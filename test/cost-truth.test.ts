import { describe, it, expect } from 'vitest';
import {
  costConfidence,
  lineMargin,
  loadedHourlyRate,
  loadedLabourCost,
  marginVerdict,
  normalizeCostSource,
  priceBookCostCoverage,
  resolveBurdenPct,
} from '@/lib/cost-truth';

describe('resolveBurdenPct', () => {
  it('uses the crew member’s own figure when they have one', () => {
    expect(resolveBurdenPct(35, 20)).toBe(35);
  });

  it('falls back to the account default when theirs is unset', () => {
    expect(resolveBurdenPct(null, 20)).toBe(20);
    expect(resolveBurdenPct(undefined, 20)).toBe(20);
  });

  it('treats a crew member’s explicit 0 as a real answer, not as unset', () => {
    // A subcontractor carries no employer burden. That has to be expressible,
    // which is the whole reason the column is nullable.
    expect(resolveBurdenPct(0, 30)).toBe(0);
  });

  it('clamps nonsense rather than producing a negative cost', () => {
    expect(resolveBurdenPct(-10, 0)).toBe(0);
    expect(resolveBurdenPct(9999, 0)).toBe(200);
    expect(resolveBurdenPct('junk', 25)).toBe(25);
  });
});

describe('loadedLabourCost', () => {
  it('keeps wages and burden apart', () => {
    // The split is load-bearing: crew pay reads wages, margin reads both.
    // Returning one blended number would let burden reach a paycheque.
    expect(loadedLabourCost(8, 30, 25)).toEqual({ wages: 240, burden: 60, total: 300 });
  });

  it('charges no burden when none is set', () => {
    expect(loadedLabourCost(8, 30, 0)).toEqual({ wages: 240, burden: 0, total: 240 });
  });

  it('rounds to cents rather than carrying float noise into the ledger', () => {
    const { wages, burden } = loadedLabourCost(3.33, 27.5, 22);
    expect(wages).toBe(91.58);
    expect(burden).toBe(20.15);
  });

  it('refuses to invent cost from junk input', () => {
    expect(loadedLabourCost(-4, 30, 25).total).toBe(0);
    expect(loadedLabourCost(8, -30, 25).total).toBe(0);
    expect(loadedLabourCost(Number.NaN, 30, 25).total).toBe(0);
  });

  it('states the loaded hourly rate for the settings screen', () => {
    expect(loadedHourlyRate(30, 25)).toBe(37.5);
    expect(loadedHourlyRate(30, 0)).toBe(30);
  });
});

describe('lineMargin', () => {
  it('computes margin when the cost is known', () => {
    expect(lineMargin(200, 80)).toEqual({ margin: 0.6, profit: 120, known: true });
  });

  it('returns null — NOT 100% — when the cost is unknown', () => {
    // This is the trap the nullable column exists to avoid. A missing cost read
    // as $0 shows a perfect margin: wrong and flattering at once.
    expect(lineMargin(200, null)).toEqual({ margin: null, profit: null, known: false });
    expect(lineMargin(200, undefined)).toEqual({ margin: null, profit: null, known: false });
    expect(lineMargin(200, '')).toEqual({ margin: null, profit: null, known: false });
  });

  it('treats a genuine zero cost as known', () => {
    expect(lineMargin(200, 0)).toEqual({ margin: 1, profit: 200, known: true });
  });

  it('reports a negative margin rather than hiding it', () => {
    expect(lineMargin(100, 130).margin).toBeCloseTo(-0.3);
  });

  it('says nothing useful about a free line', () => {
    expect(lineMargin(0, 0).known).toBe(false);
  });
});

describe('priceBookCostCoverage', () => {
  it('counts how much of the book is costed', () => {
    const c = priceBookCostCoverage([{ unitCost: 10 }, { unitCost: null }, { unitCost: 0 }, { unitCost: null }]);
    expect(c).toEqual({ withCost: 2, total: 4, pct: 0.5 });
  });

  it('does not divide by zero on an empty book', () => {
    expect(priceBookCostCoverage([])).toEqual({ withCost: 0, total: 0, pct: 0 });
  });
});

