import { describe, it, expect } from 'vitest';
import {
  monthWindows,
  countDistinctJobsInRange,
  computeKpis,
  chooseGrouping,
  buildRevenueTrend,
  buildSalesActivity,
  computeScheduleUtilization,
  computePaymentHealth,
  computeCustomerInsights,
  groupRevenueByService,
  buildMarketingPerformance,
  buildTopOpportunities,
  computeJobProfitability,
  computeLaborEfficiency,
  computeReputationMetrics,
  computeVoiceMetrics,
  computeMrrMovement,
  computePaceForecast,
  type MetricJob,
  type MetricCost,
  type FeedEvent,
  type MetricPayment,
  type MetricClient,
  type ServiceInvoice,
  type CampaignRecord,
  type OpportunitySignals,
} from '@/lib/insights-metrics';
import { DAY_MS, type Period } from '@/lib/insights';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';

// A period is just a struct to these calculators; only fromMs/toMs/days are read.
// fromMs/toMs are absolute ms, so range membership is timezone-independent — the
// fixtures below only lean on local time where a calculator builds calendar
// buckets itself (sparklines, daily/monthly trend, schedule days), and there the
// dates are placed mid-day / mid-month so no offset can push them across a line.
function periodFromMs(fromMs: number, toMs: number, days?: number): Period {
  return {
    key: 'test',
    label: 'Test',
    sentenceLabel: 'in the test window',
    fromMs,
    toMs,
    days: days ?? Math.round((toMs - fromMs) / DAY_MS),
    custom: true,
  };
}
function makePeriod(fromIso: string, toIso: string): Period {
  return periodFromMs(Date.parse(fromIso), Date.parse(toIso));
}

