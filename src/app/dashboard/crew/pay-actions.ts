'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import {
  buildPayConfirmation,
  formatKeyDay,
  formatKeyRange,
  normalizePaymentMethod,
  payBlockedReason,
  payMoney,
  paymentDateProblem,
  periodEndKey,
  periodStartKey,
  summarizePayTotals,
  type CrewPayRow,
  type PayMethodInput,
} from '@/lib/crew-pay';
import {
  approveHours,
  closePayPeriod,
  ensurePayPeriodRow,
  loadCrewPayContext,
  logPayEvent,
  markPaid,
  markSentToPayroll,
  PayUnavailableError,
  reopenPayPeriod,
  reopenGuard,
  setEntryLocked,
  snapshotOf,
  undoPaid,
} from '@/lib/crew-pay-data';
import { normalizeOffset, normalizePeriodMode, resolvePayPeriod, type PayPeriod } from '@/lib/labor';
import { LABOR_SETTINGS_COOKIE, normalizeLaborSettings } from '@/lib/labor-settings';

// Every payment action on the Hours & pay tab.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: the browser says WHO to act on. It
// never says how much. Amounts, hours and eligibility are re-derived here from
// the same rollup the screen rendered, so a tampered form can't record a
// payment for a number nobody ever saw — and an action can't quietly pay
// against stale hours either, because the re-read happens at action time.

export type PayActionState = { ok: boolean; message: string; detail?: string[] };

const OK = (message: string, detail?: string[]): PayActionState => ({ ok: true, message, detail });
const FAIL = (message: string, detail?: string[]): PayActionState => ({ ok: false, message, detail });

