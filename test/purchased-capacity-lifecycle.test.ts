import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  CAPACITY_LEDGER_STATUSES,
  isCapacityReconcileOutcome,
  knownProviderSubscriptionStatuses,
  mapProviderSubscriptionStatus,
  periodEndIso,
} from '@/lib/billing/capacity-lifecycle';
import {
  PURCHASED_CAPACITY_LIFECYCLE_WORKER_FLAG,
  purchasedCapacityLifecycleWorkerEnabled,
  summarizePurchasedCapacityLifecycleSweep,
} from '@/lib/billing/billing-worker-cron';
import {
  createStripeBillingSubscriptionProjectionResolver,
  ForeignSubscriptionRailError,
} from '@/lib/billing/stripe-billing-subscription-events';
import { TOP_UP_SUBSCRIPTION_PURPOSE } from '@/lib/billing/top-up-purchase';

/**
 * The two halves that let a capacity subscription lapse safely: mapping Stripe's
 * status vocabulary onto the ledger's three, and keeping those subscriptions off
 * the base-plan projector.
 *
 * The state machine itself is exercised against a real engine by
 * scripts/verify-purchased-capacity-lifecycle.mjs (23 checks) and the ignore rail
 * by scripts/verify-top-up-capacity-grant.mjs. What is here is the judgement
 * layer, which no database can check.
 */

describe('mapping Stripe subscription status onto the ledger', () => {
  it('treats a paying or trialing subscription as active', () => {
    expect(mapProviderSubscriptionStatus('active')).toBe('active');
    expect(mapProviderSubscriptionStatus('trialing')).toBe('active');
  });

  it('keeps every recoverable state in grace rather than cancelling it', () => {
    // canceled is TERMINAL in the ledger — there is no edge out of it, and a
    // resumed subscription becomes a new row. Mapping a recoverable state to
    // canceled would destroy entitlement no later sweep could restore, so every
    // one of these stays in grace even though grace costs us money.
    for (const status of ['past_due', 'unpaid', 'incomplete', 'paused']) {
      expect(mapProviderSubscriptionStatus(status)).toBe('past_due');
    }
  });

  it('cancels only the two states that can never bill again', () => {
    expect(mapProviderSubscriptionStatus('canceled')).toBe('canceled');
    expect(mapProviderSubscriptionStatus('incomplete_expired')).toBe('canceled');
  });

  it('never guesses at a status Stripe adds later', () => {
    // The alternative — a default branch — would silently sort a new status into
    // whichever bucket happened to be last, and the first anyone would know is a
    // workspace losing capacity it paid for.
    expect(mapProviderSubscriptionStatus('some_future_status')).toBeNull();
    expect(mapProviderSubscriptionStatus('')).toBeNull();
    expect(mapProviderSubscriptionStatus(undefined)).toBeNull();
    expect(mapProviderSubscriptionStatus(null)).toBeNull();
    expect(mapProviderSubscriptionStatus(42)).toBeNull();
  });

  it('maps every status it claims to know onto a real ledger status', () => {
    for (const status of knownProviderSubscriptionStatuses()) {
      const mapped = mapProviderSubscriptionStatus(status);
      expect(mapped).not.toBeNull();
      expect(CAPACITY_LEDGER_STATUSES).toContain(mapped);
    }
  });

  it('covers the whole documented Stripe vocabulary', () => {
    // If Stripe's list grows and this one does not, the sweep starts reporting
    // unmapped rows — which is safe, and this is where it gets noticed.
    const documented = [
      'active', 'past_due', 'unpaid', 'canceled', 'incomplete',
      'incomplete_expired', 'trialing', 'paused',
    ];
    for (const status of documented) {
      expect(mapProviderSubscriptionStatus(status)).not.toBeNull();
    }
  });
});

