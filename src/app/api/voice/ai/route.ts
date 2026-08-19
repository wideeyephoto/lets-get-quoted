import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/auth';
import { hasSignatureHeader, validateWebhookSignature } from '@/lib/sms-provider';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { planInboundCall } from '@/lib/voice/admission';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where an inbound call arrives, and where LGQ decides what to do with it.
 *
 * THIS IS THE ADMISSION POINT, and it exists because the provider has no
 * call-started event to give us (docs/ai-voice-v1-decisions.md §11). LGQ learns
 * a call began by being asked what to do about it, which is better than an
 * event: it is synchronous, and refusing is just answering differently.
 *
 * The INBOUND leg is signed. That is worth being precise about, because the
 * receipt is not: this request arrives on the compatibility API, form encoded,
 * carrying the same HMAC the existing voice rail already validates. The
 * end-of-call receipt arrives at a different route with no signature at all and
 * is defended by other means. Two legs, two postures, one product.
 *
 * Nothing points at this route yet. It goes live when a number's Voice URL is
 * changed, which is a deliberate act per workspace.
 */

function xml(inner: string, status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL
    || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`;
  return raw.replace(/\/$/, '');
}

export async function POST(request: Request) {
  if (!hasSignatureHeader(request)) {
    await logWebhookFailure({ source: 'ai_voice', errorMessage: 'Missing provider signature header' });
    return xml('', 403);
  }

  const data = await request.formData();
  const check = validateWebhookSignature(request, data);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'ai_voice',
      referenceId: String(data.get('CallSid') || '') || null,
      errorMessage: `Signature validation failed: ${check.reason}`,
    });
    return xml('', 403);
  }

  const provider = signalwireVoiceProvider;

  try {
    const call = provider.parseInboundCall(data);
    if (!call) {
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: String(data.get('CallSid') || '') || null,
        errorMessage: 'Inbound call carried no dialled number or no call id',
      });
      // A caller is on the line and nothing here identifies them. Say something.
      return xml('<Say voice="man">Sorry, we can&apos;t take your call right now. '
        + 'Please try again later.</Say>');
    }

    const admin = createAdminClient();
    // Built from the request's OWN path, not a literal: the action URL is inside
    // the HMAC the provider signs, so a hard-coded one signed over a different
    // path 403s on precisely the callback that decides what happens next.
    const basePath = new URL(request.url).pathname;
    const { plan, accountId, declineReason } = await planInboundCall(admin, call, {
      receiptUrl: (id) => `${appOrigin()}/api/voice/receipt?account=${id}`,
      forwardActionUrl: (id) => `${appOrigin()}${basePath}/status?account=${id}`,
    });

    // A decline is not a failure and is not logged as one — every reason below
    // is a caller who still reaches the business. It is recorded so that
    // "the AI never answers" has an answer, which is the question support gets.
    if (declineReason) {
      console.info('AI voice declined:', { reason: declineReason, accountId, call: call.providerCallId });
    }

    const answer = provider.renderAnswer(plan);
    return new NextResponse(answer.body, {
      status: 200,
      headers: { 'Content-Type': answer.contentType },
    });
  } catch (error) {
    console.error('AI voice admission threw:', error);
    await logWebhookFailure({
      source: 'ai_voice',
      referenceId: String(data.get('CallSid') || '') || null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    // Never a 500. A caller hears dead air or a provider retry, and neither is
    // something a homeowner should get for a bug on our side.
    return xml('<Say voice="man">Sorry, we can&apos;t take your call right now. '
      + 'Please try again later.</Say>');
  }
}
