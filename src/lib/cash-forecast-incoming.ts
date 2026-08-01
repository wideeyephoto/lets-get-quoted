// Turning rows into expected money — the part of the forecast that is easy to
// get quietly wrong.
//
// Split out of cash-forecast-data.ts for one reason: everything here is netting,
// and netting mistakes are silent. Every source of incoming money that has its
// own event ALSO has to be subtracted from the job it belongs to, or the same
// dollar is drawn twice — once as the deposit request and again inside the job's
// remaining balance. There are now four of those rules (requested payments,
// declined charges awaiting retry, projected plan installments, materialised
// recurring visits) and no amount of care makes a double-count visible on a
// chart. So they live here, pure, with tests that assert the total.
//
// No I/O: the caller does the fetching and hands the rows over. That is the
// whole point — this used to be unreachable from a test.

import { addDays, daysBetween } from '@/lib/pay-day';
import { planSchedulePreview } from '@/lib/payment-plan-math';
import { projectPlanVisits } from '@/lib/recurring';
import type { CashEvent, CashEventKind } from '@/lib/cash-forecast';

export type PendingPaymentRow = {
  id: string;
  job_id: string | null;
  kind: string;
  label: string | null;
  amount: unknown;
  status: string;
  due_date: string | null;
  requested_at: string;
  payment_plan_id?: string | null;
  dunning_state?: string | null;
  next_retry_at?: string | null;
  failure_message?: string | null;
};

export type ForecastJobRow = {
  id: string;
  ref: string;
  client_name: string;
  quoted_amount: unknown;
  status: string;
  scheduled_for: string | null;
  scheduled_until: string | null;
  recurring_plan_id: string | null;
  recurring_visit_date: string | null;
};

/** Anything already collected or asked for, per job. */
export type SettledRow = { job_id: string; amount: unknown };

export type PendingPlanRow = {
  id: string;
  job_id: string;
  total_cents: number;
  deposit_cents: number;
  installment_count: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  first_installment_date: string;
};

export type RecurringPlanRow = {
  id: string;
  title: string;
  client_name: string;
  amount: unknown;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  next_run_date: string;
  active: boolean;
  remaining_cycles: number | null;
  anchor_day?: number | null;
  auto_charge: boolean;
  card_last4: string | null;
};

export type IncomingInput = {
  payments: PendingPaymentRow[];
  jobs: ForecastJobRow[];
  settled: SettledRow[];
  pendingPlans: PendingPlanRow[];
  recurringPlans: RecurringPlanRow[];
  todayKey: string;
  horizonKey: string;
  lagDays: number;
};

export type IncomingResult = {
  events: CashEvent[];
  /** Finished work still owed that nobody has been asked for. Counted, not drawn. */
  unbilled: { count: number; total: number };
};

export const PAYMENT_KIND_MAP: Record<string, CashEventKind> = {
  deposit: 'deposit',
  stage: 'final',
  final: 'final',
  plan_installment: 'installment',
};

export const PAYMENT_KIND_WORD: Record<string, string> = {
  deposit: 'deposit',
  stage: 'stage payment',
  final: 'final payment',
  plan_installment: 'plan installment',
};

/** How far below a dollar counts as nothing left to collect. */
const REMAINDER_FLOOR = 0.5;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "Tue 12 Aug" — event detail lines are rendered as-is. */
function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A failed payment only earns a place on the curve when a retry is scheduled.
 *
 * 'needs_card' waits on the client to enter a new one and 'exhausted' has given
 * up. Both are real money with no date, and the rule the whole forecast runs on
 * is that undated money doesn't get drawn.
 */
export function isRetrying(row: PendingPaymentRow): boolean {
  return row.status === 'failed' && row.dunning_state === 'scheduled' && Boolean(row.next_retry_at);
}

