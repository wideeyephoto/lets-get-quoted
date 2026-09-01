import { createHmac, timingSafeEqual } from 'node:crypto';

export type WebhookSignatureHeader = {
  headerValue: string;
  timestamp: number;
  signature: string;
};

/**
 * Computes an HMAC-SHA256 signature over event metadata and raw body.
 */
export function computeWebhookSignature(
  secret: string,
  eventId: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000)
): WebhookSignatureHeader {
  const payload = `${timestamp}.${eventId}.${rawBody}`;
  const signature = createHmac('sha256', secret.trim())
    .update(payload, 'utf8')
    .digest('hex');

  return {
    headerValue: `t=${timestamp},v1=${signature}`,
    timestamp,
    signature,
  };
}

/**
 * Verifies an incoming webhook signature using constant-time comparison.
 */
export function verifyWebhookSignature(
  secret: string,
  eventId: string,
  rawBody: string,
  headerValue: string,
  maxAgeToleranceSeconds = 300 // 5 minutes default
): boolean {
  if (!headerValue || !secret || !eventId) {
    return false;
  }

  // Parse t=...,v1=...
  const parts = headerValue.split(',');
  let timestamp: number | null = null;
  let receivedSignature: string | null = null;

  for (const part of parts) {
    const [key, val] = part.split('=').map((s) => s.trim());
    if (key === 't' && val) {
      const parsed = Number.parseInt(val, 10);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === 'v1' && val) {
      receivedSignature = val;
    }
  }

  if (timestamp === null || !receivedSignature) {
    return false;
  }

  // Check timestamp freshness if tolerance is positive
  if (maxAgeToleranceSeconds > 0) {
    const currentSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(currentSeconds - timestamp) > maxAgeToleranceSeconds) {
      return false;
    }
  }

  const expected = computeWebhookSignature(secret, eventId, rawBody, timestamp);

  try {
    const a = Buffer.from(receivedSignature, 'utf8');
    const b = Buffer.from(expected.signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
