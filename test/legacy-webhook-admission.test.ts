import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';

import {
  LEGACY_WEBHOOK_EVENT_SCOPES,
  MAX_LEGACY_WEBHOOK_BODY_BYTES,
  inspectLegacyWebhookEvent,
  legacyWebhookAdmissionMode,
  legacyWebhookBodyTooLarge,
  legacyWebhookContentLengthTooLarge,
  legacyWebhookSecretCollides,
} from '@/lib/billing/legacy-webhook-admission';

const LIVE_ENV = { STRIPE_SECRET_KEY: 'sk_live_abcdefghijklmnop' } as const;
const TEST_ENV = { STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmnop' } as const;

// `type` is widened to string on purpose: these tests must be able to construct
// an envelope carrying a type the SDK's union does not know, which is exactly
// the case the admission table has to stay safe against.
function event(
  overrides: Omit<Partial<Stripe.Event>, 'type'> & { type: string },
): Stripe.Event {
  return {
    id: 'evt_admission',
    object: 'event',
    api_version: '2026-06-24.dahlia',
    created: 1_800_000_000,
    livemode: true,
    pending_webhooks: 0,
    request: null,
    account: undefined,
    data: { object: { id: 'cs_test_object', object: 'checkout.session' } },
    ...overrides,
  } as unknown as Stripe.Event;
}

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

describe('legacyWebhookAdmissionMode', () => {
  it('is off when the enable flag is unset — the pre-existing behaviour', () => {
    expect(legacyWebhookAdmissionMode({})).toBe('off');
  });

  it('is off for any value other than exactly "1"', () => {
    expect(legacyWebhookAdmissionMode({ LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENABLED: 'true' })).toBe('off');
    expect(legacyWebhookAdmissionMode({ LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENABLED: '0' })).toBe('off');
  });

  it('observes when enabled alone', () => {
    expect(legacyWebhookAdmissionMode({
      LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENABLED: '1',
    })).toBe('observe');
  });

  it('enforces only when both flags are exactly "1"', () => {
    expect(legacyWebhookAdmissionMode({
      LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENABLED: '1',
      LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENFORCED: '1',
    })).toBe('enforce');
  });

  it('stays off when only the enforce flag is set — enforcement cannot skip observation', () => {
    expect(legacyWebhookAdmissionMode({
      LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENFORCED: '1',
    })).toBe('off');
  });
});

describe('inspectLegacyWebhookEvent — livemode', () => {
  it('admits a live event under a live credential', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', livemode: true }),
      LIVE_ENV,
    );
    expect(verdict.outcome).toBe('admit');
  });

  it('admits a test event under a test credential', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', livemode: false }),
      TEST_ENV,
    );
    expect(verdict.outcome).toBe('admit');
  });

  it('rejects a test-mode event under a live credential as retryable config', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', livemode: false }),
      LIVE_ENV,
    );
    expect(verdict).toMatchObject({ outcome: 'reject', kind: 'config' });
  });

  it('rejects a live event under a test credential', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', livemode: true }),
      TEST_ENV,
    );
    expect(verdict).toMatchObject({ outcome: 'reject', kind: 'config' });
  });

  it('accepts a restricted key as a mode source', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', livemode: true }),
      { STRIPE_SECRET_KEY: 'rk_live_abcdefghijklmnop' },
    );
    expect(verdict.outcome).toBe('admit');
  });

  it('rejects as config when the key declares no mode', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed' }),
      { STRIPE_SECRET_KEY: 'not-a-stripe-key' },
    );
    expect(verdict).toMatchObject({ outcome: 'reject', kind: 'config' });
  });

  it('rejects an event whose livemode is not a boolean', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', livemode: undefined as never }),
      LIVE_ENV,
    );
    expect(verdict).toMatchObject({ outcome: 'reject', kind: 'scope' });
  });
});

