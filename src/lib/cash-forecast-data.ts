// Everything that will move money in or out of the bank in the next N days,
// gathered from the parts of the system that already know about it.
//
// The forecast is only as honest as this file. Two rules run through all of it:
//
//   1. Never invent a date. If we can't say WHEN money lands, it doesn't go on
//      the curve — it goes in a stat that says so out loud. Finished work that
//      was never invoiced is the big one: it's real money, we have no idea when
//      it arrives, and putting it on the line would make the forecast cheerful
//      in exactly the situation the page exists to warn about.
//   2. Never double count. A recurring visit that has already spawned a job is
//      drawn once, as the job. A quoted job that already has a deposit request
//      only contributes what's left.
//
// The math lives in cash-forecast.ts, which is pure and runs in the browser.
// This file is server-only: it takes a SupabaseClient and must never be
// imported by a client component.

import type { SupabaseClient } from '@supabase/supabase-js';
import { expandRecurrence, type CashEvent, type CashEventKind, type Recurrence } from '@/lib/cash-forecast';
import { addDays, daysBetween, payDayFor, payDaySettingsFromAccount, PAY_DAY_COLUMNS, type PayDaySettings } from '@/lib/pay-day';
import type { CashSnapshot } from '@/lib/cash-accuracy';
import { laborRulesFromAccount, LABOR_RULE_COLUMNS } from '@/lib/labor-settings';
import { resolvePayPeriod, type PeriodMode } from '@/lib/labor';
import { periodEndKey, periodStartKey, payPeriodKey } from '@/lib/crew-pay';
import { buildPayrollEvents, type LaborRow, type PayEntry } from '@/lib/cash-forecast-payroll';
import {
  buildIncomingEvents,
  type ForecastJobRow,
  type IncomingResult,
  type PendingPaymentRow,
  type PendingPlanRow,
  type RecurringPlanRow,
  type SettledRow,
} from '@/lib/cash-forecast-incoming';

const MISSING_TABLE = '42P01';
const MISSING_COLUMN = '42703';

/** How far out the page can look. A quarter is the limit of anything useful here. */
export const MAX_HORIZON_DAYS = 90;
export const DEFAULT_HORIZON_DAYS = 30;

/** Used when the account has no payment history to measure a real lag from. */
const FALLBACK_PAYMENT_LAG_DAYS = 7;

export type CashSettings = {
  /** What the owner last told us was in the bank. Null until they say. */
  balance: number | null;
  /** When they told us — a three-week-old number is not today's balance. */
  balanceAt: string | null;
  buffer: number;
  creditLine: number;
  /** False until the migration has run: the page degrades instead of exploding. */
  available: boolean;
};