function text(formData: FormData, key: string): string {
  return (formData.get(key) ?? '').toString().trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

/**
 * Rebuild the period the screen was showing.
 *
 * The period is carried in the form rather than read from a session, so the
 * action operates on exactly the range the owner was looking at when they
 * clicked — not on whatever "this week" happens to mean by the time it runs.
 */
function periodFrom(formData: FormData): PayPeriod {
  return resolvePayPeriod(normalizePeriodMode(text(formData, 'period') || 'weekly'), normalizeOffset(text(formData, 'offset')), {
    from: optional(formData, 'from'),
    to: optional(formData, 'to'),
  });
}

function selectedIds(formData: FormData): string[] {
  return formData
    .getAll('crewIds')
    .map((value) => value.toString().trim())
    .filter(Boolean);
}

async function context(formData: FormData) {
  const { supabase, accountId, userEmail } = await requireOwnerContext();
  const period = periodFrom(formData);
  const settings = normalizeLaborSettings(cookies().get(LABOR_SETTINGS_COOKIE)?.value);
  const state = await loadCrewPayContext(supabase, accountId, { period, settings, includeOpenShifts: true });
  if (!state.available) throw new PayUnavailableError();
  return { supabase, accountId, userEmail, period, state };
}

function rangeLabel(period: PayPeriod): string {
  return formatKeyRange(periodStartKey(period), periodEndKey(period));
}

function refresh() {
  revalidatePath('/dashboard/crew');
}

/** The rows named by the form, or every payable row when none were named. */
function rowsFor(rows: CrewPayRow[], ids: string[]): CrewPayRow[] {
  if (ids.length === 0) return rows.filter((row) => row.eligible && row.hours > 0);
  const wanted = new Set(ids);
  return rows.filter((row) => row.crewId && wanted.has(row.crewId));
}

// -- Approve -----------------------------------------------------------------

export async function approveHoursAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const chosen = rowsFor(state.rows, selectedIds(formData));
    const approvable = chosen.filter((row) => row.eligible && row.hours > 0 && row.blockers.length === 0 && row.review !== 'approved');

    if (approvable.length === 0) {
      const blocked = chosen.filter((row) => row.blockers.length > 0);
      if (blocked.length > 0) {
        return FAIL(
          `${blocked.length} ${blocked.length === 1 ? 'entry has' : 'entries have'} something to sort out first.`,
          blocked.map((row) => payBlockedReason(row) ?? row.name),
        );
      }
      return FAIL('There are no hours here left to approve.');
    }

    const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
    await approveHours(supabase, accountId, periodRow.id, approvable.map(snapshotOf), userEmail);

    const total = approvable.reduce((sum, row) => sum + row.estimatedPay, 0);
    await logPayEvent(supabase, accountId, {
      periodId: periodRow.id,
      crewId: approvable.length === 1 ? approvable[0].crewId : null,
      crewName: approvable.length === 1 ? approvable[0].name : null,
      action: 'hours_approved',
      summary:
        approvable.length === 1
          ? `Approved ${approvable[0].name}’s hours for ${rangeLabel(period)} — ${payMoney(approvable[0].estimatedPay)}.`
          : `Approved hours for ${approvable.length} crew members for ${rangeLabel(period)} — ${payMoney(total)}.`,
      actorEmail: userEmail,
      meta: { crew: approvable.map((row) => row.name), amount: total },
    });

    refresh();
    return OK(
      approvable.length === 1
        ? `${approvable[0].name}’s hours are approved.`
        : `Hours approved for ${approvable.length} crew members.`,
    );
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

// -- Mark paid ---------------------------------------------------------------

export async function markPaidAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);

    const paymentDate = text(formData, 'paymentDate');
    const dateProblem = paymentDateProblem(paymentDate);
    if (dateProblem) return FAIL(dateProblem);

    const approveFirst = formData.get('approveFirst') !== null;
    const acknowledged = formData.get('acknowledged') !== null;

    // Payment always names who it covers. An action that worked out its own
    // scope would, one stale form away, pay somebody who had just been excluded.
    const ids = selectedIds(formData);
    if (ids.length === 0) return FAIL('Choose who this payment covers.');
    const chosen = rowsFor(state.rows, ids);

    // "Approve and mark paid" is the one path that may approve on the way
    // through — and only for rows with nothing blocking them.
    const readied = approveFirst
      ? chosen.map((row) => (row.blockers.length === 0 && row.hours > 0 && row.eligible ? { ...row, review: 'approved' as const } : row))
      : chosen;

    const confirmation = buildPayConfirmation(readied, readied.map((row) => row.crewId ?? 'unassigned'));

    if (confirmation.rows.length === 0) {
      return FAIL(
        'Nothing here can be marked paid yet.',
        confirmation.excluded.map((item) => item.reason),
      );
    }
    if (confirmation.requiresAcknowledgement && !acknowledged) {
      return FAIL('Some of these entries have a warning on them. Confirm you’ve reviewed them before recording a payment.');
    }

    const input: PayMethodInput = {
      paymentDate,
      paymentMethod: normalizePaymentMethod(text(formData, 'paymentMethod')),
      paymentReference: optional(formData, 'paymentReference'),
      paymentNote: optional(formData, 'paymentNote'),
    };

    const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
    await markPaid(supabase, accountId, periodRow.id, confirmation.rows.map(snapshotOf), { ...input, approveFirst }, userEmail);

    const single = confirmation.rows.length === 1 ? confirmation.rows[0] : null;
    await logPayEvent(supabase, accountId, {
      periodId: periodRow.id,
      crewId: single?.crewId ?? null,
      crewName: single?.name ?? null,
      action: 'marked_paid',
      summary: single
        ? `Marked ${single.name} paid for ${rangeLabel(period)} — ${payMoney(single.estimatedPay)}.`
        : `${confirmation.crewCount} crew members marked paid for ${rangeLabel(period)} — ${payMoney(confirmation.amount)}.`,
      actorEmail: userEmail,
      meta: {
        crew: confirmation.rows.map((row) => row.name),
        amount: confirmation.amount,
        paymentDate,
        method: input.paymentMethod,
        reference: input.paymentReference,
        excluded: confirmation.excluded.map((item) => item.name),
        acknowledgedWarnings: confirmation.requiresAcknowledgement ? confirmation.warnings.map((item) => item.warning) : [],
      },
    });

    refresh();
    // Partial success is stated, not hidden: anyone left out is named.
    return OK(
      single
        ? `${single.name} marked paid for ${rangeLabel(period)}.`
        : `${confirmation.crewCount} crew members marked paid for ${rangeLabel(period)}.`,
      confirmation.excluded.length > 0
        ? [`Not included: ${confirmation.excluded.map((item) => item.name).join(', ')}.`, ...confirmation.excluded.map((item) => item.reason)]
        : undefined,
    );
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

// Marking the whole period paid is the SAME action with everyone named. There
// is deliberately no "pay everything" variant that takes no names: an action
// that decides its own scope server-side is one refresh away from paying
// somebody the owner had just excluded.

// -- Sent to payroll ---------------------------------------------------------

// Exporting is not paying. This is the explicit, separate claim that the hours
// left here — never set as a side effect of downloading the CSV.
export async function markSentAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const chosen = rowsFor(state.rows, selectedIds(formData)).filter(
      (row) => row.eligible && row.hours > 0 && row.review === 'approved' && row.payment === 'unpaid',
    );
    if (chosen.length === 0) return FAIL('Only approved, unpaid hours can be marked as sent to payroll.');

    const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
    await markSentToPayroll(supabase, accountId, periodRow.id, chosen.map(snapshotOf), userEmail);
    await logPayEvent(supabase, accountId, {
      periodId: periodRow.id,
      action: 'marked_sent',
      summary: `${chosen.length} ${chosen.length === 1 ? 'crew member' : 'crew members'} marked as sent to payroll for ${rangeLabel(period)}.`,
      actorEmail: userEmail,
      meta: { crew: chosen.map((row) => row.name) },
    });

    refresh();
    return OK(`${chosen.length} marked as sent to payroll. They stay unpaid until you record the payment.`);
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

