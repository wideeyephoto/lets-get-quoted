import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/auth';
import { hasSignatureHeader, validateWebhookSignature } from '@/lib/sms-provider';
import { normalizeUsPhone } from '@/lib/phone';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const runtime = 'nodejs';

function xml(inner = '', status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

const MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);

// Dial-completion callback from /api/sms/voice. On an unanswered call, text
// the caller back and log a missed-call lead so the owner can follow up.
export async function POST(request: Request) {
  if (!hasSignatureHeader(request)) {
    await logWebhookFailure({ source: 'sms_voice', errorMessage: 'Missing provider signature header (dial status)' });
    return xml('', 403);
  }
  const rawBody = await request.clone().text();
  const check = validateWebhookSignature(request, rawBody);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'sms_voice',
      referenceId: null,
      errorMessage: `Dial status signature validation failed: ${check.reason}`,
    });
    return xml('', 403);
  }
  const data = await request.formData();

  const accountId = new URL(request.url).searchParams.get('account');
  const dialStatus = String(data.get('DialCallStatus') ?? '');
  const caller = normalizeUsPhone(String(data.get('From') ?? ''));
  const callId = String(data.get('CallSid') ?? '').trim();

  if (!MISSED.has(dialStatus)) return xml();

  // A missed callback is not accepted until its provider call identity, lead,
  // consent baseline and SMS outbox entry commit in one database transaction.
  // Returning 5xx keeps provider retry semantics intact on any storage fault.
  if (!accountId || !caller || !callId) {
    await logWebhookFailure({
      source: 'sms_voice',
      eventType: dialStatus,
      referenceId: callId || null,
      errorMessage: 'Missed-call callback is missing account, caller, or call identity',
    });
    return xml('', 400);
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
    console.error('Missed-call text-back ingest failed:', error instanceof Error ? error.message : error);
    await logWebhookFailure({
      source: 'sms_voice',
      eventType: dialStatus,
      referenceId: callId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return xml('', 500);
  }

  return xml(); // empty response ends the call cleanly
}
