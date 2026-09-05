import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { verifySignedVoiceWebhook } from '@/lib/voice/auth';
import { normalizeUsPhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function xml(status = 200) {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

const MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled', 'ended']);

/**
 * Dial completion for the fallback emitted by /api/voice/ai.
 *
 * SignalWire invokes a Dial action URL after both answered and unanswered
 * forwards. An answered call ends cleanly with an empty XML response.
 * An unanswered call (no-answer, busy, failed, canceled) enqueues a missed-call
 * text-back and creates a missed-call lead via ingest_sms_missed_call.
 */
export async function POST(request: Request) {
  const rawBody = await request.clone().text();
  const check = verifySignedVoiceWebhook(request, rawBody);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: `Voice fallback status signature validation failed: ${check.reason}`,
    });
    return xml(403);
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get('account');
  const queryCallId = url.searchParams.get('call_id');
  const queryFrom = url.searchParams.get('from');

  let callId: string | null = null;
  let dialStatus = 'unknown';
  let caller: string | null = null;
  let forwardingSeconds: number | null = null;
  let observedAt = new Date().toISOString();

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(rawBody) as Record<string, unknown>;
      const params = (json.params ?? {}) as Record<string, unknown>;
      callId = String(json.CallSid ?? json.call_id ?? params.call_id ?? queryCallId ?? '').trim() || null;
      dialStatus = String(json.DialCallStatus ?? json.dial_status ?? params.connect_state ?? params.call_state ?? 'unknown').trim();
      if (typeof json.timestamp === 'number' && Number.isFinite(json.timestamp)) observedAt = new Date(json.timestamp * 1000).toISOString();
      const duration = Number(json.DialCallDuration ?? params.duration);
      if (Number.isFinite(duration) && duration >= 0 && duration <= 86400) forwardingSeconds = Math.ceil(duration);
      caller = normalizeUsPhone(String(json.From ?? json.from ?? params.from ?? queryFrom ?? ''));
    } catch {
      // fallback to query params
    }
  } else {
    try {
      const data = await request.formData();
      callId = String(data.get('CallSid') ?? queryCallId ?? '').trim() || null;
      dialStatus = String(data.get('DialCallStatus') ?? 'unknown').trim();
      const duration = data.get('DialCallDuration');
      if (duration !== null && /^\d+$/.test(String(duration)) && Number(duration) <= 86400) forwardingSeconds = Number(duration);
      caller = normalizeUsPhone(String(data.get('From') ?? queryFrom ?? ''));
    } catch {
      // fallback to query params
    }
  }

  if (!callId && queryCallId) callId = queryCallId.trim();
  if (!caller && queryFrom) caller = normalizeUsPhone(queryFrom);

  // Presence-only operational signal. No phone numbers, form body, signature,
  // or callback credentials are written to a log.
  console.info('AI voice fallback completed:', {
    accountId,
    callId,
    dialStatus,
  });

  if (accountId && callId && (forwardingSeconds !== null || ['connected', 'disconnected', 'completed'].includes(dialStatus) || (caller && MISSED.has(dialStatus)))) {
    try {
      const { error } = await createAdminClient().rpc('record_voice_forwarding_usage', {
        p_account_id: accountId, p_call_id: queryCallId || callId, p_caller: caller,
        p_state: dialStatus, p_seconds: forwardingSeconds ?? (['no-answer', 'busy', 'failed', 'canceled'].includes(dialStatus) ? 0 : null),
        p_observed_at: observedAt,
      });
      if (error) throw new Error('Forwarding usage persistence failed');
    } catch {
      await logWebhookFailure({ source: 'ai_voice', eventType: dialStatus, referenceId: callId,
        errorMessage: 'Forwarding usage persistence failed' });
      return xml(500);
    }
  }
  if (!MISSED.has(dialStatus)) return xml();

  // A missed callback is not accepted until its provider call identity, lead,
  // consent baseline and SMS outbox entry commit in one database transaction.
  // Returning 5xx keeps provider retry semantics intact on any storage fault.
  if (!accountId || !caller || !callId) {
    await logWebhookFailure({
      source: 'ai_voice',
      eventType: dialStatus,
      referenceId: callId || null,
      errorMessage: 'Missed-call fallback callback is missing account, caller, or call identity',
    });
    return xml(400);
  }

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin.rpc('ingest_sms_missed_call', {
      p_provider: check.provider,
      p_provider_call_id: callId,
      p_account_id: accountId,
      p_phone_number: caller,
      p_dial_status: dialStatus,
      p_body_sha256: createHash('sha256').update(rawBody).digest('hex'),
    });
    if (error) throw error;
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!result || !['accepted', 'opted_out', 'deduplicated_recent', 'disabled']
      .includes(String(result.ingest_disposition ?? ''))) {
      throw new Error('Missed-call ingest returned no durable disposition');
    }
  } catch (error) {
    console.error('AI voice fallback missed-call text-back ingest failed:', error instanceof Error ? error.message : error);
    await logWebhookFailure({
      source: 'ai_voice',
      eventType: dialStatus,
      referenceId: callId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return xml(500);
  }

  return xml();
}
