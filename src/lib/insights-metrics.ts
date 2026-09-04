// The second-generation Insights calculators — the KPI cards, the six-stage
// funnel, the revenue-over-time series, schedule utilization, payment health,
// customer and service breakdowns, marketing history and the ranked opportunity
// list that the redesigned dashboard renders.
//
// Everything here is PURE (no I/O): buildInsights (src/lib/insights.ts) does the
// tenant-scoped reads and hands these functions plain rows, so each calculator
// is unit-testable against fixtures and asserts exact numbers — no fabricated
// values ever reach the page. Where the data genuinely can't answer a question
// (a period delta for a point-in-time balance, true "overdue" without due dates,
// marketing opens without a tracking vendor) the calculator returns null / a
// flag and the UI says what's missing rather than printing a confident zero.

import { computeDelta, computePointDelta, round2, monthlyRunRate, DAY_MS, type Delta, type Period } from '@/lib/insights';
import type { BookingAvailability } from '@/lib/booking-availability';
import type { CampaignChannel } from '@/lib/campaign-audiences';

/* -------------------------------------------------------------------------- */
/* Shared time helpers                                                         */
/* -------------------------------------------------------------------------- */

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' in local time, matching how the app stores date-only columns. */
function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function inRange(iso: string | null | undefined, fromMs: number, toMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= fromMs && t < toMs;
}

// The last `months` calendar months as [start, end) windows, oldest first — the
// backbone of every KPI sparkline. Month boundaries are local so a bucket lines
// up with the month an owner would name.
export function monthWindows(now: Date, months: number): Array<{ key: string; label: string; fromMs: number; toMs: number }> {
  const out: Array<{ key: string; label: string; fromMs: number; toMs: number }> = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    out.push({
      key: monthKey(start),
      label: start.toLocaleDateString('en-US', { month: 'short' }),
      fromMs: start.getTime(),
      toMs: end.getTime(),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Row shapes (the pre-fetched inputs)                                         */
/* -------------------------------------------------------------------------- */

export type MetricJob = {
  id: string;
  ref?: string | null;
  client_id: string | null;
  client_name?: string | null;
  quoted_amount: number | string | null;
  created_at: string;
  status?: string;
};
/** A job_feed row narrowed to what these calculators read. */
export type FeedEvent = { job_id: string | null; created_at: string };
export type MetricPayment = {
  amount: number | string;
  refunded_amount?: number | string | null;
  paid_at: string;
  status?: string;
  requested_at?: string | null;
  job_id?: string | null;
};
export type MetricCost = {
  amount: number | string;
  created_at: string;
  type?: string;
  job_id?: string | null;
  hours?: number | string | null;
  crew_id?: string | null;
  rate?: number | string | null;
  burden_amount?: number | string | null;
};

/** Collected net of refunds — the honest "money that stayed" for a window. */
function netPaidInRange(paid: MetricPayment[], fromMs: number, toMs: number): number {
  return paid.reduce((sum, p) => {
    if (!inRange(p.paid_at, fromMs, toMs)) return sum;
    const net = (Number(p.amount) || 0) - (Number(p.refunded_amount) || 0);
    return sum + Math.max(0, net);
  }, 0);
}

/** Costs created in the window (labor wages + burden, plus materials/other). */
function costsInRange(costs: MetricCost[], fromMs: number, toMs: number): number {
  return costs.reduce((sum, c) => {
    if (!inRange(c.created_at, fromMs, toMs)) return sum;
    const burden = c.type === 'labor' ? (Number(c.burden_amount) || 0) : 0;
    return sum + (Number(c.amount) || 0) + burden;
  }, 0);
}

/** Distinct job ids among feed events whose timestamp falls in the window. */
function distinctJobsInRange(events: FeedEvent[], fromMs: number, toMs: number): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.job_id && inRange(event.created_at, fromMs, toMs)) ids.add(event.job_id);
  }
  return ids;
}

/** How many distinct jobs a set of feed events touched inside the window. */
export function countDistinctJobsInRange(events: FeedEvent[], fromMs: number, toMs: number): number {
  return distinctJobsInRange(events, fromMs, toMs).size;
}

/* -------------------------------------------------------------------------- */
/* KPI cards                                                                    */
/* -------------------------------------------------------------------------- */

export type KpiFormat = 'money' | 'count' | 'percent';

export type Kpi = {
  key: string;
  label: string;
  value: number;
  format: KpiFormat;
  /** null when no honest comparison exists (a point-in-time balance). */
  delta: Delta | null;
  deltaUnit: '%' | 'pp';
  /** Whether an UP arrow is good news — costs and overdue balances invert it. */
  upIsGood: boolean;
  /** Monthly trend for the tile spark; [] when there isn't a real series. */
  spark: number[];
  /** Plain-language "how this is worked out", shown in the tooltip. */
  hint: string;
  /** A caveat printed under the value, e.g. why there's no comparison. */
  note?: string;
};

export type InsightsKpis = {
  grossRevenue: Kpi;
  netCollected: Kpi;
  jobsCompleted: Kpi;
  quoteConversion: Kpi;
  outstandingBalance: Kpi;
  newCustomers: Kpi;
};

export type KpiInput = {
  jobs: MetricJob[];
  /** job_feed kind='job_completed'. */
  completedEvents: FeedEvent[];
  paid: MetricPayment[];
  /** job_feed kind='client_link_created' — a quote actually put in front of a customer. */
  quoteSentEvents: FeedEvent[];
  /** job_feed kind='quote_approved'. */
  quoteApprovedEvents: FeedEvent[];
  /** Current open-invoice balance — a snapshot, not a windowed sum. */
  outstandingTotal: number;
  outstandingCount: number;
  period: Period;
  now?: Date;
};

// Sum a completed job's quoted value over the events that finished in a window,
// counting each job once even if it was toggled complete more than once.
function completedValue(input: { completedEvents: FeedEvent[]; valueByJob: Map<string, number>; fromMs: number; toMs: number }): { count: number; value: number } {
  const jobs = distinctJobsInRange(input.completedEvents, input.fromMs, input.toMs);
  let value = 0;
  for (const id of jobs) value += input.valueByJob.get(id) ?? 0;
  return { count: jobs.size, value };
}

// Conversion for a window: approved quotes ÷ quotes actually sent, both counted
// as DISTINCT jobs so a quote re-shared twice doesn't inflate the denominator.
function conversionRate(sent: FeedEvent[], approved: FeedEvent[], fromMs: number, toMs: number): { pct: number; sent: number; approved: number } {
  const sentJobs = distinctJobsInRange(sent, fromMs, toMs);
  const approvedJobs = distinctJobsInRange(approved, fromMs, toMs);
  const pct = sentJobs.size > 0 ? Math.round((approvedJobs.size / sentJobs.size) * 100) : 0;
  return { pct, sent: sentJobs.size, approved: approvedJobs.size };
}

