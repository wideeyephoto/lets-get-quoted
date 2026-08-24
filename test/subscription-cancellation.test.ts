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

// Parameters are declared, not inferred: without them vi.fn types `mock.calls`
// as a zero-length tuple, so reading calls[0][1] to check WHAT was sent to Stripe
// is a type error -- and one the runtime suite and `next build` both accept,
// because neither typechecks test/.
const stripe = {
  update: vi.fn(async (_id: string, _params: Record<string, unknown>, _options?: Record<string, unknown>) => (
    { cancel_at: 1_800_000_000 }
  )),
  cancel: vi.fn(async (_id: string, _options?: Record<string, unknown>) => ({ status: 'canceled' })),
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
  cancelPurchasedCapacitySubscriptionAtPeriodEnd,
  cancelSubscriptionForAccountDeletion,
  resumeBasePlanSubscription,
  basePlanSubscriptionCancellationEnabled,
} = await import('@/lib/billing/subscription-cancellation');

type Row = Record<string, unknown> | null;

function adminWith(row: Row, error: { message: string } | null = null, capacityRows: Record<string, unknown>[] = []) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error }),
    then: (resolve: (arg: unknown) => unknown) => resolve({ data: capacityRows, error }),
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

/**
 * These cases are about what the operation DOES once it is switched on, so the
 * switch is on for all of them. It did not need to be until the rollout flag
 * moved inside `cancelBasePlanSubscriptionAtPeriodEnd`: it used to be checked
 * only in the server action, which meant this whole file exercised a path a
 * customer could reach with the flag off. Whether the flag itself bites, and
 * which callers it covers, is test/subscription-cancellation-gate.test.ts -- kept
 * separate deliberately, because a file that holds the gate open is exactly the
 * file that cannot be trusted to test it.
 */
beforeEach(() => {
  process.env.LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED = '1';
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

  it('does not tell somebody to retry an error that will never come good', async () => {
    // resource_missing never becomes true by waiting. Production carries a
    // rehearsal subscription projected from a TEST-mode checkout session, and a
    // live key cannot see one, so this is the error that workspace's cancel
    // button actually returns -- a dead button that looks healthy.
    const missing = Object.assign(new Error('No such subscription'), {
      code: 'resource_missing', type: 'invalid_request_error',
    });
    stripe.update.mockRejectedValueOnce(missing);
    const result = await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(result.ok === false && result.error).not.toMatch(/try again/i);
    expect(result.ok === false && result.error).toMatch(/retrying will not help/i);
  });

  it('still says try again for a failure that genuinely might', async () => {
    // The other half, or the fix is just "always say permanent", which is the
    // same defect pointing the other way.
    stripe.update.mockRejectedValueOnce(Object.assign(new Error('upstream'), { type: 'api_connection_error' }));
    const result = await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(result.ok === false && result.error).toMatch(/try again in a moment/i);
  });
});

