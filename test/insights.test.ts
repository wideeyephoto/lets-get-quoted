import { describe, it, expect } from 'vitest';
import { monthlyRunRate, computeDelta, metricsForRange, buildTrend } from '@/lib/insights';

describe('monthlyRunRate', () => {
  it('normalizes each cadence to a monthly run-rate', () => {
    expect(monthlyRunRate(100, 'weekly')).toBeCloseTo((100 * 52) / 12, 5);
    expect(monthlyRunRate(100, 'biweekly')).toBeCloseTo((100 * 26) / 12, 5);
    expect(monthlyRunRate(100, 'monthly')).toBe(100);
  });
  it('coerces string amounts and ignores non-positive / unknown cadence', () => {
    expect(monthlyRunRate('200' as unknown as number, 'monthly')).toBe(200);
    expect(monthlyRunRate(0, 'weekly')).toBe(0);
    expect(monthlyRunRate(-50, 'monthly')).toBe(0);
    expect(monthlyRunRate(100, 'yearly')).toBe(0);
  });
});

describe('computeDelta', () => {
  it('computes signed percentage change and direction', () => {
    expect(computeDelta(150, 100)).toEqual({ pct: 50, direction: 'up' });
    expect(computeDelta(50, 100)).toEqual({ pct: -50, direction: 'down' });
    expect(computeDelta(100, 100)).toEqual({ pct: 0, direction: 'flat' });
  });
  it('rounds to whole percent', () => {
    expect(computeDelta(133, 100).pct).toBe(33);
    expect(computeDelta(1, 3)).toEqual({ pct: -67, direction: 'down' });
  });
  it('returns a null pct when there is no prior basis', () => {
    expect(computeDelta(100, 0)).toEqual({ pct: null, direction: 'up' });
    expect(computeDelta(0, 0)).toEqual({ pct: null, direction: 'flat' });
  });
});

describe('metricsForRange', () => {
  const data = {
    leads: [
      { status: 'won', created_at: '2026-06-15T00:00:00Z' },
      { status: 'quoted', created_at: '2026-06-20T00:00:00Z' },
      { status: 'lost', created_at: '2026-06-25T00:00:00Z' },
      { status: 'won', created_at: '2026-01-01T00:00:00Z' }, // out of window
    ],
    jobs: [
      { quoted_amount: 1000, status: 'complete', created_at: '2026-06-10T00:00:00Z' },
      { quoted_amount: 2000, status: 'new_lead', created_at: '2026-06-12T00:00:00Z' },
      { quoted_amount: 0, status: 'complete', created_at: '2026-06-12T00:00:00Z' }, // excluded from avg
    ],
    paid: [
      { amount: 500, created_at: '2026-06-11T00:00:00Z' },
      { amount: '250.50', created_at: '2026-06-18T00:00:00Z' }, // string numeric
      { amount: 999, created_at: '2026-01-01T00:00:00Z' }, // out of window
    ],
    costs: [
      { type: 'labor', amount: 100, created_at: '2026-06-11T00:00:00Z' },
      { type: 'material', amount: 50, created_at: '2026-06-12T00:00:00Z' },
      { type: 'sub', amount: '25', created_at: '2026-06-13T00:00:00Z' },
      { type: 'labor', amount: 9999, created_at: '2026-01-01T00:00:00Z' }, // out of window
    ],
  };
  const from = Date.parse('2026-06-01T00:00:00Z');
  const to = Date.parse('2026-07-01T00:00:00Z');

  it('counts only rows inside [from, to)', () => {
    const m = metricsForRange(data, from, to);
    expect(m.leads).toBe(3);
    expect(m.quoted).toBe(2); // won + quoted
    expect(m.won).toBe(1);
    expect(m.winRate).toBe(50);
    expect(m.overallConversion).toBe(33);
  });

  it('averages only quoted (amount > 0) jobs in window', () => {
    expect(metricsForRange(data, from, to).avgQuoteValue).toBe(1500);
  });

  it('sums collected (coercing strings) and splits labor vs materials for profit + margin', () => {
    const m = metricsForRange(data, from, to);
    expect(m.collected).toBe(750.5);
    expect(m.laborCost).toBe(100);
    expect(m.materialsCost).toBe(75); // material 50 + sub 25 (everything not 'labor')
    expect(m.costs).toBe(175);
    expect(m.grossProfit).toBe(575.5);
    expect(m.margin).toBeCloseTo(575.5 / 750.5, 5);
  });

  it('reports zero margin (not NaN) when nothing was collected', () => {
    const empty = metricsForRange({ leads: [], jobs: [], paid: [], costs: [] }, from, to);
    expect(empty.margin).toBe(0);
    expect(empty.grossProfit).toBe(0);
  });
});

describe('buildTrend', () => {
  const now = new Date(2026, 5, 15); // June 2026
  const paid = [
    { amount: 1000, created_at: '2026-06-05T00:00:00Z' },
    { amount: 500, created_at: '2026-05-10T00:00:00Z' },
    { amount: 200, created_at: '2025-12-01T00:00:00Z' }, // older than the 6-month window
  ];
  const costs = [
    { amount: 300, created_at: '2026-06-06T00:00:00Z' },
    { amount: 100, created_at: '2026-05-11T00:00:00Z' },
  ];

  it('buckets the last 6 months with per-month profit = revenue − costs', () => {
    const trend = buildTrend(paid, costs, 6, now);
    expect(trend).toHaveLength(6);
    const jun = trend[5];
    const may = trend[4];
    expect(jun.label).toBe('Jun');
    expect(jun.total).toBe(1000);
    expect(jun.profit).toBe(700);
    expect(may.total).toBe(500);
    expect(may.profit).toBe(400);
    // A month with only costs (none here) or no activity stays at zero.
    expect(trend[0].total).toBe(0);
    expect(trend[0].profit).toBe(0);
  });

  it('excludes rows older than the window', () => {
    const trend = buildTrend(paid, costs, 6, now);
    const total = trend.reduce((s, m) => s + m.total, 0);
    expect(total).toBe(1500); // the Dec 2025 $200 is dropped
  });
});
