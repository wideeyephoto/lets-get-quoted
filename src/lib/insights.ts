import type { SupabaseClient } from '@supabase/supabase-js';
import { quickStopMetrics, type QuickStopMetrics } from './quick-stop-insights';

// What the business made, what it's owed, where work is getting stuck, and what
// to do about it — each headline compared to the previous equal period.
//
// Everything here is derived from data the app already stores. Where a number
// cannot be honestly computed from what's recorded, it is null and the UI says
// what's missing rather than printing a zero that looks like a fact.

export type FunnelStage = { key: 'leads' | 'quoted' | 'won'; label: string; count: number; rateOfPrev: number };
export type RevenueMonth = {
  key: string;
  label: string;
  /** Collected in the month. Named `total` since the trend chart shipped with it. */
  total: number;
  /** Collected minus costs logged that month. */
  profit: number;
  costs: number;
  /** Mean quoted value of jobs created that month. 0 when none were quoted. */
  avgJobValue: number;
  jobCount: number;
};
export type Delta = { pct: number | null; direction: 'up' | 'down' | 'flat' };

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The middle value, which is the point of having it: one $40k re-roof drags the
 * mean job value up where the median stays where most jobs actually land.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Normalize a recurring plan's per-visit amount to a monthly run-rate, so weekly,
// biweekly, and monthly plans sum into one comparable MRR figure.
export function monthlyRunRate(amount: number | string | null, frequency: string): number {
  const a = Number(amount) || 0;
  if (a <= 0) return 0;
  switch (frequency) {
    case 'weekly':
      return (a * 52) / 12;
    case 'biweekly':
      return (a * 26) / 12;
    case 'monthly':
      return a;
    default:
      return 0;
  }
}

// Percentage change from previous → current. pct is null when there's no prior
// basis (previous is 0) so the UI can show "New" instead of a misleading ∞.
export function computeDelta(current: number, previous: number): Delta {
  if (previous === 0) {
    return { pct: null, direction: current > 0 ? 'up' : 'flat' };
  }
  const p = Math.round(((current - previous) / previous) * 100);
  return { pct: p, direction: p > 0 ? 'up' : p < 0 ? 'down' : 'flat' };
}

/**
 * Change in something already measured in percent — margin, win rate.
 *
 * Reported in POINTS, not as a percentage of a percentage. A margin going 40% →
 * 44% is up 4 points; calling it "up 10%" is true of the ratio and misleading
 * about the business, and it is the number an owner would repeat out loud.
 */
export function computePointDelta(current: number, previous: number): Delta {
  const points = Math.round(current - previous);
  return { pct: points, direction: points > 0 ? 'up' : points < 0 ? 'down' : 'flat' };
}

/* -------------------------------------------------------------------------- */
/* The period                                                                  */
/* -------------------------------------------------------------------------- */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Period = {
  key: string;
  label: string;
  /**
   * The label as it reads mid-sentence. Lowercasing the label worked for
   * "Last 90 days" and produced "you kept $8,025 in jul 1, 2026 – jul 31, 2026"
   * for a custom range, so the two forms are written out separately.
   */
  sentenceLabel: string;
  /** Inclusive start, exclusive end, in epoch ms. */
  fromMs: number;
  toMs: number;
  /** Length in days, used to size the comparison period. */
  days: number;
  custom: boolean;
};

