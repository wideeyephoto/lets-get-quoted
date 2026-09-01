import { describe, it, expect } from 'vitest';
import {
  computeWebhookSignature,
  verifyWebhookSignature,
} from '@/lib/public-api/webhook-signatures';

describe('Webhook Signatures (HMAC-SHA256)', () => {
  const secret = 'whsec_abcdef123456789012345678901234567890';
  const eventId = 'evt_1234';
  const payload = JSON.stringify({
    id: 'evt_1234',
    event: 'lead.created',
    data: { id: 'lead_5678', name: 'John Smith' },
  });

  it('generates valid LGQ-Signature format: t=<timestamp>,v1=<hex>', () => {
    const signatureHeader = computeWebhookSignature(secret, eventId, payload);
    expect(signatureHeader.headerValue).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  });

  it('verifies valid signature successfully within tolerance window', () => {
    const sig = computeWebhookSignature(secret, eventId, payload);
    const isValid = verifyWebhookSignature(secret, eventId, payload, sig.headerValue);
    expect(isValid).toBe(true);
  });

  it('fails verification if payload was tampered with', () => {
    const sig = computeWebhookSignature(secret, eventId, payload);
    const tamperedPayload = JSON.stringify({
      id: 'evt_1234',
      event: 'lead.created',
      data: { id: 'lead_5678', name: 'Altered Name' },
    });

    const isValid = verifyWebhookSignature(secret, eventId, tamperedPayload, sig.headerValue);
    expect(isValid).toBe(false);
  });

  it('fails verification if secret does not match', () => {
    const sig = computeWebhookSignature(secret, eventId, payload);
    const isValid = verifyWebhookSignature(
      'whsec_wrongsecretkey1234567890123456789012345678',
      eventId,
      payload,
      sig.headerValue
    );
    expect(isValid).toBe(false);
  });

  it('fails verification if timestamp is outside tolerance window (> 5 minutes)', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const sig = computeWebhookSignature(secret, eventId, payload, oldTimestamp);
    const isValid = verifyWebhookSignature(secret, eventId, payload, sig.headerValue, 300);
    expect(isValid).toBe(false);
  });
});
