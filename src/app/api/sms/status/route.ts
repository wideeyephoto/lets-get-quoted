import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { hasSignatureHeader, validateWebhookSignature } from '@/lib/sms-provider';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasSignatureHeader(request)) {
    await logWebhookFailure({ source: 'sms_status', errorMessage: 'Missing provider signature header' });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }
  const data = await request.formData();
  const check = validateWebhookSignature(request, data);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'sms_status',
      referenceId: String(data.get('MessageSid') || '') || null,
      errorMessage: `Signature validation failed: ${check.reason}`,
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }
  const providerId = String(data.get('MessageSid') || '');
  const providerStatus = String(data.get('MessageStatus') || '');

  // 'simulated' is the provider id every simulated dispatch writes (see
  // sendSubcontractorSms). provider_id carries no unique constraint, so a
  // callback that happened to arrive with that MessageSid would mark EVERY
  // simulated row in the database as failed in one statement. The sentinel was
  // argued safe on the grounds that no real SID looks like that; nothing
  // enforced it. Now something does.
  if (providerId === 'simulated') return new NextResponse(null, { status: 204 });

  // Providers retry status callbacks that come back as an error, and a retry
  // here would just repeat the same update — harmless, but the failure still
  // needs to be visible on the Command Center, so it's logged rather than
  // left to disappear into a retry that happens to succeed the second time.
  try {
    if (providerId && ['failed', 'undelivered'].includes(providerStatus)) {
      const reason = String(data.get('ErrorMessage') || data.get('ErrorCode') || providerStatus);
      const { data: updated, error } = await createAdminClient()
        .from('sms_events')
        .update({ status: 'failed', error_reason: reason })
        .eq('provider_id', providerId)
        .select('id');
      if (error) throw new Error(error.message);

      // The provider just told us a text did not arrive, and there was no row to
      // say so on. Only the payment and crew senders write sms_events; the other
      // ~30 send functions in lib/sms.ts do not, so their delivery failures
      // updated zero rows and vanished — which is exactly why the Failed texts
      // card looks healthy. Recording it as a webhook failure is not where this
      // belongs long-term, but it is visible, and silence was the bug.
      if (!updated || updated.length === 0) {
        await logWebhookFailure({
          source: 'sms_status',
          eventType: providerStatus,
          referenceId: providerId,
          errorMessage: `Delivery failure with no sms_events row to record it on: ${reason}`,
        });
      }
    }
  } catch (err) {
    console.error('SMS status webhook handler threw:', err);
    await logWebhookFailure({
      source: 'sms_status',
      referenceId: providerId || null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  return new NextResponse(null, { status: 204 });
}
