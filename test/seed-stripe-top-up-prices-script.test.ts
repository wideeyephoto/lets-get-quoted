import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRICING_CATALOG_VERSION, TOP_UPS, TOP_UPS_WITHHELD } from '@/lib/billing/catalog';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = read('scripts/seed-stripe-top-up-prices.mjs');
const CATALOG = read('src/lib/billing/catalog.ts');

// The seeder is plain ESM run by node, so it cannot import the TypeScript
// catalog. It parses the SKUs out of source rather than restating eight prices
// and eight unit counts, because a second copy of a published price is a second
// thing to drift from the appendix.
function parseSkusAsScriptDoes(source: string) {
  const block = source.match(/export const TOP_UPS[^=]*= \{\n([\s\S]*?)\n\} as const;/);
  if (!block) return [];
  return [...block[1].matchAll(/^  ([a-z0-9_]+): \{\n([\s\S]*?)^  \},$/gm)].map(([, id, body]) => {
    const field = (name: string) => body.match(new RegExp('^\\s+' + name + ': (.+?),$', 'm'))?.[1];
    const num = (name: string) => Number(String(field(name) ?? '').replace(/_/g, ''));
    return {
      id,
      priceCents: num('priceCents'),
      recurring: field('recurring') === 'true',
      resourceCode: field('resourceCode')?.replace(/^'|'$/g, ''),
      units: num('units'),
    };
  });
}

describe('the top-up SKU seeder', () => {
  it('parses every SKU exactly as the catalog defines it', () => {
    const parsed = parseSkusAsScriptDoes(CATALOG);
    expect(parsed).toHaveLength(Object.keys(TOP_UPS).length);
    for (const sku of parsed) {
      const canonical = TOP_UPS[sku.id as keyof typeof TOP_UPS];
      expect(canonical, `unknown SKU ${sku.id}`).toBeTruthy();
      expect(sku.priceCents).toBe(canonical.priceCents);
      expect(sku.units).toBe(canonical.units);
      expect(sku.recurring).toBe(canonical.recurring);
      expect(sku.resourceCode).toBe(canonical.resourceCode);
    }
  });

  it('refuses to guess when the SKU table cannot be parsed', () => {
    expect(parseSkusAsScriptDoes('export const TOP_UPS = build();')).toEqual([]);
    expect(SCRIPT).toContain('Refusing to guess the SKUs');
    expect(SCRIPT).toContain('Refusing to report success');
  });

  it('reads the withheld list from the catalog rather than keeping its own', () => {
    // Two copies of this list would eventually disagree, and the disagreement
    // would be a SKU sold that should not have been.
    expect(SCRIPT).toContain('TOP_UPS_WITHHELD');
    expect(SCRIPT).not.toContain("office_user:");
    expect(SCRIPT).not.toContain("crew_user:");
    // Silently skipping them would make the run read as "all eight are live",
    // which is the confusion the appendix status key exists to prevent.
    expect(SCRIPT).toContain('WITHHELD -');
    expect(Object.keys(TOP_UPS_WITHHELD).sort()).toEqual([
      // Every one is priced, published and unsellable, and this list is the
      // single place that decides which -- so it is pinned rather than derived.
      //
      // crew_user left this list on 2026-08-20 and came back on 2026-08-23.
      // Everything the 2026-08-20 note says is still true: 20260819010000 fills
      // the ledger on payment, the lifecycle sweep empties it on lapse, and
      // `workspace_purchased_capacity_units` counts only `active` and `past_due`.
      // Those were FULFILMENT blockers and they are closed.
      //
      // What was never on that list is CANCELLATION. crew_user is the only
      // recurring SKU here, buying one opens a Stripe subscription, and no code
      // in the product can end it -- every subscription write resolves through
      // billing_subscriptions, which a top-up subscription never enters. 'Empties
      // on lapse' is the tell: something reclaims capacity WHEN it lapses, and
      // nothing lets the contractor make it lapse.
      'ai_voice_flex', 'ai_voice_growth', 'ai_voice_solo', 'crew_user',
      'office_user', 'storage_100gb', 'voice_minutes_100',
    ]);
    // Both remain in the price book; what is withheld is the sale.
    expect(TOP_UPS.office_user).toBeTruthy();
    expect(TOP_UPS.crew_user).toBeTruthy();
    for (const reason of Object.values(TOP_UPS_WITHHELD)) {
      expect(reason?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('stamps the catalog version it read rather than a literal', () => {
    expect(SCRIPT).toContain("PRICING_CATALOG_VERSION = '([^']+)'");
    expect(SCRIPT).not.toContain(PRICING_CATALOG_VERSION);
  });

  it('requires the key mode to be chosen deliberately in both directions', () => {
    expect(SCRIPT).toContain("keyMode === 'live' && !WANT_LIVE");
    expect(SCRIPT).toContain("keyMode !== 'live' && WANT_LIVE");
  });

  it('makes one-time SKUs one-time and recurring SKUs monthly', () => {
    // Five credit packs are one-time; storage is the only recurring capacity SKU
    // among those seeded. Getting this backwards would bill a credit pack every
    // month forever.
    const oneTime = Object.values(TOP_UPS).filter((s) => !s.recurring).map((s) => s.id);
    expect(oneTime).toContain('text_1000');
    expect(TOP_UPS.storage_100gb.recurring).toBe(true);
    expect(SCRIPT).toContain('sku.recurring');
    expect(SCRIPT).toContain("interval: 'month', interval_count: 1, usage_type: 'licensed'");
  });

  it('resolves by metadata instead of adding six more env bindings', () => {
    // The six plan Prices bind through env vars and a single stale one fails the
    // whole load — which is exactly what the catalog version bump forced.
    expect(SCRIPT).toContain("metadata['lgq_top_up_id']");
    expect(SCRIPT).toContain('lgq_catalog_version');
    expect(SCRIPT).not.toMatch(/STRIPE_PRICE_TOPUP/);
  });

  it('reads back with currency_options expanded and reuses rather than duplicating', () => {
    expect(SCRIPT).toContain("expand: ['currency_options']");
    expect(SCRIPT).toContain('prices.search');
    expect(SCRIPT).toContain('reused');
  });

  it('never sets a field the price contract rejects', () => {
    expect(SCRIPT).not.toMatch(/trial_period_days:/);
    expect(SCRIPT).not.toMatch(/tiers:/);
    expect(SCRIPT).not.toMatch(/transform_quantity:/);
    expect(SCRIPT).toContain("tax_behavior: 'exclusive'");
  });
});
