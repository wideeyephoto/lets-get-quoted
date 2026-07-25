import type { SupabaseClient } from '@supabase/supabase-js';

// The lead → quoted → won funnel plus revenue metrics, all derived from data the
// app already stores (leads, jobs, paid payments). Reporting is Jobber's most-
// criticized weakness, so this is deliberately clear and honest.

export type FunnelStage = { key: 'leads' | 'quoted' | 'won'; label: string; count: number; rateOfPrev: number };
export type RevenueMonth = { key: string; label: string; total: number };

export type Insights = {
  windowLabel: string;
  funnel: FunnelStage[];
  winRate: number; // won / quoted
  overallConversion: number; // won / leads
  avgQuoteValue: number;
  wonJobsValue: number;
  totalCollected: number;
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

function buildRevenueMonths(payments: Array<{ amount: number; created_at: string }>, months: number): RevenueMonth[] {
  const now = new Date();
  const buckets: RevenueMonth[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({ key: monthKey(date), label: date.toLocaleDateString('en-US', { month: 'short' }), total: 0 });
  }
  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  for (const payment of payments) {
    const slot = index.get(monthKey(new Date(payment.created_at)));
    if (slot !== undefined) buckets[slot].total += Number(payment.amount) || 0;
  }
  return buckets;
}

export async function buildInsights(supabase: SupabaseClient, accountId: string, windowDays: number): Promise<Insights> {
  const cutoff = windowDays > 0 ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;

  let leadQuery = supabase.from('leads').select('status').eq('account_id', accountId);
  if (cutoff) leadQuery = leadQuery.gte('created_at', cutoff);

  let jobQuery = supabase.from('jobs').select('quoted_amount, status').eq('account_id', accountId);
  if (cutoff) jobQuery = jobQuery.gte('created_at', cutoff);

  let paidQuery = supabase.from('payments').select('amount').eq('account_id', accountId).eq('status', 'paid');
  if (cutoff) paidQuery = paidQuery.gte('created_at', cutoff);

  const [{ data: leadRows }, { data: jobRows }, { data: paidRows }, { data: trendRows }] = await Promise.all([
    leadQuery,
    jobQuery,
    paidQuery,
    // The 6-month trend ignores the funnel window so the chart is always full.
    supabase.from('payments').select('amount, created_at').eq('account_id', accountId).eq('status', 'paid'),
  ]);

  const leads = leadRows ?? [];
  const totalLeads = leads.length;
  // "Quoted" = leads that reached a quote (quoted or won). "Won" = closed-won.
  const quoted = leads.filter((lead) => lead.status === 'quoted' || lead.status === 'won').length;
  const won = leads.filter((lead) => lead.status === 'won').length;

  const jobs = jobRows ?? [];
  const quotedJobs = jobs.filter((job) => Number(job.quoted_amount) > 0);
  const avgQuoteValue = quotedJobs.length
    ? quotedJobs.reduce((sum, job) => sum + Number(job.quoted_amount), 0) / quotedJobs.length
    : 0;
  const wonJobsValue = jobs
    .filter((job) => (job.status === 'in_progress' || job.status === 'complete') && Number(job.quoted_amount) > 0)
    .reduce((sum, job) => sum + Number(job.quoted_amount), 0);

  const totalCollected = (paidRows ?? []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const revenueByMonth = buildRevenueMonths(trendRows ?? [], 6);
  const peakMonthTotal = Math.max(1, ...revenueByMonth.map((month) => month.total));

  const funnel: FunnelStage[] = [
    { key: 'leads', label: 'Leads', count: totalLeads, rateOfPrev: 100 },
    { key: 'quoted', label: 'Quoted', count: quoted, rateOfPrev: pct(quoted, totalLeads) },
    { key: 'won', label: 'Won', count: won, rateOfPrev: pct(won, quoted) },
  ];

  return {
    windowLabel: windowDays > 0 ? `Last ${windowDays} days` : 'All time',
    funnel,
    winRate: pct(won, quoted),
    overallConversion: pct(won, totalLeads),
    avgQuoteValue,
    wonJobsValue,
    totalCollected,
    revenueByMonth,
    peakMonthTotal,
    hasAnyData: totalLeads > 0 || jobs.length > 0 || (trendRows ?? []).length > 0,
  };
}