// First-job-created dates per client — the basis for "new customers". A job with
// no client attached can't be credited to anyone, so it's skipped rather than
// counted as an anonymous new customer.
function firstJobByClient(jobs: MetricJob[]): number[] {
  const first = new Map<string, number>();
  for (const job of jobs) {
    if (!job.client_id) continue;
    const t = new Date(job.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const existing = first.get(job.client_id);
    if (existing === undefined || t < existing) first.set(job.client_id, t);
  }
  return [...first.values()];
}

export function computeKpis(input: KpiInput): InsightsKpis {
  const now = input.now ?? new Date();
  const { period } = input;
  const span = period.toMs - period.fromMs;
  const prevFrom = period.fromMs - span;
  const prevTo = period.fromMs;
  const months = monthWindows(now, 6);

  const valueByJob = new Map<string, number>();
  for (const job of input.jobs) valueByJob.set(job.id, Number(job.quoted_amount) || 0);

  // Gross revenue — value of jobs marked complete in the window.
  const curCompleted = completedValue({ completedEvents: input.completedEvents, valueByJob, fromMs: period.fromMs, toMs: period.toMs });
  const prevCompleted = completedValue({ completedEvents: input.completedEvents, valueByJob, fromMs: prevFrom, toMs: prevTo });
  const grossSpark = months.map((m) => completedValue({ completedEvents: input.completedEvents, valueByJob, fromMs: m.fromMs, toMs: m.toMs }).value);

  // Net collected — payments that landed, net of refunds.
  const curCollected = netPaidInRange(input.paid, period.fromMs, period.toMs);
  const prevCollected = netPaidInRange(input.paid, prevFrom, prevTo);
  const collectedSpark = months.map((m) => netPaidInRange(input.paid, m.fromMs, m.toMs));

  // Jobs completed — distinct jobs finished in the window.
  const completedSpark = months.map((m) => distinctJobsInRange(input.completedEvents, m.fromMs, m.toMs).size);

  // Quote conversion — approved ÷ sent, in points.
  const curConv = conversionRate(input.quoteSentEvents, input.quoteApprovedEvents, period.fromMs, period.toMs);
  const prevConv = conversionRate(input.quoteSentEvents, input.quoteApprovedEvents, prevFrom, prevTo);
  const convSpark = months.map((m) => conversionRate(input.quoteSentEvents, input.quoteApprovedEvents, m.fromMs, m.toMs).pct);
  const convHasSeries = months.some((m) => distinctJobsInRange(input.quoteSentEvents, m.fromMs, m.toMs).size > 0);

  // New customers — clients whose FIRST job was created in the window.
  const firstDates = firstJobByClient(input.jobs);
  const curNew = firstDates.filter((t) => t >= period.fromMs && t < period.toMs).length;
  const prevNew = firstDates.filter((t) => t >= prevFrom && t < prevTo).length;
  const newSpark = months.map((m) => firstDates.filter((t) => t >= m.fromMs && t < m.toMs).length);

  return {
    grossRevenue: {
      key: 'grossRevenue',
      label: 'Gross Revenue',
      value: round2(curCompleted.value),
      format: 'money',
      delta: computeDelta(curCompleted.value, prevCompleted.value),
      deltaUnit: '%',
      upIsGood: true,
      spark: grossSpark,
      hint: 'Total quoted value of jobs you marked complete in this period.',
    },
    netCollected: {
      key: 'netCollected',
      label: 'Net Collected',
      value: round2(curCollected),
      format: 'money',
      delta: computeDelta(curCollected, prevCollected),
      deltaUnit: '%',
      upIsGood: true,
      spark: collectedSpark,
      hint: 'Payments received in this period, minus any refunds, by the date the money landed.',
    },
    jobsCompleted: {
      key: 'jobsCompleted',
      label: 'Jobs Completed',
      value: curCompleted.count,
      format: 'count',
      delta: computeDelta(curCompleted.count, prevCompleted.count),
      deltaUnit: '%',
      upIsGood: true,
      spark: completedSpark,
      hint: 'Number of jobs marked complete in this period.',
    },
    quoteConversion: {
      key: 'quoteConversion',
      label: 'Quote Conversion',
      value: curConv.pct,
      format: 'percent',
      delta: computePointDelta(curConv.pct, prevConv.pct),
      deltaUnit: 'pp',
      upIsGood: true,
      spark: convHasSeries ? convSpark : [],
      hint: 'Quotes approved ÷ quotes sent to a customer in this period.',
      note: curConv.sent === 0 ? 'No quotes were sent to a customer in this period.' : undefined,
    },
    outstandingBalance: {
      key: 'outstandingBalance',
      label: 'Outstanding Balance',
      value: round2(input.outstandingTotal),
      format: 'money',
      // A point-in-time balance has no honest "vs previous period" — reconstructing
      // what was owed 90 days ago would need a history we don't keep. Neutral.
      delta: null,
      deltaUnit: '%',
      upIsGood: false,
      spark: [],
      hint: 'What customers owe you right now across unpaid invoices, after deposits and part-payments.',
      note: `${input.outstandingCount} unpaid invoice${input.outstandingCount === 1 ? '' : 's'} · current total, not a period change`,
    },
    newCustomers: {
      key: 'newCustomers',
      label: 'New Customers',
      value: curNew,
      format: 'count',
      delta: computeDelta(curNew, prevNew),
      deltaUnit: '%',
      upIsGood: true,
      spark: newSpark,
      hint: 'Customers whose first job with you was created in this period.',
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Revenue over time                                                            */
/* -------------------------------------------------------------------------- */

export type RevenueGrouping = 'day' | 'week' | 'month';

export type RevenueTrendPoint = {
  key: string;
  label: string;
  current: number;
  previous: number;
  costs?: number;
  profit?: number;
  previousCosts?: number;
  previousProfit?: number;
};
export type RevenueTrend = {
  grouping: RevenueGrouping;
  points: RevenueTrendPoint[];
  total: number;
  previousTotal: number;
  totalCosts?: number;
  totalProfit?: number;
  previousTotalCosts?: number;
  previousTotalProfit?: number;
  hasData: boolean;
};

// Bucket size follows the range: a 30-day window reads best day-by-day, a
// quarter by week, a year by month. Kept in one place so the axis and the label
// formatting never disagree about how many bars there are.
export function chooseGrouping(days: number): RevenueGrouping {
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

// Buckets are LABELED by the calendar month/day they belong to, which means the
// first one starts before the period does (a 30-day window opens mid-day, a
// quarter opens mid-month) and the last one ends after it. The window each bucket
// SUMS is clamped back to the period, so the chart's total is the period's total
// — unclamped, it quietly added the hours before the range and read higher than
// the Net Collected card sitting directly above it.
function trendBuckets(fromMs: number, toMs: number, grouping: RevenueGrouping): Array<{ key: string; label: string; startMs: number; endMs: number }> {
  const buckets: Array<{ key: string; label: string; startMs: number; endMs: number }> = [];
  if (grouping === 'month') {
    const first = new Date(fromMs);
    let cursor = new Date(first.getFullYear(), first.getMonth(), 1).getTime();
    while (cursor < toMs) {
      const start = new Date(cursor);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime();
      buckets.push({
        key: monthKey(start),
        label: start.toLocaleDateString('en-US', { month: 'short' }),
        startMs: Math.max(cursor, fromMs),
        endMs: Math.min(end, toMs),
      });
      cursor = end;
    }
    return buckets;
  }
  const step = grouping === 'day' ? DAY_MS : 7 * DAY_MS;
  let cursor = startOfDayMs(fromMs);
  while (cursor < toMs) {
    buckets.push({
      key: String(cursor),
      label: new Date(cursor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      startMs: Math.max(cursor, fromMs),
      endMs: Math.min(cursor + step, toMs),
    });
    cursor += step;
  }
  return buckets;
}

// Net-collected over the selected window, with each bucket's immediately-prior
// equivalent alongside it. The previous value is the same bucket shifted back by
// the whole span, so the two series always have identical length and aligned
// labels — no off-by-one when a month is 28 days and its predecessor was 31.
export function buildRevenueTrend(
  paid: MetricPayment[],
  period: Period,
  costs?: MetricCost[],
  spanOffsetMs?: number,
): RevenueTrend {
  const grouping = chooseGrouping(period.days);
  const span = spanOffsetMs ?? (period.toMs - period.fromMs);
  const buckets = trendBuckets(period.fromMs, period.toMs, grouping);

  let total = 0;
  let previousTotal = 0;
  let totalCosts = 0;
  let previousTotalCosts = 0;
  const points: RevenueTrendPoint[] = buckets.map((bucket) => {
    const current = netPaidInRange(paid, bucket.startMs, bucket.endMs);
    const previous = netPaidInRange(paid, bucket.startMs - span, bucket.endMs - span);
    total += current;
    previousTotal += previous;

    let pointCosts = 0;
    let pointPrevCosts = 0;
    if (costs) {
      pointCosts = costsInRange(costs, bucket.startMs, bucket.endMs);
      pointPrevCosts = costsInRange(costs, bucket.startMs - span, bucket.endMs - span);
      totalCosts += pointCosts;
      previousTotalCosts += pointPrevCosts;
    }

    return {
      key: bucket.key,
      label: bucket.label,
      current: round2(current),
      previous: round2(previous),
      ...(costs
        ? {
            costs: round2(pointCosts),
            profit: round2(current - pointCosts),
            previousCosts: round2(pointPrevCosts),
            previousProfit: round2(previous - pointPrevCosts),
          }
        : {}),
    };
  });

  return {
    grouping,
    points,
    total: round2(total),
    previousTotal: round2(previousTotal),
    ...(costs
      ? {
          totalCosts: round2(totalCosts),
          totalProfit: round2(total - totalCosts),
          previousTotalCosts: round2(previousTotalCosts),
          previousTotalProfit: round2(previousTotal - previousTotalCosts),
        }
      : {}),
    hasData: total > 0 || previousTotal > 0 || totalCosts > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Sales activity — six stage volumes                                           */
/* -------------------------------------------------------------------------- */

/**
 * WHY THERE ARE NO PERCENTAGES HERE.
 *
 * This used to be called a funnel and carried a conversion rate on every stage
 * plus an overall "lead → paid". Both were arithmetic on numbers that do not
 * belong to each other.
 *
 * It is period VOLUME, not a tracked cohort. A lead counted this month need not
 * be the record that got paid this month; the link from one lead to its own
 * eventual payment is not reliably recorded anywhere. So the ratio of two of
 * these counts is not a conversion rate — it is a comparison of two unrelated
 * populations that happen to share a date range.
 *
 * The tell was visible on screen: stages read ABOVE 100% (more jobs paid this
 * month than quotes sent this month), immediately below a caption explaining
 * that this is not a tracked funnel. A number that has to be disclaimed to be
 * read is not a number worth showing, and the disclaimer does not survive the
 * screenshot somebody pastes into a group chat.
 *
 * The counts themselves are honest and useful: six real things that happened in
 * a window. They are what is left. If a true conversion rate is wanted later it
 * needs cohort tracking — following each lead to its own outcome — not a ratio
 * of these six.
 */

export type SalesActivityStage = {
  key: string;
  label: string;
  count: number;
};
export type SalesActivity = {
  stages: SalesActivityStage[];
};

export type SalesActivityInput = {
  leadsCreated: number;
  quotesSent: number;
  quotesApproved: number;
  jobsScheduled: number;
  jobsCompleted: number;
  jobsPaid: number;
};

export function buildSalesActivity(input: SalesActivityInput): SalesActivity {
  return {
    stages: [
      { key: 'leads', label: 'Leads', count: input.leadsCreated },
      { key: 'quotes_sent', label: 'Quotes sent', count: input.quotesSent },
      { key: 'quotes_approved', label: 'Quotes approved', count: input.quotesApproved },
      { key: 'jobs_scheduled', label: 'Jobs scheduled', count: input.jobsScheduled },
      { key: 'jobs_completed', label: 'Jobs completed', count: input.jobsCompleted },
      { key: 'jobs_paid', label: 'Jobs paid', count: input.jobsPaid },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Schedule utilization                                                         */
/* -------------------------------------------------------------------------- */

export type ScheduleUtilization = {
  /** Booking availability is configured (enabled + at least one working weekday). */
  configured: boolean;
  lookaheadDays: number;
  workingDays: number;
  bookedDays: number;
  openDays: number;
  utilizationPct: number | null;
  /** openDays × average job value — clearly an estimate; null when we can't size it. */
  estimatedOpportunity: number | null;
  avgJobValue: number;
};

export type ScheduleUtilizationInput = {
  availability: BookingAvailability;
  /** scheduled_for date keys ('YYYY-MM-DD') of upcoming, non-archived jobs. */
  scheduledDates: string[];
  /** Owner time-off ranges ('YYYY-MM-DD' inclusive) that remove a day from capacity. */
  blocks: Array<{ start_date: string; end_date: string }>;
  avgJobValue: number;
  now?: Date;
  lookaheadDays?: number;
};

// A date is blocked when it lands inside any time-off range. 'YYYY-MM-DD' sorts
// lexically the same as chronologically, so a plain string compare is exact.
function isBlocked(dateKey: string, blocks: Array<{ start_date: string; end_date: string }>): boolean {
  return blocks.some((b) => b.start_date && b.end_date && dateKey >= b.start_date && dateKey <= b.end_date);
}

// Booked vs open across the next few working weeks. A working day is a bookable
// weekday inside the lookahead that isn't blocked off; it counts as booked once
// it has any scheduled job on it, open otherwise. Utilization is booked ÷
// working — deliberately "days that have work", not "hours filled", because a
// day-level count is the honest thing an owner can act on from this card.
export function computeScheduleUtilization(input: ScheduleUtilizationInput): ScheduleUtilization {
  const now = input.now ?? new Date();
  const lookaheadDays = input.lookaheadDays ?? 21;
  const avail = input.availability;
  const configured = avail.enabled && avail.weekdays.length > 0;

  const jobsByDate = new Map<string, number>();
  for (const key of input.scheduledDates) {
    if (!key) continue;
    jobsByDate.set(key, (jobsByDate.get(key) ?? 0) + 1);
  }

  const weekdays = new Set(avail.weekdays);
  // Enumerate by calendar date, not by adding DAY_MS — a DST transition inside
  // the lookahead would drift a millisecond walk onto the wrong day.
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let workingDays = 0;
  let bookedDays = 0;
  for (let offset = 0; configured && offset <= lookaheadDays; offset++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    if (!weekdays.has(day.getDay())) continue;
    const key = localDateKey(day);
    if (isBlocked(key, input.blocks)) continue;
    workingDays += 1;
    if ((jobsByDate.get(key) ?? 0) > 0) bookedDays += 1;
  }

  const openDays = Math.max(0, workingDays - bookedDays);
  const utilizationPct = workingDays > 0 ? Math.round((bookedDays / workingDays) * 100) : null;
  const estimatedOpportunity = openDays > 0 && input.avgJobValue > 0 ? round2(openDays * input.avgJobValue) : null;

  return {
    configured,
    lookaheadDays,
    workingDays,
    bookedDays,
    openDays,
    utilizationPct,
    estimatedOpportunity,
    avgJobValue: round2(input.avgJobValue),
  };
}

/* -------------------------------------------------------------------------- */
/* Payment health                                                               */
/* -------------------------------------------------------------------------- */

export type PaymentHealth = {
  /** Total on invoices 30+ days old. Called "overdue" loosely — see the note. */
  overdueBalance: number;
  overdueCount: number;
  avgDaysToCollect: number | null;
  failedPayments: number;
};

export type PaymentHealthInput = {
  /** buildAging() output — bands keyed 0-7 / 8-14 / 15-30 / 31-60 / 60+. */
  aging: Array<{ key: string; total: number; count: number }>;
  avgDaysToPayment: number | null;
  failedPayments: number;
};

// Age-based, NOT due-date-based. Invoices have no due date, so nothing here can
// honestly be "overdue against the terms you agreed" — this is oldest-money:
// balances that have sat unpaid for 30+ days since being raised. The card labels
// it that way. The 31-60 and 60+ aging bands are the 30+ set.
export function computePaymentHealth(input: PaymentHealthInput): PaymentHealth {
  const aged = input.aging.filter((band) => band.key === '31-60' || band.key === '60+');
  return {
    overdueBalance: round2(aged.reduce((sum, band) => sum + band.total, 0)),
    overdueCount: aged.reduce((sum, band) => sum + band.count, 0),
    avgDaysToCollect: input.avgDaysToPayment,
    failedPayments: input.failedPayments,
  };
}

/* -------------------------------------------------------------------------- */
/* Customer insights                                                            */
/* -------------------------------------------------------------------------- */

export type CustomerInsights = {
  totalClients: number;
  repeatClients: number;
  repeatRatePct: number | null;
  inactiveClients: number;
  inactiveThresholdDays: number;
  activeMaintenancePlans: number;
  maintenanceMonthly: number;
};

/** The slice of ClientWithStats these calculators need. */
export type MetricClient = {
  jobCount: number;
  created_at: string;
  lastJobAt: string | null;
  lastVisitAt: string | null;
  nextJobAt: string | null;
};

export type CustomerInsightsInput = {
  clients: MetricClient[];
  activeMaintenancePlans: number;
  maintenanceMonthly: number;
  inactiveThresholdDays?: number;
  now?: Date;
};

// Repeat rate and who's gone quiet. "Inactive" means nothing on the calendar
// ahead AND no activity for the threshold — a customer with a booked next visit
// is never inactive however long ago the last one was. Maintenance is reported
// as active recurring plans and their monthly value rather than a "due this
// week" count, because nothing links a plan to a concrete next-visit date, and a
// confident wrong number next to the money is worse than an honest one.
export function computeCustomerInsights(input: CustomerInsightsInput): CustomerInsights {
  const now = input.now ?? new Date();
  const thresholdDays = input.inactiveThresholdDays ?? 90;
  const cutoff = now.getTime() - thresholdDays * DAY_MS;

  const withJobs = input.clients.filter((c) => c.jobCount > 0);
  const repeat = withJobs.filter((c) => c.jobCount >= 2).length;

  let inactive = 0;
  for (const client of withJobs) {
    if (client.nextJobAt) continue; // something is booked — not inactive
    // Most recent real activity: a past visit date, else when the last job was created.
    const visit = client.lastVisitAt ? new Date(`${client.lastVisitAt}T00:00:00`).getTime() : null;
    const created = client.lastJobAt ? new Date(client.lastJobAt).getTime() : null;
    const lastActivity = Math.max(visit ?? 0, created ?? 0);
    if (lastActivity > 0 && lastActivity < cutoff) inactive += 1;
  }

  return {
    totalClients: input.clients.length,
    repeatClients: repeat,
    repeatRatePct: withJobs.length > 0 ? Math.round((repeat / withJobs.length) * 100) : null,
    inactiveClients: inactive,
    inactiveThresholdDays: thresholdDays,
    activeMaintenancePlans: input.activeMaintenancePlans,
    maintenanceMonthly: round2(input.maintenanceMonthly),
  };
}

/* -------------------------------------------------------------------------- */
/* Revenue by service (approximate)                                             */
/* -------------------------------------------------------------------------- */

export type RevenueServiceSlice = { label: string; amount: number; pct: number; count: number };
export type RevenueByService = {
  slices: RevenueServiceSlice[];
  total: number;
  /** Always true: grouped from free-text line-item labels, not a real service join. */
  approximate: true;
  hasData: boolean;
};

export type ServiceInvoice = {
  created_at: string;
  status: string;
  items: Array<{ description: string | null; amount: number | string | null }>;
};

const TOP_SERVICE_SLICES = 5;

function normalizeServiceLabel(description: string | null): string {
  const trimmed = (description ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Unlabeled';
  // Group case-insensitively but keep the first spelling seen for display.
  return trimmed.length > 48 ? `${trimmed.slice(0, 47)}…` : trimmed;
}

// Best-effort revenue-by-service from invoice line items on signed/paid invoices
// raised in the window. There is no service catalog joined to money, so items
// are grouped by their (normalized) description — approximate by construction,
// and labeled that way on the card. Top few by value, everything else folded
// into "Other" so a long tail of one-off descriptions doesn't drown the signal.
export function groupRevenueByService(invoices: ServiceInvoice[], period: Period): RevenueByService {
  const groups = new Map<string, { label: string; amount: number; count: number }>();
  let total = 0;
  for (const invoice of invoices) {
    if (invoice.status !== 'signed' && invoice.status !== 'paid') continue;
    if (!inRange(invoice.created_at, period.fromMs, period.toMs)) continue;
    for (const item of invoice.items ?? []) {
      const amount = Number(item.amount) || 0;
      if (amount <= 0) continue;
      const label = normalizeServiceLabel(item.description);
      const dedupeKey = label.toLowerCase();
      const group = groups.get(dedupeKey) ?? { label, amount: 0, count: 0 };
      group.amount += amount;
      group.count += 1;
      groups.set(dedupeKey, group);
      total += amount;
    }
  }

  const sorted = [...groups.values()].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, TOP_SERVICE_SLICES);
  const rest = sorted.slice(TOP_SERVICE_SLICES);
  const slices: RevenueServiceSlice[] = top.map((group) => ({
    label: group.label,
    amount: round2(group.amount),
    pct: total > 0 ? Math.round((group.amount / total) * 100) : 0,
    count: group.count,
  }));
  if (rest.length > 0) {
    const otherAmount = rest.reduce((sum, group) => sum + group.amount, 0);
    slices.push({
      label: 'Other',
      amount: round2(otherAmount),
      pct: total > 0 ? Math.round((otherAmount / total) * 100) : 0,
      count: rest.reduce((sum, group) => sum + group.count, 0),
    });
  }

  return { slices, total: round2(total), approximate: true, hasData: total > 0 };
}

/* -------------------------------------------------------------------------- */
/* Marketing performance                                                        */
/* -------------------------------------------------------------------------- */

export type MarketingCampaignRow = {
  id: string;
  channel: CampaignChannel;
  audience: string;
  sentAt: string;
  recipients: number;
  emailSent: number;
  smsQueued: number;
  failed: number;
  skipped: number;
};

export type MarketingPerformance = {
  campaigns: MarketingCampaignRow[];
  totalRecipients: number;
  hasData: boolean;
  /** No open/click/reply pixel or vendor exists — the card must not imply one. */
  tracksEngagement: false;
  /** No booking→campaign attribution exists — no "revenue from this send". */
  tracksRevenue: false;
};

export type CampaignRecord = {
  id: string;
  channel: CampaignChannel;
  audience: string;
  recipient_count: number;
  email_sent: number;
  sms_sent: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
};

// What was sent, to how many, and how it went out — the only marketing facts
// this product actually records. Opens, clicks, replies and booked revenue are
// deliberately absent: there is no tracking pixel, link wrapper or attribution
// anywhere, so inventing those columns would be fabricating the numbers an owner
// would trust most. The two `false` flags let the card state that plainly.
export function buildMarketingPerformance(campaigns: CampaignRecord[], limit = 6): MarketingPerformance {
  const rows: MarketingCampaignRow[] = campaigns.slice(0, limit).map((campaign) => ({
    id: campaign.id,
    channel: campaign.channel,
    audience: campaign.audience,
    sentAt: campaign.created_at,
    recipients: Number(campaign.recipient_count) || 0,
    emailSent: Number(campaign.email_sent) || 0,
    smsQueued: Number(campaign.sms_sent) || 0,
    failed: Number(campaign.failed_count) || 0,
    skipped: Number(campaign.skipped_count) || 0,
  }));
  return {
    campaigns: rows,
    totalRecipients: rows.reduce((sum, row) => sum + row.recipients, 0),
    hasData: rows.length > 0,
    tracksEngagement: false,
    tracksRevenue: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Top opportunities                                                            */
/* -------------------------------------------------------------------------- */

export type OpportunityPriority = 'high' | 'medium' | 'low';

export type Opportunity = {
  id: string;
  /** Key into ACTION_ICON_PATHS. */
  icon: string;
  title: string;
  detail: string;
  value: number | null;
  count: number | null;
  priority: OpportunityPriority;
  href: string;
  cta: string;
  /** When set, the CTA hands off to the campaign composer instead of navigating. */
  campaign?: 'fill-schedule' | null;
};

export type OpportunitySignals = {
  staleQuoteCount: number;
  openQuoteTotal: number;
  openQuoteCount: number;
  openScheduleDays: number;
  scheduleOpportunity: number | null;
  agingOverdueBalance: number;
  agingOverdueCount: number;
  inactiveCustomers: number;
  uncontactedLeads: number;
  uninvoicedCompleted: number;
  outstandingTotal: number;
  outstandingCount: number;
};

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

// The ranked "do this next" list. Same discipline as recommendedActions: nothing
// appears without a real count behind it, so the list is never a permanent
// checklist that reads as advice whether or not it applies. Ranked by money at
// stake, with count as the tie-break, so the top row is the one worth the
// afternoon. Every row links to the records it's about (or hands off to the
// campaign composer) — an opportunity you can't act on from here is a lecture.
export function buildTopOpportunities(signals: OpportunitySignals): Opportunity[] {
  const out: Opportunity[] = [];

  if (signals.outstandingCount > 0) {
    out.push({
      id: 'collect-outstanding',
      icon: 'unpaid-invoices',
      title: `Collect ${money(signals.outstandingTotal)} in unpaid invoices`,
      detail: signals.agingOverdueCount > 0
        ? `${signals.agingOverdueCount} of them are 30+ days old (${money(signals.agingOverdueBalance)}).`
        : `${signals.outstandingCount} invoice${signals.outstandingCount === 1 ? '' : 's'} still unpaid.`,
      value: signals.outstandingTotal,
      count: signals.outstandingCount,
      priority: signals.agingOverdueBalance > 0 ? 'high' : 'medium',
      href: '/dashboard/jobs',
      cta: 'Open jobs',
    });
  }

  if (signals.openQuoteCount > 0) {
    out.push({
      id: 'follow-up-quotes',
      icon: 'follow-up-quotes',
      title: `Follow up on ${signals.openQuoteCount} open quote${signals.openQuoteCount === 1 ? '' : 's'}`,
      detail: signals.staleQuoteCount > 0
        ? `${signals.staleQuoteCount} sent over a week ago · ${money(signals.openQuoteTotal)} on the table.`
        : `${money(signals.openQuoteTotal)} awaiting a decision.`,
      value: signals.openQuoteTotal,
      count: signals.openQuoteCount,
      priority: signals.staleQuoteCount > 0 ? 'high' : 'medium',
      href: '/dashboard/jobs?status=new_lead',
      cta: 'View quotes',
    });
  }

  if (signals.openScheduleDays > 0) {
    out.push({
      id: 'fill-schedule',
      icon: 'fill-next-week',
      title: `Fill ${signals.openScheduleDays} open day${signals.openScheduleDays === 1 ? '' : 's'} on your schedule`,
      detail: signals.scheduleOpportunity !== null
        ? `Roughly ${money(signals.scheduleOpportunity)} of work could fit — reach out to past customers.`
        : 'Reach out to past customers to book the gaps.',
      value: signals.scheduleOpportunity,
      count: signals.openScheduleDays,
      priority: 'medium',
      href: '/dashboard/marketing/campaigns',
      cta: 'Start a campaign',
      campaign: 'fill-schedule',
    });
  }

  if (signals.uninvoicedCompleted > 0) {
    out.push({
      id: 'bill-completed',
      icon: 'request-reviews',
      title: `Bill ${signals.uninvoicedCompleted} finished job${signals.uninvoicedCompleted === 1 ? '' : 's'}`,
      detail: 'Completed with no invoice raised — money earned but not yet asked for.',
      value: null,
      count: signals.uninvoicedCompleted,
      priority: 'high',
      href: '/dashboard/jobs?status=complete',
      cta: 'View jobs',
    });
  }

  if (signals.inactiveCustomers > 0) {
    out.push({
      id: 'win-back',
      icon: 'reconnect',
      title: `Win back ${signals.inactiveCustomers} quiet customer${signals.inactiveCustomers === 1 ? '' : 's'}`,
      detail: 'No visit in 90+ days and nothing booked ahead.',
      value: null,
      count: signals.inactiveCustomers,
      priority: 'low',
      href: '/dashboard/clients',
      cta: 'View customers',
    });
  }

  if (signals.uncontactedLeads > 0) {
    out.push({
      id: 'chase-leads',
      icon: 'follow-up-quotes',
      title: `Chase ${signals.uncontactedLeads} lead${signals.uncontactedLeads === 1 ? '' : 's'} with no quote`,
      detail: 'Inquiries that came in and never got priced.',
      value: null,
      count: signals.uncontactedLeads,
      priority: 'medium',
      href: '/dashboard/leads',
      cta: 'View leads',
    });
  }

  const priorityRank: Record<OpportunityPriority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || priorityRank[a.priority] - priorityRank[b.priority] || (b.count ?? 0) - (a.count ?? 0));
}

/* -------------------------------------------------------------------------- */
/* Job profitability                                                         */
/* -------------------------------------------------------------------------- */

export type JobProfitabilityItem = {
  jobId: string;
  ref: string;
  clientName: string;
  quotedAmount: number;
  revenue: number;
  costs: number;
  laborCost: number;
  materialsCost: number;
  profit: number;
  marginPct: number;
  costOverrun: number;
};

export type JobProfitability = {
  measuredJobs: number;
  winners: JobProfitabilityItem[];
  bleeders: JobProfitabilityItem[];
  overruns: JobProfitabilityItem[];
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  overallMarginPct: number;
  hasData: boolean;
};

export function computeJobProfitability(
  jobs: Array<{ id: string; ref?: string | null; client_name?: string | null; quoted_amount: number | string | null; created_at: string; status?: string }>,
  costs: Array<{ job_id?: string | null; amount: number | string; type?: string; created_at: string; burden_amount?: number | string | null }>,
  paid: Array<{ job_id?: string | null; amount: number | string; refunded_amount?: number | string | null; paid_at: string }>,
  period?: { fromMs: number; toMs: number },
): JobProfitability {
  // Aggregate costs by job
  const costsByJob = new Map<string, { total: number; labor: number; materials: number; rows: number }>();
  for (const cost of costs) {
    if (!cost.job_id) continue;
    if (period && !inRange(cost.created_at, period.fromMs, period.toMs)) continue;
    const amount = Number(cost.amount) || 0;
    const burden = cost.type === 'labor' ? (Number(cost.burden_amount) || 0) : 0;
    const totalRowCost = amount + burden;
    const existing = costsByJob.get(cost.job_id) ?? { total: 0, labor: 0, materials: 0, rows: 0 };
    existing.total += totalRowCost;
    existing.rows += 1;
    if (cost.type === 'labor') existing.labor += totalRowCost;
    else existing.materials += totalRowCost;
    costsByJob.set(cost.job_id, existing);
  }

  // Aggregate collected by job
  const paidByJob = new Map<string, number>();
  for (const payment of paid) {
    if (!payment.job_id) continue;
    if (period && !inRange(payment.paid_at, period.fromMs, period.toMs)) continue;
    const net = Math.max(0, (Number(payment.amount) || 0) - (Number(payment.refunded_amount) || 0));
    paidByJob.set(payment.job_id, (paidByJob.get(payment.job_id) ?? 0) + net);
  }

  // Find relevant job IDs: jobs created in period, or jobs with costs or payments in period
  const candidateJobIds = new Set<string>();
  for (const job of jobs) {
    if (!period || inRange(job.created_at, period.fromMs, period.toMs)) candidateJobIds.add(job.id);
  }
  for (const id of costsByJob.keys()) candidateJobIds.add(id);
  for (const id of paidByJob.keys()) candidateJobIds.add(id);

  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const items: JobProfitabilityItem[] = [];

  let sumRevenue = 0;
  let sumCosts = 0;

  for (const jobId of candidateJobIds) {
    const job = jobMap.get(jobId);
    const costAgg = costsByJob.get(jobId) ?? { total: 0, labor: 0, materials: 0, rows: 0 };
    const paidAmount = paidByJob.get(jobId) ?? 0;
    const quoted = Number(job?.quoted_amount) || 0;

    // A job needs some financial data (revenue or costs) to be analyzed
    if (costAgg.total === 0 && paidAmount === 0 && quoted === 0) continue;

    // A deposit banked does not reduce the job's revenue to the deposit amount;
    // measure against the full contract quote (or collected amount if higher).
    const revenue = quoted > 0 ? (paidAmount > quoted ? paidAmount : quoted) : paidAmount;
    const totalCost = costAgg.total;
    const profit = revenue - totalCost;
    const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : (profit < 0 ? -100 : 0);
    const costOverrun = quoted > 0 && totalCost > quoted ? totalCost - quoted : 0;

    sumRevenue += revenue;
    sumCosts += totalCost;

    items.push({
      jobId,
      ref: job?.ref ?? '',
      clientName: job?.client_name ?? 'Client',
      quotedAmount: quoted,
      revenue: round2(revenue),
      costs: round2(totalCost),
      laborCost: round2(costAgg.labor),
      materialsCost: round2(costAgg.materials),
      profit: round2(profit),
      marginPct,
      costOverrun: round2(costOverrun),
    });
  }

  const winners = [...items]
    .filter((item) => item.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 3);

  const bleeders = [...items]
    .filter((item) => item.profit < 0 || item.marginPct < 20)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 3);

  const overruns = [...items]
    .filter((item) => item.costOverrun > 0)
    .sort((a, b) => b.costOverrun - a.costOverrun)
    .slice(0, 3);

  const totalProfit = sumRevenue - sumCosts;
  const overallMarginPct = sumRevenue > 0 ? Math.round((totalProfit / sumRevenue) * 100) : 0;

  return {
    measuredJobs: items.length,
    winners,
    bleeders,
    overruns,
    totalRevenue: round2(sumRevenue),
    totalCosts: round2(sumCosts),
    totalProfit: round2(totalProfit),
    overallMarginPct,
    hasData: items.length > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Labor & Crew efficiency                                                    */
/* -------------------------------------------------------------------------- */

export type CrewMemberLabor = {
  crewId: string;
  name: string;
  hours: number;
  cost: number;
  jobCount: number;
};

export type LaborEfficiency = {
  totalHours: number;
  billableHours: number;
  billableRatio: number;
  revenuePerCrewHour: number | null;
  totalLaborCost: number;
  crewBreakdown: CrewMemberLabor[];
  hasData: boolean;
};

export function computeLaborEfficiency(
  timeEntries: Array<{ id: string; crew_id: string; job_id: string | null; started_at: string; ended_at: string | null; rate?: number | string | null }>,
  costs: Array<{ type?: string; amount: number | string; hours?: number | string | null; crew_id?: string | null; created_at: string; job_id?: string | null; burden_amount?: number | string | null }>,
  crew: Array<{ id: string; name: string }>,
  collectedRevenue: number,
  period: { fromMs: number; toMs: number },
): LaborEfficiency {
  const crewNameMap = new Map(crew.map((c) => [c.id, c.name]));
  const crewHours = new Map<string, { hours: number; cost: number; jobs: Set<string> }>();

  let totalHours = 0;
  let billableHours = 0;

  // 1. First preference: time clock entries in period
  const entriesInPeriod = timeEntries.filter((e) => inRange(e.started_at, period.fromMs, period.toMs));
  if (entriesInPeriod.length > 0) {
    for (const entry of entriesInPeriod) {
      const startMs = new Date(entry.started_at).getTime();
      const endMs = entry.ended_at ? new Date(entry.ended_at).getTime() : startMs;
      const h = Math.max(0, (endMs - startMs) / (1000 * 3600));
      totalHours += h;
      if (entry.job_id) billableHours += h;

      const rate = Number(entry.rate) || 0;
      const c = h * rate;
      const rec = crewHours.get(entry.crew_id) ?? { hours: 0, cost: 0, jobs: new Set() };
      rec.hours += h;
      rec.cost += c;
      if (entry.job_id) rec.jobs.add(entry.job_id);
      crewHours.set(entry.crew_id, rec);
    }
  } else {
    // 2. Fallback to labor cost rows with hours or cost
    const laborCosts = costs.filter((c) => c.type === 'labor' && inRange(c.created_at, period.fromMs, period.toMs));
    for (const cost of laborCosts) {
      // Do not invent hours if none were logged. A missing hour count remains 0.
      const h = Number(cost.hours) || 0;
      const amount = Number(cost.amount) || 0;
      const burden = Number(cost.burden_amount) || 0;
      totalHours += h;
      if (cost.job_id) billableHours += h;

      const crewId = cost.crew_id || 'unassigned';
      const rec = crewHours.get(crewId) ?? { hours: 0, cost: 0, jobs: new Set() };
      rec.hours += h;
      rec.cost += amount + burden;
      if (cost.job_id) rec.jobs.add(cost.job_id);
      crewHours.set(crewId, rec);
    }
  }

  const laborCostSum = costs
    .filter((c) => c.type === 'labor' && inRange(c.created_at, period.fromMs, period.toMs))
    .reduce((sum, c) => sum + (Number(c.amount) || 0) + (Number(c.burden_amount) || 0), 0);

  const roundedHours = round2(totalHours);
  const roundedBillable = round2(billableHours);
  const billableRatio = roundedHours > 0 ? Math.min(100, Math.round((roundedBillable / roundedHours) * 100)) : 0;
  const revenuePerCrewHour = roundedHours > 0 && collectedRevenue > 0 ? Math.round(collectedRevenue / roundedHours) : null;

  const crewBreakdown: CrewMemberLabor[] = [...crewHours.entries()]
    .map(([crewId, rec]) => ({
      crewId,
      name: crewNameMap.get(crewId) ?? (crewId === 'unassigned' ? 'Unassigned' : 'Crew Member'),
      hours: round2(rec.hours),
      cost: round2(rec.cost),
      jobCount: rec.jobs.size,
    }))
    .sort((a, b) => b.hours - a.hours);

  return {
    totalHours: roundedHours,
    billableHours: roundedBillable,
    billableRatio,
    revenuePerCrewHour,
    totalLaborCost: round2(laborCostSum),
    crewBreakdown,
    hasData: roundedHours > 0 || laborCostSum > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Reputation & Reviews                                                       */
/* -------------------------------------------------------------------------- */

export type ReputationMetrics = {
  totalInvites: number;
  respondedCount: number;
  responseRate: number;
  averageRating: number | null;
  googleReviewsCount: number;
  googleConversionRate: number;
  ratingCounts: { 5: number; 4: number; 3: number; 2: number; 1: number };
  hasData: boolean;
};

export function computeReputationMetrics(
  reviewInvites: Array<{ id?: string; rating: number | null; routed_to: string | null; google_clicked_at: string | null; responded_at: string | null; created_at: string }>,
  period: { fromMs: number; toMs: number },
): ReputationMetrics {
  const invitesInPeriod = reviewInvites.filter((r) => inRange(r.created_at, period.fromMs, period.toMs));
  const respondedInvites = invitesInPeriod.filter((r) => Boolean(r.responded_at) || (typeof r.rating === 'number' && r.rating >= 1));

  const totalInvites = invitesInPeriod.length;
  const respondedCount = respondedInvites.length;
  // Cohort response rate: of the invites sent in this window, how many were answered.
  // Never exceeds 100% because respondedInvites is a subset of invitesInPeriod.
  const responseRate = totalInvites > 0 ? Math.round((respondedCount / totalInvites) * 100) : 0;

  const ratings = respondedInvites
    .filter((r) => typeof r.rating === 'number' && r.rating >= 1)
    .map((r) => r.rating as number);

  const averageRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  const googleReviewsCount = respondedInvites.filter((r) => Boolean(r.google_clicked_at) || r.routed_to === 'google').length;
  const googleConversionRate = respondedCount > 0 ? Math.round((googleReviewsCount / respondedCount) * 100) : 0;

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const rating of ratings) {
    const star = Math.min(5, Math.max(1, Math.round(rating))) as 1 | 2 | 3 | 4 | 5;
    ratingCounts[star] += 1;
  }

  return {
    totalInvites,
    respondedCount,
    responseRate,
    averageRating,
    googleReviewsCount,
    googleConversionRate,
    ratingCounts,
    hasData: totalInvites > 0 || respondedCount > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Voice SKU ROI & Attribution                                                */
/* -------------------------------------------------------------------------- */

export type VoiceMetrics = {
  hasVoice: boolean;
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  leadsCreated: number;
  estimatedRevenue: number;
  totalMinutes: number;
  conversionRate?: number;
};

export function computeVoiceMetrics(
  calls: Array<{ id: string; started_at?: string | null; ai_seconds?: number | null; outcome?: string | null; lead_id?: string | null; created_at: string }>,
  avgJobValue: number,
  period: { fromMs: number; toMs: number },
  conversionRate?: number,
): VoiceMetrics {
  const callsInPeriod = calls.filter((c) => inRange(c.started_at || c.created_at, period.fromMs, period.toMs));
  const totalCalls = callsInPeriod.length;
  const answeredCalls = callsInPeriod.filter((c) => (Number(c.ai_seconds) || 0) > 0 || c.outcome === 'completed').length;
  const missedCalls = callsInPeriod.filter((c) => c.outcome === 'missed' || c.outcome === 'voicemail').length;
  const leadsCreated = callsInPeriod.filter((c) => Boolean(c.lead_id)).length;
  const totalSeconds = callsInPeriod.reduce((sum, c) => sum + (Number(c.ai_seconds) || 0), 0);
  const totalMinutes = Math.round(totalSeconds / 60);

  // Honest conversion: use actual avg quote value (no fabricated $500 fallback).
  // Factor in lead conversion rate if provided; otherwise default to 1.
  const rate = conversionRate !== undefined ? Math.max(0, Math.min(1, conversionRate)) : 1;
  const baseJobValue = Math.max(0, avgJobValue);
  const estimatedRevenue = Math.round(leadsCreated * baseJobValue * rate);

  return {
    hasVoice: calls.length > 0,
    totalCalls,
    answeredCalls,
    missedCalls,
    leadsCreated,
    estimatedRevenue,
    totalMinutes,
    conversionRate: conversionRate !== undefined ? rate : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Recurring / MRR Movement                                                  */
/* -------------------------------------------------------------------------- */

export type MrrMovement = {
  activePlans: number;
  monthlyRevenue: number;
  newPlans: number;
  newMrr: number;
  churnedPlans: number;
  churnedMrr: number;
  netMrrDelta: number;
  hasData: boolean;
};

export function computeMrrMovement(
  plans: Array<{ id?: string; amount: number | string; frequency: string; active: boolean; created_at?: string | null; updated_at?: string | null; cancelled_at?: string | null }>,
  period: { fromMs: number; toMs: number },
): MrrMovement {
  const activePlans = plans.filter((p) => p.active);
  const monthlyRevenue = activePlans.reduce((sum, p) => sum + monthlyRunRate(p.amount, p.frequency), 0);

  const newPlansList = plans.filter((p) => inRange(p.created_at, period.fromMs, period.toMs));
  const newMrr = newPlansList.reduce((sum, p) => sum + monthlyRunRate(p.amount, p.frequency), 0);

  // A plan churned when it was cancelled/deactivated. If cancelled_at is stored, use it.
  // Never re-report an already inactive plan as newly churned due to a subsequent price or detail update.
  const churnedPlansList = plans.filter((p) => {
    if (p.active) return false;
    const churnDate = p.cancelled_at !== undefined ? p.cancelled_at : p.updated_at;
    return inRange(churnDate, period.fromMs, period.toMs);
  });
  const churnedMrr = churnedPlansList.reduce((sum, p) => sum + monthlyRunRate(p.amount, p.frequency), 0);

  const netMrrDelta = newMrr - churnedMrr;

  return {
    activePlans: activePlans.length,
    monthlyRevenue: round2(monthlyRevenue),
    newPlans: newPlansList.length,
    newMrr: round2(newMrr),
    churnedPlans: churnedPlansList.length,
    churnedMrr: round2(churnedMrr),
    netMrrDelta: round2(netMrrDelta),
    hasData: plans.length > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Pacing & Run-rate forecast                                                */
/* -------------------------------------------------------------------------- */

export type PaceForecast = {
  isCurrentPeriod: boolean;
  daysElapsed: number;
  totalDays: number;
  projectedRevenue: number;
  dailyRunRate: number;
  pacePercentage: number | null;
  paceNote: string;
};

export function computePaceForecast(
  collected: number,
  period: { fromMs: number; toMs: number; days: number },
  priorCollected?: number,
  nowMs: number = Date.now(),
): PaceForecast | null {
  // Only meaningful if the period contains "now" and has future days remaining.
  // A completed period (or trailing window where now is the end) has 100% of days elapsed,
  // making any projection a tautology of what was already collected.
  if (collected <= 0 || period.toMs <= nowMs || nowMs < period.fromMs) return null;

  const daysElapsed = Math.max(1, Math.min(period.days, Math.ceil((nowMs - period.fromMs) / DAY_MS)));
  // If all days in the period have already elapsed, there is nothing left to forecast.
  if (daysElapsed >= period.days) return null;

  const dailyRunRate = round2(collected / daysElapsed);
  const projectedRevenue = Math.round(dailyRunRate * period.days);
  const pacePercentage = priorCollected && priorCollected > 0 ? Math.round((projectedRevenue / priorCollected) * 100) : null;

  let paceNote = `On pace for $${projectedRevenue.toLocaleString()} at day ${daysElapsed} of ${period.days}`;
  if (pacePercentage !== null) {
    const diff = pacePercentage - 100;
    paceNote += diff >= 0 ? ` (+${diff}% vs prior period)` : ` (${diff}% vs prior period)`;
  }

  return {
    isCurrentPeriod: true,
    daysElapsed,
    totalDays: period.days,
    projectedRevenue,
    dailyRunRate,
    pacePercentage,
    paceNote,
  };
}

