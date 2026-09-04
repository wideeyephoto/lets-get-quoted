import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { planInboundCall } from '@/lib/voice/admission';
import {
  signalWireVoiceScope,
  signVoiceToolToken,
  verifySignedVoiceWebhook,
  voiceReceiptAuthorization,
} from '@/lib/voice/auth';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import { trustedProviderCallbackOrigin } from '@/lib/app-origin';
import { recordVoiceRouteVerification } from '@/lib/voice/route-readiness';

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function failureResponse(isJson: boolean, message?: string, status = 200) {
  if (isJson) {
    if (status === 403 || !message) {
      return new NextResponse(
        JSON.stringify({
          version: '1.0.0',
          sections: {
            main: [{ hangup: {} }],
          },
        }),
        {
          status,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return new NextResponse(
      JSON.stringify({
        version: '1.0.0',
        sections: {
          main: [
            { answer: {} },
            { play: { url: `say: ${message}` } },
            { hangup: {} },
          ],
        },
      }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  return xml(message ? `<Say voice="man">${escapeXml(message)}</Say>` : '', status);
}

export async function POST(request: Request) {
  const rawBody = await request.clone().text();
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
  const isJson = contentType === 'application/json' || (rawBody.trim().startsWith('{') && rawBody.trim().endsWith('}'));

  const check = verifySignedVoiceWebhook(request, rawBody);
  if (!check.ok) {
    await logWebhookFailure({
      source: 'ai_voice',
      referenceId: null,
      errorMessage: `Voice admission signature validation failed: ${check.reason}`,
    });
    return failureResponse(isJson, undefined, 403);
  }

  let bodyData: FormData | Record<string, unknown>;
  if (isJson) {
    try {
      bodyData = JSON.parse(rawBody);
    } catch {
      bodyData = {};
    }
  } else {
    try {
      bodyData = await request.formData();
    } catch {
      bodyData = {};
    }
  }

  const provider = signalwireVoiceProvider;
  const apologyMessage = "Sorry, we can't take your call right now. Please try again later.";

  try {
    const call = provider.parseInboundCall(bodyData);
    if (!call) {
      const refId = bodyData instanceof FormData
        ? String(bodyData.get('CallSid') || '') || null
        : (typeof bodyData === 'object' && bodyData !== null
          ? String((bodyData as Record<string, unknown>).CallSid ?? (bodyData as Record<string, unknown>).call_id ?? '') || null
          : null);
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: refId,
        errorMessage: 'Inbound call carried no dialled number or no call id',
      });
      // A caller is on the line and nothing here identifies them. Say something.
      return failureResponse(isJson, apologyMessage);
    }

    // The receipt contains transcript PII and is sent with a reusable Basic
    // credential. Never admit or reserve an AI call until its destination is a
    // bare HTTPS origin inside LGQ's configured DNS namespace.
    const callbackOrigin = trustedProviderCallbackOrigin();
    if (!callbackOrigin) {
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: call.providerCallId,
        errorMessage: 'Voice callback origin is missing or unsafe',
      });
      return failureResponse(isJson, apologyMessage);
    }

    // The unsigned end-of-call receipt is safe only when it can be checked
    // against both exact SignalWire tenancy identifiers. Do not start a paid AI
    // session if either side of that future comparison is absent or malformed.
    if (!signalWireVoiceScope()) {
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: call.providerCallId,
        errorMessage: 'Voice receipt project/space scope is missing or invalid',
      });
      return failureResponse(isJson, apologyMessage);
    }

    const admin = createAdminClient();
    const { plan, accountId, declineReason } = await planInboundCall(admin, call, {
      // One stable endpoint. Workspace attribution comes from the admitted call
      // id, never from a caller-controlled query parameter.
      receiptUrl: `${callbackOrigin}/api/voice/receipt`,
      // SignalWire renders this into dedicated auth fields. It is never placed
      // in the URL or included in the decline log below.
      receiptAuthorization: voiceReceiptAuthorization(),
      forwardActionUrl: (id) => `${callbackOrigin}/api/voice/ai/status?account=${id}&from=${encodeURIComponent(call.fromNumber || '')}&call_id=${encodeURIComponent(call.providerCallId)}`,
      recordingStatusUrl: (id) => `${callbackOrigin}/api/voice/recording-status?account=${id}`,
      swaigUrl: (id, ctx) => {
        const token = ctx
          ? signVoiceToolToken({
              accountId: id,
              providerCallId: ctx.providerCallId,
              callerPhone: ctx.callerPhone,
            })
          : null;
        return token
          ? `${callbackOrigin}/api/voice/swaig?token=${encodeURIComponent(token)}`
          : `${callbackOrigin}/api/voice/swaig?account_id=${id}`;
      },
    });

    // A valid signed call to this route is the only durable proof LGQ can get
    // that the provider actually points this customer-facing number here. Stamp
    // it even when the product is still off: that is how an owner completes the
    // test call before activating Answering. Await the write so a serverless
    // response cannot terminate the proof before it commits.
    if (accountId) {
      const verified = await recordVoiceRouteVerification(admin, {
        accountId,
        number: call.toNumber,
        providerCallId: call.providerCallId,
      });
      if (!verified) {
        console.error('AI voice route verification evidence was not persisted');
      }
    }

    // A decline is not a failure and is not logged as one — every reason below
    // is a caller who still reaches the business. It is recorded so that
    // "the AI never answers" has an answer, which is the question support gets.
    if (declineReason) {
      console.info('AI voice declined:', { reason: declineReason, accountId, call: call.providerCallId });
    }

    const answer = provider.renderAnswer(plan, { format: isJson ? 'swml' : 'laml' });
    return new NextResponse(answer.body, {
      status: 200,
      headers: { 'Content-Type': answer.contentType },
    });
  } catch (error) {
    console.error('AI voice admission threw:', error);
    const refId = bodyData instanceof FormData
      ? String(bodyData.get('CallSid') || '') || null
      : (typeof bodyData === 'object' && bodyData !== null
        ? String((bodyData as Record<string, unknown>).CallSid ?? (bodyData as Record<string, unknown>).call_id ?? '') || null
        : null);
    await logWebhookFailure({
      source: 'ai_voice',
      referenceId: refId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    // Never a 500. A caller hears dead air or a provider retry, and neither is
    // something a homeowner should get for a bug on our side.
    return failureResponse(isJson, apologyMessage);
  }
}
