// Hours & pay: pay periods, overtime, entry health and the rollups behind the
// Crew & Labor page.
//
// WHAT THIS IS NOT. This product does not run payroll. It does not calculate
// or withhold tax, it does not file anything, and it does not move money to a
// crew member's bank. Everything here is a rollup of hours the crew logged so
// the owner knows what to pay — which is why the surface says "Hours & pay"
// and every money figure is labelled "estimated".
//
// THE DATA. A labor entry is a costs row with type='labor'. It carries hours,
// the rate at the time it was logged, the resulting amount, a crew snapshot and
// a job. There is no clock-in/clock-out, no adjustment, no approval flag — so
// nothing here invents one. created_at is the only date a labor entry has, so
// it is what periods are cut on, and the UI says so rather than implying there
// is a separate "worked on" date.

export type LaborEntry = {
  id: string;
  crew_id: string | null;
  crew_name: string | null;
  crew_role_label: string | null;
  job_id: string | null;
  description: string | null;
  hours: number | string | null;
  rate: number | string | null;
  amount: number | string | null;
  created_at: string;
};

// -- Pay periods -------------------------------------------------------------

export type PeriodMode = 'weekly' | 'biweekly' | 'monthly' | 'custom';

export const PERIOD_MODES: { id: PeriodMode; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Biweekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Custom range' },
];

