import { NextResponse } from 'next/server';

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
 * Dial completion for the fallback emitted by /api/voice/ai.
 *
 * SignalWire invokes a Dial action URL after both answered and unanswered
 * forwards. The response must therefore exist even though there is no second
 * action to take: an empty, authenticated response ends the call cleanly.
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

  // Presence-only operational signal. No phone numbers, form body, signature,
  // or callback credentials are written to a log.
  console.info('AI voice fallback completed:', {
    accountId,
    callId,
    dialStatus,
  });

  return xml();
}
