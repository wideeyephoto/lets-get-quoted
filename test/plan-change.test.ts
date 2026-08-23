import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stripComments } from './helpers/source-text';

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
  // latest_invoice is what the ledger binds activation to, so the mock has to
  // be able to carry it -- in both the expanded and unexpanded Stripe shapes.
  update: vi.fn(async (_id: string, _params: Record<string, unknown>, _options?: Record<string, unknown>) => (
    { id: 'sub_1' } as { id: string; latest_invoice?: unknown }
  )),
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

const UNIT_AMOUNTS: Record<string, number> = {
  solo_monthly: 3900, solo_annual: 42000, growth_monthly: 12900,
  growth_annual: 118800, scale_monthly: 32900, scale_annual: 358800,
};

function price(planCode: string, billingInterval: string, priceId: string) {
  return {
    priceId,
    productId: `prod_${planCode}`,
    planCode,
    billingInterval,
    catalogVersion: '2026-08-18-preview',
    unitAmountCents: UNIT_AMOUNTS[`${planCode}_${billingInterval}`],
  };
}

// assertConfiguredStripeBillingMode compares three things: the configured mode,
// the secret key's own prefix, and the mode of the subscription being changed.
// All three are test mode here.
process.env.LGQ_STRIPE_BILLING_LIVEMODE = '0';
process.env.STRIPE_SECRET_KEY = 'sk_test_harnesskey123';

/** The owner seam. The real recorder needs auth.uid(); this one just answers. */
const recordConsent = vi.fn(async () => ({ acceptanceId: ACCEPTANCE_ID } as never));
const OWNER = { supabase: null, accountId: 'acct_1', userId: 'user_1' } as never;
const ACCEPTANCE_ID = '90000000-0000-4000-8000-000000000009';
const OPERATION_PK = 'a0000000-0000-4000-8000-00000000000a';
/** The disclosure the panel renders, ticked. Minting refuses without it. */
const AFFIRMED = {
  accepted: true,
  consentVersion: 'base-plan-recurring-2026-08-16',
  consentTextSha256: 'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75',
};
const CLAIM_TOKEN = 'b0000000-0000-4000-8000-00000000000b';

const {
  BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_FLAG,
  buildPlanChangeIdempotencyKey,
  changeBasePlan,
  planChangeOptions,
} = await import('@/lib/billing/plan-change');

type Row = Record<string, unknown> | null;

/**
 * The admin client the plan-change path uses. Two reads share it: the
 * subscription row, and the plan-change ledger's bound acceptance -- so the
 * table name decides which row comes back, and the ledger answers empty unless a
 * test says otherwise.
 */
function adminWith(row: Row, options: {
  boundAcceptance?: Row;
  claim?: Record<string, unknown> | null;
  claimError?: { message: string } | null;
  acceptError?: { message: string } | null;
} = {}) {
  const make = (data: Row) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data, error: null }),
    };
    return chain;
  };
  return {
    from: (table: string) => make(
      table === 'billing_subscription_plan_change_operations'
        ? (options.boundAcceptance ?? null)
        : row,
    ),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'claim_stripe_billing_subscription_plan_change') {
        if (options.claimError) return { data: null, error: options.claimError };
        return {
          data: options.claim === undefined
            ? { claim_status: 'claimed', operation_pk: OPERATION_PK, operation_state: 'submitted', claim_token: CLAIM_TOKEN }
            : options.claim,
          error: null,
        };
      }
      if (name === 'mark_stripe_billing_subscription_plan_change_accepted') {
        return { data: true, error: options.acceptError ?? null };
      }
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
  // The rail is gated off by default and these tests are about what the
  // operation DOES once it is allowed to run. Turning it on explicitly here
  // rather than in a setup file keeps that visible: every assertion below is
  // conditional on a flag that is 0 in every deployed environment today.
  process.env[BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_FLAG] = '1';
  stripe.update.mockClear();
  stripe.update.mockReset();
  stripe.update.mockResolvedValue({ id: 'sub_1', latest_invoice: 'in_default123' });
  recordConsent.mockClear();
  cancelAtPeriodEnd.mockClear();
  events.length = 0;
  rpcCalls.length = 0;
  vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
});

