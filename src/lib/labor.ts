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
//
// NOT EVERYONE IS PAID BY THE HOUR. summarizeCrewLabor takes an optional map of
// how each person is actually paid; without it every row is hourly and this
// module behaves exactly as it did before pay types existed. See pay-types.ts.

import { payBasisProblem, periodPay, type CrewPayBasis, type PayType } from './pay-types';

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

// -- Pay periods are cut in the CONTRACTOR's timezone --------------------------
//
// They used to be cut in the server's, and the server is Vercel, which is UTC.
// For an Eastern shop that put every Saturday evening into the following week's
// payroll: 8pm Saturday ET is 00:00 Sunday UTC. Nobody would have spotted it
// except as a week that was quietly light and a next week that was quietly
// heavy, every single week.
//
// `timeZone` is optional throughout and falls back to the runtime's own zone, so
// a caller that has no account context behaves exactly as it did before.

/** Milliseconds to add to a UTC instant to read it as wall-clock in `timeZone`. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  // Intl renders midnight as hour 24 rather than 0 in some engines.
  const hour = get('hour') % 24;
  return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')) - instant.getTime();
}

/** The wall-clock Y/M/D in `timeZone` at this instant. */
function zonedParts(date: Date, timeZone?: string): { year: number; month: number; day: number } {
  if (!timeZone) return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  const shifted = new Date(date.getTime() + zoneOffsetMs(date, timeZone));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/**
 * The instant local midnight happens on this date in this zone.
 *
 * Two passes: guess with the offset at noon-ish, then re-measure at the guess.
 * A single pass lands an hour out on the two days a year the clocks change,
 * which is exactly the boundary a pay period must not get wrong.
 */
function zonedMidnight(year: number, month: number, day: number, timeZone?: string): Date {
  if (!timeZone) return new Date(year, month - 1, day);
  const naive = Date.UTC(year, month - 1, day);
  const first = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  return new Date(naive - zoneOffsetMs(first, timeZone));
}

export function startOfDay(date: Date, timeZone?: string): Date {
  if (!timeZone) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  const { year, month, day } = zonedParts(date, timeZone);
  return zonedMidnight(year, month, day, timeZone);
}

/** Sunday of the week containing `date`, at midnight in the given zone. */
export function startOfWeek(date: Date, timeZone?: string): Date {
  if (!timeZone) {
    const day = startOfDay(date);
    day.setDate(day.getDate() - day.getDay());
    return day;
  }
  const midnight = startOfDay(date, timeZone);
  // Which weekday that midnight IS in the zone, not in the server's.
  const weekday = new Date(midnight.getTime() + zoneOffsetMs(midnight, timeZone)).getUTCDay();
  const { year, month, day } = zonedParts(midnight, timeZone);
  return zonedMidnight(year, month, day - weekday, timeZone);
}

/** Add days to a zoned midnight and stay on midnight, DST changes included. */
export function addZonedDays(midnight: Date, days: number, timeZone?: string): Date {
  const { year, month, day } = zonedParts(midnight, timeZone);
  return zonedMidnight(year, month, day + days, timeZone);
}

/** Public alias so resolvePayPeriod can read the parts it needs. */
function zonedPartsOf(date: Date, timeZone?: string) {
  return zonedParts(date, timeZone);
}

function zonedNow(now: Date, timeZone?: string): { year: number; month: number } {
  const parts = zonedParts(now, timeZone);
  return { year: parts.year, month: parts.month };
}

/** First of a month at local midnight; month may be out of 1-12 and rolls. */
function zonedFirstOfMonth(year: number, month: number, timeZone?: string): Date {
  const rolledYear = year + Math.floor((month - 1) / 12);
  const rolledMonth = ((((month - 1) % 12) + 12) % 12) + 1;
  return zonedMidnight(rolledYear, rolledMonth, 1, timeZone);
}

/** The date key ('YYYY-MM-DD') this instant falls on in the given zone. */
export function zonedDateKey(date: Date, timeZone?: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateKey(value: string | null | undefined, timeZone?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  // A custom range typed as "Jul 26" means midnight in the CONTRACTOR's zone.
  // Parsing it in the server's put an Eastern shop's range four hours out.
  const date = timeZone ? zonedMidnight(year, month, day, timeZone) : new Date(`${value}T00:00:00`);
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
  options?: { from?: string | null; to?: string | null; now?: Date; timeZone?: string },
): PayPeriod {
  const now = options?.now ?? new Date();
  // The contractor's zone, not the server's. Omitted, everything below behaves
  // exactly as it did — which is what keeps the callers that have no account
  // context working.
  const zone = options?.timeZone;

  if (mode === 'custom') {
    const from = parseDateKey(options?.from, zone) ?? startOfWeek(now, zone);
    // Inclusive end in the URL, exclusive internally — "to=Jul 31" has to
    // include everything logged on the 31st.
    const toInclusive = parseDateKey(options?.to, zone) ?? from;
    const latest = new Date(Math.max(toInclusive.getTime(), from.getTime()));
    // A day is not always 24 hours — stepping by DAY_MS across a clock change
    // ends the range an hour early or late.
    const end = addZonedDays(latest, 1, zone);
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
    const here = zonedNow(now, zone);
    const first = zonedFirstOfMonth(here.year, here.month + offset, zone);
    const next = zonedFirstOfMonth(here.year, here.month + offset + 1, zone);
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
    const thisWeek = startOfWeek(now, zone);
    const weekParts = zonedPartsOf(thisWeek, zone);
    const weekUtc = Date.UTC(weekParts.year, weekParts.month - 1, weekParts.day);
    const fortnights = Math.floor((weekUtc - BIWEEKLY_EPOCH) / (14 * DAY_MS));
    const weeksIntoPeriod = Math.round((weekUtc - BIWEEKLY_EPOCH - fortnights * 14 * DAY_MS) / (7 * DAY_MS));
    start = addZonedDays(thisWeek, -weeksIntoPeriod * 7 + offset * 14, zone);
  } else {
    start = addZonedDays(startOfWeek(now, zone), offset * 7, zone);
  }
  const end = addZonedDays(start, lengthDays, zone);

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

/**
 * The offset that puts `dateKey` ('YYYY-MM-DD') inside a period of this mode.
 *
 * The period picker used to be four controls: two arrows, four quick-filter
 * shortcuts, a length switcher and a from/to form with its own Go button — four
 * different ways to answer "which weeks am I looking at", none of which could
 * reach a period more than a few clicks away without counting arrows. One date
 * input can, but only if the screen can turn a date back into an offset, which
 * is what this does.
 *
 * Computed the same way resolvePayPeriod cuts the period, in the same zone, so
 * "jump to 12 March" lands on exactly the period that contains 12 March rather
 * than one adjacent to it.
 */
export function offsetForDate(mode: PeriodMode, dateKey: string, options?: { now?: Date; timeZone?: string }): number {
  const now = options?.now ?? new Date();
  const zone = options?.timeZone;
  const target = parseDateKey(dateKey, zone);
  // A custom range is defined by its own two dates, so there is no offset to
  // step it by — the caller sends from/to instead.
  if (!target || mode === 'custom') return 0;

  if (mode === 'monthly') {
    const here = zonedParts(now, zone);
    const there = zonedParts(target, zone);
    return normalizeOffset((there.year - here.year) * 12 + (there.month - here.month));
  }

  // Whole weeks between the two Sundays, measured on the zoned wall-clock dates
  // rather than on elapsed milliseconds — a clock change inside the span would
  // otherwise leave the division an hour short and round the wrong way.
  const weekStartUtc = (date: Date) => {
    const parts = zonedParts(startOfWeek(date, zone), zone);
    return Date.UTC(parts.year, parts.month - 1, parts.day);
  };
  const weeks = Math.round((weekStartUtc(target) - weekStartUtc(now)) / (7 * DAY_MS));
  if (mode === 'weekly') return normalizeOffset(weeks);

  // Biweekly periods are anchored to a fixed fortnight, not to today, so
  // stepping by whole weeks would land on the wrong half of a period every
  // other time. Count fortnights from the same epoch resolvePayPeriod uses.
  const fortnight = (date: Date) => Math.floor((weekStartUtc(date) - BIWEEKLY_EPOCH) / (14 * DAY_MS));
  return normalizeOffset(fortnight(target) - fortnight(now));
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
 * WHAT OVERTIME DOES HERE, in one sentence the screen can print.
 *
 * splitOvertime COUNTS hours past the weekly threshold. It does not multiply
 * anything: estimated pay is the sum of each entry's amount, and no premium is
 * applied anywhere in this file or in crew-pay.ts. That is deliberate — this
 * product does not know an account's overtime rule (1.5×? 2× on Sundays? none,
 * because everyone here is a subcontractor?) and quietly inventing 1.5× would
 * misstate what the owner owes on a screen whose whole job is to be the number
 * they pay from.
 *
 * The danger is that a column headed "OT 5h 00m" beside a pay figure READS as
 * though the pay figure already includes a premium. It does not. Every surface
 * that shows overtime hours prints this sentence so the two can't be confused,
 * and there is exactly one copy of it so they can't drift apart.
 */
export const OVERTIME_POLICY =
  'Overtime hours are counted, not paid at a premium. Estimated pay is each entry’s hours × its rate — apply your own overtime rule when you pay.';

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
  /** How this person is paid. 'hourly' unless the caller says otherwise. */
  payType: PayType;
  /** Why estimatedPay is that number, in words — frozen onto an approval. */
  payBasis: string;
  /** False for salary and day rate: hours past the threshold don't earn more. */
  overtimePaid: boolean;
  /** Distinct days they logged anything, counted in the account's zone. */
  workedDays: number;
  /** Why their pay can't be worked out, when it can't. */
  payProblem: string | null;
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
  options?: {
    overtimeThreshold?: number;
    roundHours?: (hours: number) => number;
    /**
     * How each crew member is paid, keyed by crew id. Absent means everyone is
     * hourly, which is exactly what this function did before pay types existed
     * — every caller that doesn't care is unaffected.
     */
    payBasis?: Map<string, CrewPayBasis>;
    /** The cadence a salary is divided by. */
    periodMode?: PeriodMode;
    /** Length of the period in days, for prorating a salary over a custom range. */
    periodDays?: number;
    /** Counting worked DAYS needs a zone — an 8pm shift is not the next day. */
    timeZone?: string;
    /**
     * Crew who must appear whether or not they logged anything. A salaried
     * person who logged no hours is still owed their salary, and a table built
     * only from timesheets would leave them off the payroll entirely.
     */
    seedCrew?: Array<{ crewId: string; name: string; roleLabel: string | null }>;
  },
): { rows: CrewLaborRow[]; totalHours: number; totalPay: number; totalOvertime: number; needsReview: number } {
  const threshold = options?.overtimeThreshold ?? DEFAULT_OVERTIME_THRESHOLD;
  const periodMode = options?.periodMode ?? 'weekly';
  // Rounding changes what the hours ARE, so pay has to be recomputed from the
  // rounded figure rather than read off the stored amount — otherwise the table
  // would show 8.25 hours at $30 and a total of $242.50, which adds up to
  // nothing anyone can check. With no rule set, the stored amount is used
  // unchanged, so the default behavior is exactly what it was.
  const round = options?.roundHours;
  const byCrew = new Map<
    string,
    CrewLaborRow & { jobs: Set<string>; hoursByWeek: Map<string, number>; rates: Set<number>; days: Set<string> }
  >();

  const blank = (crewId: string | null, name: string, roleLabel: string | null) => ({
    crewId,
    name,
    roleLabel,
    rate: null,
    rateVaries: false,
    hours: 0,
    regularHours: 0,
    overtimeHours: 0,
    estimatedPay: 0,
    jobIds: [] as string[],
    entryCount: 0,
    issues: [] as NonNullable<EntryIssue>[],
    entries: [] as LaborEntryView[],
    payType: 'hourly' as PayType,
    payBasis: '',
    overtimePaid: true,
    workedDays: 0,
    payProblem: null as string | null,
    jobs: new Set<string>(),
    hoursByWeek: new Map<string, number>(),
    rates: new Set<number>(),
    days: new Set<string>(),
  });

  // Salaried crew are owed whether or not a timesheet exists, so they are put
  // on the table before any entry is read rather than only appearing if they
  // happened to log something.
  for (const seed of options?.seedCrew ?? []) {
    if (!byCrew.has(seed.crewId)) byCrew.set(seed.crewId, blank(seed.crewId, seed.name, seed.roleLabel));
  }

  for (const entry of entries) {
    const key = entry.crew_id ?? 'unassigned';
    const rawHours = Number(entry.hours) || 0;
    const hours = round ? round(rawHours) : rawHours;
    const rate = Number(entry.rate) || 0;
    const storedAmount = Number(entry.amount) || 0;
    // A ROUNDING RULE MUST NEVER DELETE MONEY.
    //
    // costs.amount is NOT NULL and costs.hours is nullable (schema.sql), so a
    // labor row can legitimately carry $960 with no hours on it at all — a lump
    // somebody typed against a job, or an import that had money but no time.
    // Recomputing EVERY amount as hours × rate the moment a rounding rule was
    // selected turned that row into 0 × 0, and the $960 disappeared from the
    // period total: choosing "nearest 15 minutes" in Labor settings silently
    // made the payroll smaller, with nothing on screen to say so. A display
    // preference is not allowed to change what is owed.
    //
    // So rounding only recomputes when there is something to recompute FROM —
    // hours AND a rate. Anything else keeps the stored amount, which is the
    // figure that was actually recorded. The entry still carries its issue flag
    // ('incomplete-time' / 'missing-rate'), so the row is still visibly wrong
    // and still blocked from approval; it just isn't wrong AND $960 lighter.
    const amount = round && rawHours > 0 && rate > 0 ? hours * rate : storedAmount;
    // Health is judged on what was LOGGED, not on the rounded figure — a 0.02
    // hour entry rounding to zero is still an entry someone made.
    const issue = entryIssue(entry);

    const row =
      byCrew.get(key) ??
      blank(
        entry.crew_id ?? null,
        entry.crew_name || (entry.crew_id ? 'Crew member' : 'Unassigned labor'),
        entry.crew_role_label ?? null,
      );

    row.hours += hours;
    row.estimatedPay += amount;
    row.entryCount += 1;
    row.days.add(zonedDateKey(new Date(entry.created_at), options?.timeZone));
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
    .map(({ jobs, hoursByWeek, rates, days, ...row }) => {
      const { regular, overtime } = splitOvertime(hoursByWeek, threshold);
      const rateList = [...rates];
      const basis = row.crewId ? options?.payBasis?.get(row.crewId) : undefined;
      // No basis means hourly, and hourly means the summed entry amounts —
      // byte-for-byte what this function returned before pay types existed.
      const pay = basis
        ? periodPay(basis, {
            mode: periodMode,
            loggedAmount: row.estimatedPay,
            workedDays: days.size,
            periodDays: options?.periodDays,
          })
        : { amount: round2(row.estimatedPay), basis: 'Hours logged × rate', overtimePaid: true };

      return {
        ...row,
        rate: rateList.length === 1 ? rateList[0] : null,
        rateVaries: rateList.length > 1,
        hours: round2(row.hours),
        regularHours: regular,
        overtimeHours: overtime,
        estimatedPay: pay.amount,
        payType: basis?.payType ?? 'hourly',
        payBasis: pay.basis,
        overtimePaid: pay.overtimePaid,
        workedDays: days.size,
        payProblem: basis ? payBasisProblem(basis) : null,
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

// A period's STATE — open, needs review, approved, partially paid, paid — moved
// to crew-pay.ts, because it can no longer be worked out from the hours alone:
// it depends on what has been approved and what has been paid. Deriving it in
// two places would be two answers to one question. What stays here is the
// export gate, which really is only about the health of the entries.

/**
 * Why the export button is off, or null when it's fine to export.
 *
 * Counted in ENTRIES, not in people. Both of these are facts about individual
 * labor rows, and saying "Danny has hours logged at a zero rate" over one bad
 * entry out of nine reads as though everything of Danny's is suspect — which is
 * exactly the confusion that makes an owner distrust a period total that is, in
 * fact, right about the other eight.
 */
export function exportBlockedReason(rows: CrewLaborRow[]): string | null {
  if (rows.length === 0) return 'There are no hours in this period to export.';
  const countOf = (row: CrewLaborRow, issue: NonNullable<EntryIssue>) =>
    row.entries.filter((entry) => entry.issue === issue).length;

  const missingRate = rows.filter((row) => row.issues.includes('missing-rate'));
  if (missingRate.length > 0) {
    const entries = missingRate.reduce((sum, row) => sum + countOf(row, 'missing-rate'), 0);
    const names = missingRate.map((row) => row.name).join(', ');
    return `${entries} ${entries === 1 ? 'entry' : 'entries'} (${names}) ${entries === 1 ? 'was' : 'were'} logged at a zero rate, so the pay column would be short by what those entries are worth. Set a rate on them first — the rest of the hours are counted as normal.`;
  }
  const incomplete = rows.filter((row) => row.issues.includes('incomplete-time'));
  if (incomplete.length > 0) {
    const entries = incomplete.reduce((sum, row) => sum + countOf(row, 'incomplete-time'), 0);
    const names = incomplete.map((row) => row.name).join(', ');
    return `${entries} ${entries === 1 ? 'entry' : 'entries'} (${names}) ${entries === 1 ? 'has' : 'have'} no hours recorded. Fix or remove ${entries === 1 ? 'it' : 'them'} first.`;
  }
  return null;
}

// The CSV moved to crew-pay.ts too: an export that doesn't carry approval and
// payment status is the file somebody pays from twice.
