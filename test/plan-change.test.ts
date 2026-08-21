import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Moving between paid plans, which the product had no surface for at all: the
 * checkout form is gated on `planCode === 'flex'`, so it renders only for a
 * workspace that never subscribed, and both seat top-ups are withheld. A Growth
 * customer who outgrew ten crew seats could not give us more money by any
 * self-serve route.
 *
 * THE ASSERTION THAT MATTERS MOST is that the Stripe update carries the new
 * price and the new METADATA together. The projector builds its contract from
 * subscription metadata, not from the Price, and refuses a mismatch with
 * `provider_price_contract_mismatch` -- a terminal code, never retried, already
 * present on a dead-lettered row in production. Change the price alone and
 * Stripe invoices the proration immediately, then every later event
 * dead-letters: the customer has paid for Growth and the product still says
 * Solo, permanently.
 */

const stripe = {
  update: vi.fn(async (_id: string, _params: Record<string, unknown>, _options?: Record<string, unknown>) => ({ id: 'sub_1' })),
};
const events: Array<Record<string, unknown>> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const cancelAtPeriodEnd = vi.fn(async (_input: Record<string, unknown>) => (
  { ok: true as const, alreadyScheduled: false, currentPeriodEnd: '2026-09-18T08:01:09.000Z' }
));

vi.mock('@/lib/stripe', () => ({ getStripeClient: () => ({ subscriptions: stripe }) }));
vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: vi.fn(async (input: Record<string, unknown>) => { events.push(input); }),
}));
vi.mock('@/lib/billing/subscription-cancellation', () => ({
  cancelBasePlanSubscriptionAtPeriodEnd: (input: Record<string, unknown>) => cancelAtPeriodEnd(input),
}));
vi.mock('@/lib/billing/stripe-plan-prices', () => ({
  loadVerifiedStripePlanPrices: async () => ({
    solo_monthly: price('solo', 'monthly', 'price_solo_m'),
    solo_annual: price('solo', 'annual', 'price_solo_a'),
    growth_monthly: price('growth', 'monthly', 'price_growth_m'),
    growth_annual: price('growth', 'annual', 'price_growth_a'),
    scale_monthly: price('scale', 'monthly', 'price_scale_m'),
    scale_annual: price('scale', 'annual', 'price_scale_a'),
  }),
}));

function price(planCode: string, billingInterval: string, priceId: string) {
  return { priceId, planCode, billingInterval, catalogVersion: '2026-08-18-preview' };
}

const {
  assertMetadataMatchesPrice,
  buildPlanChangeIdempotencyKey,
  changeBasePlan,
  planChangeOptions,
} = await import('@/lib/billing/plan-change');

type Row = Record<string, unknown> | null;

function adminWith(row: Row) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return {
    from: () => chain,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: true, error: null };
    },
  } as never;
}

const GROWTH_MONTHLY = {
  provider_subscription_id: 'sub_1',
  provider_subscription_item_id: 'si_1',
  plan_code: 'growth',
  billing_interval: 'monthly',
  status: 'active',
  current_period_start: '2026-08-18T08:01:09.000Z',
  current_period_end: '2026-09-18T08:01:09.000Z',
  pending_plan_code: null,
  pending_billing_interval: null,
  pending_effective_at: null,
  updated_at: 'T0',
};

beforeEach(() => {
  stripe.update.mockClear();
  cancelAtPeriodEnd.mockClear();
  events.length = 0;
  rpcCalls.length = 0;
  vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
});

