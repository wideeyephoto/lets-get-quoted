import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { hasSignatureHeader, SIMULATED_PROVIDER_ID, validateWebhookSignature } from '@/lib/sms-provider';
import {
  applyStatusWebhook,
  extractStatusWebhook,
  parseSmsWebhookBody,
  recordInvalidWebhook,
  type ParsedStatusWebhook,
} from '@/lib/sms-webhook-ingress';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { normalizeUsPhone } from '@/lib/phone';
import { getLeadTriage } from '@/lib/leads';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasSignatureHeader(request)) {
    await logWebhookFailure({ source: 'sms_status', errorMessage: 'Missing provider signature header' });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }

  const rawBody = await request.clone().text();
  const check = validateWebhookSignature(request, rawBody);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'sms_status',
      referenceId: null,
      errorMessage: `Signature validation failed: ${check.reason}`,
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type');
  const admin = createAdminClient();
  let status: ParsedStatusWebhook | null = null;
  try {
    status = extractStatusWebhook(parseSmsWebhookBody(rawBody, contentType));
  } catch (error) {
    console.error('SMS status payload parse failed:', error);
  }

  if (!status) {
    try {
      await recordInvalidWebhook(admin, {
        provider: check.provider,
        kind: 'status',
        rawBody,
        contentType,
        requestUrl: request.url,
      });
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      await logWebhookFailure({
        source: 'sms_status',
        referenceId: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: 'Receipt unavailable.' }, { status: 503 });
    }
  }

  if (status.providerEventId === SIMULATED_PROVIDER_ID) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const ingressResult = await applyStatusWebhook(admin, {
      ...status,
      provider: check.provider,
      rawBody,
      contentType,
      requestUrl: request.url,
    });

    if (ingressResult.smsEventId) {
      try {
        const { data: event } = await admin
          .from('sms_events')
          .select('account_id, phone_number')
          .eq('id', ingressResult.smsEventId)
          .maybeSingle();

        if (event?.account_id && event.phone_number) {
          const eventPhone = normalizeUsPhone(event.phone_number);
          const { data: leads } = await admin
            .from('leads')
            .select('id, status, triage, phone')
            .eq('account_id', event.account_id)
            .not('phone', 'is', null)
            .order('created_at', { ascending: false });

          const lead = (leads ?? []).find(
            (l) => l.phone && normalizeUsPhone(l.phone) === eventPhone,
          );

          if (lead) {
            const triage = getLeadTriage(lead);
            if (ingressResult.projectedStatus === 'delivered') {
              const entry = {
                at: new Date().toISOString(),
                label: 'SMS Delivered',
                note: `Delivered to ${event.phone_number}.`,
              };
              const contactLog = [...(triage.contactLog ?? []), entry];
              // Keep lead status intact — automated delivery does not constitute human contact.
              await admin
                .from('leads')
                .update({ triage: { ...triage, contactLog }, updated_at: new Date().toISOString() })
                .eq('id', lead.id);
            } else if (ingressResult.projectedStatus === 'failed') {
              const entry = {
                at: new Date().toISOString(),
                label: 'SMS Delivery Failed',
                note: `Delivery to ${event.phone_number} failed (${status.providerErrorCode || status.providerStatus || 'undelivered'}).`,
              };
              const contactLog = [...(triage.contactLog ?? []), entry];
              await admin
                .from('leads')
                .update({ triage: { ...triage, contactLog }, updated_at: new Date().toISOString() })
                .eq('id', lead.id);
            }
          }
        }
      } catch (reconErr) {
        console.warn('Lead delivery status reconciliation skipped:', reconErr);
      }
    }
  } catch (error) {
    console.error('SMS status webhook handler threw:', error);
    await logWebhookFailure({
      source: 'sms_status',
      referenceId: status.providerEventId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Receipt unavailable.' }, { status: 503 });
  }
  return new NextResponse(null, { status: 204 });
}
