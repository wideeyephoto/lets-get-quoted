'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireOfficeContext } from '@/lib/auth';
import {
  buildPayConfirmation,
  canApproveRow,
  formatKeyDay,
  needsReapproval,
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
import { LABOR_RULE_COLUMNS, LABOR_SETTINGS_COOKIE, laborRulesFromAccount, normalizeLaborSettings } from '@/lib/labor-settings';
import { normalizePayrollProvider, PAYROLL_PROVIDER_LABEL } from '@/lib/payroll-export';
import {
  validatePayrollSubmission,
  buildProviderPayload,
  submitPayrollToProvider,
  type PayrollProviderConfig,
} from '@/lib/payroll-api-integration';

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
function periodFrom(formData: FormData, timeZone: string): PayPeriod {
  return resolvePayPeriod(normalizePeriodMode(text(formData, 'period') || 'weekly'), normalizeOffset(text(formData, 'offset')), {
    from: optional(formData, 'from'),
    to: optional(formData, 'to'),
    // The SAME zone the screen used. Without it the action would approve or pay
    // against a slightly different week than the one that was on screen — the
    // worst possible place for a boundary to move.
    timeZone,
  });
}

function selectedIds(formData: FormData): string[] {
  return formData
    .getAll('crewIds')
    .map((value) => value.toString().trim())
    .filter(Boolean);
}

async function context(formData: FormData) {
  const { supabase, accountId, userEmail } = await requireOfficeContext('crew_pay.write');
  const { data: accountRow } = await supabase
    .from('accounts')
    .select(`timezone, require_separate_payer, ${LABOR_RULE_COLUMNS}`)
    .eq('id', accountId)
    .maybeSingle();
  const period = periodFrom(formData, ((accountRow as { timezone?: string } | null)?.timezone) || 'America/New_York');
  // The rules the ACCOUNT keeps, falling back to this browser's cookie only
  // while they have never been saved — so an amount is never computed under one
  // set of rules on a laptop and a different set on a phone.
  const settings = laborRulesFromAccount(
    accountRow as Parameters<typeof laborRulesFromAccount>[0],
    normalizeLaborSettings((await cookies()).get(LABOR_SETTINGS_COOKIE)?.value),
  );
  const requireSeparatePayer = (accountRow as { require_separate_payer?: boolean } | null)?.require_separate_payer === true;
  const state = await loadCrewPayContext(supabase, accountId, { period, settings, includeOpenShifts: true });
  if (!state.available) throw new PayUnavailableError();
  return { supabase, accountId, userEmail, period, state, settings, requireSeparatePayer };
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
    const { supabase, accountId, userEmail, period, state, settings } = await context(formData);
    const chosen = rowsFor(state.rows, selectedIds(formData));
    // canApproveRow lets an ALREADY-APPROVED row through when its hours have
    // moved since — see needsReapproval. This filter used to end in
    // `row.review !== 'approved'`, which made "Hours added after approval" a
    // warning with no exit: the only way out was an undo-approval action that
    // does not exist, and pressing Approve answered "There are no hours here
    // left to approve" while the screen went on flagging the row.
    const approvable = chosen.filter((row) => canApproveRow(row) && row.blockers.length === 0);
    const again = approvable.filter(needsReapproval);

    if (approvable.length === 0) {
      const blocked = chosen.filter((row) => row.blockers.length > 0);
      if (blocked.length > 0) {
        return FAIL(
          `${blocked.length} ${blocked.length === 1 ? 'entry has' : 'entries have'} something to sort out first.`,
          blocked.map((row) => payBlockedReason(row) ?? row.name),
        );
      }
      // Said as the state it is, not as an absence. "Nothing left to approve"
      // over a row that is visibly flagged is what made this look broken.
      const settled = chosen.filter((row) => row.review === 'approved');
      if (settled.length > 0) {
        return FAIL(
          settled.every((row) => row.payment === 'paid')
            ? 'These hours have already been paid. Undo the payment first if the figure was wrong.'
            : 'These hours are already approved and nothing has changed since.',
        );
      }
      return FAIL('There are no hours here left to approve.');
    }

    const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
    await approveHours(supabase, accountId, periodRow.id, approvable.map(snapshotOf), userEmail, {
      overtimeThreshold: settings.overtimeThreshold,
      rounding: settings.rounding,
    });

    const total = approvable.reduce((sum, row) => sum + row.estimatedPay, 0);
    await logPayEvent(supabase, accountId, {
      periodId: periodRow.id,
      crewId: approvable.length === 1 ? approvable[0].crewId : null,
      crewName: approvable.length === 1 ? approvable[0].name : null,
      action: 'hours_approved',
      // A second approval says what it replaced. "Approved $480" appearing
      // twice in a history with no mention that the first figure was $420 is a
      // trail that hides the only interesting thing that happened.
      summary:
        approvable.length === 1
          ? needsReapproval(approvable[0])
            ? `Re-approved ${approvable[0].name}’s hours for ${rangeLabel(period)} — ${payMoney(approvable[0].estimatedPay)}, was ${payMoney(approvable[0].approvedAmount ?? 0)}.`
            : `Approved ${approvable[0].name}’s hours for ${rangeLabel(period)} — ${payMoney(approvable[0].estimatedPay)}.`
          : `Approved hours for ${approvable.length} crew members for ${rangeLabel(period)} — ${payMoney(total)}${again.length > 0 ? ` (${again.length} re-approved after changes)` : ''}.`,
      actorEmail: userEmail,
      meta: {
        crew: approvable.map((row) => row.name),
        amount: total,
        reapproved: again.map((row) => ({ name: row.name, was: row.approvedAmount, now: row.estimatedPay })),
      },
    });

    refresh();
    return OK(
      approvable.length === 1
        ? needsReapproval(approvable[0])
          ? `${approvable[0].name}’s hours are approved again at ${payMoney(approvable[0].estimatedPay)}.`
          : `${approvable[0].name}’s hours are approved.`
        : `Hours approved for ${approvable.length} crew members.`,
      again.length > 0 && approvable.length > 1
        ? [`${again.length} of these had changed since they were approved and have been agreed again.`]
        : undefined,
    );
  } catch (error) {
    return FAIL(messageFor(error));
  }
}