describe('an upgrade on the same billing cycle', () => {
  it('sends the new price AND the new metadata in one call', async () => {
    // The whole point. Either alone is a defect; together they are the contract.
    const result = await changeBasePlan({
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok).toBe(true);
    expect(stripe.update).toHaveBeenCalledTimes(1);
    const params = stripe.update.mock.calls[0][1] as Record<string, unknown>;
    expect(params.items).toEqual([{ id: 'si_1', price: 'price_scale_m' }]);
    expect(params.metadata).toMatchObject({
      lgq_plan_code: 'scale',
      lgq_billing_interval: 'monthly',
      lgq_catalog_version: '2026-08-18-preview',
    });
  });

  it('invoices the difference now, because it activates on payment', async () => {
    await changeBasePlan({
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect((stripe.update.mock.calls[0][1] as Record<string, unknown>).proration_behavior)
      .toBe('always_invoice');
  });

  it('records the intent BEFORE calling Stripe', async () => {
    await changeBasePlan({
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('plan_change_requested');
  });

  it('refuses when the subscription has no Stripe line item', async () => {
    // Falling back to items[0] would be wrong for any subscription that ever
    // gains a second line, and it would move money.
    const result = await changeBasePlan({
      admin: adminWith({ ...GROWTH_MONTHLY, provider_subscription_item_id: null }),
      accountId: 'acct_1', targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok).toBe(false);
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('tells somebody a decline is not worth retrying blindly', async () => {
    stripe.update.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'card_declined' }));
    const result = await changeBasePlan({
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok === false && result.error).toMatch(/declined/i);
  });
});

describe('the metadata guard', () => {
  it('throws rather than letting a mismatched pair reach Stripe', () => {
    // Throwing, not returning ok:false: this condition means the CODE is wrong,
    // and by the time Stripe has invoiced the proration the money has moved and
    // the projection failure is terminal.
    expect(() => assertMetadataMatchesPrice(
      { lgq_plan_code: 'growth', lgq_billing_interval: 'monthly', lgq_catalog_version: '2026-08-18-preview' },
      { planCode: 'scale', billingInterval: 'monthly', catalogVersion: '2026-08-18-preview' },
    )).toThrow(/provider_price_contract_mismatch/);
  });

  it('catches a stale catalog version too', () => {
    expect(() => assertMetadataMatchesPrice(
      { lgq_plan_code: 'scale', lgq_billing_interval: 'monthly', lgq_catalog_version: '2026-08-15-preview' },
      { planCode: 'scale', billingInterval: 'monthly', catalogVersion: '2026-08-18-preview' },
    )).toThrow();
  });

  it('passes a matched pair', () => {
    expect(() => assertMetadataMatchesPrice(
      { lgq_plan_code: 'scale', lgq_billing_interval: 'annual', lgq_catalog_version: '2026-08-18-preview' },
      { planCode: 'scale', billingInterval: 'annual', catalogVersion: '2026-08-18-preview' },
    )).not.toThrow();
  });
});

describe('changes that wait for renewal', () => {
  it('schedules a downgrade instead of applying it now', async () => {
    const result = await changeBasePlan({
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'solo', targetBillingInterval: 'monthly',
    });
    expect(result.ok && result.kind).toBe('scheduled');
    // No Stripe call at all: sending the price change now would take effect
    // immediately, which is what schedule_at_renewal exists to prevent.
    expect(stripe.update).not.toHaveBeenCalled();
    expect(rpcCalls[0].name).toBe('set_billing_subscription_pending_plan');
    expect(rpcCalls[0].args).toMatchObject({
      p_pending_plan_code: 'solo',
      p_pending_billing_interval: 'monthly',
      p_pending_effective_at: '2026-09-18T08:01:09.000Z',
    });
  });

  it('waits for renewal when a tier upgrade also switches billing cycle', async () => {
    // The rule that is easy to get wrong: growth->scale is immediate on the same
    // cycle, and NOT immediate if it also moves monthly->annual, because
    // otherwise an annual subscriber could escape their term by bundling the two.
    const result = await changeBasePlan({
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'annual',
    });
    expect(result.ok && result.kind).toBe('scheduled');
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('routes a downgrade to Flex through cancellation, not a pending row', async () => {
    // pending_plan_code's CHECK admits only paid codes. Writing null would mean
    // "nothing scheduled" while still reporting success -- a scheduled downgrade
    // that silently never happens. Cancelling already ends the plan at period
    // end and drops the workspace to Flex, which IS this transition.
    const result = await changeBasePlan({
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'flex', targetBillingInterval: 'none',
    });
    expect(result.ok && result.kind).toBe('scheduled');
    expect(cancelAtPeriodEnd).toHaveBeenCalledTimes(1);
    expect(rpcCalls.filter((c) => c.name === 'set_billing_subscription_pending_plan')).toHaveLength(0);
  });
});

describe('the toggle cannot be answered with a stale Stripe response', () => {
  it('gives a re-change a different key from the first', () => {
    // solo -> growth -> solo is ordinary. Stripe replays a cached response for
    // 24 hours, so without a state token the third request would be answered
    // with the first one's result and the subscription would never move.
    const base = { workspaceId: 'acct_1', providerSubscriptionId: 'sub_1', targetPlanCode: 'growth', targetBillingInterval: 'monthly' } as const;
    expect(buildPlanChangeIdempotencyKey({ ...base, stateToken: 'T0' }))
      .not.toBe(buildPlanChangeIdempotencyKey({ ...base, stateToken: 'T2' }));
  });

  it('still collapses a double click inside one render', () => {
    const base = { workspaceId: 'acct_1', providerSubscriptionId: 'sub_1', targetPlanCode: 'growth', targetBillingInterval: 'monthly', stateToken: 'T0' } as const;
    expect(buildPlanChangeIdempotencyKey(base)).toBe(buildPlanChangeIdempotencyKey(base));
  });

  it('separates targets at the same state', () => {
    const base = { workspaceId: 'acct_1', providerSubscriptionId: 'sub_1', stateToken: 'T0' } as const;
    expect(buildPlanChangeIdempotencyKey({ ...base, targetPlanCode: 'scale', targetBillingInterval: 'monthly' }))
      .not.toBe(buildPlanChangeIdempotencyKey({ ...base, targetPlanCode: 'scale', targetBillingInterval: 'annual' }));
  });
});

describe('the options a workspace is offered', () => {
  const subscription = {
    providerSubscriptionId: 'sub_1',
    providerSubscriptionItemId: 'si_1',
    planCode: 'growth' as const,
    billingInterval: 'monthly' as const,
    status: 'active',
    currentPeriodStart: '2026-08-18T08:01:09.000Z',
    currentPeriodEnd: '2026-09-18T08:01:09.000Z',
    pendingPlanCode: null,
    pendingBillingInterval: null,
    pendingEffectiveAt: null,
    updatedAt: 'T0',
  };

  it('labels each move with when it actually takes effect', () => {
    const options = planChangeOptions(subscription, Date.parse('2026-08-25T00:00:00.000Z'));
    const find = (plan: string, interval: string) =>
      options.find((o) => o.planCode === plan && o.billingInterval === interval);
    expect(find('scale', 'monthly')?.effect, 'same-cycle upgrade is immediate').toBe('immediate');
    expect(find('scale', 'annual')?.effect, 'cycle change waits, even upgrading').toBe('at_renewal');
    expect(find('solo', 'monthly')?.effect, 'downgrade waits').toBe('at_renewal');
    expect(find('flex', 'none')?.effect).toBe('at_renewal');
  });

  it('never offers the plan the workspace is already on', () => {
    const options = planChangeOptions(subscription, Date.parse('2026-08-25T00:00:00.000Z'));
    expect(options.some((o) => o.planCode === 'growth' && o.billingInterval === 'monthly')).toBe(false);
  });
});

describe('how it is wired', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

  it('re-validates the target inside the server action', () => {
    // A server action is a public endpoint; the form that rendered the buttons
    // proves nothing about what was submitted.
    const action = read('src', 'app', 'dashboard', 'settings', 'plan-change-actions.ts');
    expect(action).toContain('requireOwnerContext()');
    expect(action).toContain('checkRateLimitStrict(');
    expect(action).toContain('parseTarget(');
    // Both actions share one bucket: the pair is a toggle and each flip is a
    // Stripe write, so separate buckets would double the allowance.
    expect(action.split('base-plan-change:${userId}').length - 1).toBe(2);
  });

  it('clears the pending row only AFTER Stripe accepts', () => {
    // Clearing first loses the intent if the call fails, and the customer
    // silently stays where they are on a date they were told they would move.
    const worker = read('src', 'lib', 'billing', 'plan-change-worker.ts');
    const updateAt = worker.indexOf('stripe.subscriptions.update');
    const clearAt = worker.indexOf("set_billing_subscription_pending_plan");
    expect(updateAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(updateAt);
  });

  it('carries the same metadata rule into the renewal worker', () => {
    // The worker changes a price too, so it has the identical dead-letter
    // exposure. A fix applied to only one of the two paths is not a fix.
    const worker = read('src', 'lib', 'billing', 'plan-change-worker.ts');
    expect(worker).toContain('SUBSCRIPTION_CHECKOUT_METADATA_KEYS.planCode');
    expect(worker).toContain('metadata,');
    expect(worker).toContain("proration_behavior: 'none'");
  });

  it('schedules the renewal worker, or nothing would ever apply', () => {
    const vercel = JSON.parse(read('vercel.json')) as { crons: Array<{ path: string }> };
    expect(vercel.crons.some((c) => c.path === '/api/cron/plan-change-apply')).toBe(true);
  });

  it('declares every account-event kind it writes', () => {
    const kinds = read('src', 'lib', 'account-events.ts');
    for (const kind of ['plan_change_requested', 'plan_change_scheduled', 'plan_change_cancelled', 'plan_change_applied']) {
      expect(kinds, `${kind} is written but not declared`).toContain(`'${kind}'`);
    }
  });
});

describe('the panel says what just happened to the money', () => {
  const PANEL = readFileSync(
    join(process.cwd(), 'src/app/dashboard/settings/ChangePlanPanel.tsx'), 'utf8');

  it('confirms an activated upgrade, which is the one that charges', () => {
    // changeBasePlan sends proration_behavior: 'always_invoice', so an upgrade
    // invoices on the spot. Nothing acknowledged it: the action revalidated, the
    // current-plan line quietly changed from Solo to Growth, and somebody who
    // had just been charged was left to infer that from a noun.
    expect(PANEL).toContain("success.kind === 'activated'");
    expect(PANEL).toContain('has been charged to your card on file');
  });

  it('promises nothing was charged for a scheduled change', () => {
    expect(PANEL).toContain("success.kind === 'scheduled'");
    expect(PANEL).toContain('nothing is charged');
  });

  it('handles all three success kinds, not two', () => {
    // The union is no_change | activated | scheduled. Writing this from memory
    // produced 'immediate', which does not exist -- the typechecker caught it.
    // A no_change branch that said "done" would imply something happened.
    expect(PANEL).toContain('already on');
    for (const kind of ['activated', 'scheduled']) {
      expect(PANEL, kind).toContain(`success.kind === '${kind}'`);
    }
  });

  it('renders the note in both branches', () => {
    // A scheduled change revalidates into the pending branch, which returns
    // early -- so a note rendered only in the main branch would be dropped on
    // the way through by the very change that produced it.
    expect(PANEL.match(/\{successNote\}/g) ?? []).toHaveLength(2);
  });
});
