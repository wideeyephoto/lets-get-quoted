import { describe, it, expect } from 'vitest';
import { computeMargin, parseQuoteItems } from '@/lib/jobs';
import type { Cost } from '@/lib/jobs';

// The two functions in jobs.ts that decide money and had no tests: the margin
// shown on every job and in Insights, and the parser that turns a jsonb column
// into the quote total.

const cost = (type: Cost['type'], amount: number): Cost => ({ type, amount } as unknown as Cost);

describe('computeMargin', () => {
  it('splits costs into the three buckets the UI draws', () => {
    const margin = computeMargin({ quoted_amount: 10000 }, [
      cost('material', 1000),
      cost('labor', 2000),
      cost('other', 500),
    ]);
    expect(margin).toEqual({
      revenue: 10000,
      materialsCost: 1000,
      // Labour now reports the wage and the employer burden on it separately.
      // laborCost is their sum and is what the total is built from.
      laborWages: 2000,
      laborBurden: 0,
      laborCost: 2000,
      otherCost: 500,
      totalCost: 3500,
      profit: 6500,
      margin: 0.65,
    });
  });

  it('adds employer burden to labour cost without touching the wage', () => {
    // The split is the safety property: crew pay reads the wage, and only
    // margin is allowed to add burden on top of it.
    const margin = computeMargin({ quoted_amount: 10000 }, [{ ...cost('labor', 2000), burden_amount: 500 }]);
    expect(margin.laborWages).toBe(2000);
    expect(margin.laborBurden).toBe(500);
    expect(margin.laborCost).toBe(2500);
    expect(margin.totalCost).toBe(2500);
  });

  it('treats a pre-burden cost row as zero burden rather than NaN', () => {
    const legacy = { ...cost('labor', 2000) } as Record<string, unknown>;
    delete legacy.burden_amount;
    const margin = computeMargin({ quoted_amount: 10000 }, [legacy as never]);
    expect(margin.laborBurden).toBe(0);
    expect(margin.laborCost).toBe(2000);
  });

  it('counts subcontractors and receipts as materials, not as nothing', () => {
    const margin = computeMargin({ quoted_amount: 1000 }, [cost('sub', 200), cost('receipt', 100)]);
    expect(margin.materialsCost).toBe(300);
    expect(margin.totalCost).toBe(300);
  });

  // THE ONE THAT MATTERS. Five cost_type values exist in the schema and each is
  // routed to a bucket. Add a sixth and forget to route it and nothing breaks —
  // it silently falls out of totalCost, profit goes UP, margin goes UP, and the
  // next job gets priced off a number that is too good.
  it('routes EVERY cost type into totalCost — an unrouted type inflates profit', () => {
    const every: Cost['type'][] = ['material', 'labor', 'sub', 'receipt', 'other'];
    const costs = every.map((type) => cost(type, 100));
    const margin = computeMargin({ quoted_amount: 1000 }, costs);
    expect(margin.totalCost).toBe(every.length * 100);
    // Said again as a sum of the buckets, so a type routed to no bucket fails here too.
    expect(margin.materialsCost + margin.laborCost + margin.otherCost).toBe(margin.totalCost);
    expect(margin.profit).toBe(500);
  });

  it('reports a loss rather than clamping at zero', () => {
    const margin = computeMargin({ quoted_amount: 1000 }, [cost('labor', 1500)]);
    expect(margin.profit).toBe(-500);
    expect(margin.margin).toBe(-0.5);
  });

  it('calls an unpriced job 0% rather than dividing by zero', () => {
    const margin = computeMargin({ quoted_amount: 0 }, [cost('labor', 500)]);
    expect(margin.margin).toBe(0);
    expect(Number.isFinite(margin.margin)).toBe(true);
    expect(margin.profit).toBe(-500);
  });

  it('is 100% on a job with nothing logged — an absence of data, not a real margin', () => {
    // The UI is responsible for saying "no costs yet"; the arithmetic here is
    // still 100% and pinning it stops somebody "fixing" it to 0.
    expect(computeMargin({ quoted_amount: 4000 }, []).margin).toBe(1);
  });

  it('coerces string amounts, which is how numeric columns arrive', () => {
    const margin = computeMargin({ quoted_amount: '1000' as unknown as number }, [
      { type: 'labor', amount: '250.50' } as unknown as Cost,
    ]);
    expect(margin.revenue).toBe(1000);
    expect(margin.laborCost).toBe(250.5);
  });
});

