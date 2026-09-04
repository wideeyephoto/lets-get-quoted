import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { verifySignedVoiceWebhook } from '@/lib/voice/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function xml(status = 200) {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Signed lifecycle callback configured on the dedicated SignalWire number.
 *
 * This is intentionally separate from `/api/voice/ai/status`: that sibling is
 * a LaML <Dial> action URL and receives `DialCallStatus`, while this route is
 * the number-level `call_status_callback_url` and receives `CallStatus`.
 */
export async function POST(request: Request) {
  const rawBody = await request.clone().text();
  const check = verifySignedVoiceWebhook(request, rawBody);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'ai_voice',
      eventType: 'provider_status',
      errorMessage: `Voice provider-status signature validation failed: ${check.reason}`,
    });
    return xml(403);
  }

  const data = await request.formData();
  const callId = String(data.get('CallSid') ?? '').trim();
  const callStatus = String(data.get('CallStatus') ?? '').trim().toLowerCase();
  if (!callId || !/^[a-z][a-z0-9_-]{1,63}$/.test(callStatus)) {
    await logWebhookFailure({
      source: 'ai_voice',
      eventType: 'provider_status',
      referenceId: callId || null,
      errorMessage: 'Voice provider status is missing call identity or a valid status',
    });
    return xml(400);
  }

  const admin = createAdminClient();
  const { data: closeData, error: closeError } = await admin.rpc(
    'close_voice_staff_step_up_from_provider_status',
    { p_provider_call_id: callId, p_call_status: callStatus },
  );
  const closeRow = Array.isArray(closeData) ? closeData[0] : closeData;
  const closeStatus = closeRow && typeof closeRow === 'object' && !Array.isArray(closeRow)
    ? String((closeRow as Record<string, unknown>).close_status ?? '')
    : '';
  if (closeError || !['nonterminal', 'tombstoned', 'closed', 'already_closed'].includes(closeStatus)) {
    await logWebhookFailure({
      source: 'ai_voice',
      eventType: 'provider_status',
      referenceId: callId,
      errorMessage: 'Voice provider status could not close canonical call state',
    });
    return xml(500);
  }

  // Presence-only telemetry: never log caller/callee numbers or the signed
  // provider payload. Receipts remain authoritative for billing settlement.
  console.info('AI voice provider status received:', { callId, callStatus, closeStatus });
  return xml();
}
