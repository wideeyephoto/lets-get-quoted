import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_PLANS, PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import { STRIPE_PLAN_PRICE_BINDINGS } from '@/lib/billing/stripe-plan-prices';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = read('scripts/seed-stripe-plan-prices.mjs');
const BINDINGS_SRC = read('src/lib/billing/stripe-plan-prices.ts');
const CATALOG_SRC = read('src/lib/billing/catalog.ts');

// The seeder is plain ESM run by node, so it cannot import the TypeScript
// modules. It parses the bindings and the catalog out of source rather than
// duplicating six price IDs and six amounts — a second copy of a number is a
// second thing to drift, and drift is exactly what the price contract rejects.
function parseBindingsAsScriptDoes(source: string) {
  return [...source.matchAll(
    /key: '([a-z_]+)',\s*\n\s*planCode: '([a-z]+)',\s*\n\s*billingInterval: '([a-z]+)',\s*\n\s*envKey: '([A-Z_]+)',/g,
  )].map(([, key, planCode, billingInterval, envKey]) => ({ key, planCode, billingInterval, envKey }));
}

function parseCatalogAsScriptDoes(source: string) {
  const plans: Record<string, { monthly: number; annual: number }> = {};
  for (const match of source.matchAll(/^ {2}([a-z]+): \{\n([\s\S]*?)^ {2}\},$/gm)) {
    const [, id, body] = match;
    const monthly = body.match(/^ {4}monthlyPriceCents: ([0-9_]+),/m)?.[1];
    const annual = body.match(/^ {4}annualPriceCents: ([0-9_]+),/m)?.[1];
    if (monthly && annual) {
      plans[id] = {
        monthly: Number(monthly.replace(/_/g, '')),
        annual: Number(annual.replace(/_/g, '')),
      };
    }
  }
  return plans;
}

describe('the plan price seeder', () => {
  it('parses exactly the bindings the module exports', () => {
    expect(parseBindingsAsScriptDoes(BINDINGS_SRC)).toEqual(
      STRIPE_PLAN_PRICE_BINDINGS.map((b) => ({
        key: b.key,
        planCode: b.planCode,
        billingInterval: b.billingInterval,
        envKey: b.envKey,
      })),
    );
  });

  it('refuses to guess when the bindings cannot be parsed', () => {
    expect(parseBindingsAsScriptDoes('export const STRIPE_PLAN_PRICE_BINDINGS = build();')).toEqual([]);
    expect(SCRIPT).toContain('Refusing to guess them');
  });

  it('parses catalog amounts that match the catalog itself', () => {
    const parsed = parseCatalogAsScriptDoes(CATALOG_SRC);
    for (const binding of STRIPE_PLAN_PRICE_BINDINGS) {
      const plan = BILLING_PLANS[binding.planCode];
      expect(parsed[binding.planCode]?.monthly).toBe(plan.monthlyPriceCents);
      expect(parsed[binding.planCode]?.annual).toBe(plan.annualPriceCents);
    }
  });

  it('does not mistake the nested voice price for the base plan price', () => {
    // Every paid plan carries a `voice:` block with its own monthlyPriceCents.
    // Matching that instead would seed a Price at the wrong amount, which the
    // contract would reject — but only after the wrong object existed in Stripe.
    const parsed = parseCatalogAsScriptDoes(CATALOG_SRC);
    expect(parsed.solo?.monthly).toBe(BILLING_PLANS.solo.monthlyPriceCents);
    expect(parsed.solo?.monthly).not.toBe(BILLING_PLANS.solo.voice.monthlyPriceCents);
  });

  it('stamps the catalog version it read, not a literal', () => {
    expect(SCRIPT).toContain("PRICING_CATALOG_VERSION = '([^']+)'");
    expect(SCRIPT).not.toContain(PRICING_CATALOG_VERSION);
  });

  it('requires the key mode to be chosen deliberately in both directions', () => {
    // A live key without --live would create real customer-visible products;
    // --live against a test key would seed the wrong account and report success.
    expect(SCRIPT).toContain("keyMode === 'live' && !WANT_LIVE");
    expect(SCRIPT).toContain("keyMode !== 'live' && WANT_LIVE");
  });

  it('sets every field the price contract requires', () => {
    for (const required of [
      "tax_behavior: 'exclusive'",
      "usage_type: 'licensed'",
      'interval_count: 1',
      "currency: 'usd'",
    ]) {
      expect(SCRIPT).toContain(required);
    }
    // Both must stay absent: the contract rejects a Price that carries either.
    expect(SCRIPT).not.toMatch(/trial_period_days:/);
    expect(SCRIPT).not.toMatch(/meter:/);
  });

  it('reads back with currency_options expanded', () => {
    // A Price can be created cleanly and still fail the contract on this field,
    // which is only populated when explicitly expanded.
    expect(SCRIPT).toContain("expand: ['currency_options']");
  });

  it('reuses an existing price rather than creating a duplicate', () => {
    expect(SCRIPT).toContain('prices.search');
    expect(SCRIPT).toContain('reused');
  });
});