/** Records that an export happened. The status of nothing changes. */
export async function recordExportAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
    const totals = summarizePayTotals(state.rows);
    await logPayEvent(supabase, accountId, {
      periodId: periodRow.id,
      action: 'export_created',
      summary: `Exported ${totals.crewCount} ${totals.crewCount === 1 ? 'crew member' : 'crew members'} (${totals.hours} hours) for ${rangeLabel(period)}.`,
      actorEmail: userEmail,
      meta: { rows: totals.crewCount, hours: totals.hours },
    });
    refresh();
    return OK('Export recorded in this period’s history.');
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

// -- Undo --------------------------------------------------------------------

/**
 * Take a paid status back off one crew member.
 *
 * A reason is required and kept. The payment line that was written when it was
 * marked paid stays exactly where it was — this adds a line saying it was
 * undone, rather than removing the claim that it happened.
 */
export async function undoPaidAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const crewId = text(formData, 'crewId');
    const reason = text(formData, 'reason');
    if (!reason) return FAIL('Say why this payment status is being undone. It stays in the history.');

    const row = state.rows.find((candidate) => candidate.crewId === crewId);
    if (!row || !row.record) return FAIL('There is no payment record here to undo.');
    if (row.payment !== 'paid') return FAIL(`${row.name} isn’t marked paid for this period.`);

    await undoPaid(supabase, accountId, row.record.id);
    await logPayEvent(supabase, accountId, {
      periodId: state.periodRow?.id ?? null,
      entryId: row.record.id,
      crewId: row.crewId,
      crewName: row.name,
      action: 'paid_undone',
      summary: `Paid status undone for ${row.name} for ${rangeLabel(period)} — ${payMoney(row.paidAmount ?? 0)} was recorded on ${row.record.paymentDate ? formatKeyDay(row.record.paymentDate) : 'an unknown date'}.`,
      actorEmail: userEmail,
      reason,
      meta: { amount: row.paidAmount, paymentDate: row.record.paymentDate },
    });

    refresh();
    return OK(`${row.name} is back to approved and unpaid.`, [
      'This changed the status here only. It did not cancel a payment with your bank or payroll provider.',
    ]);
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

/** Unlock a paid entry so its hours can be edited. Reason required. */
export async function setEntryLockAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const crewId = text(formData, 'crewId');
    const locked = text(formData, 'locked') === '1';
    const reason = text(formData, 'reason');
    const row = state.rows.find((candidate) => candidate.crewId === crewId);
    if (!row?.record) return FAIL('There is nothing to lock here yet.');
    if (!locked && !reason) return FAIL('Say why this paid entry is being unlocked.');

    await setEntryLocked(supabase, accountId, row.record.id, locked);
    await logPayEvent(supabase, accountId, {
      periodId: state.periodRow?.id ?? null,
      entryId: row.record.id,
      crewId: row.crewId,
      crewName: row.name,
      action: 'entry_unlocked',
      summary: locked
        ? `Locked ${row.name}’s entry for ${rangeLabel(period)}.`
        : `Unlocked ${row.name}’s paid entry for ${rangeLabel(period)}.`,
      actorEmail: userEmail,
      reason: reason || null,
    });

    refresh();
    return OK(locked ? `${row.name}’s entry is locked.` : `${row.name}’s entry is unlocked. The payment record is unchanged.`);
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

// -- Period lifecycle --------------------------------------------------------

export async function closePeriodAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const totals = summarizePayTotals(state.rows);
    if (totals.needsReview > 0) {
      return FAIL(`${totals.needsReview} ${totals.needsReview === 1 ? 'entry needs' : 'entries need'} reviewing before this period can be closed.`);
    }
    const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
    await closePayPeriod(supabase, accountId, periodRow.id, userEmail);
    await logPayEvent(supabase, accountId, {
      periodId: periodRow.id,
      action: 'period_closed',
      summary: `Closed the pay period ${rangeLabel(period)} — ${totals.paid} of ${totals.crewCount} paid, ${payMoney(totals.paidPay)} recorded.`,
      actorEmail: userEmail,
      meta: { paid: totals.paid, crew: totals.crewCount, amount: totals.paidPay },
    });
    refresh();
    return OK(`${rangeLabel(period)} is closed.`);
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

export async function reopenPeriodAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const reason = text(formData, 'reason');
    if (!reason) return FAIL('Say why this period is being reopened. It stays in the history.');
    if (!state.periodRow) return FAIL('This period was never closed.');
    const guard = reopenGuard(state.periodRow);
    if (guard) return FAIL(guard);

    await reopenPayPeriod(supabase, accountId, state.periodRow.id, reason);
    await logPayEvent(supabase, accountId, {
      periodId: state.periodRow.id,
      action: 'period_reopened',
      summary: `Reopened the pay period ${rangeLabel(period)}.`,
      actorEmail: userEmail,
      reason,
    });
    refresh();
    return OK(`${rangeLabel(period)} is open again. Payments already recorded are untouched.`);
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

function messageFor(error: unknown): string {
  if (error instanceof PayUnavailableError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong and nothing was changed. Try again.';
}