describe('an upgrade on the same billing cycle', () => {
  it('sends the new price AND the new metadata in one call', async () => {
    // The whole point. Either alone is a defect; together they are the contract.
    const result = await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
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
    await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect((stripe.update.mock.calls[0][1] as Record<string, unknown>).proration_behavior)
      .toBe('always_invoice');
  });

  it('records the intent BEFORE calling Stripe', async () => {
    await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('plan_change_requested');
  });

  it('refuses when the subscription has no Stripe line item', async () => {
    // Falling back to items[0] would be wrong for any subscription that ever
    // gains a second line, and it would move money.
    const result = await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith({ ...GROWTH_MONTHLY, provider_subscription_item_id: null }),
      accountId: 'acct_1', targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok).toBe(false);
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('tells somebody a decline is not worth retrying blindly', async () => {
    stripe.update.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'card_declined' }));
    const result = await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok === false && result.error).toMatch(/declined/i);
  });
});

describe('the metadata guard that never guarded anything', () => {
  // stripComments, or this fails against the comment that explains the
  // deletion -- a comment naming a removed symbol reads exactly like the
  // symbol. Three tests in this repo have hit that; the helper exists for it.
  const source = stripComments(readFileSync(
    join(process.cwd(), 'src', 'lib', 'billing', 'plan-change.ts'), 'utf8',
  ));

  it('is gone, and has not come back', () => {
    // assertMetadataMatchesPrice compared metadata built by
    // planChangeMetadata(target) against prices[`${planCode}_${billingInterval}`].
    // The resolver copies planCode and billingInterval off the definition found
    // by that same key, and both catalogVersions are the one imported
    // PRICING_CATALOG_VERSION binding. Three comparisons of a value with
    // itself; the throw could not fire.
    expect(source).not.toContain('assertMetadataMatchesPrice');
  });

  it('no longer has the file header resting its safety argument on it', () => {
    // RAW here, not stripped -- this assertion is ABOUT the prose. The header is
    // what made a dead guard worse than no guard: it told the next reader the
    // coupling could not be broken by accident, and named a function that could
    // not detect it being broken.
    const raw = readFileSync(
      join(process.cwd(), 'src', 'lib', 'billing', 'plan-change.ts'), 'utf8',
    );
    const header = raw.slice(0, raw.indexOf('export type PaidPlanCode'));
    expect(header).not.toMatch(/exists so that cannot be done by accident/);
    // The replacement has to NAME the check that does read Stripe, or the next
    // reader finds a deletion with no successor and re-adds the dead one.
    expect(header).toContain('validatePrice');
  });

  it('names the check that does read Stripe, so the contract is still stated', () => {
    // loadVerifiedStripePlanPrices -> validatePrice compares the live Price's
    // own metadata to the catalog and fails price_contract_mismatch, so a
    // disagreeing Price never reaches this file. Deleting the dead guard is not
    // a loosening, and this pins the reason.
    const prices = readFileSync(
      join(process.cwd(), 'src', 'lib', 'billing', 'stripe-plan-prices.ts'), 'utf8',
    );
    expect(prices).toContain('price_contract_mismatch');
  });
});

