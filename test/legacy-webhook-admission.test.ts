import { describe, it, expect } from 'vitest';

import {
  MAX_LEGACY_WEBHOOK_BODY_BYTES,
  legacyWebhookBodyTooLarge,
  legacyWebhookContentLengthTooLarge,
  legacyWebhookSecretCollides,
} from '@/lib/billing/legacy-webhook-admission';

describe('legacyWebhookSecretCollides', () => {
  it('passes when the legacy secret is unique across all four endpoints', () => {
    expect(legacyWebhookSecretCollides({
      STRIPE_WEBHOOK_SECRET: 'whsec_legacy',
      STRIPE_BILLING_WEBHOOK_SECRET: 'whsec_billing',
      STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET: 'whsec_connected',
      STRIPE_TOP_UP_WEBHOOK_SECRET: 'whsec_topup',
    })).toBe(false);
  });

  it.each([
    ['billing', 'STRIPE_BILLING_WEBHOOK_SECRET'],
    ['connected payment', 'STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET'],
    ['top-up', 'STRIPE_TOP_UP_WEBHOOK_SECRET'],
  ])('detects reuse of the %s endpoint secret', (_label, key) => {
    expect(legacyWebhookSecretCollides({
      STRIPE_WEBHOOK_SECRET: 'whsec_shared',
      [key]: 'whsec_shared',
    })).toBe(true);
  });

  it('does not collide when the legacy secret is unset', () => {
    // Absence is handled by the route's own !webhookSecret branch; this helper
    // must not report a collision between two undefined values.
    expect(legacyWebhookSecretCollides({
      STRIPE_BILLING_WEBHOOK_SECRET: undefined,
    })).toBe(false);
  });

  it('does not treat unset sibling secrets as a collision', () => {
    expect(legacyWebhookSecretCollides({
      STRIPE_WEBHOOK_SECRET: 'whsec_legacy',
    })).toBe(false);
  });
});

describe('legacyWebhookContentLengthTooLarge', () => {
  it('accepts a missing header — chunked deliveries carry none', () => {
    expect(legacyWebhookContentLengthTooLarge(null)).toBe(false);
  });

  it('accepts a header at the ceiling', () => {
    expect(legacyWebhookContentLengthTooLarge(String(MAX_LEGACY_WEBHOOK_BODY_BYTES))).toBe(false);
  });

  it('rejects a header above the ceiling', () => {
    expect(legacyWebhookContentLengthTooLarge(String(MAX_LEGACY_WEBHOOK_BODY_BYTES + 1))).toBe(true);
  });

  it('ignores a malformed header rather than rejecting on it', () => {
    // A caller must not be able to force a 413 with a junk header, nor slip past
    // the post-read measurement by sending one.
    expect(legacyWebhookContentLengthTooLarge('not-a-number')).toBe(false);
    expect(legacyWebhookContentLengthTooLarge('-1')).toBe(false);
  });
});

describe('legacyWebhookBodyTooLarge', () => {
  it('accepts a realistic Stripe event body', () => {
    expect(legacyWebhookBodyTooLarge(JSON.stringify({ id: 'evt_1', type: 'charge.refunded' }))).toBe(false);
  });

  it('accepts a body exactly at the ceiling', () => {
    expect(legacyWebhookBodyTooLarge('a'.repeat(MAX_LEGACY_WEBHOOK_BODY_BYTES))).toBe(false);
  });

  it('rejects a body one byte over', () => {
    expect(legacyWebhookBodyTooLarge('a'.repeat(MAX_LEGACY_WEBHOOK_BODY_BYTES + 1))).toBe(true);
  });

  it('measures bytes, not characters', () => {
    // Half the ceiling in 4-byte code points is twice the ceiling in bytes. A
    // `.length` comparison would wave this through.
    const multibyte = '𝄞'.repeat(MAX_LEGACY_WEBHOOK_BODY_BYTES / 2);
    expect(multibyte.length).toBeLessThanOrEqual(MAX_LEGACY_WEBHOOK_BODY_BYTES);
    expect(legacyWebhookBodyTooLarge(multibyte)).toBe(true);
  });
});
