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
import { laborRulesFromAccount, LABOR_RULE_COLUMNS } from '@/lib/labor-settings';
import { resolvePayPeriod, type PeriodMode } from '@/lib/labor';
import { periodEndKey, periodStartKey, payPeriodKey } from '@/lib/crew-pay';
import { projectPlanVisits } from '@/lib/recurring';
import { planSchedulePreview } from '@/lib/payment-plan-math';

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

function expandScheduled(rows: ScheduledPayment[], window: { fromKey: string; toKey: string }): CashEvent[] {
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

  type EntryInfo = { status: string; approved: number };
  const entriesByPeriod = new Map<string, Map<string, EntryInfo>>();
  for (const row of entryRows) {
    const period = Array.isArray(row.period) ? row.period[0] : row.period;
    if (!period?.period_key) continue;
    const bucket = entriesByPeriod.get(period.period_key) ?? new Map<string, EntryInfo>();
    bucket.set(row.crew_id, { status: String(row.status), approved: num(row.approved_amount) });
    entriesByPeriod.set(period.period_key, bucket);
  }

  const labor = (laborRows ?? []) as Array<{ crew_id: string | null; amount: unknown; created_at: string }>;

  // The average recent payroll, for periods nobody has worked yet. Built from
  // whole periods that are already over, so a half-finished week can't drag it
  // down.
  const history: number[] = [];
  for (const entry of periods) {
    if (entry.period.open || entry.endKey >= todayKey) continue;
    const total = periodPayroll(entry, labor, entriesByPeriod.get(entry.key));
    if (total.amount > 0) history.push(total.amount);
  }
  const average = history.length > 0 ? history.reduce((sum, value) => sum + value, 0) / history.length : 0;

  const events: CashEvent[] = [];
  for (const entry of relevant) {
    const { amount, confirmed, approvedCount, crewCount } = periodPayroll(entry, labor, entriesByPeriod.get(entry.key));

    if (amount > 0) {
      events.push({
        id: `payroll:${entry.key}`,
        dateKey: entry.payDayKey,
        label: 'Crew payroll',
        detail: confirmed
          ? `Approved · ${entry.period.rangeLabel}`
          : approvedCount > 0
            ? `${approvedCount} of ${crewCount} approved · ${entry.period.rangeLabel}`
            : `From logged hours · ${entry.period.rangeLabel}`,
        amount: -Math.round(amount * 100) / 100,
        kind: 'payroll',
        confirmed,
        slips: false,
        repeating: true,
        href: '/dashboard/crew?tab=pay',
      });
      continue;
    }

    // Nothing logged yet, but the period is in the future and this account does
    // run payroll — so a payroll is coming, even though no hours exist for it.
    if (average > 0 && entry.startKey > todayKey) {
      events.push({
        id: `payroll:${entry.key}:projected`,
        dateKey: entry.payDayKey,
        label: 'Crew payroll',
        detail: `Projected from recent periods · ${entry.period.rangeLabel}`,
        amount: -Math.round(average * 100) / 100,
        kind: 'payroll',
        confirmed: false,
        slips: false,
        repeating: true,
        href: '/dashboard/crew?tab=pay',
      });
    }
  }

  return events;
}

/** What one period still owes, and how much of it is a number somebody approved. */
function periodPayroll(
  entry: { period: { startIso: string; endIso: string } },
  labor: Array<{ crew_id: string | null; amount: unknown; created_at: string }>,
  entries: Map<string, { status: string; approved: number }> | undefined,
): { amount: number; confirmed: boolean; approvedCount: number; crewCount: number } {
  const inPeriod = labor.filter(
    (row) => row.crew_id && row.created_at >= entry.period.startIso && row.created_at < entry.period.endIso,
  );

  const loggedByCrew = new Map<string, number>();
  for (const row of inPeriod) {
    const crewId = row.crew_id as string;
    loggedByCrew.set(crewId, (loggedByCrew.get(crewId) ?? 0) + num(row.amount));
  }

  // Somebody can be owed for a period they logged no hours in — a salaried crew
  // member's approved entry is the only record of it.
  const crewIds = new Set<string>([...loggedByCrew.keys(), ...(entries?.keys() ?? [])]);

  let amount = 0;
  let approvedCount = 0;
  let unapproved = 0;
  for (const crewId of crewIds) {
    const record = entries?.get(crewId);
    if (record?.status === 'paid') continue; // Already out the door.
    if (record && (record.status === 'approved' || record.status === 'sent')) {
      amount += record.approved > 0 ? record.approved : (loggedByCrew.get(crewId) ?? 0);
      approvedCount += 1;
      continue;
    }
    // No entry, or one still in review: the logged hours are the best we have.
    const logged = loggedByCrew.get(crewId) ?? 0;
    if (logged <= 0) continue;
    amount += logged;
    unapproved += 1;
  }

  return {
    amount: Math.round(amount * 100) / 100,
    confirmed: amount > 0 && unapproved === 0,
    approvedCount,
    crewCount: approvedCount + unapproved,
  };
}

