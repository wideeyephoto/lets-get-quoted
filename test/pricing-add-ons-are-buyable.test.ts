import { describe, expect, it } from 'vitest';

import { ADD_ONS } from '@/app/pricing/pricing-catalog';
import { SELLABLE_TOP_UP_IDS, TOP_UPS, TOP_UPS_WITHHELD } from '@/lib/billing/catalog';

/**
 * The public page priced seven SKUs nobody could buy.
 *
 * Both purchase paths refuse a withheld SKU -- top-up-purchase.ts fails
 * `sku_withheld` and the projector blocks `fulfillment_withheld` -- and the
 * dashboard's own picker is built from SELLABLE_TOP_UP_IDS. So the only surface
 * still quoting "$15/month" for an office user was the one a stranger reads
 * before deciding to sign up, and the settings page they landed on had never
 * offered it.
 *
 * The rule is narrow and worth keeping: this page may LIST anything, and may
 * PRICE only what checkout will actually sell.
 */
describe('the public add-on list prices only what can be bought', () => {
  const priced = ADD_ONS.filter((item) => /\$/.test(item.price));
  const soon = ADD_ONS.filter((item) => !item.available);
  const labelToId = new Map(Object.values(TOP_UPS).map((t) => [t.label, t.id]));

  it('quotes a dollar figure only for a sellable SKU', () => {
    for (const item of priced) {
      const id = labelToId.get(item.label);
      expect(id, item.label).toBeDefined();
      expect(SELLABLE_TOP_UP_IDS, item.label).toContain(id!);
    }
    // Guards the guard: an empty ADD_ONS would satisfy every loop above.
    expect(priced).toHaveLength(SELLABLE_TOP_UP_IDS.length);
    expect(priced.length).toBeGreaterThan(0);
  });

  it('shows every withheld SKU as coming soon, with no price at all', () => {
    expect(soon).toHaveLength(Object.keys(TOP_UPS_WITHHELD).length);
    for (const item of soon) {
      expect(item.price, item.label).toBe('Coming soon');
      // Not just "no dollar sign" -- no number a reader could take as a rate.
      expect(item.price, item.label).not.toMatch(/\d/);
      expect(TOP_UPS_WITHHELD, item.label).toHaveProperty(labelToId.get(item.label)!);
    }
  });

  it('still lists all of them, because withholding a sale is not hiding a plan', () => {
    expect(ADD_ONS.map((i) => i.label).sort())
      .toEqual(Object.values(TOP_UPS).map((t) => t.label).sort());
  });

  it('puts the buyable ones first', () => {
    // A list that opens with four things you cannot have reads as a product
    // that is not ready, whatever the individual rows say.
    const firstUnavailable = ADD_ONS.findIndex((i) => !i.available);
    const lastAvailable = ADD_ONS.map((i) => i.available).lastIndexOf(true);
    expect(firstUnavailable).toBeGreaterThan(lastAvailable);
  });

  it('agrees with the dashboard about what is for sale', () => {
    // The two surfaces derive from the same map, so this is a wiring check: if
    // one is ever rebuilt from a hand-kept list, they part company silently.
    const pageSellable = new Set(priced.map((i) => labelToId.get(i.label)));
    expect([...pageSellable].sort()).toEqual([...SELLABLE_TOP_UP_IDS].sort());
  });
});
