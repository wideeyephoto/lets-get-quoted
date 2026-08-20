import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { PRICING_CATALOG_VERSION, BILLING_PLANS } from '@/lib/billing/catalog';
import { STRIPE_API_VERSION } from '@/lib/stripe';
import {
  STRIPE_PLAN_PRICE_BINDINGS,
  loadVerifiedStripePlanPrices,
} from '@/lib/billing/stripe-plan-prices';

/**
 * LIVE PREFLIGHT. Reads the six bound Stripe Prices and says, per Price,
 * whether checkout would accept it. Talks to Stripe; changes nothing.
 *
 *   npm run preflight:prices
 *
 * WHY IT EXISTS. `stripe-billing-subscription-checkout.ts` compares each Price's
 * `lgq_catalog_version` metadata against PRICING_CATALOG_VERSION
 * character-for-character and throws when they differ. The customer sees "Plan
 * checkout is not configured for this environment. Nothing was charged." --
 * deliberately uninformative, so a stale Price reads as a broken deploy. There
 * was no way to find out before a customer hit it.
 *
 * IT CALLS THE REAL VALIDATOR. `loadVerifiedStripePlanPrices` is the same
 * function checkout uses, so this cannot pass while checkout fails. A preflight
 * with its own copy of the contract would eventually disagree with the thing it
 * is meant to predict, and the disagreement would surface as a customer-facing
 * failure that "passed preflight".
 *
 * IT ALSO PRINTS A RAW READ of all six, because the validator throws on the
 * FIRST problem. Fixing six Prices one rerun at a time is six deploys of
 * somebody's afternoon; the table shows every mismatch at once.
 *
 * WHAT IT DOES NOT ASSUME. Nobody has read the live Prices since the catalog
 * moved on 2026-08-18, and the last claim of version drift in this repo turned
 * out to be read from source rather than live state and was wrong. This asks
 * Stripe rather than repeating that.
 */

const KEY = process.env.STRIPE_SECRET_KEY;
const MODE = process.env.LGQ_STRIPE_BILLING_LIVEMODE;

/**
 * What is missing, if anything. Computed once so the live checks can SKIP
 * rather than fail: a machine without the Production variables should report
 * one honest line, not three failures topped by a Stripe SDK error about a
 * missing api key. Run this where the variables are.
 */
const MISSING = [
  ...(KEY ? [] : ['STRIPE_SECRET_KEY']),
  ...(MODE === '1' || MODE === '0' ? [] : ['LGQ_STRIPE_BILLING_LIVEMODE (must be 1 or 0)']),
  ...STRIPE_PLAN_PRICE_BINDINGS.filter((b) => !process.env[b.envKey]).map((b) => b.envKey),
];
const CONFIGURED = MISSING.length === 0;

const expectedAmount = (planCode: string, interval: string) => {
  const plan = BILLING_PLANS[planCode as keyof typeof BILLING_PLANS];
  return interval === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
};

describe('the six bound Stripe Prices', () => {
  it('has the credentials it needs, or says which are missing', () => {
    expect(MISSING, `not configured here: ${MISSING.join(', ')}`).toEqual([]);
  });

  it.skipIf(!CONFIGURED)('reports every Price, so six problems take one pass not six', async () => {
    const stripe = new Stripe(KEY!, { apiVersion: STRIPE_API_VERSION, typescript: true });
    const rows: string[] = [];
    let mismatches = 0;

    for (const binding of STRIPE_PLAN_PRICE_BINDINGS) {
      const id = process.env[binding.envKey]!;
      let price: Stripe.Price;
      try {
        price = await stripe.prices.retrieve(id);
      } catch (error) {
        rows.push(`${binding.envKey.padEnd(28)} UNREADABLE  ${(error as Error).message}`);
        mismatches += 1;
        continue;
      }

      const md = price.metadata ?? {};
      const want = {
        lgq_price_purpose: 'base_plan',
        lgq_plan_code: binding.planCode,
        // The footgun the operator docs call out: this vocabulary is
        // monthly/annual, NOT the month/year that recurring.interval uses.
        lgq_billing_interval: binding.billingInterval,
        lgq_catalog_version: PRICING_CATALOG_VERSION,
      } as Record<string, string>;

      const problems: string[] = [];
      for (const [k, v] of Object.entries(want)) {
        if (md[k] !== v) problems.push(`${k}: ${JSON.stringify(md[k] ?? null)} != ${JSON.stringify(v)}`);
      }
      const amount = expectedAmount(binding.planCode, binding.billingInterval);
      if (price.unit_amount !== amount) problems.push(`unit_amount: ${price.unit_amount} != ${amount}`);
      if (price.currency !== 'usd') problems.push(`currency: ${price.currency} != usd`);
      if (price.livemode !== (MODE === '1')) problems.push(`livemode: ${price.livemode} != ${MODE === '1'}`);
      if (price.active !== true) problems.push('active: false');
      const wantInterval = binding.billingInterval === 'annual' ? 'year' : 'month';
      if (price.recurring?.interval !== wantInterval) {
        problems.push(`recurring.interval: ${price.recurring?.interval} != ${wantInterval}`);
      }
      if (price.recurring?.interval_count !== 1) {
        problems.push(`recurring.interval_count: ${price.recurring?.interval_count} != 1`);
      }

      if (problems.length) mismatches += 1;
      rows.push(
        `${binding.envKey.padEnd(28)} ${problems.length ? 'FAIL' : 'ok  '} ${id}`
        + (problems.length ? `\n    ${problems.join('\n    ')}` : ''),
      );
    }

    console.log(`\nPRICING_CATALOG_VERSION = ${PRICING_CATALOG_VERSION}\n`);
    console.log(rows.join('\n'));
    console.log('');

    expect(mismatches, `${mismatches} of ${STRIPE_PLAN_PRICE_BINDINGS.length} Prices would be refused`)
      .toBe(0);
  }, 60_000);

  it.skipIf(!CONFIGURED)('passes the real checkout validator, which is the verdict that counts', async () => {
    // Throws StripePlanPriceBindingError with a code and the binding it failed
    // on. If the table above is clean and this still throws, the contract has
    // grown a field the table does not print -- read validatePrice.
    const verified = await loadVerifiedStripePlanPrices();
    expect(Object.keys(verified).sort())
      .toEqual(STRIPE_PLAN_PRICE_BINDINGS.map((b) => b.key).sort());
    for (const snapshot of Object.values(verified)) {
      expect(snapshot.catalogVersion).toBe(PRICING_CATALOG_VERSION);
    }
  }, 60_000);
});
