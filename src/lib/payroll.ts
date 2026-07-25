import type { SupabaseClient } from '@supabase/supabase-js';

// A payroll/hours rollup from logged labor costs (crew field-logging + any
// owner-entered labor). Labor cost rows carry hours + amount (= hours × rate at
// the time), a crew snapshot, and job_id — everything a pay-period report needs.

export type PayrollPeriod = 'this-week' | 'last-week' | 'this-month' | 'last-month';

export const PAYROLL_PERIODS: { id: PayrollPeriod; label: string }[] = [
  { id: 'this-week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
];

export type PayrollRow = {
  crewId: string | null;
  name: string;
  roleLabel: string | null;
  hours: number;
  pay: number;
  jobCount: number;
};

export type PayrollSummary = {
  period: PayrollPeriod;
  label: string;
  startIso: string;
  endIso: string;
  rows: PayrollRow[];
  totalHours: number;
  totalPay: number;
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Date range for a period. Weeks start Sunday. End is exclusive (the query uses
// created_at < endIso), so "this week"/"this month" naturally include up to now.
export function resolvePayrollRange(period: PayrollPeriod): { startIso: string; endIso: string; label: string } {
  const today = startOfDay(new Date());

  if (period === 'last-week') {
    const thisSunday = new Date(today);
    thisSunday.setDate(today.getDate() - today.getDay());
    const lastSunday = new Date(thisSunday);
    lastSunday.setDate(thisSunday.getDate() - 7);
    return { startIso: lastSunday.toISOString(), endIso: thisSunday.toISOString(), label: 'Last week' };
  }
  if (period === 'this-month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { startIso: first.toISOString(), endIso: nextMonth.toISOString(), label: 'This month' };
  }
  if (period === 'last-month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const thisMonthFirst = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startIso: first.toISOString(), endIso: thisMonthFirst.toISOString(), label: 'Last month' };
  }
  // this-week (default)
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  return { startIso: sunday.toISOString(), endIso: nextSunday.toISOString(), label: 'This week' };
}

export async function getPayrollSummary(supabase: SupabaseClient, accountId: string, period: PayrollPeriod): Promise<PayrollSummary> {
  const { startIso, endIso, label } = resolvePayrollRange(period);

  const { data, error } = await supabase
    .from('costs')
    .select('crew_id, crew_name, crew_role_label, hours, amount, job_id')
    .eq('account_id', accountId)
    .eq('type', 'labor')
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  // Defensive: never 500 the page on a read error — show an empty period.
  const costs = error ? [] : data ?? [];

  const byCrew = new Map<string, PayrollRow & { jobs: Set<string> }>();
  for (const cost of costs) {
    const key = (cost.crew_id as string | null) ?? 'unassigned';
    const entry =
      byCrew.get(key) ??
      {
        crewId: (cost.crew_id as string | null) ?? null,
        name: (cost.crew_name as string | null) || (cost.crew_id ? 'Crew member' : 'Unassigned labor'),
        roleLabel: (cost.crew_role_label as string | null) ?? null,
        hours: 0,
        pay: 0,
        jobCount: 0,
        jobs: new Set<string>(),
      };
    entry.hours += Number(cost.hours) || 0;
    entry.pay += Number(cost.amount) || 0;
    if (cost.job_id) entry.jobs.add(cost.job_id as string);
    // Keep the most recent non-empty name/role snapshot.
    if (cost.crew_name) entry.name = cost.crew_name as string;
    if (cost.crew_role_label) entry.roleLabel = cost.crew_role_label as string;
    byCrew.set(key, entry);
  }

  const rows: PayrollRow[] = [...byCrew.values()]
    .map(({ jobs, ...row }) => ({ ...row, hours: Math.round(row.hours * 100) / 100, pay: Math.round(row.pay * 100) / 100, jobCount: jobs.size }))
    .sort((a, b) => b.pay - a.pay);

  return {
    period,
    label,
    startIso,
    endIso,
    rows,
    totalHours: Math.round(rows.reduce((sum, row) => sum + row.hours, 0) * 100) / 100,
    totalPay: Math.round(rows.reduce((sum, row) => sum + row.pay, 0) * 100) / 100,
  };
}