describe('changes that wait for renewal', () => {
  it('schedules a downgrade instead of applying it now', async () => {
    const result = await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
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
    const result = await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
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
    const result = await changeBasePlan({ owner: OWNER, recordConsent, affirmation: AFFIRMED,
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
    livemode: false,
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

/**
 * The durable ledger row, and the order it has to be written in.
 *
 * Everything here exists because the webhook can arrive before
 * `subscriptions.update()` returns. A row written after the Stripe call leaves
 * the projector meeting an event with no operation to bind, which dead-letters
 * it -- the original bug from the other side.
 */
describe('the plan-change operation ledger', () => {
  const rowFor = (name: string) => rpcCalls.find((call) => call.name === name);

  it('claims the operation BEFORE Stripe, and names it in the metadata', async () => {
    let rpcsWhenStripeRan = -1;
    stripe.update.mockImplementationOnce(async () => {
      rpcsWhenStripeRan = rpcCalls.filter(
        (c) => c.name === 'claim_stripe_billing_subscription_plan_change',
      ).length;
      return { id: 'sub_1', latest_invoice: 'in_proration123' };
    });

    const result = await changeBasePlan({
      owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok).toBe(true);

    // Order, not merely presence.
    expect(rpcsWhenStripeRan, 'the row must exist before the Stripe call').toBe(1);

    const claim = rowFor('claim_stripe_billing_subscription_plan_change');
    const operationId = claim?.args.p_operation_id;
    expect(typeof operationId).toBe('string');

    // The projector binds an event to its operation through this metadata key.
    // Without it every event keeps resolving to the ORIGINAL checkout operation,
    // which still holds the old price, so the binding refuses and the change
    // never projects.
    const [, params] = stripe.update.mock.calls[0];
    const metadata = (params as { metadata: Record<string, string> }).metadata;
    expect(metadata.lgq_operation_id).toBe(operationId);
    expect(metadata.lgq_plan_code).toBe('scale');
    expect(metadata.lgq_catalog_version).toBe('2026-08-18-preview');

    // ...and the idempotency key the claim recorded is the one Stripe was sent.
    const [, , options] = stripe.update.mock.calls[0];
    expect((options as { idempotencyKey: string }).idempotencyKey)
      .toBe(claim?.args.p_stripe_idempotency_key);
  });

  it('records the exact proration invoice, because activation binds to it', async () => {
    stripe.update.mockResolvedValueOnce({ id: 'sub_1', latest_invoice: { id: 'in_proration456' } });
    await changeBasePlan({
      owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    // Expanded and unexpanded latest_invoice both reach here depending on the
    // API version; both must resolve to the id.
    expect(rowFor('mark_stripe_billing_subscription_plan_change_accepted')?.args.p_proration_invoice_id)
      .toBe('in_proration456');
  });

  it('never reports activation from Stripe merely accepting the change', async () => {
    // always_invoice with the default payment_behavior of allow_incomplete
    // leaves the proration invoice open when collection fails, and does NOT
    // throw. So the ledger may only reach provider_accepted here; only the
    // projector, seeing that invoice paid, may activate.
    await changeBasePlan({
      owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(rowFor('mark_stripe_billing_subscription_plan_change_accepted')).toBeDefined();
    expect(rpcCalls.some((c) => c.name.includes('activated'))).toBe(false);
  });

  it('separates a Stripe that answered from a Stripe that did not', async () => {
    // A response means Stripe decided and the change did not apply -> abandon.
    stripe.update.mockRejectedValueOnce(Object.assign(new Error('no'), { statusCode: 402 }));
    await changeBasePlan({
      owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(rowFor('abandon_stripe_billing_subscription_plan_change')).toBeDefined();
    expect(rowFor('mark_stripe_billing_subscription_plan_change_indeterminate')).toBeUndefined();

    rpcCalls.length = 0;
    // No response means nobody knows whether it applied. That is exactly what
    // 'indeterminate' is for, and it is reconciliation-only because a blind
    // retry could apply the change twice.
    stripe.update.mockRejectedValueOnce(new Error('socket hang up'));
    await changeBasePlan({
      owner: OWNER, recordConsent, affirmation: AFFIRMED,
      admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(rowFor('mark_stripe_billing_subscription_plan_change_indeterminate')).toBeDefined();
    expect(rowFor('abandon_stripe_billing_subscription_plan_change')).toBeUndefined();
  });

  it('reuses the acceptance already bound to a retried operation', async () => {
    // Consent evidence is single-use. Minting a fresh acceptance for a retry of
    // the same operation makes the claim's replay branch see a different
    // acceptance id and report a conflict the customer cannot act on.
    const admin = adminWith(GROWTH_MONTHLY, {
      boundAcceptance: {
        recurring_consent_acceptance_id: ACCEPTANCE_ID,
        plan_code: 'scale',
        billing_interval: 'monthly',
        purpose: 'base_plan_plan_change',
      },
      claim: {
        claim_status: 'replay', operation_pk: OPERATION_PK,
        operation_state: 'submitted', claim_token: CLAIM_TOKEN,
      },
    });
    const result = await changeBasePlan({
      owner: OWNER, recordConsent, admin, accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok).toBe(true);
    expect(recordConsent, 'a bound acceptance must not be re-minted').not.toHaveBeenCalled();
    expect(rowFor('claim_stripe_billing_subscription_plan_change')?.args.p_recurring_consent_acceptance_id)
      .toBe(ACCEPTANCE_ID);
  });

  it('will not send a second subscriptions.update for a resolved operation', async () => {
    // Anything past 'submitted' has already been applied, abandoned or is
    // indeterminate. Re-sending would apply the change twice and prorate twice.
    // The token is deliberately NON-null. A resolved row cannot really carry
    // one -- the state shape CHECK forbids it -- but if the only thing stopping
    // a second send were the missing token, this guard would be decoration and
    // any future RPC change that returned a token would silently re-charge.
    for (const claim_status of ['activated', 'provider_accepted', 'abandoned', 'indeterminate']) {
      stripe.update.mockClear();
      const admin = adminWith(GROWTH_MONTHLY, {
        claim: { claim_status, operation_pk: OPERATION_PK, operation_state: claim_status, claim_token: CLAIM_TOKEN },
      });
      await changeBasePlan({
        owner: OWNER, recordConsent, affirmation: AFFIRMED, admin, accountId: 'acct_1',
        targetPlanCode: 'scale', targetBillingInterval: 'monthly',
      });
      expect(stripe.update, `${claim_status} must not re-send`).not.toHaveBeenCalled();
    }
  });

  it('does not call Stripe at all when the claim is refused', async () => {
    const admin = adminWith(GROWTH_MONTHLY, { claimError: { message: 'a plan change requires an active paid workspace' } });
    const result = await changeBasePlan({
      owner: OWNER, recordConsent, affirmation: AFFIRMED, admin, accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    });
    expect(result.ok).toBe(false);
    expect(stripe.update).not.toHaveBeenCalled();
  });
});

/**
 * The consent trail only evidences something if a human saw the disclosure.
 *
 * The server used to mint an acceptance unconditionally, which would have
 * recorded a specific human agreeing to a specific recurring amount they were
 * never shown. The guard sits at the one site that mints consent, so it cannot
 * become one of the unreachable copies this file has already had to delete once.
 */
describe('the recurring billing authorization', () => {
  const affirmed = {
    accepted: true,
    consentVersion: 'base-plan-recurring-2026-08-16',
    consentTextSha256: 'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75',
  };

  const upgrade = (affirmation: unknown) => changeBasePlan({
    owner: OWNER, recordConsent,
    admin: adminWith(GROWTH_MONTHLY), accountId: 'acct_1',
    targetPlanCode: 'scale', targetBillingInterval: 'monthly',
    affirmation: affirmation as never,
  });

  it('charges nothing without it', async () => {
    for (const missing of [
      null,
      undefined,
      { ...affirmed, accepted: false },
      // A stale tab: ticked, but against a disclosure that is no longer current.
      { ...affirmed, consentVersion: 'base-plan-recurring-2026-01-01' },
      { ...affirmed, consentTextSha256: '0'.repeat(64) },
    ]) {
      stripe.update.mockClear();
      recordConsent.mockClear();
      const result = await upgrade(missing);
      expect(result.ok, JSON.stringify(missing)).toBe(false);
      expect(recordConsent, 'no acceptance may be minted').not.toHaveBeenCalled();
      expect(stripe.update, 'and no card may be charged').not.toHaveBeenCalled();
    }
  });

  it('proceeds once the exact rendered artifact comes back', async () => {
    const result = await upgrade(affirmed);
    expect(result.ok).toBe(true);
    expect(recordConsent).toHaveBeenCalledTimes(1);
    expect(stripe.update).toHaveBeenCalledTimes(1);
  });

  it('is not demanded again for an operation that already has an acceptance', async () => {
    // The row already carries single-use evidence from the first attempt.
    // Demanding a fresh tick would strand a retry that is otherwise idempotent.
    const admin = adminWith(GROWTH_MONTHLY, {
      boundAcceptance: {
        recurring_consent_acceptance_id: ACCEPTANCE_ID,
        plan_code: 'scale',
        billing_interval: 'monthly',
        purpose: 'base_plan_plan_change',
      },
    });
    const result = await changeBasePlan({
      owner: OWNER, recordConsent, admin, accountId: 'acct_1',
      targetPlanCode: 'scale', targetBillingInterval: 'monthly',
      affirmation: null,
    });
    expect(result.ok).toBe(true);
    expect(recordConsent).not.toHaveBeenCalled();
  });
});
