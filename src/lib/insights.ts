import type { SupabaseClient } from '@supabase/supabase-js';

// The lead → quoted → won funnel plus the money that matters to a contractor:
// what you collected, what it cost you, what you kept (profit + margin), what's
// still owed (unpaid invoices), and your recurring run-rate — each compared to
// the previous equal window. All derived from data the app already stores, so no
// migration. Reporting is Jobber's most-criticized weakness; this is deliberately
// clear and honest about what each number means.

export type FunnelStage = { key: 'leads' | 'quoted' | 'won'; label: string; count: number; rateOfPrev: number };
export type RevenueMonth = { key: string; label: string; total: number; profit: number };
export type Delta = { pct: number | null; direction: 'up' | 'down' | 'flat' };

export type Insights = {
  windowLabel: string;
  funnel: FunnelStage[];
  // Current-window performance.
  winRate: number; // won / quoted
  overallConversion: number; // won / leads
  avgQuoteValue: number;
  collected: number; // paid payments in window
  costs: number; // material + labor + sub + receipt + other, logged in window
  materialsCost: number; // everything that isn't labor
  laborCost: number;
  grossProfit: number; // collected − costs
  margin: number; // grossProfit / collected, 0..1
  // Change vs the previous equal-length window. null for "all time" (no prior).
  deltas: { collected: Delta; grossProfit: Delta; winRate: Delta } | null;
  // Cash position as of now (NOT window-bounded).
  outstanding: { total: number; count: number }; // unpaid (sent/signed) invoices
  mrr: { monthly: number; activePlans: number }; // recurring run-rate
  // 6-month trend (ignores the window so the chart is always full).
  revenueByMonth: RevenueMonth[];
  peakMonthTotal: number;
  hasAnyData: boolean;
};

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

type Rowset = {
  leads: Array<{ status: string; created_at: string }>;
  jobs: Array<{ quoted_amount: number | string | null; status: string; created_at: string }>;
  paid: Array<{ amount: number | string; created_at: string }>;
  costs: Array<{ type: string; amount: number | string; created_at: string }>;
};

export type WindowMetrics = {
  leads: number;
  quoted: number;
  won: number;
  winRate: number;
  overallConversion: number;
  avgQuoteValue: number;
  collected: number;
  costs: number;
  materialsCost: number;
  laborCost: number;
  grossProfit: number;
  margin: number;
};

// Compute every window-bounded metric from the pre-fetched rows over [fromMs, toMs).
// Pure (no I/O) so both the current and previous windows reuse it, and it's unit-testable.
export function metricsForRange(data: Rowset, fromMs: number, toMs: number): WindowMetrics {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= fromMs && t < toMs;
  };

  const leads = data.leads.filter((l) => inRange(l.created_at));
  const totalLeads = leads.length;
  const quoted = leads.filter((l) => l.status === 'quoted' || l.status === 'won').length;
  const won = leads.filter((l) => l.status === 'won').length;

  const jobs = data.jobs.filter((j) => inRange(j.created_at));
  const quotedJobs = jobs.filter((j) => Number(j.quoted_amount) > 0);
  const avgQuoteValue = quotedJobs.length
    ? quotedJobs.reduce((sum, j) => sum + Number(j.quoted_amount), 0) / quotedJobs.length
    : 0;

  const collected = data.paid.filter((p) => inRange(p.created_at)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

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
    avgQuoteValue,
    collected,
    costs,
    materialsCost,
    laborCost,
    grossProfit,
    margin,
  };
}

