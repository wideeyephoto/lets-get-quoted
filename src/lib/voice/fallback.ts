import 'server-only';

import { trustedProviderCallbackOrigin } from '@/lib/app-origin';
import { normalizeUsPhone } from '@/lib/phone';
import { verifySignedVoiceWebhook } from '@/lib/voice/auth';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';

/**
 * Last-resort provider recovery. Keep this independent of workspace/session
 * lookups and AI admission: the primary callback may have failed because those
 * dependencies are down. The provider keeps the bounded voicemail recording.
 */
export async function handleVoiceProviderFallback(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const check = verifySignedVoiceWebhook(request, rawBody);
  if (!check.ok) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 403,
      headers: { 'Content-Type': 'text/xml', 'Cache-Control': 'no-store' },
    });
  }

  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const isJson = mediaType === 'application/json' || rawBody.trim().startsWith('{');
  let inbound: Record<string, unknown> = {};
  try { inbound = isJson ? JSON.parse(rawBody) : Object.fromEntries(new URLSearchParams(rawBody)); } catch { /* recovery must still answer */ }
  const call = signalwireVoiceProvider.parseInboundCall(inbound);
  const origin = trustedProviderCallbackOrigin();
  // Native recording callbacks on query-bearing URLs failed signature checks
  // in live acceptance. Keep attribution in the signed path, using numeric
  // segments so provider URL normalization cannot rewrite plus signs.
  const toNumber = normalizeUsPhone(call?.toNumber ?? '');
  const fromNumber = normalizeUsPhone(call?.fromNumber ?? '');
  const recordingStatusUrl = origin && toNumber ? new URL(
    `/api/voice/recording-status/${toNumber.slice(1)}/${fromNumber?.slice(1) || 'unknown'}`,
    origin,
  ) : null;
  const answer = signalwireVoiceProvider.renderAnswer({
    kind: 'voicemail',
    ...(recordingStatusUrl ? { recordingStatusUrl: recordingStatusUrl.toString() } : {}),
    message: "Sorry, we can't connect your call right now. Please leave your name, callback number, and a message after the beep.",
  }, { format: isJson ? 'swml' : 'laml' });

  return new Response(answer.body, {
    status: 200,
    headers: { 'Content-Type': answer.contentType, 'Cache-Control': 'no-store' },
  });
}