describe('reading the billing period', () => {
  it('converts unix seconds to an instant', () => {
    expect(periodEndIso(1_790_000_000)).toBe(new Date(1_790_000_000_000).toISOString());
  });

  it('returns null rather than 1970 for anything unusable', () => {
    // The RPC coalesces null to "leave it alone". An epoch-zero timestamp would
    // instead be written as fact.
    expect(periodEndIso(0)).toBeNull();
    expect(periodEndIso(-1)).toBeNull();
    expect(periodEndIso(undefined)).toBeNull();
    expect(periodEndIso('1790000000')).toBeNull();
    expect(periodEndIso(Number.NaN)).toBeNull();
  });
});

describe('the sweep summary', () => {
  it('is off for every value except the exact string 1', () => {
    expect(purchasedCapacityLifecycleWorkerEnabled({})).toBe(false);
    expect(purchasedCapacityLifecycleWorkerEnabled({
      [PURCHASED_CAPACITY_LIFECYCLE_WORKER_FLAG]: 'true',
    })).toBe(false);
    expect(purchasedCapacityLifecycleWorkerEnabled({
      [PURCHASED_CAPACITY_LIFECYCLE_WORKER_FLAG]: '1',
    })).toBe(true);
  });

  it('counts unmapped and missing without calling either a failure', () => {
    // Neither is an error somebody should be paged for, and neither may be
    // invisible: one is a status we do not translate, the other a subscription
    // Stripe no longer has, and both mean a row was deliberately left alone.
    const summary = summarizePurchasedCapacityLifecycleSweep({
      status: 'completed',
      examined: 10,
      canceled: 2,
      changed: 3,
      unchanged: 4,
      unmapped: 1,
      missing: 1,
      providerErrors: 0,
    });
    expect(summary.unmapped).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.failures).toBe(0);
  });

  it('reports a failed sweep as one failure and no progress', () => {
    expect(summarizePurchasedCapacityLifecycleSweep({ status: 'failed' })).toEqual({
      status: 'failed',
      examined: 0,
      canceled: 0,
      changed: 0,
      unchanged: 0,
      unmapped: 0,
      missing: 0,
      provider_errors: 0,
      failures: 1,
    });
  });
});

describe('the reconcile outcome vocabulary', () => {
  it('accepts exactly what the RPC can return', () => {
    for (const outcome of ['active', 'past_due', 'canceled', 'unchanged', 'already_canceled', 'not_found']) {
      expect(isCapacityReconcileOutcome(outcome)).toBe(true);
    }
    expect(isCapacityReconcileOutcome('something_else')).toBe(false);
    expect(isCapacityReconcileOutcome(null)).toBe(false);
  });
});

describe('keeping capacity subscriptions off the base-plan projector', () => {
  function resolverFor(subscription: unknown) {
    return createStripeBillingSubscriptionProjectionResolver({
      assertMode: () => {},
      dependencies: {
        retrieveSubscription: vi.fn().mockResolvedValue(subscription),
        retrieveInvoice: vi.fn(),
        retrieveCheckoutSession: vi.fn(),
        listCheckoutSessions: vi.fn(),
        loadVerifiedPrices: vi.fn(),
      },
    });
  }

  const claim = {
    billingEventId: '11111111-1111-4111-8111-111111111111',
    status: 'claimed' as const,
    claimToken: '22222222-2222-4222-8222-222222222222',
    attemptCount: 1,
    providerEventId: 'evt_capacity_0001',
    eventType: 'customer.subscription.updated' as const,
    eventObjectId: 'sub_capacity00000001',
    livemode: false,
    providerCreatedAt: '2026-08-19T00:00:00.000Z',
  };

  it('refuses to project a purchased-capacity subscription', async () => {
    // Without this it reaches normalizeSubscription, whose metadata key-set
    // equality rejects it as provider_object_contract_mismatch — terminal on the
    // first attempt, one dead letter per renewal, failure and cancellation.
    const resolver = resolverFor({
      object: 'subscription',
      id: 'sub_capacity00000001',
      livemode: false,
      metadata: {
        lgq_purpose: TOP_UP_SUBSCRIPTION_PURPOSE,
        lgq_top_up_id: 'storage_100gb',
        lgq_account_id: '33333333-3333-4333-8333-333333333333',
        lgq_resource_code: 'storage_gb',
        lgq_units: '100',
        lgq_catalog_version: '2026-08-18-preview',
      },
    });

    await expect(resolver.loadProviderContext(claim as never))
      .rejects.toBeInstanceOf(ForeignSubscriptionRailError);
  });

  it('does not divert a subscription that merely lacks metadata', async () => {
    // The discriminator has to be a positive match on lgq_purpose. Treating
    // "unrecognised" as "not ours" would silently swallow a genuinely broken
    // base-plan subscription that ought to dead-letter and be looked at.
    const resolver = resolverFor({
      object: 'subscription', id: 'sub_capacity00000001', livemode: false, metadata: {},
    });
    await expect(resolver.loadProviderContext(claim as never))
      .rejects.not.toBeInstanceOf(ForeignSubscriptionRailError);
  });

  it('carries which rail owns it', () => {
    expect(new ForeignSubscriptionRailError('purchased_capacity').rail).toBe('purchased_capacity');
  });
});