// Build the last N months of collected revenue with the profit portion (collected
// − costs logged that month) computed per bucket for the shaded trend.
export function buildTrend(
  paid: Array<{ amount: number | string; created_at: string }>,
  costs: Array<{ amount: number | string; created_at: string }>,
  months: number,
  now: Date = new Date(),
): RevenueMonth[] {
  const buckets: RevenueMonth[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({ key: monthKey(date), label: date.toLocaleDateString('en-US', { month: 'short' }), total: 0, profit: 0 });
  }
  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  for (const payment of paid) {
    const slot = index.get(monthKey(new Date(payment.created_at)));
    if (slot !== undefined) buckets[slot].total += Number(payment.amount) || 0;
  }
  for (const cost of costs) {
    const slot = index.get(monthKey(new Date(cost.created_at)));
    if (slot !== undefined) buckets[slot].profit -= Number(cost.amount) || 0; // start negative, add revenue next
  }
  // profit currently holds −costs; fold in the month's revenue.
  for (const bucket of buckets) bucket.profit += bucket.total;
  return buckets;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildInsights(supabase: SupabaseClient, accountId: string, windowDays: number): Promise<Insights> {
  const nowMs = Date.now();

  const [
    { data: leadRows },
    { data: jobRows },
    { data: paidRows },
    { data: costRows },
    { data: invoiceRows },
    { data: planRows },
  ] = await Promise.all([
    supabase.from('leads').select('status, created_at').eq('account_id', accountId),
    supabase.from('jobs').select('quoted_amount, status, created_at').eq('account_id', accountId),
    supabase.from('payments').select('amount, created_at').eq('account_id', accountId).eq('status', 'paid'),
    // Costs power the profit + margin story. Defensive: an older account/DB with
    // no costs simply yields zero cost (100% margin), never an error.
    supabase.from('costs').select('type, amount, created_at').eq('account_id', accountId),
    // Snapshot AR: invoices billed but not yet paid/void.
    supabase.from('invoices').select('total, status').eq('account_id', accountId).in('status', ['sent', 'signed']),
    // Snapshot MRR: active recurring plans. Reads defensively (un-migrated DB → []).
    supabase.from('recurring_plans').select('amount, frequency').eq('account_id', accountId).eq('active', true),
  ]);

  const data: Rowset = {
    leads: (leadRows ?? []) as Rowset['leads'],
    jobs: (jobRows ?? []) as Rowset['jobs'],
    paid: (paidRows ?? []) as Rowset['paid'],
    costs: (costRows ?? []) as Rowset['costs'],
  };

  // Current window: [cutoff, now). All-time when windowDays === 0.
  const curFrom = windowDays > 0 ? nowMs - windowDays * DAY_MS : -Infinity;
  const cur = metricsForRange(data, curFrom, Infinity);

  // Previous equal window: [now − 2w, now − w). Only meaningful for a bounded window.
  let deltas: Insights['deltas'] = null;
  if (windowDays > 0) {
    const prev = metricsForRange(data, nowMs - 2 * windowDays * DAY_MS, curFrom);
    deltas = {
      collected: computeDelta(cur.collected, prev.collected),
      grossProfit: computeDelta(cur.grossProfit, prev.grossProfit),
      winRate: computeDelta(cur.winRate, prev.winRate),
    };
  }

  const outstandingRows = (invoiceRows ?? []) as Array<{ total: number | string }>;
  const outstanding = {
    total: outstandingRows.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0),
    count: outstandingRows.length,
  };

  const activePlans = (planRows ?? []) as Array<{ amount: number | string; frequency: string }>;
  const mrr = {
    monthly: activePlans.reduce((sum, plan) => sum + monthlyRunRate(plan.amount, plan.frequency), 0),
    activePlans: activePlans.length,
  };

  const revenueByMonth = buildTrend(data.paid, data.costs, 6);
  const peakMonthTotal = Math.max(1, ...revenueByMonth.map((month) => month.total));

  const funnel: FunnelStage[] = [
    { key: 'leads', label: 'Leads', count: cur.leads, rateOfPrev: 100 },
    { key: 'quoted', label: 'Quoted', count: cur.quoted, rateOfPrev: pct(cur.quoted, cur.leads) },
    { key: 'won', label: 'Won', count: cur.won, rateOfPrev: pct(cur.won, cur.quoted) },
  ];

  return {
    windowLabel: windowDays > 0 ? `Last ${windowDays} days` : 'All time',
    funnel,
    winRate: cur.winRate,
    overallConversion: cur.overallConversion,
    avgQuoteValue: cur.avgQuoteValue,
    collected: cur.collected,
    costs: cur.costs,
    materialsCost: cur.materialsCost,
    laborCost: cur.laborCost,
    grossProfit: cur.grossProfit,
    margin: cur.margin,
    deltas,
    outstanding,
    mrr,
    revenueByMonth,
    peakMonthTotal,
    hasAnyData:
      cur.leads > 0 ||
      data.jobs.length > 0 ||
      data.paid.length > 0 ||
      outstanding.count > 0 ||
      mrr.activePlans > 0,
  };
}
