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

const MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);

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

  const data = await request.formData();
  const accountId = new URL(request.url).searchParams.get('account');
  const callId = String(data.get('CallSid') ?? '').trim() || null;
  const dialStatus = String(data.get('DialCallStatus') ?? '').trim() || 'unknown';
  const caller = normalizeUsPhone(String(data.get('From') ?? ''));

  // Presence-only operational signal. No phone numbers, form body, signature,
  // or callback credentials are written to a log.
  console.info('AI voice fallback completed:', {
    accountId,
    callId,
    dialStatus,
  });

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