describe('the lifecycle migrations', () => {
  const read = (name: string) => readFileSync(
    join(process.cwd(), 'migrations', name), 'utf8',
  ).replace(/\r\n/g, '\n');

  const lifecycle = read('20260819020000_purchased_capacity_lifecycle.sql');
  const ignore = read('20260819030000_ignore_foreign_subscription_event.sql');

  it('are transactional and timestamped', () => {
    for (const sql of [lifecycle, ignore]) {
      expect(sql).toContain('begin;');
      expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    }
  });

  it('keeps Stripe vocabulary out of the database', () => {
    // The RPC accepts only the ledger's three. The judgement lives in TypeScript
    // where it can be unit-tested, which is what the block above does.
    //
    // Executable SQL only: the file's own comments explain the mapping it is
    // NOT doing, and this assertion failed against that prose first time — the
    // same trap the purchased-capacity migration test documents.
    const statements = lifecycle
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).toContain("p_status not in ('active', 'past_due', 'canceled')");
    expect(statements).not.toContain('trialing');
    expect(statements).not.toContain('incomplete_expired');
    expect(statements).not.toContain('unpaid');
  });

  it('sets status and canceled_at in one statement', () => {
    // The shape check is a plain per-statement CHECK: two statements fail on the
    // first one.
    expect(lifecycle).toMatch(/set status = 'canceled',\s*\n\s*canceled_at = coalesce\(c\.canceled_at/);
  });

  it('never rewrites an existing cancellation time', () => {
    expect(lifecycle).toContain('coalesce(c.canceled_at, pg_catalog.now())');
  });

  it('serialises against the seat gates', () => {
    // Both crew seat gates hold the entitlement row FOR UPDATE and then read the
    // purchased units, trusting the number to hold for the rest of the gate.
    expect(lifecycle).toContain('from public.workspace_entitlements e');
    expect(lifecycle).toContain('for update');
  });

  it('excludes terminal rows from the work list', () => {
    expect(lifecycle).toContain("c.status <> 'canceled'");
  });

  it('widens BOTH billing_events constraints for the ignored result', () => {
    // The terminal shape pins projection_result to four values INSIDE the
    // subscription branch, so widening only the result check leaves the write
    // failing — which a real engine caught before production did.
    expect(ignore).toContain('billing_events_projection_result_check');
    expect(ignore).toContain('billing_events_projection_terminal_shape_check');
    expect(ignore).toContain('subscription_not_our_rail');
  });

  it('requires an owned, unexpired claim before writing', () => {
    expect(ignore).toContain('projection_claim_token is distinct from p_claim_token');
    expect(ignore).toContain('projection_lease_expires_at <= pg_catalog.now()');
    expect(ignore).toContain("event_scope <> 'platform_subscription'");
  });
});
