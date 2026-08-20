import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Terms, the recurring-consent box a customer ticks at checkout, the
 * homepage ("Cancel anytime") and the FAQ ("you can leave whenever you like")
 * all promised cancellation, and the product had no way to do it. The complete
 * Stripe subscription surface in this app was two read-only `retrieve` sweeps.
 *
 * The read side was already finished -- customer.subscription.updated and
 * .deleted are in the webhook scope, the projector allowlist and the worker
 * allowlist, and the projection RPC already writes cancel_at_period_end,
 * canceled_at and ended_at. So the contract worth pinning is narrow: make the
 * right request, record the intent before making it, and never write the
 * projector's row from here.
 */

const stripe = {
  update: vi.fn(async () => ({ cancel_at: 1_800_000_000 })),
  cancel: vi.fn(async () => ({ status: 'canceled' })),
};
const events: Array<Record<string, unknown>> = [];

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({ subscriptions: stripe }),
}));
vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: vi.fn(async (input: Record<string, unknown>) => { events.push(input); }),
}));

const {
  buildSubscriptionCancellationIdempotencyKey,
  cancelBasePlanSubscriptionAtPeriodEnd,
  cancelSubscriptionForAccountDeletion,
  basePlanSubscriptionCancellationEnabled,
} = await import('@/lib/billing/subscription-cancellation');

type Row = Record<string, unknown> | null;

function adminWith(row: Row, error: { message: string } | null = null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error }),
  };
  return { from: () => chain } as never;
}

const ACTIVE = {
  provider_subscription_id: 'sub_live_1',
  plan_code: 'growth',
  status: 'active',
  cancel_at_period_end: false,
  current_period_end: '2026-09-18T08:01:09.000Z',
};

beforeEach(() => {
  stripe.update.mockClear();
  stripe.cancel.mockClear();
  events.length = 0;
});

describe('scheduling a cancellation', () => {
  it('sets cancel_at_period_end rather than ending access already paid for', async () => {
    // The FAQ says cancellations take effect at renewal. Ending the workspace on
    // click would contradict the page and take away time they have bought.
    const result = await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(result.ok).toBe(true);
    expect(stripe.update).toHaveBeenCalledTimes(1);
    expect(stripe.update.mock.calls[0][1]).toEqual({ cancel_at_period_end: true });
    expect(stripe.cancel).not.toHaveBeenCalled();
  });

  it('records the request BEFORE calling Stripe', async () => {
    // If the process dies mid-request the record of what was asked for has to
    // survive; the projector supplies what actually happened.
    await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('subscription_cancellation_requested');
    expect(events[0].accountId).toBe('acct_1');
  });

  it('sends a stable idempotency key, so a double click is one API call', () => {
    const key = buildSubscriptionCancellationIdempotencyKey({
      workspaceId: 'acct_1', providerSubscriptionId: 'sub_live_1', mode: 'at_period_end',
    });
    expect(key).toBe(buildSubscriptionCancellationIdempotencyKey({
      workspaceId: 'acct_1', providerSubscriptionId: 'sub_live_1', mode: 'at_period_end',
    }));
    // Scheduling and ending immediately are different requests and must not
    // share a key, or the second would be answered with the first's result.
    expect(key).not.toBe(buildSubscriptionCancellationIdempotencyKey({
      workspaceId: 'acct_1', providerSubscriptionId: 'sub_live_1', mode: 'immediate',
    }));
    expect(key.startsWith('lgq:billing:v1:subscription.cancel:')).toBe(true);
  });

  it('is a no-op when it is already scheduled', async () => {
    const result = await cancelBasePlanSubscriptionAtPeriodEnd({
      admin: adminWith({ ...ACTIVE, cancel_at_period_end: true }), accountId: 'acct_1',
    });
    expect(result).toEqual({ ok: true, alreadyScheduled: true, currentPeriodEnd: ACTIVE.current_period_end });
    expect(stripe.update).not.toHaveBeenCalled();
    // No second intent row either -- nothing was requested that was not already true.
    expect(events).toHaveLength(0);
  });

  it('refuses when there is nothing to cancel', async () => {
    for (const row of [null, { ...ACTIVE, status: 'canceled' }, { ...ACTIVE, provider_subscription_id: null }]) {
      const result = await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(row), accountId: 'acct_1' });
      expect(result.ok).toBe(false);
    }
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('reports a Stripe failure instead of claiming success', async () => {
    stripe.update.mockRejectedValueOnce(new Error('card_declined'));
    const result = await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(result.ok).toBe(false);
    // The intent row still stands: it is the record that somebody asked.
    expect(events).toHaveLength(1);
  });
});

describe('deleting an account stops the billing', () => {
  it('cancels immediately, because nothing survives to project a later one onto', async () => {
    // billing_subscriptions.account_id is ON DELETE CASCADE, so deleting the
    // accounts row destroys the only local record while Stripe keeps charging.
    const result = await cancelSubscriptionForAccountDeletion({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(result.canceled).toBe(true);
    expect(stripe.cancel).toHaveBeenCalledWith('sub_live_1', expect.objectContaining({
      idempotencyKey: expect.stringContaining('lgq:billing:v1:subscription.cancel:'),
    }));
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('never throws, so a Stripe outage cannot trap somebody in an account', async () => {
    stripe.cancel.mockRejectedValueOnce(new Error('stripe down'));
    const result = await cancelSubscriptionForAccountDeletion({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(result.canceled).toBe(false);
    // The id has to come back, and be logged, or the still-billing subscription
    // is unfindable once its local row is gone.
    expect(result.subscriptionId).toBe('sub_live_1');
  });

  it('survives an unreadable subscription table', async () => {
    const result = await cancelSubscriptionForAccountDeletion({
      admin: adminWith(null, { message: 'permission denied' }), accountId: 'acct_1',
    });
    expect(result.canceled).toBe(false);
  });
});

describe('how it is wired', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

  it('is off by default and documented', () => {
    expect(basePlanSubscriptionCancellationEnabled({})).toBe(false);
    expect(basePlanSubscriptionCancellationEnabled({ LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED: '1' })).toBe(true);
    // Anything other than the exact string 1 is off, including 'true'.
    expect(basePlanSubscriptionCancellationEnabled({ LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED: 'true' })).toBe(false);
  });

  it('is called before the account row is deleted, not after', () => {
    const actions = read('src', 'app', 'dashboard', 'settings', 'actions.ts');
    const cancelAt = actions.indexOf('cancelSubscriptionForAccountDeletion');
    const deleteAt = actions.indexOf("from('accounts').delete()");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(-1);
    expect(cancelAt, 'the cascade destroys the subscription row, so cancelling after it is too late').toBeLessThan(deleteAt);
    // The stale note that said paid plans had not landed yet must be gone.
    expect(actions).not.toContain("SaaS billing subscriptions aren't created yet");
  });

  it('never writes the projector-owned row from the request path', () => {
    // Two writers on billing_subscriptions is how two sources of truth start.
    const lib = read('src', 'lib', 'billing', 'subscription-cancellation.ts');
    expect(lib).not.toContain(".update({ cancel_at_period_end");
    expect(lib).not.toContain("from('billing_subscriptions').update");
  });

  it('re-establishes the flag and the session inside the server action', () => {
    // A server action is a public endpoint; the component that rendered the
    // button proves nothing.
    const action = read('src', 'app', 'dashboard', 'settings', 'subscription-cancellation-actions.ts');
    expect(action).toContain('basePlanSubscriptionCancellationEnabled()');
    expect(action).toContain('requireOwnerContext()');
    expect(action).toContain('checkRateLimitStrict');
  });
});