describe('restoring a plan before it lapses', () => {
  const SCHEDULED = { ...ACTIVE, cancel_at_period_end: true };

  it('clears the flag rather than starting a new subscription', async () => {
    // A new subscription would restart the billing period and charge them again
    // for time they have already bought.
    const result = await resumeBasePlanSubscription({ admin: adminWith(SCHEDULED), accountId: 'acct_1' });
    expect(result.ok).toBe(true);
    expect(stripe.update.mock.calls[0][1]).toEqual({ cancel_at_period_end: false });
    expect(stripe.cancel).not.toHaveBeenCalled();
  });

  it('records the intent BEFORE calling Stripe, like the cancel path', async () => {
    await resumeBasePlanSubscription({ admin: adminWith(SCHEDULED), accountId: 'acct_1' });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('subscription_cancellation_revoked');
    expect(events[0].accountId).toBe('acct_1');
  });

  it('keeps the renewal date, because an undo does not move it', async () => {
    // Read from the projected row, not off the Stripe response: v22 does not
    // carry current_period_end on the Subscription any more, so a reader that
    // trusted the response would quietly start returning null.
    const result = await resumeBasePlanSubscription({ admin: adminWith(SCHEDULED), accountId: 'acct_1' });
    expect(result.ok === true && result.currentPeriodEnd).toBe(ACTIVE.current_period_end);
  });

  it('is a no-op when nothing is scheduled', async () => {
    const result = await resumeBasePlanSubscription({ admin: adminWith(ACTIVE), accountId: 'acct_1' });
    expect(result).toEqual({ ok: true, alreadyActive: true, currentPeriodEnd: ACTIVE.current_period_end });
    expect(stripe.update).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('refuses once the period has actually ended', async () => {
    // Stripe will not revive a canceled subscription, and past that point
    // subscribing again is a new purchase rather than an undo. Saying so beats
    // sending a request that can only fail.
    for (const row of [null, { ...SCHEDULED, status: 'canceled' }]) {
      const result = await resumeBasePlanSubscription({ admin: adminWith(row), accountId: 'acct_1' });
      expect(result.ok).toBe(false);
    }
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('reports a Stripe failure instead of claiming success', async () => {
    stripe.update.mockRejectedValueOnce(new Error('api down'));
    const result = await resumeBasePlanSubscription({ admin: adminWith(SCHEDULED), accountId: 'acct_1' });
    expect(result.ok).toBe(false);
    expect(events).toHaveLength(1);
  });
});

describe('the toggle cannot be answered with a stale Stripe response', () => {
  const keyOf = (call: number): unknown =>
    (stripe.update.mock.calls[call][2] as Record<string, unknown> | undefined)?.idempotencyKey;

  it('gives a second cancellation a different key from the first', async () => {
    // THE REGRESSION. cancel_at_period_end is a toggle, and a key derived from
    // (workspace, subscription, mode) alone is stable for its whole life. Stripe
    // replays a cached response for 24 hours, so cancel -> resume -> cancel sent
    // the third request under the FIRST cancel's key: Stripe answered with the
    // old response without touching the subscription, the customer was shown
    // "Cancellation scheduled", nothing was scheduled, and they were charged at
    // renewal. updated_at is what the projector advances on every flip.
    await cancelBasePlanSubscriptionAtPeriodEnd({
      admin: adminWith({ ...ACTIVE, updated_at: 'T0' }), accountId: 'acct_1',
    });
    await resumeBasePlanSubscription({
      admin: adminWith({ ...ACTIVE, cancel_at_period_end: true, updated_at: 'T1' }), accountId: 'acct_1',
    });
    await cancelBasePlanSubscriptionAtPeriodEnd({
      admin: adminWith({ ...ACTIVE, updated_at: 'T2' }), accountId: 'acct_1',
    });

    expect(stripe.update).toHaveBeenCalledTimes(3);
    expect(keyOf(2), 'the re-cancellation reused the first cancellation key').not.toBe(keyOf(0));
    expect(new Set([keyOf(0), keyOf(1), keyOf(2)]).size).toBe(3);
  });

  it('still collapses a double click into one API call', async () => {
    // The property the key exists for, and the one the fix must not cost. Both
    // clicks see the same projected state, so both derive the same key.
    const row = { ...ACTIVE, updated_at: 'T0' };
    await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(row), accountId: 'acct_1' });
    await cancelBasePlanSubscriptionAtPeriodEnd({ admin: adminWith(row), accountId: 'acct_1' });
    expect(stripe.update).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('separates the two directions even at the same state', () => {
    // Belt and braces: a resume must never be answered with a cancel's response
    // even if both were derived from the same projected row.
    const at = { workspaceId: 'acct_1', providerSubscriptionId: 'sub_live_1', stateToken: 'T0' } as const;
    expect(buildSubscriptionCancellationIdempotencyKey({ ...at, mode: 'at_period_end' }))
      .not.toBe(buildSubscriptionCancellationIdempotencyKey({ ...at, mode: 'resume' }));
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
  it('cancels capacity subscriptions along with the base plan', async () => {
    const result = await cancelSubscriptionForAccountDeletion({
      admin: adminWith(ACTIVE, null, [{ stripe_subscription_id: 'sub_cap_1' }]),
      accountId: 'acct_1',
      preloadedCapacitySubscriptions: ['sub_cap_1'],
    });
    expect(result.canceled).toBe(true);
    expect(result.capacityCanceledCount).toBe(1);
    expect(stripe.cancel).toHaveBeenCalledWith('sub_cap_1', expect.anything());
  });
});

describe('scheduling capacity subscription cancellation', () => {
  const CAPACITY_ROW = {
    id: 'cap_1',
    top_up_id: 'crew_user',
    resource_code: 'crew_users',
    units: 1,
    stripe_subscription_id: 'sub_cap_1',
    status: 'active',
    current_period_end: '2026-09-20T00:00:00Z',
  };

  it('updates Stripe with cancel_at_period_end and records an event', async () => {
    const result = await cancelPurchasedCapacitySubscriptionAtPeriodEnd({
      admin: adminWith(CAPACITY_ROW),
      accountId: 'acct_1',
      stripeSubscriptionId: 'sub_cap_1',
    });
    expect(result.ok).toBe(true);
    expect(stripe.update).toHaveBeenCalledWith('sub_cap_1', { cancel_at_period_end: true }, expect.anything());
    expect(events.some((e) => e.kind === 'purchased_capacity_cancellation_requested')).toBe(true);
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
    const action = read('src', 'app', 'dashboard', 'settings', 'subscription-cancellation-actions.ts');
    expect(action.split('requireOwnerContext()').length - 1).toBe(3);
    expect(action.split('checkRateLimitStrict(').length - 1).toBe(3);
  });

  it('rate-limits both directions out of ONE bucket', () => {
    // The pair is a toggle and each flip is a Stripe write. Separate buckets
    // would let somebody alternate cancel/resume and make twice the API calls
    // the limit was written to allow.
    const action = read('src', 'app', 'dashboard', 'settings', 'subscription-cancellation-actions.ts');
    expect(action.split('base-plan-cancel:${userId}').length - 1).toBe(2);
  });

  it('offers the undo in the panel rather than naming support', () => {
    const panel = read('src', 'app', 'dashboard', 'settings', 'CancelSubscriptionPanel.tsx');
    expect(panel).toContain('resumeBasePlanSubscriptionAction');
    // The promise this replaced. If it comes back, the mechanism went away.
    expect(panel).not.toContain('Contact support');
  });
});

describe('the pages that promise cancellation say where it is', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

  /**
   * Seven surfaces sold on "cancel anytime" while the product had no way to do
   * it. Naming the place is what makes the claim checkable by the reader, and a
   * page that goes back to promising without naming is the original defect.
   *
   * /terms is deliberately absent: it already states the right accurately, and
   * TERMS_VERSION is compared against stored acceptances, so editing it would
   * force every existing account to re-accept. subscription-consent.ts is absent
   * for a harder reason -- its text is SHA-256 pinned by a migration.
   */
  const SURFACES: Array<[string, string[]]> = [
    ['the home FAQ', ['src', 'lib', 'home-faqs.ts']],
    ['/faq', ['src', 'app', 'faq', 'page.tsx']],
    ['/features', ['src', 'app', 'features', 'page.tsx']],
    ['the flagship home CTA', ['src', 'components', 'flagship', 'flagship-home.tsx']],
    ['/home-classic', ['src', 'app', 'home-classic', 'page.tsx']],
    ['/home-editorial', ['src', 'app', 'home-editorial', 'page.tsx']],
    ['/home-next', ['src', 'app', 'home-next', 'page.tsx']],
  ];

  for (const [name, parts] of SURFACES) {
    it(`${name} names Settings`, () => {
      expect(read(...parts)).toContain('Settings');
    });
  }

  it('does not leave a bare "Cancel anytime" anywhere it used to sell one', () => {
    // The guard that bites. Every one of these files carried that exact phrase
    // with nothing after it, so a revert is caught rather than passing on the
    // strength of the word Settings appearing somewhere else in a long file.
    for (const [name, parts] of SURFACES) {
      const body = read(...parts);
      expect(body, `${name} promises cancellation without saying how`)
        .not.toMatch(/Cancel anytime(?!\s+from Settings)/);
    }
  });

  it('does not touch the two texts that are pinned', () => {
    // Changing either invalidates evidence rather than improving copy.
    const consent = read('src', 'lib', 'billing', 'subscription-consent.ts');
    expect(consent).toContain('f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75');
    expect(read('src', 'app', 'terms', 'page.tsx')).toContain('cancellation takes effect at the end of the current paid billing period');
  });
});