describe('inspectLegacyWebhookEvent — account scope', () => {
  it('admits a platform-scope payment event carrying no account', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', account: undefined }),
      LIVE_ENV,
    );
    expect(verdict.outcome).toBe('admit');
  });

  it('REJECTS a platform-scope payment event that arrives on a connected account', () => {
    // The cross-tenant case: a connected account creates a Session on its own
    // account carrying another workspace's payment_id in metadata. Stripe signs
    // it legitimately; only this rule stops it settling someone else's payment.
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'checkout.session.completed', account: 'acct_attacker123' }),
      LIVE_ENV,
    );
    expect(verdict).toMatchObject({ outcome: 'reject', kind: 'scope' });
  });

  it.each([
    'charge.refunded',
    'charge.dispute.created',
    'payment_intent.succeeded',
    'invoice.paid',
    'customer.subscription.deleted',
  ])('rejects %s on a connected account', (type) => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type, account: 'acct_attacker123' }),
      LIVE_ENV,
    );
    expect(verdict).toMatchObject({ outcome: 'reject', kind: 'scope' });
  });

  it('admits account.updated whose account matches its subject', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({
        type: 'account.updated',
        account: 'acct_connected1',
        data: { object: { id: 'acct_connected1', object: 'account' } } as never,
      }),
      LIVE_ENV,
    );
    expect(verdict.outcome).toBe('admit');
  });

  it('admits account.updated for the platform itself (no account on the event)', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({
        type: 'account.updated',
        account: undefined,
        data: { object: { id: 'acct_platform', object: 'account' } } as never,
      }),
      LIVE_ENV,
    );
    expect(verdict.outcome).toBe('admit');
  });

  it('rejects account.updated whose account does not match its subject', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({
        type: 'account.updated',
        account: 'acct_sender',
        data: { object: { id: 'acct_someoneelse', object: 'account' } } as never,
      }),
      LIVE_ENV,
    );
    expect(verdict).toMatchObject({ outcome: 'reject', kind: 'scope' });
  });

  it('admits a type no handler reads — it reaches no handler either way', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({ type: 'payout.paid', account: 'acct_whatever' }),
      LIVE_ENV,
    );
    expect(verdict.outcome).toBe('admit');
  });

  it('never leaks payload contents into a rejection reason', () => {
    const verdict = inspectLegacyWebhookEvent(
      event({
        type: 'checkout.session.completed',
        account: 'acct_attacker123',
        data: { object: { id: 'cs_secret', object: 'checkout.session', customer_email: 'victim@example.com' } } as never,
      }),
      LIVE_ENV,
    );
    expect(verdict.outcome).toBe('reject');
    if (verdict.outcome !== 'reject') throw new Error('unreachable');
    expect(verdict.reason).not.toContain('victim@example.com');
    expect(verdict.reason).not.toContain('cs_secret');
  });
});

describe('LEGACY_WEBHOOK_EVENT_SCOPES covers every handled type', () => {
  // A type absent from the table is admitted unchecked, so the table drifting
  // behind the handlers is a silent hole rather than a loud failure. These three
  // sources are every handler the legacy endpoint dispatches into.
  const SOURCES = [
    'src/app/api/stripe/webhook/route.ts',
    'src/lib/ad-billing.ts',
    'src/lib/merchandise/stripe-webhook.ts',
  ];

  it('lists every event.type literal the handlers compare against', () => {
    const handled = new Set<string>();
    for (const relative of SOURCES) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8');
      for (const m of source.matchAll(/event\.type\s*[!=]==\s*'([a-z0-9_.]+)'/g)) {
        handled.add(m[1]!);
      }
    }

    // Guards the guard: if this regex ever stops matching, the assertion below
    // passes vacuously and the drift protection is gone.
    expect(handled.size).toBeGreaterThan(10);

    const tabled = new Set(Object.keys(LEGACY_WEBHOOK_EVENT_SCOPES));
    const missing = [...handled].filter((type) => !tabled.has(type)).sort();
    expect(missing, `handled but unscoped: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not scope types no handler reads', () => {
    const handled = new Set<string>();
    for (const relative of SOURCES) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8');
      for (const m of source.matchAll(/event\.type\s*[!=]==\s*'([a-z0-9_.]+)'/g)) {
        handled.add(m[1]!);
      }
    }
    const stale = Object.keys(LEGACY_WEBHOOK_EVENT_SCOPES).filter((type) => !handled.has(type)).sort();
    expect(stale, `scoped but unhandled: ${stale.join(', ')}`).toEqual([]);
  });
});
