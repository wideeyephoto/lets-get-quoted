import { describe, it, expect } from 'vitest';
import {
  monthlyRunRate,
  computeDelta,
  computePointDelta,
  metricsForRange,
  buildTrend,
  buildAging,
  daysToPayment,
  biggestDrop,
  recommendedActions,
  resolvePeriod,
  parseDateInput,
  median,
  mean,
  DAY_MS,
  type ActionInput,
  type FunnelStage,
} from '@/lib/insights';

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

describe('computePointDelta — for metrics already measured in percent', () => {
  it('reports the change in points, not as a percentage of a percentage', () => {
    // 40% → 44% margin is up 4 points. "Up 10%" is true of the ratio and
    // misleading about the business, and it's the number said out loud.
    expect(computePointDelta(44, 40)).toEqual({ pct: 4, direction: 'up' });
    expect(computePointDelta(38, 40)).toEqual({ pct: -2, direction: 'down' });
    expect(computePointDelta(40, 40)).toEqual({ pct: 0, direction: 'flat' });
  });

  it('survives a previous of zero without going infinite', () => {
    expect(computePointDelta(30, 0)).toEqual({ pct: 30, direction: 'up' });
  });
});

describe('median / mean', () => {
  it('takes the middle value, and averages the middle pair when even', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('is the point of having a median: one huge job does not move it', () => {
    const jobs = [900, 1000, 1100, 1200, 40000];
    expect(median(jobs)).toBe(1100);
    expect(mean(jobs)).toBeGreaterThan(8000);
  });
});

describe('metricsForRange', () => {
  const data = {
    leads: [
      { status: 'won', source: 'referral', created_at: '2026-06-15T00:00:00Z', converted_job: null },
      { status: 'quoted', source: 'website_form', created_at: '2026-06-20T00:00:00Z', converted_job: null },
      { status: 'lost', source: 'manual', created_at: '2026-06-25T00:00:00Z', converted_job: null },
      { status: 'won', source: 'referral', created_at: '2026-01-01T00:00:00Z', converted_job: null }, // out of window
    ],
    jobs: [
      { id: 'j1', ref: 'J-1', client_name: 'A', quoted_amount: 1000, status: 'complete', created_at: '2026-06-10T00:00:00Z', lead_source: null },
      { id: 'j2', ref: 'J-2', client_name: 'B', quoted_amount: 2000, status: 'new_lead', created_at: '2026-06-12T00:00:00Z', lead_source: null },
      { id: 'j3', ref: 'J-3', client_name: 'C', quoted_amount: 0, status: 'complete', created_at: '2026-06-12T00:00:00Z', lead_source: null },
    ],
    paid: [
      { amount: 500, paid_at: '2026-06-11T00:00:00Z', requested_at: '2026-06-10T00:00:00Z', job_id: 'j1' },
      { amount: '250.50', paid_at: '2026-06-18T00:00:00Z', requested_at: null, job_id: null }, // string numeric
      { amount: 999, paid_at: '2026-01-01T00:00:00Z', requested_at: null, job_id: null }, // out of window
    ],
    costs: [
      { type: 'labor', amount: 100, created_at: '2026-06-11T00:00:00Z', job_id: 'j1' },
      { type: 'material', amount: 50, created_at: '2026-06-12T00:00:00Z', job_id: 'j1' },
      { type: 'sub', amount: '25', created_at: '2026-06-13T00:00:00Z', job_id: 'j1' },
      { type: 'labor', amount: 9999, created_at: '2026-01-01T00:00:00Z', job_id: 'j1' }, // out of window
    ],
    approvals: [
      { amount: 1000, job_id: 'j1', created_at: '2026-06-14T00:00:00Z' },
      { amount: null, job_id: 'j2', created_at: '2026-06-16T00:00:00Z' }, // falls back to the job
      { amount: 5000, job_id: 'j1', created_at: '2026-01-05T00:00:00Z' }, // out of window
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
    expect(m.leadToQuote).toBe(67);
  });

  it('reads revenue from paid_at, not from a column payments does not have', () => {
    // `payments` has no created_at. Selecting it 400s in PostgREST, and the
    // `?? []` at the call site turned that into "$0 collected" on every account
    // in every window, silently. This test is that bug written down.
    const m = metricsForRange(data, from, to);
    expect(m.collected).toBe(750.5);
  });

  it('averages and medians only quoted (amount > 0) jobs in window', () => {
    const m = metricsForRange(data, from, to);
    expect(m.avgQuoteValue).toBe(1500);
    expect(m.medianQuoteValue).toBe(1500);
    expect(m.jobsQuoted).toBe(2);
    expect(m.quotedRevenue).toBe(3000);
  });

  it('falls back to the job amount when an approval event carries none', () => {
    // 1000 from the event + 2000 from job j2, whose event had a null amount.
    expect(metricsForRange(data, from, to).approvedRevenue).toBe(3000);
  });

  it('splits labor vs materials for profit + margin', () => {
    const m = metricsForRange(data, from, to);
    expect(m.laborCost).toBe(100);
    expect(m.materialsCost).toBe(75); // material 50 + sub 25 (everything not 'labor')
    expect(m.costs).toBe(175);
    expect(m.grossProfit).toBe(575.5);
    expect(m.margin).toBeCloseTo(575.5 / 750.5, 5);
    expect(m.marginPct).toBe(77);
  });

  it('reports zero margin (not NaN) when nothing was collected', () => {
    const empty = metricsForRange({ leads: [], jobs: [], paid: [], costs: [], approvals: [] }, from, to);
    expect(empty.margin).toBe(0);
    expect(empty.grossProfit).toBe(0);
    expect(empty.medianQuoteValue).toBe(0);
  });
});

describe('buildTrend', () => {
  const now = new Date(2026, 5, 15); // June 2026
  const paid = [
    { amount: 1000, paid_at: '2026-06-05T00:00:00Z' },
    { amount: 500, paid_at: '2026-05-10T00:00:00Z' },
    { amount: 200, paid_at: '2025-12-01T00:00:00Z' }, // older than the 6-month window
  ];
  const costs = [
    { amount: 300, created_at: '2026-06-06T00:00:00Z' },
    { amount: 100, created_at: '2026-05-11T00:00:00Z' },
  ];
  const jobs = [
    { quoted_amount: 800, created_at: '2026-06-02T00:00:00Z' },
    { quoted_amount: 1200, created_at: '2026-06-09T00:00:00Z' },
    { quoted_amount: 0, created_at: '2026-06-09T00:00:00Z' }, // unpriced, excluded
  ];

  it('buckets the last 6 months with per-month profit = revenue − costs', () => {
    const trend = buildTrend(paid, costs, jobs, 6, now);
    expect(trend).toHaveLength(6);
    const jun = trend[5];
    const may = trend[4];
    expect(jun.label).toBe('Jun');
    expect(jun.total).toBe(1000);
    expect(jun.costs).toBe(300);
    expect(jun.profit).toBe(700);
    expect(may.total).toBe(500);
    expect(may.profit).toBe(400);
    expect(trend[0].total).toBe(0);
    expect(trend[0].profit).toBe(0);
  });

  it('averages job value per month, skipping unpriced jobs', () => {
    const trend = buildTrend(paid, costs, jobs, 6, now);
    expect(trend[5].avgJobValue).toBe(1000); // (800 + 1200) / 2
    expect(trend[5].jobCount).toBe(2);
    expect(trend[0].avgJobValue).toBe(0);
  });

  it('excludes rows older than the window', () => {
    const trend = buildTrend(paid, costs, jobs, 6, now);
    expect(trend.reduce((s, m) => s + m.total, 0)).toBe(1500); // Dec 2025's $200 dropped
  });
});

describe('buildAging', () => {
  const now = Date.parse('2026-08-04T12:00:00Z');
  const days = (n: number) => new Date(now - n * DAY_MS).toISOString();

  it('drops each unpaid invoice into the band matching its age', () => {
    const bands = buildAging(
      [
        { total: 100, created_at: days(1) },
        { total: 200, created_at: days(10) },
        { total: 300, created_at: days(20) },
        { total: 400, created_at: days(45) },
        { total: 500, created_at: days(400) },
      ],
      now,
    );
    expect(bands.map((b) => b.total)).toEqual([100, 200, 300, 400, 500]);
    expect(bands.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
  });

  it('puts a boundary day in the lower band', () => {
    const bands = buildAging([{ total: 50, created_at: days(7) }], now);
    expect(bands[0].total).toBe(50);
    expect(bands[1].total).toBe(0);
  });

  it('carries a CSS-safe tone, because "60+" cannot be a class name unescaped', () => {
    expect(buildAging([], now).map((b) => b.tone)).toEqual(['fresh', 'recent', 'month', 'late', 'stale']);
  });

  it('ignores a row with an unreadable date rather than bucketing it as ancient', () => {
    const bands = buildAging([{ total: 90, created_at: 'not a date' }], now);
    expect(bands.reduce((sum, b) => sum + b.total, 0)).toBe(0);
  });
});

describe('daysToPayment', () => {
  it('measures requested → paid, in days', () => {
    const gaps = daysToPayment([
      { requested_at: '2026-08-01T00:00:00Z', paid_at: '2026-08-04T00:00:00Z' },
      { requested_at: '2026-08-01T00:00:00Z', paid_at: '2026-08-01T12:00:00Z' },
    ]);
    expect(gaps).toEqual([3, 0.5]);
  });

  it('skips rows that cannot be measured rather than reporting a zero', () => {
    // An imported payment with no request, and one whose timestamps run
    // backwards, are both "we don't know" — averaging a 0 in would drag the
    // whole figure down and make collections look faster than they are.
    expect(daysToPayment([
      { requested_at: null, paid_at: '2026-08-04T00:00:00Z' },
      { requested_at: '2026-08-05T00:00:00Z', paid_at: '2026-08-04T00:00:00Z' },
    ])).toEqual([]);
  });
});

describe('biggestDrop', () => {
  const stage = (key: FunnelStage['key'], label: string, count: number): FunnelStage =>
    ({ key, label, count, rateOfPrev: 0 });

  it('picks the worst stage by SHARE lost, not by headcount', () => {
    // 8 of 10 leads never quoted (80%) is a worse problem than 9 of 90 quotes
    // not closing (10%), and counting bodies says the opposite.
    const drop = biggestDrop([stage('leads', 'Leads', 10), stage('quoted', 'Quotes', 2), stage('won', 'Wins', 1)]);
    expect(drop).toEqual({ from: 'Leads', to: 'Quotes', lostCount: 8, lostPct: 80 });
  });

  it('is null when nothing dropped off, and when there is nothing to measure', () => {
    expect(biggestDrop([stage('leads', 'Leads', 3), stage('quoted', 'Quotes', 3), stage('won', 'Wins', 3)])).toBeNull();
    expect(biggestDrop([stage('leads', 'Leads', 0), stage('quoted', 'Quotes', 0), stage('won', 'Wins', 0)])).toBeNull();
  });
});

describe('recommendedActions', () => {
  const base: ActionInput = {
    openQuoteTotal: 0,
    openQuoteCount: 0,
    staleQuoteCount: 0,
    outstandingTotal: 0,
    outstandingCount: 0,
    oldestUnpaidDays: 0,
    completedNotInvoiced: 0,
    leadsNeedingFollowUp: 0,
    arrivalUpdatesOn: true,
    hasArrivalData: true,
    marginPct: 40,
    collected: 1000,
    costsRecorded: true,
  };

  it('recommends nothing when nothing is waiting on you', () => {
    expect(recommendedActions(base)).toEqual([]);
  });

  it('never suggests chasing quotes that do not exist', () => {
    // A permanent checklist reads as advice whether or not it applies, which is
    // how people learn to ignore the panel.
    expect(recommendedActions({ ...base, openQuoteTotal: 5000 }).some((a) => a.id === 'open-quotes')).toBe(false);
  });

  it('ranks by money genuinely at stake', () => {
    const actions = recommendedActions({
      ...base,
      openQuoteCount: 3,
      openQuoteTotal: 4519,
      outstandingCount: 8,
      outstandingTotal: 8655,
    });
    expect(actions.map((a) => a.id)).toEqual(['unpaid-invoices', 'open-quotes']);
    expect(actions[0].value).toBe(8655);
  });

  it('puts a figureless action below the ones carrying money, not above', () => {
    const actions = recommendedActions({ ...base, completedNotInvoiced: 2, outstandingCount: 1, outstandingTotal: 500 });
    expect(actions[0].id).toBe('unpaid-invoices');
    expect(actions[1].id).toBe('not-invoiced');
  });

  it('flags missing costs, because profit without them is just revenue', () => {
    const actions = recommendedActions({ ...base, costsRecorded: false });
    expect(actions.map((a) => a.id)).toContain('no-costs');
  });

  it('does not nag about costs on an account that has collected nothing', () => {
    expect(recommendedActions({ ...base, costsRecorded: false, collected: 0 }).map((a) => a.id)).not.toContain('no-costs');
  });

  it('escalates unpaid invoices once they are properly old', () => {
    const fresh = recommendedActions({ ...base, outstandingCount: 1, outstandingTotal: 100, oldestUnpaidDays: 3 });
    const old = recommendedActions({ ...base, outstandingCount: 1, outstandingTotal: 100, oldestUnpaidDays: 90 });
    expect(old[0].impact).toBeGreaterThan(fresh[0].impact);
    expect(old[0].detail).toContain('90 days');
  });
});

describe('resolvePeriod', () => {
  const now = new Date(2026, 7, 4, 12, 0, 0); // 4 Aug 2026, midday

  it('defaults to 90 days', () => {
    expect(resolvePeriod({}, now).key).toBe('90');
    expect(resolvePeriod({ window: 'nonsense' }, now).key).toBe('90');
  });

  it('honours a preset', () => {
    const p = resolvePeriod({ window: '30' }, now);
    expect(p.days).toBe(30);
    expect(p.toMs - p.fromMs).toBe(30 * DAY_MS);
  });

  it('treats a custom end date as inclusive', () => {
    // "to 3 Aug" means through the end of 3 Aug, not up to its midnight — a
    // range ending today would otherwise report nothing that happened today.
    const p = resolvePeriod({ from: '2026-08-01', to: '2026-08-03' }, now);
    expect(p.custom).toBe(true);
    expect(p.days).toBe(3);
    expect(new Date(p.toMs).getDate()).toBe(4);
  });

  it('parses a date input as LOCAL midnight, not UTC', () => {
    const parsed = parseDateInput('2026-08-01');
    expect(new Date(parsed!).getDate()).toBe(1);
    expect(new Date(parsed!).getHours()).toBe(0);
  });

  it('falls back rather than rendering a period that runs backwards', () => {
    expect(resolvePeriod({ from: '2026-08-10', to: '2026-08-01' }, now).custom).toBe(false);
    expect(resolvePeriod({ from: '2026-08-01' }, now).custom).toBe(false);
    expect(resolvePeriod({ from: 'garbage', to: 'worse' }, now).custom).toBe(false);
  });

  it('never runs a custom range past today', () => {
    const p = resolvePeriod({ from: '2026-08-01', to: '2027-01-01' }, now);
    expect(p.toMs).toBeLessThanOrEqual(new Date(2026, 7, 5).getTime());
  });
});