/** The most recent forecast taken BEFORE today, for the accuracy check. */
export async function loadPreviousSnapshot(
  supabase: SupabaseClient,
  accountId: string,
  todayKey: string,
): Promise<CashSnapshot | null> {
  const { data, error } = await supabase
    .from('cash_snapshots')
    .select('taken_on, balance, buffer, horizon_days, projected')
    .eq('account_id', accountId)
    .lt('taken_on', todayKey)
    .order('taken_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Missing table (pre-migration) just means there's nothing to compare against.
  if (error || !data) return null;
  const projected = Array.isArray(data.projected) ? (data.projected as { d: string; p: number }[]) : [];
  return {
    takenOn: String(data.taken_on),
    balance: num(data.balance),
    buffer: num(data.buffer),
    horizonDays: Number(data.horizon_days) || DEFAULT_HORIZON_DAYS,
    projected,
  };
}

export type CashForecastSources = {
  events: CashEvent[];
  settings: CashSettings;
  /** Days from asking for money to getting it, measured on this account. */
  paymentLagDays: number;
  /** True when the lag came from real history rather than the fallback. */
  paymentLagMeasured: boolean;
  /**
   * Finished work with money still outstanding and no payment requested. Real,
   * undated, and deliberately NOT on the curve.
   */
  unbilled: { count: number; total: number };
  /** Scheduled payments as stored, for the manage panel. */
  scheduled: ScheduledPayment[];
  scheduledAvailable: boolean;
  payrollMode: PeriodMode;
  payDay: PayDaySettings;
};

export type ScheduledPayment = {
  id: string;
  label: string;
  amount: number;
  direction: 'in' | 'out';
  category: CashEventKind;
  dueDate: string;
  recurrence: Recurrence;
  endsOn: string | null;
  confirmed: boolean;
  active: boolean;
  note: string | null;
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissing(error: { code?: string } | null): boolean {
  return error?.code === MISSING_TABLE || error?.code === MISSING_COLUMN;
}

/** "Tue 12 Aug" — for event detail lines, which are rendered as-is. */
function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------------------------------------------------------------------------

export async function loadCashForecastSources(
  supabase: SupabaseClient,
  accountId: string,
  options: { todayKey: string; days: number },
): Promise<CashForecastSources> {
  const days = Math.max(7, Math.min(MAX_HORIZON_DAYS, Math.round(options.days)));
  const todayKey = options.todayKey;
  const horizonKey = addDays(todayKey, days - 1);

  const account = await loadAccountRow(supabase, accountId);
  const payDay = payDaySettingsFromAccount(account.row);
  const laborRules = laborRulesFromAccount(account.row);
  // A custom range is a one-off view of hours, not a cadence — it can't be
  // walked forward, so the forecast falls back to weekly rather than inventing
  // a repeating "custom" period that doesn't exist.
  const payrollMode: PeriodMode = laborRules.periodMode === 'custom' ? 'weekly' : laborRules.periodMode;
  const timeZone = typeof account.row?.timezone === 'string' ? account.row.timezone : undefined;

  const paymentLag = await measurePaymentLag(supabase, accountId);

  const [scheduled, payroll, incoming] = await Promise.all([
    loadScheduledPayments(supabase, accountId),
    loadPayrollEvents(supabase, accountId, { todayKey, horizonKey, mode: payrollMode, payDay, timeZone }),
    loadIncomingEvents(supabase, accountId, { todayKey, horizonKey, lagDays: paymentLag.days }),
  ]);

  const events = [
    ...expandScheduled(scheduled.rows, { fromKey: todayKey, toKey: horizonKey }),
    ...payroll,
    ...incoming.events,
  ];

  return {
    events,
    settings: account.settings,
    paymentLagDays: paymentLag.days,
    paymentLagMeasured: paymentLag.measured,
    unbilled: incoming.unbilled,
    scheduled: scheduled.rows,
    scheduledAvailable: scheduled.available,
    payrollMode,
    payDay,
  };
}

// -- Account settings --------------------------------------------------------

type AccountRow = Record<string, unknown> | null;

async function loadAccountRow(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ row: AccountRow; settings: CashSettings }> {
  const CASH_COLUMNS = 'cash_balance, cash_balance_at, cash_buffer, cash_credit_line';
  const base = `timezone, ${LABOR_RULE_COLUMNS}, ${PAY_DAY_COLUMNS}`;

  const { data, error } = await supabase.from('accounts').select(`${base}, ${CASH_COLUMNS}`).eq('id', accountId).maybeSingle();
  if (!error) {
    const row = (data ?? null) as AccountRow;
    return {
      row,
      settings: {
        balance: row?.cash_balance == null ? null : num(row.cash_balance),
        balanceAt: typeof row?.cash_balance_at === 'string' ? row.cash_balance_at : null,
        buffer: row?.cash_buffer == null ? 0 : num(row.cash_buffer),
        creditLine: row?.cash_credit_line == null ? 0 : num(row.cash_credit_line),
        available: true,
      },
    };
  }
  if (!isMissing(error)) throw new Error(error.message);

  // Migration not applied yet. Everything else on the page still works; the
  // owner just can't save a balance.
  const { data: fallback } = await supabase.from('accounts').select(base).eq('id', accountId).maybeSingle();
  return {
    row: (fallback ?? null) as AccountRow,
    settings: { balance: null, balanceAt: null, buffer: 0, creditLine: 0, available: false },
  };
}

// -- Scheduled payments ------------------------------------------------------

async function loadScheduledPayments(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ rows: ScheduledPayment[]; available: boolean }> {
  const { data, error } = await supabase
    .from('scheduled_payments')
    .select('id, label, amount, direction, category, due_date, recurrence, ends_on, confirmed, active, note')
    .eq('account_id', accountId)
    .order('due_date', { ascending: true });

  if (error) {
    if (isMissing(error)) return { rows: [], available: false };
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.label ?? ''),
    amount: num(row.amount),
    direction: row.direction === 'in' ? ('in' as const) : ('out' as const),
    category: normalizeCategory(row.category),
    dueDate: String(row.due_date),
    recurrence: normalizeRecurrence(row.recurrence),
    endsOn: row.ends_on ? String(row.ends_on) : null,
    confirmed: row.confirmed === true,
    active: row.active !== false,
    note: row.note ? String(row.note) : null,
  }));

  return { rows, available: true };
}

