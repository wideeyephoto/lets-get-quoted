import { describe, expect, it } from 'vitest';

import { ADD_ONS } from '@/app/pricing/pricing-catalog';
import { SELLABLE_TOP_UP_IDS, TOP_UPS, TOP_UPS_WITHHELD } from '@/lib/billing/catalog';

/**
 * The public page prices only SKUs customers can actually buy.
 *
 * Both purchase paths refuse a withheld SKU -- top-up-purchase.ts fails
 * `sku_withheld` and the projector blocks `fulfillment_withheld` -- and the
 * dashboard's own picker is built from SELLABLE_TOP_UP_IDS.
 *
 * The rule is: this page LISTS and PRICES only what checkout will actually sell.
 */
describe('the public add-on list prices only what can be bought', () => {
  const priced = ADD_ONS.filter((item) => /\$/.test(item.price));
  const labelToId = new Map([
    ...Object.values(TOP_UPS).map((t) => [t.label, t.id] as const),
    ['250 AI credits', 'ai_writing_250' as const],
  ]);

  it('quotes a dollar figure only for a sellable SKU', () => {
    for (const item of priced) {
      const id = labelToId.get(item.label);
      expect(id, item.label).toBeDefined();
      expect(SELLABLE_TOP_UP_IDS, item.label).toContain(id!);
    }
    expect(priced).toHaveLength(SELLABLE_TOP_UP_IDS.length - 1);
    expect(priced.length).toBeGreaterThan(0);
  });

  it('excludes withheld SKUs so no unpurchasable items appear', () => {
    for (const item of ADD_ONS) {
      const id = labelToId.get(item.label);
      expect(id).toBeDefined();
      expect(TOP_UPS_WITHHELD).not.toHaveProperty(id!);
    }
  });

  it('agrees with the dashboard about what is for sale', () => {
    const pageSellable = new Set(priced.map((i) => labelToId.get(i.label)));
    const expectedSellable = SELLABLE_TOP_UP_IDS.filter((id) => id !== 'ai_intake_100');
    expect([...pageSellable].sort()).toEqual([...expectedSellable].sort());
  });
});