describe('parseQuoteItems', () => {
  it('returns nothing for a legacy job with no items', () => {
    expect(parseQuoteItems(null)).toEqual([]);
    expect(parseQuoteItems(undefined)).toEqual([]);
    expect(parseQuoteItems('not an array')).toEqual([]);
    expect(parseQuoteItems({})).toEqual([]);
  });

  it('drops rows that could never be priced', () => {
    const items = parseQuoteItems([
      { label: 'Real', amount: 100 },
      { label: '', amount: 100 }, // no label
      { label: '   ', amount: 100 }, // whitespace only
      { label: 'No amount' }, // missing
      { label: 'Not a number', amount: 'abc' },
      null,
      'nonsense',
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Real');
  });

  it('never lets a negative line reduce the quote', () => {
    expect(parseQuoteItems([{ label: 'Discount', amount: -500 }])[0].amount).toBe(0);
  });

  it('rounds to cents, so a pasted long decimal cannot store sub-cent precision', () => {
    expect(parseQuoteItems([{ label: 'Odd', amount: 12.3456 }])[0].amount).toBe(12.35);
  });

  it('treats an unknown kind as a base line — included, not silently dropped', () => {
    const items = parseQuoteItems([{ label: 'Mystery', amount: 100, kind: 'wat' }]);
    expect(items[0].kind).toBe('base');
    expect(items[0].selected).toBe(true);
  });

  it('includes base lines always and add-ons only when selected', () => {
    const items = parseQuoteItems([
      { label: 'Base', amount: 100 },
      { label: 'Chosen add-on', amount: 50, kind: 'addon', selected: true },
      { label: 'Offered add-on', amount: 75, kind: 'addon' },
    ]);
    expect(items.map((item) => item.selected)).toEqual([true, true, false]);
  });

  it('only lets an ADD-ON be recommended — the badge is meaningless elsewhere', () => {
    const items = parseQuoteItems([
      { label: 'Base', amount: 100, recommended: true },
      { label: 'Add-on', amount: 50, kind: 'addon', selected: true, recommended: true },
    ]);
    expect(items[0].recommended).toBe(false);
    expect(items[1].recommended).toBe(true);
  });

  it('carries subscription terms, defaulting the cadence to monthly', () => {
    const [plan] = parseQuoteItems([
      { label: 'Maintenance', amount: 99, kind: 'subscription', termCycles: 6, prepayDiscountPercent: 10 },
    ]);
    expect(plan).toMatchObject({ kind: 'subscription', frequency: 'monthly', termCycles: 6, prepayDiscountPercent: 10, signedUp: false });
    // A subscription is always "on" — it is not an optional upsell.
    expect(plan.selected).toBe(true);
  });

  it('clamps a nonsense term and discount instead of trusting them', () => {
    const [plan] = parseQuoteItems([
      { label: 'Plan', amount: 99, kind: 'subscription', termCycles: -4, prepayDiscountPercent: 500 },
    ]);
    expect(plan.termCycles).toBe(0);
    expect(plan.prepayDiscountPercent).toBe(100);
  });

  it('leaves subscription fields off a non-subscription line', () => {
    const [base] = parseQuoteItems([{ label: 'Base', amount: 100, frequency: 'weekly', termCycles: 9 }]);
    expect(base.frequency).toBeUndefined();
    expect(base.termCycles).toBeUndefined();
  });

  it('keeps a real id and invents a stable one only when missing', () => {
    const items = parseQuoteItems([
      { id: 'keep-me', label: 'A', amount: 1 },
      { label: 'B', amount: 2 },
      { id: '', label: 'C', amount: 3 },
    ]);
    expect(items.map((item) => item.id)).toEqual(['keep-me', 'qi-2', 'qi-3']);
  });

  it('numbers invented ids by POSITION KEPT, not by position read', () => {
    // A dropped row must not leave a gap — two items both called qi-2 would
    // collide as React keys and as the id an accept-plan action posts back.
    const items = parseQuoteItems([{ label: '', amount: 1 }, { label: 'A', amount: 1 }, { label: 'B', amount: 2 }]);
    expect(items.map((item) => item.id)).toEqual(['qi-1', 'qi-2']);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});