const CATEGORIES: CashEventKind[] = ['payroll', 'materials', 'equipment', 'bill', 'tax', 'loan', 'other'];

function normalizeCategory(value: unknown): CashEventKind {
  return CATEGORIES.includes(value as CashEventKind) ? (value as CashEventKind) : 'bill';
}

function normalizeRecurrence(value: unknown): Recurrence {
  const all: Recurrence[] = ['once', 'weekly', 'biweekly', 'monthly'];
  return all.includes(value as Recurrence) ? (value as Recurrence) : 'once';
}

const RECURRENCE_WORD: Record<Recurrence, string> = {
  once: 'One-off',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
};

export function expandScheduled(rows: ScheduledPayment[], window: { fromKey: string; toKey: string }): CashEvent[] {
  const events: CashEvent[] = [];
  for (const row of rows) {
    if (!row.active || row.amount <= 0) continue;
    const dates = expandRecurrence(row.dueDate, row.recurrence, window, row.endsOn);
    for (const dateKey of dates) {
      const incoming = row.direction === 'in';
      events.push({
        id: `sched:${row.id}:${dateKey}`,
        dateKey,
        label: row.label,
        detail: `${RECURRENCE_WORD[row.recurrence]} · ${dayLabel(dateKey)}`,
        amount: incoming ? row.amount : -row.amount,
        kind: incoming ? 'other_in' : row.category,
        confirmed: row.confirmed,
        // A bill doesn't arrive late, it bounces. Only customer money slips.
        slips: false,
        repeating: row.recurrence !== 'once',
        href: null,
      });
    }
  }
  return events;
}

// -- Payroll -----------------------------------------------------------------

/**
 * What payroll is going to cost, on the days it actually leaves the account.
 *
 * Three tiers, most certain first:
 *   1. An approved or sent pay entry — a number somebody agreed to. Confirmed.
 *   2. Logged hours nobody has approved yet — priced from the labor costs on
 *      those hours. An estimate, and said to be one.
 *   3. A future period with nothing logged against it — the average of recent
 *      periods that did have payroll. Also an estimate, and the only way the
 *      chart can show a payroll that hasn't been worked yet.
 *
 * A period contributes at most one event, on its pay day. Two markers on one
 * day for the same payroll reads as paying twice.
 */