// -- Mark paid ---------------------------------------------------------------

export async function markPaidAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state, requireSeparatePayer } = await context(formData);

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

    // Two-person rule, where the account has asked for one. Approving and paying
    // are separate claims; letting one person make both removes the only check
    // this screen has on an amount that nobody else ever looks at.
    if (requireSeparatePayer && userEmail) {
      const selfApproved = confirmation.rows.filter((row) => row.record?.approvedBy && row.record.approvedBy === userEmail);
      if (selfApproved.length > 0) {
        return FAIL(
          'Somebody else has to record this payment.',
          [
            `You approved ${selfApproved.length === 1 ? selfApproved[0].name : `${selfApproved.length} of these`}, and this account requires a different person to pay than approved.`,
            'Turn that off in Labor settings if it is not how you work.',
          ],
        );
      }
    }

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

/**
 * Direct API Submission to configured payroll provider (Gusto, QuickBooks, ADP, Paychex).
 * Validates approved hours, transmits the payload to the provider API, marks rows as sent, and logs the audit event.
 */
export async function submitPayrollApiAction(_prev: PayActionState, formData: FormData): Promise<PayActionState> {
  try {
    const { supabase, accountId, userEmail, period, state } = await context(formData);
    const provider = normalizePayrollProvider(text(formData, 'payrollProvider'));
    const companyId = optional(formData, 'companyId') || undefined;
    const realmId = optional(formData, 'realmId') || undefined;

    const chosen = rowsFor(state.rows, selectedIds(formData));
    const validation = validatePayrollSubmission(provider, chosen, {
      rangeLabel: period.rangeLabel,
      periodEndKey: periodEndKey(period),
      alreadySent: chosen.some((r) => r.record?.sentAt),
      companyId,
    });

    if (!validation.valid) {
      return FAIL(
        `Validation failed before sending to ${PAYROLL_PROVIDER_LABEL[provider]}.`,
        [...validation.problems, ...validation.excluded.map((e) => `${e.name}: ${e.reason}`)],
      );
    }

    const payload = buildProviderPayload(provider, validation.payable, {
      rangeLabel: period.rangeLabel,
      periodStartKey: periodStartKey(period),
      periodEndKey: periodEndKey(period),
      companyId,
      realmId,
    });

    const providerConfig: PayrollProviderConfig = {
      provider,
      companyId,
      realmId,
      status: 'connected',
    };

    const submissionResult = await submitPayrollToProvider(providerConfig, payload, { dryRun: false });

    if (!submissionResult.success) {
      return FAIL(submissionResult.message, submissionResult.errors);
    }

    const periodRow = await ensurePayPeriodRow(supabase, accountId, period);
    const approvedRows = chosen.filter(
      (row) => row.eligible && row.hours > 0 && row.review === 'approved' && row.payment === 'unpaid',
    );

    if (approvedRows.length > 0) {
      await markSentToPayroll(supabase, accountId, periodRow.id, approvedRows.map(snapshotOf), userEmail);
    }

    await logPayEvent(supabase, accountId, {
      periodId: periodRow.id,
      action: 'marked_sent',
      summary: `Submitted ${validation.payable.length} records (${payMoney(validation.totalGross)}) to ${PAYROLL_PROVIDER_LABEL[provider]} API (Batch #${submissionResult.batchId}).`,
      actorEmail: userEmail,
      meta: {
        provider,
        batchId: submissionResult.batchId,
        transactionId: submissionResult.transactionId,
        recordCount: validation.payable.length,
        totalGross: validation.totalGross,
        totalHours: validation.totalHours,
        rangeLabel: formatKeyRange(periodStartKey(period), periodEndKey(period)),
      },
    });

    refresh();
    return OK(
      `Submitted ${validation.payable.length} records to ${PAYROLL_PROVIDER_LABEL[provider]} (Batch #${submissionResult.batchId}).`,
      [
        `Transaction Reference: ${submissionResult.transactionId}`,
        `Total Hours: ${validation.totalHours} hrs · Gross: ${payMoney(validation.totalGross)}`,
        'Hours marked as sent to payroll. Record payments once settled.',
      ],
    );
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