describe('monthWindows', () => {
  it('returns the last N calendar months, oldest first, contiguous and local', () => {
    const windows = monthWindows(new Date(2026, 5, 15), 6); // June 2026
    expect(windows).toHaveLength(6);
    expect(windows.map((w) => w.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
    expect(windows.map((w) => w.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    // The newest window is the current month, [1st, next 1st).
    expect(windows[5].fromMs).toBe(new Date(2026, 5, 1).getTime());
    expect(windows[5].toMs).toBe(new Date(2026, 6, 1).getTime());
    // No gaps or overlaps between adjacent months.
    expect(windows[1].fromMs).toBe(windows[0].toMs);
  });

  it('crosses a year boundary without losing a month', () => {
    const windows = monthWindows(new Date(2026, 1, 10), 4); // Feb 2026 → back to Nov 2025
    expect(windows.map((w) => w.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('countDistinctJobsInRange', () => {
  const events: FeedEvent[] = [
    { job_id: 'j1', created_at: '2026-06-10T12:00:00Z' },
    { job_id: 'j1', created_at: '2026-06-11T12:00:00Z' }, // same job, counted once
    { job_id: 'j2', created_at: '2026-06-12T12:00:00Z' },
    { job_id: null, created_at: '2026-06-12T12:00:00Z' }, // no job attached, skipped
    { job_id: 'j3', created_at: '2026-05-01T12:00:00Z' }, // out of window
  ];
  const from = Date.parse('2026-06-01T00:00:00Z');
  const to = Date.parse('2026-07-01T00:00:00Z');

  it('counts each job at most once inside the window', () => {
    expect(countDistinctJobsInRange(events, from, to)).toBe(2);
  });

  it('treats the window as half-open [from, to)', () => {
    expect(countDistinctJobsInRange([{ job_id: 'x', created_at: new Date(from).toISOString() }], from, to)).toBe(1);
    expect(countDistinctJobsInRange([{ job_id: 'x', created_at: new Date(to).toISOString() }], from, to)).toBe(0);
  });
});

describe('computeKpis', () => {
  // Current window is June 2026 (a clean 30-day span); the previous equal period
  // is the 30 days before it. Every fixture row is dated mid-day so it lands in
  // exactly the window intended, and the 6-month sparkline (anchored at `now`)
  // covers Feb–Jul 2026.
  const jobs: MetricJob[] = [
    { id: 'j1', client_id: 'c1', quoted_amount: 1000, created_at: '2026-06-05T12:00:00Z' },
    { id: 'j2', client_id: 'c2', quoted_amount: 2000, created_at: '2026-06-06T12:00:00Z' },
    { id: 'j3', client_id: 'c1', quoted_amount: 1000, created_at: '2026-05-10T12:00:00Z' },
    { id: 'j4', client_id: 'c2', quoted_amount: 1500, created_at: '2026-06-04T12:00:00Z' },
    { id: 'j5', client_id: 'c3', quoted_amount: 0, created_at: '2026-06-25T12:00:00Z' },
  ];
  const completedEvents: FeedEvent[] = [
    { job_id: 'j1', created_at: '2026-06-10T12:00:00Z' }, // current: 1000
    { job_id: 'j2', created_at: '2026-06-20T12:00:00Z' }, // current: 2000
    { job_id: 'j3', created_at: '2026-05-15T12:00:00Z' }, // previous: 1000
  ];
  const paid: MetricPayment[] = [
    { amount: 500, paid_at: '2026-06-11T12:00:00Z' }, // current
    { amount: 300, refunded_amount: 100, paid_at: '2026-06-18T12:00:00Z' }, // current, net 200
    { amount: 400, paid_at: '2026-05-20T12:00:00Z' }, // previous
  ];
  const quoteSentEvents: FeedEvent[] = [
    { job_id: 'j1', created_at: '2026-06-02T12:00:00Z' },
    { job_id: 'j2', created_at: '2026-06-03T12:00:00Z' },
    { job_id: 'j4', created_at: '2026-06-04T12:00:00Z' },
    { job_id: 'j3', created_at: '2026-05-10T12:00:00Z' }, // previous
  ];
  const quoteApprovedEvents: FeedEvent[] = [
    { job_id: 'j1', created_at: '2026-06-14T12:00:00Z' },
    { job_id: 'j2', created_at: '2026-06-16T12:00:00Z' },
    { job_id: 'j3', created_at: '2026-05-12T12:00:00Z' }, // previous
  ];
  const period = makePeriod('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z');
  const now = new Date(2026, 6, 15); // anchors the 6-month sparklines at Feb–Jul
  const kpis = computeKpis({
    jobs,
    completedEvents,
    paid,
    quoteSentEvents,
    quoteApprovedEvents,
    outstandingTotal: 8655,
    outstandingCount: 8,
    period,
    now,
  });

  it('gross revenue is completed-job value, up vs the previous period, with a monthly spark', () => {
    expect(kpis.grossRevenue.value).toBe(3000); // 1000 + 2000
    expect(kpis.grossRevenue.format).toBe('money');
    expect(kpis.grossRevenue.delta).toEqual({ pct: 200, direction: 'up' }); // vs 1000
    expect(kpis.grossRevenue.deltaUnit).toBe('%');
    expect(kpis.grossRevenue.spark).toEqual([0, 0, 0, 1000, 3000, 0]); // May then Jun
  });

  it('net collected subtracts refunds and attributes by the date the money landed', () => {
    expect(kpis.netCollected.value).toBe(700); // 500 + (300 − 100)
    expect(kpis.netCollected.delta).toEqual({ pct: 75, direction: 'up' }); // vs 400
    expect(kpis.netCollected.spark).toEqual([0, 0, 0, 400, 700, 0]);
  });

  it('jobs completed is a distinct count with its own delta', () => {
    expect(kpis.jobsCompleted.value).toBe(2);
    expect(kpis.jobsCompleted.format).toBe('count');
    expect(kpis.jobsCompleted.delta).toEqual({ pct: 100, direction: 'up' }); // 2 vs 1
    expect(kpis.jobsCompleted.spark).toEqual([0, 0, 0, 1, 2, 0]);
  });

  it('quote conversion is approved ÷ sent, and its change is in POINTS not percent', () => {
    expect(kpis.quoteConversion.value).toBe(67); // 2 of 3 sent
    expect(kpis.quoteConversion.format).toBe('percent');
    expect(kpis.quoteConversion.deltaUnit).toBe('pp');
    expect(kpis.quoteConversion.delta).toEqual({ pct: -33, direction: 'down' }); // 67 − 100
    expect(kpis.quoteConversion.spark).toEqual([0, 0, 0, 100, 67, 0]);
  });

  it('outstanding balance is a point-in-time snapshot with NO period delta', () => {
    expect(kpis.outstandingBalance.value).toBe(8655);
    expect(kpis.outstandingBalance.delta).toBeNull();
    expect(kpis.outstandingBalance.upIsGood).toBe(false);
    expect(kpis.outstandingBalance.spark).toEqual([]);
    expect(kpis.outstandingBalance.note).toBe('8 unpaid invoices · current total, not a period change');
  });

  it('new customers counts a client only in the period of their FIRST job', () => {
    // c2's earliest job is Jun 4 and c3's is Jun 25 (both current); c1's earliest
    // is May 10 (previous). A second job for an existing client is not a new one.
    expect(kpis.newCustomers.value).toBe(2);
    expect(kpis.newCustomers.delta).toEqual({ pct: 100, direction: 'up' }); // 2 vs 1
    expect(kpis.newCustomers.spark).toEqual([0, 0, 0, 1, 2, 0]);
  });

  it('a quiet account gets honest zeros, a flat delta, and no invented series', () => {
    const empty = computeKpis({
      jobs: [],
      completedEvents: [],
      paid: [],
      quoteSentEvents: [],
      quoteApprovedEvents: [],
      outstandingTotal: 0,
      outstandingCount: 0,
      period,
      now,
    });
    expect(empty.grossRevenue.value).toBe(0);
    expect(empty.grossRevenue.delta).toEqual({ pct: null, direction: 'flat' });
    expect(empty.grossRevenue.spark).toEqual([0, 0, 0, 0, 0, 0]);
    expect(empty.quoteConversion.value).toBe(0);
    expect(empty.quoteConversion.spark).toEqual([]); // no month had a quote sent
    expect(empty.quoteConversion.note).toBe('No quotes were sent to a customer in this period.');
    expect(empty.outstandingBalance.note).toBe('0 unpaid invoices · current total, not a period change');
  });
});

describe('chooseGrouping', () => {
  it('reads a short window by day, a season by week, a year by month', () => {
    expect(chooseGrouping(30)).toBe('day');
    expect(chooseGrouping(31)).toBe('day');
    expect(chooseGrouping(32)).toBe('week');
    expect(chooseGrouping(120)).toBe('week');
    expect(chooseGrouping(121)).toBe('month');
    expect(chooseGrouping(365)).toBe('month');
  });
});

describe('buildRevenueTrend', () => {
  it('buckets a short window by day and lays the previous equal period alongside', () => {
    // 3 local days (Jun 10–12). The previous overlay is each bucket shifted back
    // by the whole span, so the Jun-7 payment is the Jun-10 bucket's "previous".
    const period = periodFromMs(new Date(2026, 5, 10).getTime(), new Date(2026, 5, 13).getTime());
    const paid: MetricPayment[] = [
      { amount: 100, paid_at: new Date(2026, 5, 10, 12).toISOString() },
      { amount: 250, refunded_amount: 50, paid_at: new Date(2026, 5, 11, 12).toISOString() }, // net 200
      { amount: 400, paid_at: new Date(2026, 5, 12, 12).toISOString() },
      { amount: 60, paid_at: new Date(2026, 5, 7, 12).toISOString() }, // previous period
    ];
    const trend = buildRevenueTrend(paid, period);
    expect(trend.grouping).toBe('day');
    expect(trend.points).toHaveLength(3);
    expect(trend.points.map((p) => p.label)).toEqual(['Jun 10', 'Jun 11', 'Jun 12']);
    expect(trend.points.map((p) => p.current)).toEqual([100, 200, 400]);
    expect(trend.points.map((p) => p.previous)).toEqual([60, 0, 0]);
    expect(trend.total).toBe(700);
    expect(trend.previousTotal).toBe(60);
    expect(trend.hasData).toBe(true);
  });

  it('buckets a long window by calendar month', () => {
    const period = periodFromMs(new Date(2026, 0, 10).getTime(), new Date(2026, 4, 20).getTime()); // ~130 days
    const paid: MetricPayment[] = [
      { amount: 1000, paid_at: new Date(2026, 0, 20, 12).toISOString() }, // Jan
      { amount: 500, paid_at: new Date(2026, 1, 15, 12).toISOString() }, // Feb
      { amount: 300, paid_at: new Date(2026, 3, 2, 12).toISOString() }, // Apr
    ];
    const trend = buildRevenueTrend(paid, period);
    expect(trend.grouping).toBe('month');
    expect(trend.points.map((p) => p.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May']);
    expect(trend.points.map((p) => p.current)).toEqual([1000, 500, 0, 300, 0]);
    expect(trend.total).toBe(1800);
  });

  it('clamps the first and last bucket to the period, so the chart totals the period', () => {
    // A "last 30 days" preset starts mid-afternoon, and the first daily bucket is
    // labeled with the whole day containing it. The bucket used to SUM that whole
    // day too, so a payment taken the morning before the window opened landed on
    // the chart and its total ran ahead of the Net Collected card above it.
    const from = new Date(2026, 5, 10, 15, 0).getTime();
    const to = new Date(2026, 5, 13, 15, 0).getTime();
    const period = periodFromMs(from, to);
    const paid: MetricPayment[] = [
      { amount: 999, paid_at: new Date(2026, 5, 10, 9).toISOString() }, // before the window opens
      { amount: 100, paid_at: new Date(2026, 5, 10, 18).toISOString() },
      { amount: 400, paid_at: new Date(2026, 5, 13, 9).toISOString() },
      { amount: 777, paid_at: new Date(2026, 5, 13, 18).toISOString() }, // after it closes
    ];
    const trend = buildRevenueTrend(paid, period);
    expect(trend.points.map((p) => p.label)).toEqual(['Jun 10', 'Jun 11', 'Jun 12', 'Jun 13']);
    expect(trend.points.map((p) => p.current)).toEqual([100, 0, 0, 400]);
    expect(trend.total).toBe(500);
  });

  it('clamps a month-grouped chart to the period too', () => {
    const from = new Date(2026, 0, 10).getTime();
    const to = new Date(2026, 4, 20).getTime(); // ~130 days, so month buckets
    const paid: MetricPayment[] = [
      { amount: 800, paid_at: new Date(2026, 0, 3, 12).toISOString() }, // before Jan 10
      { amount: 1000, paid_at: new Date(2026, 0, 20, 12).toISOString() },
      { amount: 600, paid_at: new Date(2026, 4, 25, 12).toISOString() }, // after May 20
    ];
    const trend = buildRevenueTrend(paid, periodFromMs(from, to));
    expect(trend.points.map((p) => p.current)).toEqual([1000, 0, 0, 0, 0]);
    expect(trend.total).toBe(1000);
  });

  it('reports no data (not a zero line) when nothing was collected either period', () => {
    const period = periodFromMs(new Date(2026, 5, 10).getTime(), new Date(2026, 5, 13).getTime());
    const trend = buildRevenueTrend([], period);
    expect(trend.hasData).toBe(false);
    expect(trend.total).toBe(0);
    expect(trend.previousTotal).toBe(0);
    expect(trend.points.every((p) => p.current === 0 && p.previous === 0)).toBe(true);
  });
});

describe('buildSalesActivity', () => {
  it('is six counts and nothing else', () => {
    const activity = buildSalesActivity({
      leadsCreated: 10,
      quotesSent: 8,
      quotesApproved: 5,
      jobsScheduled: 4,
      jobsCompleted: 3,
      jobsPaid: 3,
    });
    expect(activity.stages.map((s) => s.label)).toEqual([
      'Leads',
      'Quotes sent',
      'Quotes approved',
      'Jobs scheduled',
      'Jobs completed',
      'Jobs paid',
    ]);
    expect(activity.stages.map((s) => s.count)).toEqual([10, 8, 5, 4, 3, 3]);
  });

  it('carries no conversion rate, because there is no cohort to convert', () => {
    // This used to publish a percentage per stage and an overall lead → paid.
    // Both were ratios of counts that do not belong to each other: the lead
    // counted this period need not be the record that got paid this period.
    //
    // The tell was on screen — more jobs paid than quotes sent gives a stage
    // reading 150%, printed directly under a caption saying this is NOT a
    // tracked funnel. The old test asserted that 150% and called it truthful.
    // It was arithmetically faithful to a calculation that should not exist.
    const activity = buildSalesActivity({
      leadsCreated: 5,
      quotesSent: 5,
      quotesApproved: 5,
      jobsScheduled: 5,
      jobsCompleted: 2,
      jobsPaid: 3,
    });
    for (const stage of activity.stages) {
      expect(Object.keys(stage).sort(), stage.key).toEqual(['count', 'key', 'label']);
    }
    expect('overallPct' in activity).toBe(false);
  });

  it('reports an empty period as zeroes rather than as nothing', () => {
    // Six zeroes is a real answer — "you did no work this month" — and it is
    // the caller's job to decide whether that is worth a card.
    const activity = buildSalesActivity({
      leadsCreated: 0,
      quotesSent: 0,
      quotesApproved: 2,
      jobsScheduled: 0,
      jobsCompleted: 0,
      jobsPaid: 0,
    });
    expect(activity.stages).toHaveLength(6);
    expect(activity.stages.map((s) => s.count)).toEqual([0, 0, 2, 0, 0, 0]);
  });
});

describe('computeScheduleUtilization', () => {
  const availability = bookingAvailabilityFromAccount({ booking_weekdays: [1, 2, 3, 4, 5] }); // Mon–Fri, enabled
  const monday = new Date(2026, 0, 5); // Mon 5 Jan 2026

  it('counts booked vs open working days, skips weekends and time off, sizes the gap', () => {
    // Lookahead Jan 5–11: working weekdays are 5,6,8,9 (7th blocked); Sat/Sun out.
    // Jobs on the 6th and 8th → 2 booked, 2 open. A job on Sat 10th doesn't count.
    const util = computeScheduleUtilization({
      availability,
      scheduledDates: ['2026-01-06', '2026-01-06', '2026-01-08', '2026-01-10'],
      blocks: [{ start_date: '2026-01-07', end_date: '2026-01-07' }],
      avgJobValue: 800,
      now: monday,
      lookaheadDays: 6,
    });
    expect(util).toEqual({
      configured: true,
      lookaheadDays: 6,
      workingDays: 4,
      bookedDays: 2,
      openDays: 2,
      utilizationPct: 50,
      estimatedOpportunity: 1600, // 2 open × $800
      avgJobValue: 800,
    });
  });

  it('sizes no opportunity when there is no average job value to multiply by', () => {
    const util = computeScheduleUtilization({
      availability,
      scheduledDates: ['2026-01-06'],
      blocks: [],
      avgJobValue: 0,
      now: monday,
      lookaheadDays: 6,
    });
    expect(util.utilizationPct).not.toBeNull(); // 1 of 5 booked
    expect(util.estimatedOpportunity).toBeNull();
  });

  it('says "not configured" and computes nothing when booking is switched off', () => {
    const util = computeScheduleUtilization({
      availability: bookingAvailabilityFromAccount({ booking_enabled: false, booking_weekdays: [1, 2, 3, 4, 5] }),
      scheduledDates: ['2026-01-06'],
      blocks: [],
      avgJobValue: 800,
      now: monday,
      lookaheadDays: 6,
    });
    expect(util.configured).toBe(false);
    expect(util.workingDays).toBe(0);
    expect(util.utilizationPct).toBeNull();
    expect(util.estimatedOpportunity).toBeNull();
  });
});

describe('computePaymentHealth', () => {
  it('sums only the 30+-day aging bands, and passes the other signals through', () => {
    const health = computePaymentHealth({
      aging: [
        { key: '0-7', total: 100, count: 1 },
        { key: '8-14', total: 200, count: 1 },
        { key: '15-30', total: 300, count: 2 },
        { key: '31-60', total: 400, count: 1 },
        { key: '60+', total: 500, count: 3 },
      ],
      avgDaysToPayment: 12,
      failedPayments: 4,
    });
    expect(health.overdueBalance).toBe(900); // 400 + 500
    expect(health.overdueCount).toBe(4); // 1 + 3
    expect(health.avgDaysToCollect).toBe(12);
    expect(health.failedPayments).toBe(4);
  });

  it('carries an unknown collection time through as null rather than a zero', () => {
    const health = computePaymentHealth({ aging: [], avgDaysToPayment: null, failedPayments: 0 });
    expect(health.overdueBalance).toBe(0);
    expect(health.avgDaysToCollect).toBeNull();
  });
});

describe('computeCustomerInsights', () => {
  const now = new Date(2026, 6, 1); // 1 Jul 2026; inactive cutoff ≈ 2 Apr 2026
  const clients: MetricClient[] = [
    // repeat + booked ahead → counts as repeat, never inactive
    { jobCount: 3, created_at: '2025-01-01T00:00:00Z', lastJobAt: '2026-06-01T00:00:00Z', lastVisitAt: '2026-06-01', nextJobAt: '2026-07-15' },
    // one job, last seen January, nothing booked → inactive
    { jobCount: 1, created_at: '2025-01-01T00:00:00Z', lastJobAt: '2026-01-01T00:00:00Z', lastVisitAt: '2026-01-01', nextJobAt: null },
    // repeat, last seen February, nothing booked → inactive
    { jobCount: 2, created_at: '2024-01-01T00:00:00Z', lastJobAt: '2026-02-01T00:00:00Z', lastVisitAt: '2026-02-01', nextJobAt: null },
    // last visit a year ago BUT booked ahead → not inactive
    { jobCount: 1, created_at: '2025-01-01T00:00:00Z', lastJobAt: '2025-06-01T00:00:00Z', lastVisitAt: '2025-06-01', nextJobAt: '2026-07-10' },
    // a prospect with no jobs → excluded from repeat-rate maths
    { jobCount: 0, created_at: '2026-06-01T00:00:00Z', lastJobAt: null, lastVisitAt: null, nextJobAt: null },
  ];

  it('computes repeat rate over customers-with-jobs and flags the genuinely quiet ones', () => {
    const insights = computeCustomerInsights({
      clients,
      activeMaintenancePlans: 2,
      maintenanceMonthly: 250,
      now,
    });
    expect(insights.totalClients).toBe(5);
    expect(insights.repeatClients).toBe(2); // jobCount 3 and 2
    expect(insights.repeatRatePct).toBe(50); // 2 of 4 with jobs
    expect(insights.inactiveClients).toBe(2); // the two with nothing booked ahead
    expect(insights.inactiveThresholdDays).toBe(90);
    expect(insights.activeMaintenancePlans).toBe(2);
    expect(insights.maintenanceMonthly).toBe(250);
  });

  it('has no repeat rate to report on an account with no jobs yet', () => {
    const insights = computeCustomerInsights({
      clients: [{ jobCount: 0, created_at: '2026-06-01T00:00:00Z', lastJobAt: null, lastVisitAt: null, nextJobAt: null }],
      activeMaintenancePlans: 0,
      maintenanceMonthly: 0,
      now,
    });
    expect(insights.repeatRatePct).toBeNull();
    expect(insights.repeatClients).toBe(0);
    expect(insights.inactiveClients).toBe(0);
  });
});

describe('groupRevenueByService', () => {
  const period = makePeriod('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z');

  it('groups line items by label (case-insensitively), keeping the top few + Other', () => {
    const invoices: ServiceInvoice[] = [
      {
        created_at: '2026-06-10T12:00:00Z',
        status: 'paid',
        items: [
          { description: 'Lawn Mowing', amount: 100 },
          { description: 'lawn mowing', amount: 50 }, // folds into the above
          { description: 'Hedge Trimming', amount: 80 },
        ],
      },
      {
        created_at: '2026-06-15T12:00:00Z',
        status: 'signed',
        items: [
          { description: 'Leaf Removal', amount: 70 },
          { description: 'Gutter Cleaning', amount: 60 },
          { description: 'Power Washing', amount: 40 },
          { description: 'Fertilizing', amount: 30 }, // beyond the top 5 → Other
          { description: null, amount: 20 }, // "Unlabeled" → also Other
          { description: 'Freebie', amount: 0 }, // zero value, skipped
        ],
      },
      { created_at: '2026-05-01T12:00:00Z', status: 'paid', items: [{ description: 'Old', amount: 999 }] }, // out of window
      { created_at: '2026-06-20T12:00:00Z', status: 'draft', items: [{ description: 'Draft', amount: 500 }] }, // wrong status
    ];
    const result = groupRevenueByService(invoices, period);
    expect(result.total).toBe(450);
    expect(result.approximate).toBe(true);
    expect(result.hasData).toBe(true);
    expect(result.slices).toEqual([
      { label: 'Lawn Mowing', amount: 150, pct: 33, count: 2 },
      { label: 'Hedge Trimming', amount: 80, pct: 18, count: 1 },
      { label: 'Leaf Removal', amount: 70, pct: 16, count: 1 },
      { label: 'Gutter Cleaning', amount: 60, pct: 13, count: 1 },
      { label: 'Power Washing', amount: 40, pct: 9, count: 1 },
      { label: 'Other', amount: 50, pct: 11, count: 2 }, // Fertilizing 30 + Unlabeled 20
    ]);
  });

  it('reports no data on an account with no qualifying invoices', () => {
    const result = groupRevenueByService([], period);
    expect(result.hasData).toBe(false);
    expect(result.total).toBe(0);
    expect(result.slices).toEqual([]);
    expect(result.approximate).toBe(true);
  });
});

describe('buildMarketingPerformance', () => {
  const campaigns: CampaignRecord[] = [
    { id: 'c1', channel: 'email', audience: 'all', recipient_count: 100, email_sent: 95, sms_sent: 0, failed_count: 3, skipped_count: 2, created_at: '2026-06-01T00:00:00Z' },
    { id: 'c2', channel: 'both', audience: 'past', recipient_count: 50, email_sent: 40, sms_sent: 30, failed_count: 1, skipped_count: 0, created_at: '2026-05-01T00:00:00Z' },
  ];

  it('maps only the facts we actually record, and flags the engagement/revenue it does NOT', () => {
    const perf = buildMarketingPerformance(campaigns);
    expect(perf.campaigns).toHaveLength(2);
    expect(perf.campaigns[0]).toEqual({
      id: 'c1',
      channel: 'email',
      audience: 'all',
      sentAt: '2026-06-01T00:00:00Z',
      recipients: 100,
      emailSent: 95,
      smsQueued: 0,
      failed: 3,
      skipped: 2,
    });
    expect(perf.totalRecipients).toBe(150);
    expect(perf.hasData).toBe(true);
    expect(perf.tracksEngagement).toBe(false); // no open/click pixel exists
    expect(perf.tracksRevenue).toBe(false); // no attribution exists
  });

  it('honours the display limit', () => {
    const perf = buildMarketingPerformance(campaigns, 1);
    expect(perf.campaigns).toHaveLength(1);
    expect(perf.totalRecipients).toBe(100);
  });

  it('reports no data on an account that has never sent a campaign', () => {
    const perf = buildMarketingPerformance([]);
    expect(perf.hasData).toBe(false);
    expect(perf.totalRecipients).toBe(0);
    expect(perf.tracksEngagement).toBe(false);
  });
});

describe('buildTopOpportunities', () => {
  it('ranks by money at stake and links every row to where you act on it', () => {
    const signals: OpportunitySignals = {
      staleQuoteCount: 2,
      openQuoteTotal: 4519,
      openQuoteCount: 3,
      openScheduleDays: 4,
      scheduleOpportunity: 3200,
      agingOverdueBalance: 1500,
      agingOverdueCount: 2,
      inactiveCustomers: 5,
      uncontactedLeads: 1,
      uninvoicedCompleted: 2,
      outstandingTotal: 8655,
      outstandingCount: 8,
    };
    const out = buildTopOpportunities(signals);
    // Money first ($8,655 > $4,519 > $3,200); the figureless rows fall below,
    // among themselves ordered by priority then count.
    expect(out.map((o) => o.id)).toEqual([
      'collect-outstanding',
      'follow-up-quotes',
      'fill-schedule',
      'bill-completed',
      'chase-leads',
      'win-back',
    ]);
    expect(out[0].value).toBe(8655);
    expect(out[0].priority).toBe('high');
    expect(out[0].title).toBe('Collect $8,655 in unpaid invoices');
    expect(out[0].detail).toBe('2 of them are 30+ days old ($1,500).');
    const fill = out.find((o) => o.id === 'fill-schedule')!;
    expect(fill.campaign).toBe('fill-schedule');
    expect(fill.href).toBe('/dashboard/marketing/campaigns');
    expect(out.find((o) => o.id === 'follow-up-quotes')!.detail).toBe('2 sent over a week ago · $4,519 on the table.');
  });

  it('softens wording and priority when nothing is stale or aged', () => {
    const out = buildTopOpportunities({
      staleQuoteCount: 0,
      openQuoteTotal: 900,
      openQuoteCount: 1,
      openScheduleDays: 0,
      scheduleOpportunity: null,
      agingOverdueBalance: 0,
      agingOverdueCount: 0,
      inactiveCustomers: 0,
      uncontactedLeads: 0,
      uninvoicedCompleted: 0,
      outstandingTotal: 500,
      outstandingCount: 1,
    });
    expect(out.map((o) => o.id)).toEqual(['follow-up-quotes', 'collect-outstanding']); // $900 > $500
    const collect = out.find((o) => o.id === 'collect-outstanding')!;
    expect(collect.priority).toBe('medium');
    expect(collect.detail).toBe('1 invoice still unpaid.');
    const quotes = out.find((o) => o.id === 'follow-up-quotes')!;
    expect(quotes.title).toBe('Follow up on 1 open quote');
    expect(quotes.detail).toBe('$900 awaiting a decision.');
    expect(quotes.priority).toBe('medium');
  });

  it('never lists an opportunity with no real count behind it', () => {
    expect(
      buildTopOpportunities({
        staleQuoteCount: 0,
        openQuoteTotal: 0,
        openQuoteCount: 0,
        openScheduleDays: 0,
        scheduleOpportunity: null,
        agingOverdueBalance: 0,
        agingOverdueCount: 0,
        inactiveCustomers: 0,
        uncontactedLeads: 0,
        uninvoicedCompleted: 0,
        outstandingTotal: 0,
        outstandingCount: 0,
      }),
    ).toEqual([]);
  });
});

describe('buildRevenueTrend with profit & costs', () => {
  const period = periodFromMs(Date.parse('2026-06-01T00:00:00Z'), Date.parse('2026-06-30T23:59:59Z'), 30);
  const paid: MetricPayment[] = [
    { amount: 1000, refunded_amount: null, status: 'paid', paid_at: '2026-06-10T12:00:00Z', requested_at: null, job_id: 'j1' },
    { amount: 1500, refunded_amount: null, status: 'paid', paid_at: '2026-06-20T12:00:00Z', requested_at: null, job_id: 'j2' },
  ];
  const costs: MetricCost[] = [
    { amount: 300, type: 'material', created_at: '2026-06-10T14:00:00Z', job_id: 'j1' },
    { amount: 400, type: 'labor', created_at: '2026-06-20T14:00:00Z', job_id: 'j2' },
  ];

  it('computes bucket costs and profit alongside revenue', () => {
    const trend = buildRevenueTrend(paid, period, costs);
    expect(trend.total).toBe(2500);
    expect(trend.totalCosts).toBe(700);
    expect(trend.totalProfit).toBe(1800);
    const withRevenue = trend.points.filter((p) => p.current > 0);
    expect(withRevenue.length).toBeGreaterThan(0);
    expect(withRevenue.some((p) => (p.profit ?? 0) > 0)).toBe(true);
  });
});

describe('computeJobProfitability', () => {
  const period = { fromMs: Date.parse('2026-06-01T00:00:00Z'), toMs: Date.parse('2026-06-30T23:59:59Z') };
  const jobs: MetricJob[] = [
    { id: 'j1', ref: 'J-001', client_name: 'Alice', client_id: 'c1', quoted_amount: 1000, status: 'complete', created_at: '2026-06-05T00:00:00Z' },
    { id: 'j2', ref: 'J-002', client_name: 'Bob', client_id: 'c2', quoted_amount: 2000, status: 'complete', created_at: '2026-06-10T00:00:00Z' },
    { id: 'j3', ref: 'J-003', client_name: 'Charlie', client_id: 'c3', quoted_amount: 500, status: 'complete', created_at: '2026-06-15T00:00:00Z' },
  ];
  const paid: MetricPayment[] = [
    { amount: 1000, refunded_amount: null, status: 'paid', paid_at: '2026-06-08T00:00:00Z', requested_at: null, job_id: 'j1' },
    { amount: 2000, refunded_amount: null, status: 'paid', paid_at: '2026-06-12T00:00:00Z', requested_at: null, job_id: 'j2' },
    { amount: 500, refunded_amount: null, status: 'paid', paid_at: '2026-06-18T00:00:00Z', requested_at: null, job_id: 'j3' },
  ];
  const costs: MetricCost[] = [
    // j1: rev 1000, cost 200 -> profit 800, margin 80% (winner)
    { amount: 200, type: 'material', created_at: '2026-06-06T00:00:00Z', job_id: 'j1' },
    // j2: rev 2000, cost 1800 -> profit 200, margin 10% (bleeder)
    { amount: 1800, type: 'labor', created_at: '2026-06-11T00:00:00Z', job_id: 'j2' },
    // j3: rev 500, cost 700 -> profit -200, margin -40% (bleeder and overrun vs quote 500)
    { amount: 700, type: 'sub', created_at: '2026-06-16T00:00:00Z', job_id: 'j3' },
  ];

  it('identifies top margin winners, bleeders, and cost-to-quote overruns', () => {
    const prof = computeJobProfitability(jobs, costs, paid, period);
    expect(prof.hasData).toBe(true);
    expect(prof.measuredJobs).toBe(3);
    expect(prof.winners.length).toBeGreaterThan(0);
    expect(prof.winners[0].jobId).toBe('j1');
    expect(prof.winners[0].marginPct).toBe(80);

    expect(prof.bleeders.some((b) => b.jobId === 'j3')).toBe(true);
    expect(prof.overruns.some((o) => o.jobId === 'j3')).toBe(true);
    expect(prof.overruns.find((o) => o.jobId === 'j3')!.costOverrun).toBe(200); // 700 cost - 500 quote
  });
});

describe('computeLaborEfficiency', () => {
  const period = { fromMs: Date.parse('2026-06-01T00:00:00Z'), toMs: Date.parse('2026-06-30T23:59:59Z') };
  const crew = [
    { id: 'crew-1', name: 'Dan Leader' },
    { id: 'crew-2', name: 'Sam Tech' },
  ];
  const timeEntries = [
    { id: 't1', crew_id: 'crew-1', job_id: 'j1', started_at: '2026-06-05T08:00:00Z', ended_at: '2026-06-05T16:00:00Z', rate: 30 },
    { id: 't2', crew_id: 'crew-2', job_id: 'j1', started_at: '2026-06-05T08:00:00Z', ended_at: '2026-06-05T14:00:00Z', rate: 25 },
    { id: 't3', crew_id: 'crew-2', job_id: null, started_at: '2026-06-06T08:00:00Z', ended_at: '2026-06-06T10:00:00Z', rate: 25 },
  ];
  const laborCosts: MetricCost[] = [
    { amount: 240, type: 'labor', created_at: '2026-06-05T00:00:00Z', job_id: 'j1', crew_id: 'crew-1', hours: 8, rate: 30 },
  ];

  it('calculates total hours, billable utilization, and revenue per crew hour', () => {
    // 8 + 6 + 2 hrs = 16 hours. Billable: 8 + 6 = 14 hours.
    const result = computeLaborEfficiency(timeEntries, laborCosts, crew, 3200, period);
    expect(result.hasData).toBe(true);
    expect(result.totalHours).toBe(16);
    expect(result.billableHours).toBe(14);
    expect(result.billableRatio).toBe(88); // 14/16 = 87.5% -> 88%
    expect(result.revenuePerCrewHour).toBe(200); // 3200 / 16
    expect(result.crewBreakdown.length).toBe(2);
  });
});

describe('computeReputationMetrics', () => {
  const period = { fromMs: Date.parse('2026-06-01T00:00:00Z'), toMs: Date.parse('2026-06-30T23:59:59Z') };
  const invites = [
    { id: 'r1', rating: 5, routed_to: 'google', google_clicked_at: '2026-06-10T12:00:00Z', responded_at: '2026-06-10T12:00:00Z', created_at: '2026-06-08T12:00:00Z' },
    { id: 'r2', rating: 4, routed_to: 'google', google_clicked_at: '2026-06-12T12:00:00Z', responded_at: '2026-06-12T12:00:00Z', created_at: '2026-06-10T12:00:00Z' },
    { id: 'r3', rating: 3, routed_to: 'private', google_clicked_at: null, responded_at: '2026-06-14T12:00:00Z', created_at: '2026-06-12T12:00:00Z' },
    { id: 'r4', rating: null, routed_to: null, google_clicked_at: null, responded_at: null, created_at: '2026-06-15T12:00:00Z' },
  ];

  it('aggregates response rate, star ratings, and Google conversion', () => {
    const rep = computeReputationMetrics(invites, period);
    expect(rep.hasData).toBe(true);
    expect(rep.totalInvites).toBe(4);
    expect(rep.respondedCount).toBe(3);
    expect(rep.responseRate).toBe(75);
    expect(rep.averageRating).toBe(4); // (5 + 4 + 3) / 3 = 4.0
    expect(rep.googleReviewsCount).toBe(2);
    expect(rep.googleConversionRate).toBe(67); // 2 of 3 responded
  });
});

describe('computeVoiceMetrics', () => {
  const period = { fromMs: Date.parse('2026-06-01T00:00:00Z'), toMs: Date.parse('2026-06-30T23:59:59Z') };
  const calls = [
    { id: 'c1', started_at: '2026-06-05T00:00:00Z', ai_seconds: 120, outcome: 'completed', lead_id: 'l1', created_at: '2026-06-05T00:00:00Z' },
    { id: 'c2', started_at: '2026-06-06T00:00:00Z', ai_seconds: 180, outcome: 'completed', lead_id: 'l2', created_at: '2026-06-06T00:00:00Z' },
    { id: 'c3', started_at: '2026-06-07T00:00:00Z', ai_seconds: 0, outcome: 'missed', lead_id: null, created_at: '2026-06-07T00:00:00Z' },
  ];

  it('tracks answered vs missed calls, leads captured, and estimated value', () => {
    const voice = computeVoiceMetrics(calls, 2000, period);
    expect(voice.hasVoice).toBe(true);
    expect(voice.totalCalls).toBe(3);
    expect(voice.answeredCalls).toBe(2);
    expect(voice.missedCalls).toBe(1);
    expect(voice.leadsCreated).toBe(2);
    expect(voice.estimatedRevenue).toBe(4000); // 2 * 2000
    expect(voice.totalMinutes).toBe(5); // 300s / 60
  });
});

describe('computeMrrMovement', () => {
  const period = { fromMs: Date.parse('2026-06-01T00:00:00Z'), toMs: Date.parse('2026-06-30T23:59:59Z') };
  const plans = [
    // Existing active plan
    { id: 'p1', amount: 100, frequency: 'monthly', active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    // New active plan started in June
    { id: 'p2', amount: 200, frequency: 'monthly', active: true, created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:00:00Z' },
    // Churned plan cancelled in June
    { id: 'p3', amount: 50, frequency: 'monthly', active: false, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' },
  ];

  it('computes active MRR, new MRR, churned MRR, and net delta', () => {
    const movement = computeMrrMovement(plans, period);
    expect(movement.hasData).toBe(true);
    expect(movement.activePlans).toBe(2);
    expect(movement.monthlyRevenue).toBe(300); // 100 + 200
    expect(movement.newPlans).toBe(1);
    expect(movement.newMrr).toBe(200);
    expect(movement.churnedPlans).toBe(1);
    expect(movement.churnedMrr).toBe(50);
    expect(movement.netMrrDelta).toBe(150); // 200 - 50
  });
});

describe('computePaceForecast', () => {
  it('projects end-of-period revenue on an active period containing now', () => {
    const now = Date.parse('2026-06-15T12:00:00Z');
    const period = {
      fromMs: Date.parse('2026-06-01T00:00:00Z'),
      toMs: Date.parse('2026-06-30T23:59:59Z'),
      days: 30,
    };
    // Collected $15,000 in 15 days -> $1,000/day -> Projected $30,000
    const forecast = computePaceForecast(15000, period, 25000, now);
    expect(forecast).not.toBeNull();
    expect(forecast!.isCurrentPeriod).toBe(true);
    expect(forecast!.daysElapsed).toBe(15);
    expect(forecast!.dailyRunRate).toBe(1000);
    expect(forecast!.projectedRevenue).toBe(30000);
    expect(forecast!.pacePercentage).toBe(120); // 30000 / 25000
    expect(forecast!.paceNote).toContain('+20%');
  });

  it('returns null if period is completely in the past', () => {
    const now = Date.parse('2026-08-01T00:00:00Z');
    const pastPeriod = {
      fromMs: Date.parse('2026-06-01T00:00:00Z'),
      toMs: Date.parse('2026-06-30T23:59:59Z'),
      days: 30,
    };
    expect(computePaceForecast(10000, pastPeriod, undefined, now)).toBeNull();
  });
});