async function loadPayrollEvents(
  supabase: SupabaseClient,
  accountId: string,
  options: { todayKey: string; horizonKey: string; mode: PeriodMode; payDay: PayDaySettings; timeZone?: string },
): Promise<CashEvent[]> {
  const { todayKey, horizonKey, mode, payDay, timeZone } = options;

  // Wide enough to catch a period that ended before today but whose pay day
  // hasn't arrived, and every period whose pay day lands inside the window.
  const span = Math.max(1, daysBetween(todayKey, horizonKey));
  const periodDays = mode === 'weekly' ? 7 : mode === 'biweekly' ? 14 : 30;
  const forward = Math.ceil(span / periodDays) + 1;
  const offsets: number[] = [];
  for (let offset = -3; offset <= forward; offset++) offsets.push(offset);

  // The real clock, not a noon-UTC stand-in built from todayKey: resolvePayPeriod
  // cuts its boundaries in the contractor's zone, and handing it a fabricated
  // instant would move the boundary for anyone far enough east.
  const now = new Date();
  const periods = offsets.map((offset) => {
    const period = resolvePayPeriod(mode, offset, { now, timeZone });
    return {
      offset,
      period,
      key: payPeriodKey(period),
      startKey: periodStartKey(period),
      endKey: periodEndKey(period),
      payDayKey: payDayFor(periodEndKey(period), payDay),
    };
  });

  const relevant = periods.filter((entry) => entry.payDayKey >= todayKey && entry.payDayKey <= horizonKey);
  if (relevant.length === 0) return [];

  const oldest = periods[0];
  const newest = periods[periods.length - 1];

  const [{ data: laborRows }, entriesResult] = await Promise.all([
    supabase
      .from('costs')
      .select('crew_id, amount, created_at')
      .eq('account_id', accountId)
      .eq('category', 'Labor')
      .gte('created_at', oldest.period.startIso)
      .lt('created_at', newest.period.endIso),
    supabase
      .from('crew_pay_entries')
      .select('crew_id, status, approved_amount, paid_amount, period:crew_pay_periods!inner(period_key)')
      .eq('account_id', accountId)
      .in('period.period_key', periods.map((entry) => entry.key)),
  ]);

  // No pay tables yet is not an error here — it just means every period is
  // priced from its logged hours.
  const entryRows = (entriesResult.error ? [] : entriesResult.data ?? []) as unknown as Array<{
    crew_id: string;
    status: string;
    approved_amount: unknown;
    paid_amount: unknown;
    period: { period_key: string } | { period_key: string }[] | null;
  }>;

  const entriesByPeriod = new Map<string, Map<string, PayEntry>>();
  for (const row of entryRows) {
    const period = Array.isArray(row.period) ? row.period[0] : row.period;
    if (!period?.period_key) continue;
    const bucket = entriesByPeriod.get(period.period_key) ?? new Map<string, PayEntry>();
    bucket.set(row.crew_id, { status: String(row.status), approved: num(row.approved_amount) });
    entriesByPeriod.set(period.period_key, bucket);
  }

  return buildPayrollEvents({
    periods,
    relevant,
    labor: (laborRows ?? []) as LaborRow[],
    entriesByPeriod,
    todayKey,
  });
}

/**
 * Days from asking for money to getting it, from a list of observed gaps.
 *
 * Median rather than mean: one customer who paid four months late would drag a
 * mean out far enough to make every forecast useless. Clamped, because a lag of
 * zero says money arrives before it is asked for and a lag of 180 is not a
 * forecast input, it is a different business.
 */
export function medianLagDays(gaps: number[], fallback: number): number {
  const usable = gaps.filter((gap) => Number.isFinite(gap) && gap >= 0 && gap <= 180).sort((a, b) => a - b);
  if (usable.length < 3) return fallback;
  return Math.max(1, Math.min(30, Math.round(usable[Math.floor(usable.length / 2)])));
}

// -- Incoming ----------------------------------------------------------------

/**
 * Fetch the rows the incoming half needs, then hand them to the pure builder.
 *
 * Everything that decides an AMOUNT lives in cash-forecast-incoming.ts, and
 * nothing here does. That split is the point: the netting rules — four separate
 * "subtract this or it counts twice" cases — are the part that goes silently
 * wrong, and they are now reachable from a test.
 */
