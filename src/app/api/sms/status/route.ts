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
      // Retry this even for duplicate receipts: ingress may have committed before
      // a previous history write failed. The RPC deduplicates by canonical event
      // and appends to the current database value, without stale triage snapshots.
      const { error } = await admin.rpc('record_sms_lead_delivery_history', {
        p_sms_event_id: ingressResult.smsEventId,
      });
      if (error) throw new Error(`SMS lead history unavailable (${error.code || 'unknown'}).`);
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
