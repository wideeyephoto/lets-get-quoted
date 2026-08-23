import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { BILLING_PLANS, PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import { STRIPE_API_VERSION } from '@/lib/stripe';

/**
 * DISCOVERY. What base-plan Prices exist in this Stripe account, and what
 * catalog version is stamped on each? Read-only.
 *
 *   STRIPE_SECRET_KEY=<key> npm run preflight:prices:discover
 *
 * WHY THIS EXISTS SEPARATELY FROM THE BINDING PREFLIGHT. The six
 * STRIPE_PRICE_* values are Sensitive in Vercel: write-only, unreadable by
 * anyone including their owner. So the binding preflight can only run inside a
 * Production runtime, and until somebody does that, nobody can say whether the
 * bound Prices are stale.
 *
 * This asks a narrower question that needs no bindings at all -- only a key --
 * and it is the question that decides the work: does a correctly-stamped Price
 * EXIST for each plan and interval? If none does, new Prices have to be created
 * whatever is bound. If they all do, the job is only to confirm the bindings
 * point at them.
 *
 * WHAT IT CANNOT TELL YOU, and must not be read as telling you: which Prices
 * are actually bound. A Price can be perfect and unbound, and a stale one can
 * be the one in use. Do not conclude checkout is fixed from a clean run here.
 *
 * It filters on `lgq_price_purpose = base_plan` rather than trusting IDs from a
 * document, because a documented ID is a reconstruction and testing a
 * reconstruction produces a confident answer about the wrong object.
 */

const KEY = process.env.STRIPE_SECRET_KEY;
const CONFIGURED = Boolean(KEY);

type Row = {
  plan: string;
  interval: string;
  version: string;
  amount: number | null;
  active: boolean;
  livemode: boolean;
  id: string;
};

describe('base-plan Prices that exist in this Stripe account', () => {
  it('has a key, or says so', () => {
    expect(CONFIGURED, 'set STRIPE_SECRET_KEY (a restricted read key is enough)').toBe(true);
  });

  it.skipIf(!CONFIGURED)('reports every base-plan Price and its catalog version', async () => {
    const stripe = new Stripe(KEY!, { apiVersion: STRIPE_API_VERSION, typescript: true });

    // Listed rather than searched: search is indexed asynchronously and can lag
    // a Price that was created moments ago, which is exactly when somebody
    // would be running this.
    const rows: Row[] = [];
    for await (const price of stripe.prices.list({ limit: 100, expand: [] })) {
      const md = price.metadata ?? {};
      if (md.lgq_price_purpose !== 'base_plan') continue;
      rows.push({
        plan: md.lgq_plan_code ?? '(none)',
        interval: md.lgq_billing_interval ?? '(none)',
        version: md.lgq_catalog_version ?? '(none)',
        amount: price.unit_amount,
        active: price.active,
        livemode: price.livemode,
        id: price.id,
      });
    }

    rows.sort((a, b) => a.plan.localeCompare(b.plan) || a.interval.localeCompare(b.interval));

    console.log(`\nPRICING_CATALOG_VERSION = ${PRICING_CATALOG_VERSION}`);
    console.log(`base-plan Prices found: ${rows.length}\n`);
    for (const r of rows) {
      const stale = r.version !== PRICING_CATALOG_VERSION;
      console.log(
        `${stale ? 'STALE' : 'ok   '} ${r.plan.padEnd(7)} ${r.interval.padEnd(8)}`
        + ` ${String(r.version).padEnd(20)} ${String(r.amount).padStart(7)}`
        + ` ${r.active ? 'active  ' : 'archived'} ${r.livemode ? 'live' : 'test'} ${r.id}`,
      );
    }

    // What matters for the decision: is there a usable Price for each of the
    // six plan/interval pairs at the CURRENT version?
    const need: Array<[string, string]> = [];
    for (const plan of ['solo', 'growth', 'scale']) {
      for (const interval of ['monthly', 'annual']) need.push([plan, interval]);
    }
    const missing = need.filter(([plan, interval]) => !rows.some((r) => (
      r.plan === plan && r.interval === interval
      && r.version === PRICING_CATALOG_VERSION && r.active && r.livemode
    )));

    console.log(
      `\nlive + active + current-version Prices missing for: `
      + (missing.length ? missing.map(([p, i]) => `${p}/${i}`).join(', ') : 'none'),
    );
    console.log(
      'This says what EXISTS, not what is BOUND. The six STRIPE_PRICE_* values\n'
      + 'are write-only in Vercel; only the binding preflight, run inside\n'
      + 'Production, can confirm which of these are actually in use.\n',
    );

    // Guards the guard: zero rows means the filter found nothing, which is a
    // different and much more alarming answer than "all six are fine".
    expect(rows.length, 'no base-plan Prices found at all -- wrong account, or wrong key mode?')
      .toBeGreaterThan(0);
    // Amounts should match the catalogue wherever a current-version Price exists.
    for (const r of rows.filter((x) => x.version === PRICING_CATALOG_VERSION && x.livemode)) {
      const plan = BILLING_PLANS[r.plan as keyof typeof BILLING_PLANS];
      if (!plan) continue;
      const expected = r.interval === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
      expect(r.amount, `${r.plan}/${r.interval} amount`).toBe(expected);
    }
  }, 120_000);
});