export const PERIOD_PRESETS: { key: string; label: string; days: number }[] = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** A YYYY-MM-DD string as LOCAL midnight, not UTC — `new Date('2026-08-01')` is UTC. */
export function parseDateInput(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const ms = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Which window the page is showing.
 *
 * A custom range needs both ends and has to be the right way round; anything
 * else falls back to the preset rather than rendering a period that runs
 * backwards and silently reports zero of everything.
 */
export function resolvePeriod(
  input: { window?: string; from?: string; to?: string },
  now: Date = new Date(),
): Period {
  const nowMs = now.getTime();
  const from = parseDateInput(input.from);
  const to = parseDateInput(input.to);
  if (from !== null && to !== null && to >= from) {
    // The end date is inclusive to a human — "to Aug 4" means through Aug 4.
    const toExclusive = Math.min(to + DAY_MS, startOfDay(now) + DAY_MS);
    const label = `${formatDay(from)} – ${formatDay(Math.max(from, toExclusive - DAY_MS))}`;
    return {
      key: 'custom',
      label,
      sentenceLabel: `between ${label}`,
      fromMs: from,
      toMs: toExclusive,
      days: Math.max(1, Math.round((toExclusive - from) / DAY_MS)),
      custom: true,
    };
  }
  const preset = PERIOD_PRESETS.find((option) => option.key === input.window) ?? PERIOD_PRESETS[1];
  return {
    key: preset.key,
    label: `Last ${preset.label}`,
    sentenceLabel: `in the last ${preset.label}`,
    fromMs: nowMs - preset.days * DAY_MS,
    toMs: nowMs,
    days: preset.days,
    custom: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Window metrics                                                              */
/* -------------------------------------------------------------------------- */

type LeadRow = { status: string; source: string | null; created_at: string; converted_job: string | null };
type JobRow = {
  id: string;
  ref: string | null;
  client_name: string | null;
  quoted_amount: number | string | null;
  status: string;
  created_at: string;
  lead_source: string | null;
};
/** Payments carry paid_at, NOT created_at — see the note in buildInsights. */
type PaidRow = { amount: number | string; paid_at: string; requested_at: string | null; job_id: string | null };
type CostRow = { type: string; amount: number | string; created_at: string; job_id: string | null };

type Rowset = {
  leads: LeadRow[];
  jobs: JobRow[];
  paid: PaidRow[];
  costs: CostRow[];
  /** quote_approved feed events, for approved-revenue in the window. */
  approvals: Array<{ amount: number | string | null; job_id: string | null; created_at: string }>;
};

export type WindowMetrics = {
  leads: number;
  quoted: number;
  won: number;
  winRate: number;
  overallConversion: number;
  leadToQuote: number;
  avgQuoteValue: number;
  medianQuoteValue: number;
  jobsQuoted: number;
  quotedRevenue: number;
  approvedRevenue: number;
  collected: number;
  costs: number;
  materialsCost: number;
  laborCost: number;
  grossProfit: number;
  /** 0..1 */
  margin: number;
  /** Whole percent, for point-deltas. */
  marginPct: number;
};

// Compute every window-bounded metric from the pre-fetched rows over [fromMs, toMs).
// Pure (no I/O) so the current and comparison windows reuse it, and it's testable.
export function metricsForRange(data: Rowset, fromMs: number, toMs: number): WindowMetrics {
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= fromMs && t < toMs;
  };

  const leads = data.leads.filter((l) => inRange(l.created_at));
  const totalLeads = leads.length;
  const quoted = leads.filter((l) => l.status === 'quoted' || l.status === 'won').length;
  const won = leads.filter((l) => l.status === 'won').length;

  const jobs = data.jobs.filter((j) => inRange(j.created_at));
  const quotedValues = jobs.map((j) => Number(j.quoted_amount) || 0).filter((amount) => amount > 0);
  const quotedRevenue = quotedValues.reduce((sum, amount) => sum + amount, 0);

  const approvedRevenue = data.approvals
    .filter((a) => inRange(a.created_at))
    .reduce((sum, a) => {
      const amount = Number(a.amount) || 0;
      if (amount > 0) return sum + amount;
      // The feed event doesn't always carry the amount; fall back to the job's.
      const job = data.jobs.find((j) => j.id === a.job_id);
      return sum + (Number(job?.quoted_amount) || 0);
    }, 0);

  const collected = data.paid.filter((p) => inRange(p.paid_at)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const costRows = data.costs.filter((c) => inRange(c.created_at));
  const laborCost = costRows.filter((c) => c.type === 'labor').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const materialsCost = costRows.filter((c) => c.type !== 'labor').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const costs = laborCost + materialsCost;
  const grossProfit = collected - costs;
  const margin = collected > 0 ? grossProfit / collected : 0;

  return {
    leads: totalLeads,
    quoted,
    won,
    winRate: pct(won, quoted),
    overallConversion: pct(won, totalLeads),
    leadToQuote: pct(quoted, totalLeads),
    avgQuoteValue: mean(quotedValues),
    medianQuoteValue: median(quotedValues),
    jobsQuoted: quotedValues.length,
    quotedRevenue,
    approvedRevenue,
    collected,
    costs,
    materialsCost,
    laborCost,
    grossProfit,
    margin,
    marginPct: Math.round(margin * 100),
  };
}

// Build the last N months of collected revenue, cost, profit and average job
// value. Ignores the selected period so the trend is always a full run of
// months — a 30-day window with one bar is not a trend.
export function buildTrend(
  paid: Array<{ amount: number | string; paid_at: string }>,
  costs: Array<{ amount: number | string; created_at: string }>,
  jobs: Array<{ quoted_amount: number | string | null; created_at: string }>,
  months: number,
  now: Date = new Date(),
): RevenueMonth[] {
  const buckets: RevenueMonth[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      key: monthKey(date),
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      total: 0,
      profit: 0,
      costs: 0,
      avgJobValue: 0,
      jobCount: 0,
    });
  }
  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  const quotedByMonth = new Map<number, number[]>();

  for (const payment of paid) {
    const slot = index.get(monthKey(new Date(payment.paid_at)));
    if (slot !== undefined) buckets[slot].total += Number(payment.amount) || 0;
  }
  for (const cost of costs) {
    const slot = index.get(monthKey(new Date(cost.created_at)));
    if (slot !== undefined) buckets[slot].costs += Number(cost.amount) || 0;
  }
  for (const job of jobs) {
    const slot = index.get(monthKey(new Date(job.created_at)));
    const amount = Number(job.quoted_amount) || 0;
    if (slot === undefined || amount <= 0) continue;
    const list = quotedByMonth.get(slot) ?? [];
    list.push(amount);
    quotedByMonth.set(slot, list);
  }
  for (const [slot, values] of quotedByMonth) {
    buckets[slot].avgJobValue = mean(values);
    buckets[slot].jobCount = values.length;
  }
  for (const bucket of buckets) bucket.profit = bucket.total - bucket.costs;
  return buckets;
}

/* -------------------------------------------------------------------------- */
/* Cash                                                                        */
/* -------------------------------------------------------------------------- */

export type AgingBucket = { key: string; label: string; tone: string; total: number; count: number };

// `tone` is a CSS-safe word rather than the band key: "60+" would need escaping
// in a selector, and a stylesheet with `.band-60\+` in it is a trap.
export const AGING_BANDS: Array<{ key: string; label: string; tone: string; maxDays: number }> = [
  { key: '0-7', label: '0–7 days', tone: 'fresh', maxDays: 7 },
  { key: '8-14', label: '8–14 days', tone: 'recent', maxDays: 14 },
  { key: '15-30', label: '15–30 days', tone: 'month', maxDays: 30 },
  { key: '31-60', label: '31–60 days', tone: 'late', maxDays: 60 },
  { key: '60+', label: '60+ days', tone: 'stale', maxDays: Infinity },
];

/**
 * Unpaid invoices grouped by how long they've been outstanding.
 *
 * Age runs from when the invoice was raised. `invoices` has no due date, so
 * calling anything here "overdue" would be inventing terms the owner never
 * agreed with the customer — the bands say how OLD a bill is, which is a fact.
 */
export function buildAging(
  invoices: Array<{ total: number | string; created_at: string }>,
  nowMs: number = Date.now(),
): AgingBucket[] {
  const buckets: AgingBucket[] = AGING_BANDS.map((band) => ({ key: band.key, label: band.label, tone: band.tone, total: 0, count: 0 }));
  for (const invoice of invoices) {
    const raised = new Date(invoice.created_at).getTime();
    if (!Number.isFinite(raised)) continue;
    const ageDays = Math.max(0, Math.floor((nowMs - raised) / DAY_MS));
    const slot = AGING_BANDS.findIndex((band) => ageDays <= band.maxDays);
    const target = buckets[slot === -1 ? buckets.length - 1 : slot];
    target.total += Number(invoice.total) || 0;
    target.count += 1;
  }
  return buckets;
}

/** Days between a payment being requested and actually landing. */
export function daysToPayment(payments: Array<{ requested_at: string | null; paid_at: string }>): number[] {
  const out: number[] = [];
  for (const payment of payments) {
    if (!payment.requested_at) continue;
    const requested = new Date(payment.requested_at).getTime();
    const paid = new Date(payment.paid_at).getTime();
    if (!Number.isFinite(requested) || !Number.isFinite(paid) || paid < requested) continue;
    out.push((paid - requested) / DAY_MS);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Where work gets stuck                                                       */
/* -------------------------------------------------------------------------- */

export type OpenQuote = {
  id: string;
  ref: string;
  clientName: string;
  amount: number;
  ageDays: number;
};

export type FunnelDrop = { from: string; to: string; lostCount: number; lostPct: number } | null;

/**
 * The stage that loses the most, as a share of what reached it.
 *
 * By share rather than by headcount: 8 of 10 leads never quoted is a worse
 * problem than 9 of 90 quotes not closing, and counting bodies says the
 * opposite. Null when nothing has moved through the funnel at all.
 */
export function biggestDrop(stages: FunnelStage[]): FunnelDrop {
  let worst: FunnelDrop = null;
  for (let i = 1; i < stages.length; i += 1) {
    const from = stages[i - 1];
    const to = stages[i];
    if (from.count === 0) continue;
    const lostCount = from.count - to.count;
    if (lostCount <= 0) continue;
    const lostPct = Math.round((lostCount / from.count) * 100);
    if (!worst || lostPct > worst.lostPct) {
      worst = { from: from.label, to: to.label, lostCount, lostPct };
    }
  }
  return worst;
}

/* -------------------------------------------------------------------------- */
/* What to do next                                                             */
/* -------------------------------------------------------------------------- */

export type RecommendedAction = {
  id: string;
  title: string;
  detail: string;
  /** 1–5, drives the impact meter. Never a claim beyond what the numbers say. */
  impact: number;
  impactLabel: 'High impact' | 'Medium impact' | 'Low impact';
  /** Money genuinely at stake, when there is a figure. Null when there isn't. */
  value: number | null;
  href: string;
  cta: string;
};

export type ActionInput = {
  openQuoteTotal: number;
  openQuoteCount: number;
  staleQuoteCount: number;
  outstandingTotal: number;
  outstandingCount: number;
  oldestUnpaidDays: number;
  completedNotInvoiced: number;
  leadsNeedingFollowUp: number;
  arrivalUpdatesOn: boolean;
  hasArrivalData: boolean;
  marginPct: number;
  collected: number;
  costsRecorded: boolean;
};

function impactLabel(impact: number): RecommendedAction['impactLabel'] {
  return impact >= 4 ? 'High impact' : impact >= 3 ? 'Medium impact' : 'Low impact';
}

/**
 * What to do next, ranked by money at stake.
 *
 * Ranked by VALUE rather than by a hand-assigned importance, so the top row is
 * the one worth an afternoon. Every action names the records it's about and
 * links to them — a recommendation you can't act on from the page is a lecture.
 *
 * Nothing is recommended without evidence for it: no open quotes means no
 * chase-your-quotes row, rather than a permanent checklist that reads as advice
 * whether or not it applies.
 */
export function recommendedActions(input: ActionInput): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (input.openQuoteCount > 0) {
    const impact = input.openQuoteTotal > 0 ? 5 : 3;
    actions.push({
      id: 'open-quotes',
      title: `Follow up with ${input.openQuoteCount} open quote${input.openQuoteCount === 1 ? '' : 's'}`,
      detail: input.staleQuoteCount > 0
        ? `${input.staleQuoteCount} sent over two weeks ago · potential ${money(input.openQuoteTotal)}`
        : `Potential revenue ${money(input.openQuoteTotal)}`,
      impact,
      impactLabel: impactLabel(impact),
      value: input.openQuoteTotal,
      href: '/dashboard/jobs?status=new_lead',
      cta: 'View open quotes',
    });
  }

  if (input.outstandingCount > 0) {
    const impact = input.oldestUnpaidDays > 30 ? 5 : 4;
    actions.push({
      id: 'unpaid-invoices',
      title: `Collect ${input.outstandingCount} unpaid invoice${input.outstandingCount === 1 ? '' : 's'}`,
      detail: input.oldestUnpaidDays > 0
        ? `Outstanding ${money(input.outstandingTotal)} · oldest ${input.oldestUnpaidDays} days`
        : `Outstanding ${money(input.outstandingTotal)}`,
      impact,
      impactLabel: impactLabel(impact),
      value: input.outstandingTotal,
      // NOT /dashboard/invoices — that route does not exist and never has, so
      // this CTA was a 404. There is no invoice list anywhere in the app: an
      // unpaid invoice belongs to a job, and the jobs list is the only place
      // the amount still owed is shown per row. No ?status= either — the jobs
      // page declares that param and never reads it, so it would look like a
      // filter and do nothing.
      href: '/dashboard/jobs',
      cta: 'Open jobs',
    });
  }

  if (input.completedNotInvoiced > 0) {
    actions.push({
      id: 'not-invoiced',
      title: `Bill ${input.completedNotInvoiced} finished job${input.completedNotInvoiced === 1 ? '' : 's'}`,
      detail: 'Completed with no invoice raised — money you have earned but not asked for.',
      impact: 5,
      impactLabel: impactLabel(5),
      value: null,
      href: '/dashboard/jobs?status=complete',
      cta: 'View jobs',
    });
  }

  if (input.leadsNeedingFollowUp > 0) {
    actions.push({
      id: 'stale-leads',
      title: `Chase ${input.leadsNeedingFollowUp} lead${input.leadsNeedingFollowUp === 1 ? '' : 's'} with no quote`,
      detail: 'Enquiries that came in and never got priced.',
      impact: 4,
      impactLabel: impactLabel(4),
      value: null,
      href: '/dashboard/leads',
      cta: 'View leads',
    });
  }

  if (input.collected > 0 && !input.costsRecorded) {
    actions.push({
      id: 'no-costs',
      title: 'Record what your jobs cost',
      detail: 'With no costs logged, every profit figure here is your revenue — not your profit.',
      impact: 4,
      impactLabel: impactLabel(4),
      value: null,
      href: '/dashboard/jobs',
      cta: 'Add costs',
    });
  }

  if (!input.arrivalUpdatesOn) {
    actions.push({
      id: 'arrival-updates',
      title: 'Turn on arrival updates',
      detail: input.hasArrivalData ? 'Not switched on for every job yet.' : 'No arrival data recorded yet.',
      impact: 3,
      impactLabel: impactLabel(3),
      value: null,
      href: '/dashboard/settings#arrival',
      cta: 'Enable now',
    });
  }

  // Money at stake first; ties fall back to the impact score so a row with no
  // figure (billing finished work) still outranks a settings nudge.
  return actions.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.impact - a.impact);
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

export type LeadSourceRow = { source: string; label: string; leads: number; won: number; winRate: number };

export type Insights = {
  period: Period;
  windowLabel: string;
  summary: {
    revenue: number;
    costs: number;
    profit: number;
    marginPct: number;
    quotedRevenue: number;
    approvedRevenue: number;
    deltas: {
      revenue: Delta;
      costs: Delta;
      profit: Delta;
      margin: Delta;
      quotedRevenue: Delta;
      approvedRevenue: Delta;
    };
  };
  materialsCost: number;
  laborCost: number;
  funnel: FunnelStage[];
  drop: FunnelDrop;
  winRate: number;
  overallConversion: number;
  leadToQuote: number;
  deltas: { collected: Delta; grossProfit: Delta; winRate: Delta };
  jobValue: { average: number; median: number; delta: Delta; count: number };
  cash: {
    outstanding: { total: number; count: number };
    aging: AgingBucket[];
    oldestUnpaidDays: number;
    avgDaysToPayment: number | null;
    medianDaysToPayment: number | null;
    mrr: { monthly: number; activePlans: number };
  };
  opportunity: {
    total: number;
    count: number;
    quotes: OpenQuote[];
    staleCount: number;
  };
  responsiveness: {
    /** Hours from a lead arriving to its quote being shared. Null with no sample. */
    quoteTurnaroundHours: number | null;
    quoteTurnaroundSample: number;
    paymentDays: number | null;
    paymentSample: number;
  };
  leadSources: LeadSourceRow[];
  quickStops: QuickStopMetrics;
  stuck: { completedNotInvoiced: number; leadsNeedingFollowUp: number; invoicesSent: number };
  actions: RecommendedAction[];
  revenueByMonth: RevenueMonth[];
  peakMonthTotal: number;
  peakMonthCosts: number;
  peakAvgJobValue: number;
  hasAnyData: boolean;
  /** True when costs exist — profit is revenue-minus-nothing without them. */
  costsRecorded: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  website_form: 'Website form',
  manual: 'Added by hand',
  missed_call: 'Missed call',
  referral: 'Referral',
  booking: 'Online booking',
};

export async function buildInsights(
  supabase: SupabaseClient,
  accountId: string,
  period: Period,
  options: { arrivalUpdatesOn?: boolean; hasArrivalData?: boolean } = {},
): Promise<Insights> {
  const nowMs = Date.now();

  const [
    { data: leadRows },
    { data: jobRows },
    { data: paidRows },
    { data: costRows },
    { data: openInvoiceRows },
    { data: allInvoiceRows },
    { data: planRows },
    { data: approvalRows },
    { data: shareRows },
    { data: quickStopRows },
    { data: quickStopPaymentRows },
    { data: assignmentRows },
    { data: crewRows },
  ] = await Promise.all([
    supabase.from('leads').select('status, source, created_at, converted_job').eq('account_id', accountId),
    supabase.from('jobs').select('id, ref, client_name, quoted_amount, status, created_at, lead_source').eq('account_id', accountId),
    // paid_at, NOT created_at. `payments` has no created_at column at all, so the
    // old query 400'd and the `?? []` below turned that into "you collected $0" —
    // on every account, in every window, with no error anywhere. A payment also
    // belongs in the month the money ARRIVED, not the month it was asked for.
    supabase.from('payments').select('amount, paid_at, requested_at, job_id').eq('account_id', accountId).eq('status', 'paid'),
    supabase.from('costs').select('type, amount, created_at, job_id').eq('account_id', accountId),
    supabase.from('invoices').select('id, total, status, created_at, job_id').eq('account_id', accountId).in('status', ['sent', 'signed']),
    supabase.from('invoices').select('job_id, status').eq('account_id', accountId),
    supabase.from('recurring_plans').select('amount, frequency').eq('account_id', accountId).eq('active', true),
    supabase.from('job_feed').select('amount, job_id, created_at').eq('account_id', accountId).eq('kind', 'quote_approved'),
    // When a quote was actually put in front of the customer.
    supabase.from('job_feed').select('job_id, created_at').eq('account_id', accountId).eq('kind', 'client_link_created'),
    // Quick Stops. `paidRows` above can't serve this: it selects no id, and the
    // fee has to be told apart from the service work by payment id or the same
    // money gets reported twice under two different names.
    supabase
      .from('extra_stop_requests')
      // detour_miles / route_extension_minutes are what make "revenue per added
      // hour" a real division rather than an allocation — they are the marginal
      // cost of the stop, measured against the last one already on that day.
      .select(
        'id, job_id, payment_id, client_id, status, arrival_date, detour_miles, route_extension_minutes, offer_visit_minutes, offer_sent_at, paid_at, completed_at, created_at',
      )
      .eq('account_id', accountId),
    supabase
      .from('payments')
      .select('id, job_id, amount, refunded_amount, paid_at')
      .eq('account_id', accountId)
      .eq('status', 'paid'),
    supabase.from('crew_assignments').select('job_id, crew_id').eq('account_id', accountId),
    supabase.from('crew').select('id, name').eq('account_id', accountId),
  ]);

  const data: Rowset = {
    leads: (leadRows ?? []) as LeadRow[],
    jobs: (jobRows ?? []) as JobRow[],
    paid: (paidRows ?? []) as PaidRow[],
    costs: (costRows ?? []) as CostRow[],
    approvals: (approvalRows ?? []) as Rowset['approvals'],
  };

  const cur = metricsForRange(data, period.fromMs, period.toMs);
  // The equal-length window immediately before this one.
  const span = period.toMs - period.fromMs;
  const prev = metricsForRange(data, period.fromMs - span, period.fromMs);

  const summary = {
    revenue: cur.collected,
    costs: cur.costs,
    profit: cur.grossProfit,
    marginPct: cur.marginPct,
    quotedRevenue: cur.quotedRevenue,
    approvedRevenue: cur.approvedRevenue,
    deltas: {
      revenue: computeDelta(cur.collected, prev.collected),
      // Costs going UP is not good news, but the pill only reports direction —
      // the page decides what colour "up" is per metric (see toneFor).
      costs: computeDelta(cur.costs, prev.costs),
      profit: computeDelta(cur.grossProfit, prev.grossProfit),
      margin: computePointDelta(cur.marginPct, prev.marginPct),
      quotedRevenue: computeDelta(cur.quotedRevenue, prev.quotedRevenue),
      approvedRevenue: computeDelta(cur.approvedRevenue, prev.approvedRevenue),
    },
  };

  const openInvoices = (openInvoiceRows ?? []) as Array<{ id: string; total: number | string; created_at: string; job_id: string | null }>;
  const outstanding = {
    total: openInvoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0),
    count: openInvoices.length,
  };
  const aging = buildAging(openInvoices, nowMs);
  const oldestUnpaidDays = openInvoices.reduce((oldest, invoice) => {
    const raised = new Date(invoice.created_at).getTime();
    if (!Number.isFinite(raised)) return oldest;
    return Math.max(oldest, Math.floor((nowMs - raised) / DAY_MS));
  }, 0);

  const paymentGaps = daysToPayment(data.paid);
  const activePlans = (planRows ?? []) as Array<{ amount: number | string; frequency: string }>;

  // Open quotes: still at the quote stage, with a price on them.
  const openQuotes: OpenQuote[] = data.jobs
    .filter((job) => job.status === 'new_lead' && Number(job.quoted_amount) > 0)
    .map((job) => ({
      id: job.id,
      ref: job.ref ?? '',
      clientName: job.client_name ?? 'Unnamed',
      amount: Number(job.quoted_amount) || 0,
      ageDays: Math.max(0, Math.floor((nowMs - new Date(job.created_at).getTime()) / DAY_MS)),
    }))
    .sort((a, b) => b.amount - a.amount);

  // Time from a lead landing to its quote being shared.
  const shares = new Map<string, number>();
  for (const row of (shareRows ?? []) as Array<{ job_id: string | null; created_at: string }>) {
    if (!row.job_id) continue;
    const at = new Date(row.created_at).getTime();
    const existing = shares.get(row.job_id);
    if (existing === undefined || at < existing) shares.set(row.job_id, at);
  }
  const turnarounds: number[] = [];
  for (const lead of data.leads) {
    if (!lead.converted_job) continue;
    const shared = shares.get(lead.converted_job);
    const arrived = new Date(lead.created_at).getTime();
    if (shared === undefined || !Number.isFinite(arrived) || shared < arrived) continue;
    turnarounds.push((shared - arrived) / (60 * 60 * 1000));
  }

  // Lead sources over the selected period.
  const bySource = new Map<string, { leads: number; won: number }>();
  for (const lead of data.leads) {
    const at = new Date(lead.created_at).getTime();
    if (!(at >= period.fromMs && at < period.toMs)) continue;
    const key = lead.source || 'unknown';
    const row = bySource.get(key) ?? { leads: 0, won: 0 };
    row.leads += 1;
    if (lead.status === 'won') row.won += 1;
    bySource.set(key, row);
  }
  const leadSources: LeadSourceRow[] = [...bySource.entries()]
    .map(([source, row]) => ({
      source,
      label: SOURCE_LABELS[source] ?? source.replace(/_/g, ' '),
      leads: row.leads,
      won: row.won,
      winRate: pct(row.won, row.leads),
    }))
    .sort((a, b) => b.leads - a.leads);

  // Work that has stalled between stages.
  const invoicedJobIds = new Set(
    ((allInvoiceRows ?? []) as Array<{ job_id: string | null; status: string }>)
      .filter((invoice) => invoice.status !== 'void' && invoice.job_id)
      .map((invoice) => invoice.job_id as string),
  );
  const completedNotInvoiced = data.jobs.filter((job) => job.status === 'complete' && !invoicedJobIds.has(job.id)).length;
  const quotedJobIds = new Set(data.jobs.map((job) => job.id));
  const leadsNeedingFollowUp = data.leads.filter(
    (lead) => (lead.status === 'new' || lead.status === 'contacted') && (!lead.converted_job || !quotedJobIds.has(lead.converted_job)),
  ).length;

  const revenueByMonth = buildTrend(data.paid, data.costs, data.jobs, 6);
  const staleCount = openQuotes.filter((quote) => quote.ageDays > 14).length;

  const funnel: FunnelStage[] = [
    { key: 'leads', label: 'Leads', count: cur.leads, rateOfPrev: 100 },
    { key: 'quoted', label: 'Quotes', count: cur.quoted, rateOfPrev: pct(cur.quoted, cur.leads) },
    { key: 'won', label: 'Wins', count: cur.won, rateOfPrev: pct(cur.won, cur.quoted) },
  ];

  const actions = recommendedActions({
    openQuoteTotal: openQuotes.reduce((sum, quote) => sum + quote.amount, 0),
    openQuoteCount: openQuotes.length,
    staleQuoteCount: staleCount,
    outstandingTotal: outstanding.total,
    outstandingCount: outstanding.count,
    oldestUnpaidDays,
    completedNotInvoiced,
    leadsNeedingFollowUp,
    arrivalUpdatesOn: options.arrivalUpdatesOn ?? false,
    hasArrivalData: options.hasArrivalData ?? false,
    marginPct: cur.marginPct,
    collected: cur.collected,
    costsRecorded: data.costs.length > 0,
  });

  const quickStops = quickStopMetrics({
    requests: (quickStopRows ?? []) as Parameters<typeof quickStopMetrics>[0]['requests'],
    payments: (quickStopPaymentRows ?? []) as Parameters<typeof quickStopMetrics>[0]['payments'],
    assignments: (assignmentRows ?? []) as Parameters<typeof quickStopMetrics>[0]['assignments'],
    crew: (crewRows ?? []) as Parameters<typeof quickStopMetrics>[0]['crew'],
    fromMs: period.fromMs,
    toMs: period.toMs,
  });

  return {
    period,
    windowLabel: period.label,
    summary,
    materialsCost: cur.materialsCost,
    laborCost: cur.laborCost,
    funnel,
    drop: biggestDrop(funnel),
    winRate: cur.winRate,
    overallConversion: cur.overallConversion,
    leadToQuote: cur.leadToQuote,
    deltas: {
      collected: summary.deltas.revenue,
      grossProfit: summary.deltas.profit,
      winRate: computePointDelta(cur.winRate, prev.winRate),
    },
    jobValue: {
      average: cur.avgQuoteValue,
      median: cur.medianQuoteValue,
      delta: computeDelta(cur.avgQuoteValue, prev.avgQuoteValue),
      count: cur.jobsQuoted,
    },
    cash: {
      outstanding,
      aging,
      oldestUnpaidDays,
      avgDaysToPayment: paymentGaps.length ? round2(mean(paymentGaps)) : null,
      medianDaysToPayment: paymentGaps.length ? round2(median(paymentGaps)) : null,
      mrr: {
        monthly: activePlans.reduce((sum, plan) => sum + monthlyRunRate(plan.amount, plan.frequency), 0),
        activePlans: activePlans.length,
      },
    },
    opportunity: {
      total: openQuotes.reduce((sum, quote) => sum + quote.amount, 0),
      count: openQuotes.length,
      quotes: openQuotes.slice(0, 5),
      staleCount,
    },
    responsiveness: {
      quoteTurnaroundHours: turnarounds.length ? round2(mean(turnarounds)) : null,
      quoteTurnaroundSample: turnarounds.length,
      paymentDays: paymentGaps.length ? round2(mean(paymentGaps)) : null,
      paymentSample: paymentGaps.length,
    },
    leadSources,
    quickStops,
    stuck: { completedNotInvoiced, leadsNeedingFollowUp, invoicesSent: outstanding.count },
    actions,
    revenueByMonth,
    peakMonthTotal: Math.max(1, ...revenueByMonth.map((month) => month.total)),
    peakMonthCosts: Math.max(1, ...revenueByMonth.map((month) => month.costs)),
    peakAvgJobValue: Math.max(1, ...revenueByMonth.map((month) => month.avgJobValue)),
    hasAnyData:
      data.leads.length > 0 ||
      data.jobs.length > 0 ||
      data.paid.length > 0 ||
      outstanding.count > 0 ||
      activePlans.length > 0,
    costsRecorded: data.costs.length > 0,
  };
}