export function buildIncomingEvents(input: IncomingInput): IncomingResult {
  const { todayKey, horizonKey, lagDays } = input;
  const events: CashEvent[] = [];
  const jobById = new Map(input.jobs.map((job) => [job.id, job] as const));

  // A failed row with no scheduled retry never becomes an event and never nets
  // off a job — it is money with no date, which this page does not draw.
  const payments = input.payments.filter((row) => row.status !== 'failed' || isRetrying(row));

  // -- What is already accounted for, per job --------------------------------
  const settledByJob = new Map<string, number>();
  const account = (jobId: string, amount: number) =>
    settledByJob.set(jobId, (settledByJob.get(jobId) ?? 0) + amount);

  for (const row of input.settled) account(row.job_id, num(row.amount));
  // Retries are drawn as their own event below, so they count here too.
  for (const row of payments) {
    if (isRetrying(row) && row.job_id) account(row.job_id, num(row.amount));
  }

  // -- 1. Money already asked for --------------------------------------------
  for (const row of payments) {
    const amount = num(row.amount);
    if (amount <= 0) continue;
    const job = row.job_id ? jobById.get(row.job_id) : null;
    const who = job?.client_name ?? 'Customer';
    const retrying = isRetrying(row);
    // A plan installment has a real scheduled charge date. Anything else is a
    // link somebody has to click, so it lands a typical payment lag after it was
    // sent, not the day it was sent.
    const expected = retrying
      ? String(row.next_retry_at).slice(0, 10)
      : row.due_date ?? addDays(String(row.requested_at).slice(0, 10), lagDays);
    // The expected day can already be past, and buildForecast pulls it onto
    // today. Say so: a detail line still reading "expected Thu, Jul 30" on a row
    // drawn in August is the page contradicting itself.
    const late = daysBetween(todayKey, expected) < 0;
    const dateKey = late ? todayKey : expected;
    const lateBy = late ? daysBetween(expected, todayKey) : 0;
    // A retry is never "confirmed" however firmly it is scheduled — the card has
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
      kind: PAYMENT_KIND_MAP[row.kind] ?? 'final',
      confirmed,
      slips: true,
      repeating: row.kind === 'plan_installment',
      href: row.job_id ? `/dashboard/jobs/${row.job_id}` : null,
    });
  }

  // -- 1b. A plan still waiting on its deposit -------------------------------
  // Its installment rows don't exist yet; they're written in one go the moment
  // the deposit is confirmed. Until then the balance landed as a single lump on
  // the job's end date, which for a six-month plan is the wrong month by five.
  for (const plan of input.pendingPlans) {
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
        // Every word here is load-bearing: none of it happens unless the deposit
        // is paid first, and a forecast that quietly assumes it was is the kind
        // of optimism this page exists to remove.
        detail: `Payment plan — none of these charge until the deposit clears · ${dayLabel(entry.dueDate)}`,
        amount,
        kind: 'installment',
        confirmed: false,
        slips: true,
        repeating: true,
        href: `/dashboard/jobs/${plan.job_id}`,
      });
    }
    // The WHOLE projected total, not just the part inside the window. An
    // installment falling after the horizon hasn't arrived in this window
    // either, and adding it back as a lump on the job's end date would date it
    // more wrongly than leaving it out.
    if (projected > 0) account(plan.job_id, projected);
  }

  // -- 2. Quoted work on the calendar, net of everything above ---------------
  const unbilled = { count: 0, total: 0 };
  for (const job of input.jobs) {
    const quoted = num(job.quoted_amount);
    if (quoted <= 0) continue;
    const settled = settledByJob.get(job.id) ?? 0;
    const remaining = cents(quoted - settled);
    if (remaining <= REMAINDER_FLOOR) continue;

    const endKey = job.scheduled_until || job.scheduled_for;
    if (!endKey) continue;

    if (job.status === 'complete') {
      // Finished, still owed, nobody asked for it. There is no honest date for
      // this, so it is counted and not drawn.
      unbilled.count += 1;
      unbilled.total = cents(unbilled.total + remaining);
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

  // -- 3. Recurring visits that haven't become jobs yet ----------------------
  // The ones that HAVE are already above as jobs; projecting them too would bill
  // the same visit twice.
  const materialized = new Set(
    input.jobs
      .filter((job) => job.recurring_plan_id && job.recurring_visit_date)
      .map((job) => `${job.recurring_plan_id}:${job.recurring_visit_date}`),
  );
  const planById = new Map(input.recurringPlans.map((plan) => [plan.id, plan] as const));
  const visits = projectPlanVisits(
    input.recurringPlans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      client_name: plan.client_name,
      amount: num(plan.amount),
      frequency: plan.frequency,
      next_run_date: plan.next_run_date,
      active: plan.active,
      remaining_cycles: plan.remaining_cycles,
      anchor_day: plan.anchor_day,
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
      // A saved card is taken on the day. An invoice has to be paid, so it lands
      // a typical lag later.
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