export type PayPeriod = {
  mode: PeriodMode;
  /** Steps back (negative) or forward (positive) from the current period. */
  offset: number;
  startIso: string;
  /** Exclusive — the query uses created_at < endIso. */
  endIso: string;
  label: string;
  rangeLabel: string;
  /** True while the period still has time left to run. */
  open: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Biweekly periods have to land on the same fortnight every time or the totals
// move under the owner's feet. Anchored to a fixed Sunday rather than to "today",
// so a period's boundaries never depend on when the page was opened.
const BIWEEKLY_EPOCH = Date.UTC(2024, 0, 7); // Sunday, 7 Jan 2024

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Sunday of the week containing `date`, at local midnight. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateKey(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Jul 26 – Aug 1", or with the year when the period isn't in the current one. */
function formatRange(start: Date, endExclusive: Date, now: Date): string {
  const lastDay = new Date(endExclusive.getTime() - DAY_MS);
  const sameYear = start.getFullYear() === now.getFullYear() && lastDay.getFullYear() === now.getFullYear();
  const suffix = sameYear ? '' : `, ${lastDay.getFullYear()}`;
  return `${fmtDay(start)} – ${fmtDay(lastDay)}${suffix}`;
}

/**
 * Resolve a pay period. `offset` walks whole periods: -1 is the previous one,
 * +1 the next. `now` is injectable so boundaries can be tested deterministically.
 */
export function resolvePayPeriod(
  mode: PeriodMode,
  offset = 0,
  options?: { from?: string | null; to?: string | null; now?: Date },
): PayPeriod {
  const now = options?.now ?? new Date();

  if (mode === 'custom') {
    const from = parseDateKey(options?.from) ?? startOfWeek(now);
    // Inclusive end in the URL, exclusive internally — "to=Jul 31" has to
    // include everything logged on the 31st.
    const toInclusive = parseDateKey(options?.to) ?? from;
    const end = new Date(Math.max(toInclusive.getTime(), from.getTime()) + DAY_MS);
    return {
      mode,
      offset: 0,
      startIso: from.toISOString(),
      endIso: end.toISOString(),
      label: 'Custom range',
      rangeLabel: formatRange(from, end, now),
      open: end.getTime() > now.getTime(),
    };
  }

  if (mode === 'monthly') {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const next = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return {
      mode,
      offset,
      startIso: first.toISOString(),
      endIso: next.toISOString(),
      label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      rangeLabel: formatRange(first, next, now),
      open: next.getTime() > now.getTime(),
    };
  }

  const lengthDays = mode === 'biweekly' ? 14 : 7;
  let start: Date;
  if (mode === 'biweekly') {
    // Which fortnight since the epoch contains today, then step by `offset`.
    const thisWeek = startOfWeek(now);
    const fortnights = Math.floor((Date.UTC(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate()) - BIWEEKLY_EPOCH) / (14 * DAY_MS));
    start = new Date(thisWeek);
    const weeksIntoPeriod = Math.round(
      (Date.UTC(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate()) - BIWEEKLY_EPOCH - fortnights * 14 * DAY_MS) / (7 * DAY_MS),
    );
    start.setDate(start.getDate() - weeksIntoPeriod * 7 + offset * 14);
  } else {
    start = startOfWeek(now);
    start.setDate(start.getDate() + offset * 7);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + lengthDays);

  const isCurrent = offset === 0;
  return {
    mode,
    offset,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: isCurrent
      ? mode === 'biweekly' ? 'This pay period' : 'This week'
      : offset === -1
        ? mode === 'biweekly' ? 'Last pay period' : 'Last week'
        : formatRange(start, end, now),
    rangeLabel: formatRange(start, end, now),
    open: end.getTime() > now.getTime(),
  };
}

/** The quick filters, expressed as a mode + offset so they share one code path. */
export const QUICK_PERIODS: { id: string; label: string; mode: PeriodMode; offset: number }[] = [
  { id: 'this-week', label: 'This week', mode: 'weekly', offset: 0 },
  { id: 'last-week', label: 'Last week', mode: 'weekly', offset: -1 },
  { id: 'this-month', label: 'This month', mode: 'monthly', offset: 0 },
  { id: 'last-month', label: 'Last month', mode: 'monthly', offset: -1 },
];

export function normalizePeriodMode(value: unknown): PeriodMode {
  return PERIOD_MODES.some((m) => m.id === value) ? (value as PeriodMode) : 'weekly';
}

export function normalizeOffset(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // Clamped: the URL is user-editable and an absurd offset would build dates
  // far outside anything the account can have data for.
  return Math.max(-260, Math.min(260, Math.trunc(n)));
}

// -- Entry health ------------------------------------------------------------

export type EntryIssue = 'missing-rate' | 'incomplete-time' | 'unassigned' | null;

export const ENTRY_ISSUE_LABEL: Record<NonNullable<EntryIssue>, string> = {
  'missing-rate': 'Missing rate',
  'incomplete-time': 'Incomplete time',
  unassigned: 'No crew member',
};

export const ENTRY_ISSUE_HELP: Record<NonNullable<EntryIssue>, string> = {
  'missing-rate': 'Hours were logged but the rate was zero, so this entry adds nothing to estimated pay.',
  'incomplete-time': 'This entry has no hours on it, so it can\'t be counted toward a total.',
  unassigned: 'This labor was logged against the job without naming a crew member.',
};

/**
 * What's wrong with one entry, if anything. Ordered by how badly it breaks the
 * total: no hours is worse than no rate, and both are worse than not knowing
 * who did the work.
 */
export function entryIssue(entry: Pick<LaborEntry, 'hours' | 'rate' | 'crew_id'>): EntryIssue {
  const hours = Number(entry.hours) || 0;
  const rate = Number(entry.rate) || 0;
  if (hours <= 0) return 'incomplete-time';
  if (rate <= 0) return 'missing-rate';
  if (!entry.crew_id) return 'unassigned';
  return null;
}

// -- Overtime ----------------------------------------------------------------

export const DEFAULT_OVERTIME_THRESHOLD = 40;

/**
 * Split a crew member's hours into regular and overtime.
 *
 * Overtime is per WEEK, not per period — 45 hours in one week and 35 in the
 * next is five hours of overtime, and a biweekly total of 80 would hide that
 * completely. So the entries are bucketed by the week they fall in and each
 * week is measured against the threshold on its own.
 */
export function splitOvertime(
  hoursByWeek: Map<string, number>,
  threshold = DEFAULT_OVERTIME_THRESHOLD,
): { regular: number; overtime: number } {
  let regular = 0;
  let overtime = 0;
  for (const weekHours of hoursByWeek.values()) {
    regular += Math.min(weekHours, threshold);
    overtime += Math.max(0, weekHours - threshold);
  }
  return { regular: round2(regular), overtime: round2(overtime) };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// -- Rollups -----------------------------------------------------------------

export type CrewLaborRow = {
  crewId: string | null;
  name: string;
  roleLabel: string | null;
  /** Rate, when every entry agrees on one. Null when they differ or none is set. */
  rate: number | null;
  rateVaries: boolean;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  estimatedPay: number;
  jobIds: string[];
  entryCount: number;
  issues: NonNullable<EntryIssue>[];
  entries: LaborEntryView[];
};

export type LaborEntryView = {
  id: string;
  jobId: string | null;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  loggedAt: string;
  issue: EntryIssue;
};

// There is deliberately no "logged from the field app / added by hand" flag on
// an entry. Both paths write the same costs row and nothing records which one
// it came from, so the only way to show it would be to infer it from whether a
// crew member is attached — and that is wrong the moment an owner adds an entry
// and picks the crew member from the dropdown, which is the normal case. A
// label that is right most of the time on a screen about money is worse than no
// label. Recording the source needs a column.

function weekKey(iso: string): string {
  return toDateKey(startOfWeek(new Date(iso)));
}

/**
 * Group labor entries by crew member for the hours table.
 *
 * Estimated pay is the sum of each entry's stored amount — hours × the rate at
 * the moment it was logged. No overtime premium is applied: there is no
 * overtime rule to apply, and silently multiplying by 1.5 would misstate what
 * the owner actually owes. Overtime hours are reported so they can act on it.
 */
export function summarizeCrewLabor(
  entries: LaborEntry[],
  options?: { overtimeThreshold?: number; roundHours?: (hours: number) => number },
): { rows: CrewLaborRow[]; totalHours: number; totalPay: number; totalOvertime: number; needsReview: number } {
  const threshold = options?.overtimeThreshold ?? DEFAULT_OVERTIME_THRESHOLD;
  // Rounding changes what the hours ARE, so pay has to be recomputed from the
  // rounded figure rather than read off the stored amount — otherwise the table
  // would show 8.25 hours at $30 and a total of $242.50, which adds up to
  // nothing anyone can check. With no rule set, the stored amount is used
  // unchanged, so the default behaviour is exactly what it was.
  const round = options?.roundHours;
  const byCrew = new Map<
    string,
    CrewLaborRow & { jobs: Set<string>; hoursByWeek: Map<string, number>; rates: Set<number> }
  >();

  for (const entry of entries) {
    const key = entry.crew_id ?? 'unassigned';
    const rawHours = Number(entry.hours) || 0;
    const hours = round ? round(rawHours) : rawHours;
    const rate = Number(entry.rate) || 0;
    const amount = round ? hours * rate : Number(entry.amount) || 0;
    // Health is judged on what was LOGGED, not on the rounded figure — a 0.02
    // hour entry rounding to zero is still an entry someone made.
    const issue = entryIssue(entry);

    const row =
      byCrew.get(key) ??
      {
        crewId: entry.crew_id ?? null,
        name: entry.crew_name || (entry.crew_id ? 'Crew member' : 'Unassigned labor'),
        roleLabel: entry.crew_role_label ?? null,
        rate: null,
        rateVaries: false,
        hours: 0,
        regularHours: 0,
        overtimeHours: 0,
        estimatedPay: 0,
        jobIds: [],
        entryCount: 0,
        issues: [],
        entries: [],
        jobs: new Set<string>(),
        hoursByWeek: new Map<string, number>(),
        rates: new Set<number>(),
      };

    row.hours += hours;
    row.estimatedPay += amount;
    row.entryCount += 1;
    if (entry.job_id) row.jobs.add(entry.job_id);
    if (rate > 0) row.rates.add(rate);
    if (issue && !row.issues.includes(issue)) row.issues.push(issue);
    row.hoursByWeek.set(weekKey(entry.created_at), (row.hoursByWeek.get(weekKey(entry.created_at)) ?? 0) + hours);
    // Keep the most recent non-empty snapshot — a member who was renamed should
    // show under the name they have now.
    if (entry.crew_name) row.name = entry.crew_name;
    if (entry.crew_role_label) row.roleLabel = entry.crew_role_label;

    row.entries.push({
      id: entry.id,
      jobId: entry.job_id ?? null,
      description: entry.description || 'Labor',
      hours: round2(hours),
      rate: round2(rate),
      amount: round2(amount),
      loggedAt: entry.created_at,
      issue,
    });

    byCrew.set(key, row);
  }

  const rows: CrewLaborRow[] = [...byCrew.values()]
    .map(({ jobs, hoursByWeek, rates, ...row }) => {
      const { regular, overtime } = splitOvertime(hoursByWeek, threshold);
      const rateList = [...rates];
      return {
        ...row,
        rate: rateList.length === 1 ? rateList[0] : null,
        rateVaries: rateList.length > 1,
        hours: round2(row.hours),
        regularHours: regular,
        overtimeHours: overtime,
        estimatedPay: round2(row.estimatedPay),
        jobIds: [...jobs],
        entries: row.entries.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
      };
    })
    .sort((a, b) => b.estimatedPay - a.estimatedPay || a.name.localeCompare(b.name));

  return {
    rows,
    totalHours: round2(rows.reduce((sum, row) => sum + row.hours, 0)),
    totalPay: round2(rows.reduce((sum, row) => sum + row.estimatedPay, 0)),
    totalOvertime: round2(rows.reduce((sum, row) => sum + row.overtimeHours, 0)),
    needsReview: entries.filter((entry) => entryIssue(entry) !== null).length,
  };
}

// -- Labor by job ------------------------------------------------------------

export type JobLaborRow = {
  jobId: string;
  ref: string;
  clientName: string;
  status: string;
  crewNames: string[];
  hours: number;
  laborCost: number;
  /** The hours the job was quoted for. There is no separate labor line on a
   *  quote in this product, so the job's estimated hours IS the allowance. */
  quotedHours: number | null;
  /** Actual minus allowance, in hours. Positive means over. Null when unquoted. */
  varianceHours: number | null;
  overBudget: boolean;
  quotedAmount: number;
  /** Labor cost as a share of what the job was quoted at. Null when unquoted. */
  laborShare: number | null;
};

export function summarizeJobLabor(
  entries: LaborEntry[],
  jobs: Array<{ id: string; ref: string; client_name: string; status: string; estimated_hours: number | null; quoted_amount: number }>,
): JobLaborRow[] {
  const byJob = new Map<string, { hours: number; cost: number; names: Set<string> }>();
  for (const entry of entries) {
    if (!entry.job_id) continue;
    const bucket = byJob.get(entry.job_id) ?? { hours: 0, cost: 0, names: new Set<string>() };
    bucket.hours += Number(entry.hours) || 0;
    bucket.cost += Number(entry.amount) || 0;
    if (entry.crew_name) bucket.names.add(entry.crew_name);
    byJob.set(entry.job_id, bucket);
  }

  const rows: JobLaborRow[] = [];
  for (const job of jobs) {
    const bucket = byJob.get(job.id);
    if (!bucket) continue; // a job with no labor logged has nothing to compare
    const quotedHours = job.estimated_hours && job.estimated_hours > 0 ? Number(job.estimated_hours) : null;
    const hours = round2(bucket.hours);
    const quotedAmount = Number(job.quoted_amount) || 0;
    rows.push({
      jobId: job.id,
      ref: job.ref,
      clientName: job.client_name,
      status: job.status,
      crewNames: [...bucket.names].sort((a, b) => a.localeCompare(b)),
      hours,
      laborCost: round2(bucket.cost),
      quotedHours,
      varianceHours: quotedHours === null ? null : round2(hours - quotedHours),
      overBudget: quotedHours !== null && hours > quotedHours,
      quotedAmount,
      laborShare: quotedAmount > 0 ? round2((bucket.cost / quotedAmount) * 100) : null,
    });
  }

  // Worst offenders first: over budget, by how far over.
  return rows.sort((a, b) => {
    if (a.overBudget !== b.overBudget) return a.overBudget ? -1 : 1;
    return (b.varianceHours ?? -Infinity) - (a.varianceHours ?? -Infinity);
  });
}

// -- Period status -----------------------------------------------------------

// Only the states that can be derived from the data are here. "Exported" and
// "Finalized" are deliberately absent: knowing a period was exported means
// RECORDING that it was, and there is no column for it. Showing a badge the
// data can't back would be a badge that lies the first time someone exports
// twice.
export type PeriodStatus = 'open' | 'needs-review' | 'ready';

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  open: 'Open',
  'needs-review': 'Needs review',
  ready: 'Ready to export',
};

export function periodStatus(period: PayPeriod, needsReview: number, entryCount: number): PeriodStatus {
  if (needsReview > 0) return 'needs-review';
  if (period.open || entryCount === 0) return 'open';
  return 'ready';
}

/** Why the export button is off, or null when it's fine to export. */
export function exportBlockedReason(rows: CrewLaborRow[]): string | null {
  if (rows.length === 0) return 'There are no hours in this period to export.';
  const missingRate = rows.filter((row) => row.issues.includes('missing-rate'));
  if (missingRate.length > 0) {
    const names = missingRate.map((row) => row.name).join(', ');
    return `${names} ${missingRate.length === 1 ? 'has' : 'have'} hours logged at a zero rate, so the pay column would be wrong. Set a rate on those entries first.`;
  }
  const incomplete = rows.filter((row) => row.issues.includes('incomplete-time'));
  if (incomplete.length > 0) {
    const names = incomplete.map((row) => row.name).join(', ');
    return `${names} ${incomplete.length === 1 ? 'has an entry' : 'have entries'} with no hours on them. Fix or remove them first.`;
  }
  return null;
}

// -- Export ------------------------------------------------------------------

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildLaborCsv(rows: CrewLaborRow[], period: PayPeriod): string {
  const grid: (string | number)[][] = [
    ['Crew member', 'Role', 'Regular hours', 'Overtime hours', 'Total hours', 'Rate', 'Estimated pay', 'Jobs', 'Period'],
    ...rows.map((row) => [
      row.name,
      row.roleLabel ?? '',
      row.regularHours,
      row.overtimeHours,
      row.hours,
      row.rateVaries ? 'Varies' : row.rate ?? '',
      row.estimatedPay.toFixed(2),
      row.jobIds.length,
      period.rangeLabel,
    ]),
  ];
  return grid.map((line) => line.map(csvCell).join(',')).join('\n');
}
