import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { validateTwilioSignature } from '@/lib/sms';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!request.headers.get('x-twilio-signature')) {
    await logWebhookFailure({ source: 'twilio_status', errorMessage: 'Missing x-twilio-signature header' });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }
  const data = await request.formData();
  if (!validateTwilioSignature(request, data)) {
    await logWebhookFailure({
      source: 'twilio_status',
      referenceId: String(data.get('MessageSid') || '') || null,
      errorMessage: 'Signature validation failed',
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }
  const providerId = String(data.get('MessageSid') || '');
  const providerStatus = String(data.get('MessageStatus') || '');
  // Twilio retries status callbacks that come back as an error, and a retry
  // here would just repeat the same update — harmless, but the failure still
  // needs to be visible on the Command Center, so it's logged rather than
  // left to disappear into a retry that happens to succeed the second time.
  try {
    if (providerId && ['failed', 'undelivered'].includes(providerStatus)) {
      await createAdminClient().from('sms_events').update({
        status: 'failed',
        error_reason: String(data.get('ErrorMessage') || data.get('ErrorCode') || providerStatus),
      }).eq('provider_id', providerId);
    }
  } catch (err) {
    console.error('Twilio status webhook handler threw:', err);
    await logWebhookFailure({
      source: 'twilio_status',
      referenceId: providerId || null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
  return new NextResponse(null, { status: 204 });
}