describe('costConfidence', () => {
  it('weights by money, not by row count', () => {
    // Ten $4 guesses beside one $8,000 invoice is a well-evidenced job. Counting
    // rows would call it 91% guesswork and the number would be useless.
    const rows = [
      ...Array.from({ length: 10 }, () => ({ amount: 4, source: 'estimated' as const })),
      { amount: 8000, source: 'supplier_invoice' as const },
    ];
    const c = costConfidence(rows);
    expect(c.evidenced).toBe(8000);
    expect(c.estimated).toBe(40);
    expect(c.evidencedPct).toBeCloseTo(0.995, 3);
  });

  it('counts burden alongside the wage it sits on', () => {
    const c = costConfidence([{ amount: 240, burdenAmount: 60, source: 'clocked' }]);
    expect(c.evidenced).toBe(300);
    expect(c.total).toBe(300);
  });

  it('keeps legacy rows in their own bucket rather than calling them estimates', () => {
    const c = costConfidence([{ amount: 100, source: 'unspecified' }, { amount: 100, source: 'receipt' }]);
    expect(c.unrecorded).toBe(100);
    expect(c.estimated).toBe(0);
    expect(c.evidencedPct).toBe(0.5);
  });

  it('is quiet on an empty job instead of dividing by zero', () => {
    expect(costConfidence([]).evidencedPct).toBe(0);
  });
});

describe('normalizeCostSource', () => {
  it('keeps known sources and buckets anything else as unrecorded', () => {
    expect(normalizeCostSource('receipt')).toBe('receipt');
    expect(normalizeCostSource('clocked')).toBe('clocked');
    expect(normalizeCostSource('made up')).toBe('unspecified');
    expect(normalizeCostSource(null)).toBe('unspecified');
  });
});

describe('marginVerdict', () => {
  it('stays quiet when no floor is set', () => {
    const v = marginVerdict({ revenue: 1000, totalCost: 990, minMarginPct: 0 });
    expect(v.quiet).toBe(true);
    expect(v.message).toBeNull();
  });

  it('stays quiet on a job with no revenue yet', () => {
    // Otherwise every new job fires the moment its first cost lands.
    const v = marginVerdict({ revenue: 0, totalCost: 500, minMarginPct: 25 });
    expect(v.quiet).toBe(true);
    expect(v.below).toBe(false);
  });

  it('says nothing when the job clears the floor', () => {
    expect(marginVerdict({ revenue: 1000, totalCost: 500, minMarginPct: 25 }).message).toBeNull();
  });

  it('names both the margin and the floor when it falls short', () => {
    const v = marginVerdict({ revenue: 1000, totalCost: 850, minMarginPct: 25 });
    expect(v.below).toBe(true);
    expect(v.losing).toBe(false);
    expect(v.message).toBe('Margin is 15%, below your 25% floor.');
  });

  it('words an outright loss differently', () => {
    const v = marginVerdict({ revenue: 1000, totalCost: 1200, minMarginPct: 25 });
    expect(v.losing).toBe(true);
    expect(v.message).toContain('running at a loss');
  });

  it('hedges when most of the cost is guesswork', () => {
    // Telling someone they're losing money on numbers they estimated is how a
    // real warning gets trained away.
    const v = marginVerdict({ revenue: 1000, totalCost: 1200, minMarginPct: 25, evidencedPct: 0.2 });
    expect(v.message).toContain('estimated');
  });

  it('does not hedge when the cost is well evidenced', () => {
    const v = marginVerdict({ revenue: 1000, totalCost: 1200, minMarginPct: 25, evidencedPct: 0.9 });
    expect(v.message).not.toContain('estimated');
  });
});