// -- Incoming ----------------------------------------------------------------

type IncomingResult = { events: CashEvent[]; unbilled: { count: number; total: number } };

async function loadIncomingEvents(
  supabase: SupabaseClient,
  accountId: string,
  options: { todayKey: string; horizonKey: string; lagDays: number },
): Promise<IncomingResult> {
  const { todayKey, horizonKey, lagDays } = options;

  const [pendingResult, jobsResult, plansResult] = await Promise.all([
    // `failed` is in here on purpose. A declined auto-charge with a retry
    // scheduled is money arriving on a known date; leaving it out made it vanish
    // from the forecast until it recovered, which is precisely the month you
    // most need to know about it. Which failures actually count is decided
    // below — an exhausted one never arrives, and one waiting on a new card
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
      .select('id, title, client_name, amount, frequency, next_run_date, active, remaining_cycles, auto_charge, card_last4')
      .eq('account_id', accountId)
      .eq('active', true),
  ]);

  if (pendingResult.error) throw new Error(pendingResult.error.message);
  if (jobsResult.error) throw new Error(jobsResult.error.message);

  const allPending = (pendingResult.data ?? []) as Array<{
    id: string;
    job_id: string | null;
    kind: string;
    label: string | null;
    amount: unknown;
    status: string;
    due_date: string | null;
    requested_at: string;
    payment_plan_id: string | null;
    dunning_state: string | null;
    next_retry_at: string | null;
    failure_message: string | null;
  }>;

  // A failed payment only earns a place on the curve when a retry is actually
  // scheduled. 'needs_card' waits on the client to enter a new one and
  // 'exhausted' has given up — both are real money with no date, and the rule
  // this whole file runs on is that undated money doesn't get drawn.
  const isRetrying = (row: (typeof allPending)[number]) =>
    row.status === 'failed' && row.dunning_state === 'scheduled' && Boolean(row.next_retry_at);
  const pending = allPending.filter((row) => row.status !== 'failed' || isRetrying(row));

  const jobs = (jobsResult.data ?? []) as Array<{
    id: string;
    ref: string;
    client_name: string;
    quoted_amount: unknown;
    status: string;
    scheduled_for: string | null;
    scheduled_until: string | null;
    recurring_plan_id: string | null;
    recurring_visit_date: string | null;
  }>;

  // What's already been collected or asked for per job, so a quote that's half
  // paid only contributes the half that isn't.
  const jobIds = jobs.map((job) => job.id);
  const settledByJob = new Map<string, number>();
  if (jobIds.length > 0) {
    const { data: settled } = await supabase
      .from('payments')
      .select('job_id, amount, status')
      .eq('account_id', accountId)
      .in('job_id', jobIds)
      .in('status', ['paid', 'processing', 'requested']);
    for (const row of (settled ?? []) as Array<{ job_id: string; amount: unknown; status: string }>) {
      settledByJob.set(row.job_id, (settledByJob.get(row.job_id) ?? 0) + num(row.amount));
    }
  }
  // Retries are drawn as their own event, so they have to count as "already
  // accounted for" against the job as well — otherwise the same money appears
  // once as the retry and again inside the job's remaining balance.
  for (const row of pending) {
    if (!isRetrying(row) || !row.job_id) continue;
    settledByJob.set(row.job_id, (settledByJob.get(row.job_id) ?? 0) + num(row.amount));
  }

  // A payment plan whose deposit hasn't cleared has no installment rows yet —
  // they're written in one go the moment the deposit is confirmed. Until then
  // the whole balance landed as a single lump on the job's end date, which for
  // a six-month plan is the wrong month by five of them. Project the schedule
  // the client was actually shown.
  const pendingPlans = jobIds.length
    ? (
        await supabase
          .from('payment_plans')
          .select('id, job_id, total_cents, deposit_cents, installment_count, frequency, first_installment_date')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .eq('status', 'pending_deposit')
      ).data ?? []
    : [];

  const events: CashEvent[] = [];

  // 1. Money already asked for.
  const jobById = new Map(jobs.map((job) => [job.id, job] as const));
  for (const row of pending) {
    const amount = num(row.amount);
    if (amount <= 0) continue;
    const job = row.job_id ? jobById.get(row.job_id) : null;
    const who = job?.client_name ?? 'Customer';
    // A plan installment has a real scheduled charge date. Anything else is a
    // link somebody has to click, so it lands a typical payment lag after it
    // was sent, not the day it was sent.
    const retrying = isRetrying(row);
    const expected = retrying
      ? String(row.next_retry_at).slice(0, 10)
      : row.due_date ?? addDays(String(row.requested_at).slice(0, 10), lagDays);
    // The expected day can already be in the past, and the forecast will pull it
    // onto today. Say so: a detail line still reading "expected Thu, Jul 30" on a
    // row drawn in August is the page contradicting itself.
    const late = daysBetween(todayKey, expected) < 0;
    const dateKey = late ? todayKey : expected;
    const lateBy = late ? daysBetween(expected, todayKey) : 0;
    // A retry is never "confirmed" however firmly it's scheduled — the card has
    // already said no once.
    const confirmed = !retrying && (row.status === 'processing' || (row.kind === 'plan_installment' && Boolean(row.due_date)));
    events.push({
      id: `pay:${row.id}`,
      dateKey,
      label: `${who} — ${row.label || PAYMENT_KIND_WORD[row.kind] || 'payment'}`,
      detail: retrying
        ? `Card declined${row.failure_message ? ` (${row.failure_message})` : ''} · retrying ${dayLabel(dateKey)}`
        : row.status === 'processing'
          ? `Payment in flight · ${dayLabel(dateKey)}`
          : late
            ? `Asked for, still unpaid · ${lateBy} ${lateBy === 1 ? 'day' : 'days'} past when you'd expect it`
            : row.due_date
              ? `Scheduled charge · ${dayLabel(dateKey)}`
              : `Requested, unpaid · expected ${dayLabel(dateKey)}`,
      amount,
      kind: (PAYMENT_KIND_MAP[row.kind] ?? 'final') as CashEventKind,
      confirmed,
      slips: true,
      repeating: row.kind === 'plan_installment',
      href: row.job_id ? `/dashboard/jobs/${row.job_id}` : null,
    });
  }

  // 1b. Installments of a plan that is still waiting on its deposit.
  for (const plan of pendingPlans as Array<{
    id: string;
    job_id: string;
    total_cents: number;
    deposit_cents: number;
    installment_count: number;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    first_installment_date: string;
  }>) {
    const job = jobById.get(plan.job_id);
    const schedule = planSchedulePreview(plan);
    let projected = 0;
    for (const entry of schedule) {
      const amount = Math.round(entry.amountCents) / 100;
      if (amount <= 0) continue;
      projected += amount;
      if (entry.dueDate > horizonKey) continue;
      events.push({
        id: `planned:${plan.id}:${entry.seq}`,
        dateKey: entry.dueDate,
        label: `${job?.client_name ?? 'Customer'} — installment ${entry.seq} of ${schedule.length}`,
        // Every word of this is load-bearing: none of it happens unless the
        // deposit is paid first, and a forecast that quietly assumes it was is
        // the kind of optimism this page exists to remove.
        detail: `Payment plan — none of these charge until the deposit clears · ${dayLabel(entry.dueDate)}`,
        amount,
        kind: 'installment',
        confirmed: false,
        slips: true,
        repeating: true,
        href: `/dashboard/jobs/${plan.job_id}`,
      });
    }
    // Drawn above, so it must not also land inside the job's remaining balance.
    // The whole projected total, not just the part inside the window: an
    // installment falling after the horizon hasn't arrived in this window
    // either, and adding it back as a lump on the job's end date would date it
    // even more wrongly than leaving it out.
    if (projected > 0) settledByJob.set(plan.job_id, (settledByJob.get(plan.job_id) ?? 0) + projected);
  }

  // 2. Quoted work on the calendar, net of anything already requested or paid.
  const unbilled = { count: 0, total: 0 };
  for (const job of jobs) {
    const quoted = num(job.quoted_amount);
    if (quoted <= 0) continue;
    const settled = settledByJob.get(job.id) ?? 0;
    const remaining = Math.round((quoted - settled) * 100) / 100;
    if (remaining <= 0.5) continue;

    const endKey = job.scheduled_until || job.scheduled_for;
    if (!endKey) continue;

    if (job.status === 'complete') {
      // Finished, still owed, nobody has been asked for it. We have no date for
      // this — see the note at the top of the file. Counted, not drawn.
      unbilled.count += 1;
      unbilled.total = Math.round((unbilled.total + remaining) * 100) / 100;
      continue;
    }

    if (endKey < todayKey) continue;
    events.push({
      id: `job:${job.id}`,
      dateKey: addDays(endKey, lagDays),
      label: `${job.client_name} — ${job.ref}`,
      detail: `Quoted work, finishes ${dayLabel(endKey)}${settled > 0 ? ' · balance after deposits' : ''}`,
      amount: remaining,
      kind: 'job',
      confirmed: false,
      slips: true,
      repeating: false,
      href: `/dashboard/jobs/${job.id}`,
    });
  }

  // 3. Recurring visits that haven't become jobs yet. The ones that HAVE are
  // already above as jobs — projecting them too would bill the same visit twice.
  const materialized = new Set(
    jobs
      .filter((job) => job.recurring_plan_id && job.recurring_visit_date)
      .map((job) => `${job.recurring_plan_id}:${job.recurring_visit_date}`),
  );
  const plans = (plansResult.error ? [] : plansResult.data ?? []) as Array<{
    id: string;
    title: string;
    client_name: string;
    amount: unknown;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    next_run_date: string;
    active: boolean;
    remaining_cycles: number | null;
    auto_charge: boolean;
    card_last4: string | null;
  }>;
  const planById = new Map(plans.map((plan) => [plan.id, plan] as const));
  const visits = projectPlanVisits(
    plans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      client_name: plan.client_name,
      amount: num(plan.amount),
      frequency: plan.frequency,
      next_run_date: plan.next_run_date,
      active: plan.active,
      remaining_cycles: plan.remaining_cycles,
    })) as Parameters<typeof projectPlanVisits>[0],
    { fromKey: todayKey, toKey: horizonKey },
    60,
    materialized,
  );

  for (const visit of visits) {
    if (visit.amount <= 0) continue;
    const plan = planById.get(visit.planId);
    const autoCharged = Boolean(plan?.auto_charge && plan?.card_last4);
    events.push({
      id: `visit:${visit.planId}:${visit.dateKey}`,
      // A saved card is taken on the day. An invoice has to be paid, so it
      // lands a typical lag later.
      dateKey: autoCharged ? visit.dateKey : addDays(visit.dateKey, lagDays),
      label: `${visit.clientName} — ${visit.planTitle}`,
      detail: autoCharged
        ? `Card on file, charged ${dayLabel(visit.dateKey)}`
        : `Invoiced on the visit, ${dayLabel(visit.dateKey)}`,
      amount: visit.amount,
      kind: 'recurring',
      confirmed: autoCharged,
      slips: true,
      repeating: true,
      href: '/dashboard/recurring',
    });
  }

  return { events, unbilled };
}

const PAYMENT_KIND_MAP: Record<string, CashEventKind> = {
  deposit: 'deposit',
  stage: 'final',
  final: 'final',
  plan_installment: 'installment',
};

const PAYMENT_KIND_WORD: Record<string, string> = {
  deposit: 'deposit',
  stage: 'stage payment',
  final: 'final payment',
  plan_installment: 'plan installment',
};

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

  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return { days: Math.max(1, Math.min(30, Math.round(median))), measured: true };
}
