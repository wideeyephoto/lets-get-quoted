import 'server-only';

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
  const answer = signalwireVoiceProvider.renderAnswer({
    kind: 'voicemail',
    message: "Sorry, we can't connect your call right now. Please leave your name, callback number, and a message after the beep.",
  }, { format: isJson ? 'swml' : 'laml' });

  return new Response(answer.body, {
    status: 200,
    headers: { 'Content-Type': answer.contentType, 'Cache-Control': 'no-store' },
  });
}