async function loadIncomingEvents(
  supabase: SupabaseClient,
  accountId: string,
  options: { todayKey: string; horizonKey: string; lagDays: number },
): Promise<IncomingResult> {
  const { todayKey, horizonKey } = options;

  const [pendingResult, jobsResult, plansResult] = await Promise.all([
    // `failed` is in here on purpose. A declined auto-charge with a retry
    // scheduled is money arriving on a known date; leaving it out made it vanish
    // from the forecast until it recovered, which is precisely the month you
    // most need to know about it. Which failures actually count is decided by
    // isRetrying — an exhausted one never arrives, and one waiting on a new card
    // arrives when the client gets round to it, which is not a date.
    supabase
      .from('payments')
      .select('id, job_id, kind, label, amount, status, due_date, requested_at, payment_plan_id, dunning_state, next_retry_at, failure_message')
      .eq('account_id', accountId)
      .in('status', ['requested', 'processing', 'failed'])
      .eq('imported', false),
    // Work on the calendar inside the window, plus recently finished work, so
    // the unbilled stat has something to count.
    supabase
      .from('jobs')
      .select('id, ref, client_name, quoted_amount, status, scheduled_for, scheduled_until, recurring_plan_id, recurring_visit_date')
      .eq('account_id', accountId)
      .in('status', ['in_progress', 'complete'])
      .gte('scheduled_for', addDays(todayKey, -60))
      .lte('scheduled_for', horizonKey),
    supabase
      .from('recurring_plans')
      .select('id, title, client_name, amount, frequency, next_run_date, active, remaining_cycles, anchor_day, auto_charge, card_last4')
      .eq('account_id', accountId)
      .eq('active', true),
  ]);

  if (pendingResult.error) throw new Error(pendingResult.error.message);
  if (jobsResult.error) throw new Error(jobsResult.error.message);

  const jobs = (jobsResult.data ?? []) as ForecastJobRow[];
  const jobIds = jobs.map((job) => job.id);

  const [settled, pendingPlans] = await Promise.all([
    jobIds.length
      ? supabase
          .from('payments')
          .select('job_id, amount')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .in('status', ['paid', 'processing', 'requested'])
          .then(({ data }) => (data ?? []) as SettledRow[])
      : Promise.resolve([] as SettledRow[]),
    jobIds.length
      ? supabase
          .from('payment_plans')
          .select('id, job_id, total_cents, deposit_cents, installment_count, frequency, first_installment_date')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .eq('status', 'pending_deposit')
          .then(({ data }) => (data ?? []) as PendingPlanRow[])
      : Promise.resolve([] as PendingPlanRow[]),
  ]);

  return buildIncomingEvents({
    payments: (pendingResult.data ?? []) as PendingPaymentRow[],
    jobs,
    settled,
    pendingPlans,
    // A plans read failure is not fatal: the rest of the forecast is still true.
    recurringPlans: (plansResult.error ? [] : plansResult.data ?? []) as RecurringPlanRow[],
    ...options,
  });
}

// -- How long this account actually waits to get paid ------------------------

/**
 * Median days from asking for money to receiving it, on this account's own
 * history.
 *
 * Median rather than mean: one customer who paid four months late would drag a
 * mean out far enough to make every forecast useless. Falls back to a week when
 * there's nothing to measure, and says which it used, because "expected Tuesday"
 * built on a guess should not look like "expected Tuesday" built on 40 payments.
 */
async function measurePaymentLag(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ days: number; measured: boolean }> {
  const since = new Date(Date.now() - 180 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('payments')
    .select('requested_at, paid_at')
    .eq('account_id', accountId)
    .eq('status', 'paid')
    .eq('imported', false)
    .gte('paid_at', since)
    .limit(300);

  if (error || !data || data.length < 3) return { days: FALLBACK_PAYMENT_LAG_DAYS, measured: false };

  const gaps: number[] = [];
  for (const row of data as Array<{ requested_at: string | null; paid_at: string | null }>) {
    if (!row.requested_at || !row.paid_at) continue;
    const gap = daysBetween(row.requested_at.slice(0, 10), row.paid_at.slice(0, 10));
    if (gap >= 0 && gap <= 180) gaps.push(gap);
  }
  if (gaps.length < 3) return { days: FALLBACK_PAYMENT_LAG_DAYS, measured: false };

  const days = medianLagDays(gaps, FALLBACK_PAYMENT_LAG_DAYS);
  return { days, measured: days !== FALLBACK_PAYMENT_LAG_DAYS || gaps.length >= 3 };
}
