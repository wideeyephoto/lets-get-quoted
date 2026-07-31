import { round2, toDateKey, type CrewLaborRow, type PayPeriod } from './labor';

// Crew pay — the approval-and-payment lifecycle on top of the hours rollup.
//
// WHAT "PAID" MEANS. It means the contractor recorded that they paid. Nothing
// here moves money, calculates or withholds tax, or talks to a payroll
// provider. Three claims are kept apart on purpose, because collapsing them is
// how a crew member ends up unpaid while a screen says otherwise:
//
//   Approved         these hours are agreed and this is what they come to
//   Sent to payroll  the hours left this product as an export
//   Paid             the contractor says the money went out
//
// Payment is recorded per crew member PER PERIOD. Nobody is ever globally
// "paid": Danny paid for the week of Jul 26 says nothing about Aug 2, and the
// data model can't express the sloppier claim.
//
// Client-safe: types, labels and pure functions only.

// -- The one workflow --------------------------------------------------------

// One ordered lifecycle, not two parallel ones. The table shows review status
// and payment status in separate columns, but both are read off this single
// value — so there is exactly one answer to "where is this?".
export type PayStatus = 'draft' | 'needs_review' | 'approved' | 'sent' | 'paid';

export const PAY_STATUS_ORDER: PayStatus[] = ['draft', 'needs_review', 'approved', 'sent', 'paid'];

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  draft: 'Draft',
  needs_review: 'Needs review',
  approved: 'Approved',
  sent: 'Sent to payroll',
  paid: 'Paid',
};

export const PAY_STATUS_HELP: Record<PayStatus, string> = {
  draft: 'Hours are logged but nobody has agreed them yet.',
  needs_review: 'Something about these hours has to be sorted out before they can be approved.',
  approved: 'You have agreed these hours and what they come to. Nothing has been paid yet.',
  sent: 'These hours were exported for payroll. That is not a payment — mark them paid once the money actually goes out.',
  paid: 'You recorded that this person was paid for this period. This product did not move the money.',
};

/** The review half of the workflow, for the Status column. */
export type ReviewState = 'draft' | 'needs_review' | 'approved';
/** The payment half, for the Payment column. */
export type PaymentState = 'unpaid' | 'sent' | 'paid';

export function reviewStateOf(status: PayStatus): ReviewState {
  if (status === 'draft') return 'draft';
  if (status === 'needs_review') return 'needs_review';
  return 'approved';
}

export function paymentStateOf(status: PayStatus): PaymentState {
  if (status === 'paid') return 'paid';
  if (status === 'sent') return 'sent';
  return 'unpaid';
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  unpaid: 'Unpaid',
  sent: 'Sent to payroll',
  paid: 'Paid',
};

/**
 * Whether the workflow allows this move.
 *
 * Paid never slides quietly back to Draft or Needs review — going back out of
 * paid is the explicit "undo paid" action, which lands on Approved, asks why,
 * and writes a history line. Everything else moves forward, or back one step
 * within the review half.
 */
export function canTransition(from: PayStatus, to: PayStatus): boolean {
  if (from === to) return false;
  if (from === 'paid') return to === 'approved'; // undo only, and only via the action that asks for a reason
  if (to === 'paid') return from === 'approved' || from === 'sent';
  if (to === 'sent') return from === 'approved';
  // Anything left is inside the review half — draft, needs review, approved —
  // where moving back and forth is ordinary work, not a correction.
  return true;
}

// -- Payment methods ---------------------------------------------------------

export type PaymentMethod = 'payroll_provider' | 'direct_deposit' | 'check' | 'cash' | 'bank_transfer' | 'other';

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'payroll_provider', label: 'Payroll provider' },
  { id: 'direct_deposit', label: 'Direct deposit' },
  { id: 'check', label: 'Check' },
  { id: 'cash', label: 'Cash' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'other', label: 'Other' },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHODS.map((method) => [method.id, method.label]),
) as Record<PaymentMethod, string>;

export function normalizePaymentMethod(value: unknown): PaymentMethod | null {
  return PAYMENT_METHODS.some((method) => method.id === value) ? (value as PaymentMethod) : null;
}

/** The sentence that has to appear wherever a paid status is undone. */
export const UNDO_DISCLAIMER =
  'This only changes the status in Let’s Get Quoted. It does not cancel a payment with your bank or payroll provider.';

/** What the confirmation modal collects. Only the date is required. */
export type PayMethodInput = {
  /** 'YYYY-MM-DD' — the day the money went out, which is rarely today. */
  paymentDate: string;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  paymentNote: string | null;
};

/**
 * Why this payment date can't be recorded, or null when it's fine.
 *
 * A future date would record a payment that hasn't happened yet, which is the
 * one thing this screen exists to stop someone believing.
 */
export function paymentDateProblem(value: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter the date this payment went out.';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'That isn’t a real date.';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today.getTime()) return 'A payment can’t be dated in the future.';
  const twoYearsAgo = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());
  if (date.getTime() < twoYearsAgo.getTime()) return 'That date is more than two years ago — check it before recording it.';
  return null;
}

/** "Jul 26" from a 'YYYY-MM-DD' key, read as a local day rather than UTC midnight. */
export function formatKeyDay(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Jul 26 – Aug 1" from two 'YYYY-MM-DD' keys. */
export function formatKeyRange(startKey: string, endKey: string): string {
  return `${formatKeyDay(startKey)} – ${formatKeyDay(endKey)}`;
}

// -- Period identity ---------------------------------------------------------

/** Last day of the period, inclusive — the range label and the DB row use it. */
export function periodEndKey(period: PayPeriod): string {
  return toDateKey(new Date(new Date(period.endIso).getTime() - 24 * 60 * 60 * 1000));
}

export function periodStartKey(period: PayPeriod): string {
  return toDateKey(new Date(period.startIso));
}

/**
 * A stable id for a period, derived from the period itself.
 *
 * Two people opening the same week have to land on the same record, and the
 * same week reopened next month has to be the same one again — so this is
 * computed, never generated. A custom range carries both ends because its
 * start alone doesn't identify it.
 */
export function payPeriodKey(period: PayPeriod): string {
  const start = periodStartKey(period);
  return period.mode === 'custom' ? `custom:${start}:${periodEndKey(period)}` : `${period.mode}:${start}`;
}

// -- Stored records ----------------------------------------------------------

export type PayRecord = {
  id: string;
  crewId: string;
  crewName: string;
  status: PayStatus;
  regularHours: number;
  overtimeHours: number;
  approvedAmount: number;
  approvedAt: string | null;
  approvedBy: string | null;
  sentAt: string | null;
  paidAmount: number | null;
  paidAt: string | null;
  paidBy: string | null;
  paymentDate: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  paymentNote: string | null;
  locked: boolean;
};

// -- What's wrong with a row -------------------------------------------------

export type PayWarning =
  | 'no-hours'
  | 'missing-rate'
  | 'unassigned'
  | 'no-job'
  | 'open-shift'
  | 'long-shift'
  | 'overtime'
  | 'changed-after-approval'
  | 'logged-after-approval'
  | 'changed-after-paid';

export const PAY_WARNING_LABEL: Record<PayWarning, string> = {
  'no-hours': 'Entry with no hours',
  'missing-rate': 'Missing rate',
  unassigned: 'No crew member',
  'no-job': 'Hours without a job',
  'open-shift': 'Shift still running',
  'long-shift': 'Unusually long shift',
  overtime: 'Overtime',
  'changed-after-approval': 'Amount changed after approval',
  'logged-after-approval': 'Hours added after approval',
  'changed-after-paid': 'Hours edited after payment',
};

export const PAY_WARNING_HELP: Record<PayWarning, string> = {
  'no-hours': 'An entry here has no hours on it, so it adds nothing to the total and probably isn’t finished.',
  'missing-rate': 'Hours were logged at a zero rate, so the pay figure is short by whatever those hours are worth.',
  unassigned: 'This labor was logged against a job without naming who did it. There is nobody to pay until it is assigned.',
  'no-job': 'Hours here aren’t attached to a job, so they won’t show up in that job’s costs or margin.',
  'open-shift': 'This person is still clocked in for this period. The hours will grow until the shift is closed.',
  'long-shift': 'A single entry is over 16 hours, which is usually a missed clock-out rather than a real shift.',
  overtime: 'Some of these hours are past your weekly overtime threshold. No premium is added — apply your own rule when you pay.',
  'changed-after-approval': 'The hours have changed since you approved them, so the approved figure and the current one no longer agree.',
  'logged-after-approval': 'Hours were logged for this person after you approved the period.',
  'changed-after-paid': 'The hours have changed since this was paid. The payment record is unchanged — the difference is shown as an adjustment.',
};

/**
 * How hard each warning pushes back.
 *
 *   block  the total would be wrong; approving it means approving a wrong number
 *   warn   worth a conscious "yes I know" before money is recorded
 *   info   say it, don't gate on it
 */
export const PAY_WARNING_SEVERITY: Record<PayWarning, 'block' | 'warn' | 'info'> = {
  'no-hours': 'block',
  'missing-rate': 'block',
  unassigned: 'block',
  'no-job': 'info',
  'open-shift': 'warn',
  'long-shift': 'warn',
  overtime: 'info',
  'changed-after-approval': 'warn',
  'logged-after-approval': 'warn',
  'changed-after-paid': 'warn',
};

/** A single entry longer than this is almost always a missed clock-out. */
export const LONG_SHIFT_HOURS = 16;

// -- The row the table renders -----------------------------------------------

export type CrewPayRow = CrewLaborRow & {
  status: PayStatus;
  review: ReviewState;
  payment: PaymentState;
  /** False for labor nobody is attached to — it can't carry a payment record. */
  eligible: boolean;
  ineligibleReason: string | null;
  warnings: PayWarning[];
  blockers: PayWarning[];
  record: PayRecord | null;
  approvedAmount: number | null;
  paidAmount: number | null;
  /**
   * Live estimate minus what was already agreed (or paid). Non-zero means the
   * hours moved after the fact; the stored figures are never rewritten to hide it.
   */
  adjustment: number;
  locked: boolean;
  /** "Paid Jul 31" — the line under the payment badge. */
  paymentLabel: string | null;
  /** "Check · #1042" — the second line, when there's something to say. */
  paymentDetail: string | null;
};

function shortDate(value: string | null): string | null {
  if (!value) return null;
  // A date column comes back as 'YYYY-MM-DD'; parsing that bare would read it as
  // UTC midnight and show the day before for anyone west of Greenwich.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Merge the live hours rollup with whatever has been approved or paid.
 *
 * A crew member with no stored record isn't missing — most people in most
 * periods never need one. Their status is derived from the state of their
 * hours, and a row is only written the first time somebody acts.
 */
export function buildPayRows(
  laborRows: CrewLaborRow[],
  records: PayRecord[],
  context?: { openShiftCrewIds?: string[]; now?: Date },
): CrewPayRow[] {
  const byCrew = new Map(records.map((record) => [record.crewId, record]));
  const openShifts = new Set(context?.openShiftCrewIds ?? []);

  return laborRows.map((row) => {
    const record = row.crewId ? byCrew.get(row.crewId) ?? null : null;
    const warnings: PayWarning[] = [];

    if (row.issues.includes('incomplete-time')) warnings.push('no-hours');
    if (row.issues.includes('missing-rate')) warnings.push('missing-rate');
    if (!row.crewId) warnings.push('unassigned');
    if (row.entries.some((entry) => !entry.jobId)) warnings.push('no-job');
    if (row.crewId && openShifts.has(row.crewId)) warnings.push('open-shift');
    if (row.entries.some((entry) => entry.hours > LONG_SHIFT_HOURS)) warnings.push('long-shift');
    if (row.overtimeHours > 0) warnings.push('overtime');

    const approvedAmount = record && record.approvedAt ? record.approvedAmount : null;
    const paidAmount = record && record.paidAt ? record.paidAmount ?? 0 : null;

    // Compare against what was PAID once there is a payment, and against what
    // was approved before that — the later commitment is the one that matters.
    const baseline = paidAmount ?? approvedAmount;
    const adjustment = baseline === null ? 0 : round2(row.estimatedPay - baseline);
    if (adjustment !== 0) warnings.push(paidAmount === null ? 'changed-after-approval' : 'changed-after-paid');
    const approvedAt = record?.approvedAt;
    if (approvedAt && row.entries.some((entry) => entry.loggedAt > approvedAt)) warnings.push('logged-after-approval');

    const blockers = warnings.filter((warning) => PAY_WARNING_SEVERITY[warning] === 'block');

    // The derived status, used until somebody acts. A stored record always wins
    // — an owner who approved hours with a warning on them meant it.
    const derived: PayStatus = blockers.length > 0 ? 'needs_review' : 'draft';
    const status = record?.status ?? derived;

    return {
      ...row,
      status,
      review: reviewStateOf(status),
      payment: paymentStateOf(status),
      eligible: Boolean(row.crewId),
      ineligibleReason: row.crewId
        ? null
        : 'This labor has no crew member on it, so there is nobody to pay. Assign it to someone first.',
      warnings,
      blockers,
      record,
      approvedAmount,
      paidAmount,
      adjustment,
      locked: record?.locked ?? false,
      paymentLabel:
        record?.paidAt && record.paymentDate ? `Paid ${shortDate(record.paymentDate)}` : record?.sentAt ? 'Sent to payroll' : null,
      paymentDetail: record?.paidAt ? paymentDetailLine(record) : null,
    };
  });
}

/** "Check · #1042" / "Direct deposit". Null when there's nothing extra to say. */
export function paymentDetailLine(record: Pick<PayRecord, 'paymentMethod' | 'paymentReference'>): string | null {
  const method = record.paymentMethod ? PAYMENT_METHOD_LABEL[record.paymentMethod] : null;
  const reference = record.paymentReference?.trim();
  if (method && reference) return `${method} · ${reference}`;
  return method ?? (reference ? `Ref ${reference}` : null);
}

// -- Period state ------------------------------------------------------------

// Every state the period can actually be in, and no more. Each one changes what
// the owner should do next, which is the only reason a status earns its place.
export type PayPeriodState = 'empty' | 'open' | 'needs-review' | 'ready' | 'approved' | 'partially-paid' | 'paid' | 'reopened';

export const PERIOD_STATE_LABEL: Record<PayPeriodState, string> = {
  empty: 'No hours',
  open: 'Open',
  'needs-review': 'Needs review',
  ready: 'Ready to approve',
  approved: 'Approved',
  'partially-paid': 'Partially paid',
  paid: 'Paid',
  reopened: 'Reopened',
};

export const PERIOD_STATE_HELP: Record<PayPeriodState, string> = {
  empty: 'Nothing has been logged against this period yet.',
  open: 'This period is still running, so hours can still land in it.',
  'needs-review': 'Some entries have to be sorted out before these hours can be approved.',
  ready: 'Every entry looks complete. Approve the hours to lock in what they come to.',
  approved: 'Hours are agreed. Nothing has been paid yet.',
  'partially-paid': 'Some of this crew has been marked paid and some has not.',
  paid: 'Everyone with hours in this period has been marked paid.',
  reopened: 'This period was reopened after being closed. Changes made now are on top of what was already paid.',
};

export type PeriodTotals = {
  crewCount: number;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  /** Hours that have actually been agreed — never conflated with hours logged. */
  approvedHours: number;
  estimatedPay: number;
  approvedPay: number;
  paidPay: number;
  unpaidPay: number;
  needsReview: number;
  approved: number;
  unpaid: number;
  paid: number;
  sent: number;
  noHours: number;
  ineligible: number;
  locked: number;
  /** Rows carrying a warning that isn't blocking — the "look at this" count. */
  flagged: number;
};

export function summarizePayTotals(rows: CrewPayRow[]): PeriodTotals {
  const eligible = rows.filter((row) => row.eligible);
  const paidRows = eligible.filter((row) => row.payment === 'paid');
  return {
    crewCount: eligible.length,
    hours: round2(rows.reduce((sum, row) => sum + row.hours, 0)),
    regularHours: round2(rows.reduce((sum, row) => sum + row.regularHours, 0)),
    overtimeHours: round2(rows.reduce((sum, row) => sum + row.overtimeHours, 0)),
    approvedHours: round2(eligible.filter((row) => row.review === 'approved').reduce((sum, row) => sum + row.hours, 0)),
    estimatedPay: round2(rows.reduce((sum, row) => sum + row.estimatedPay, 0)),
    approvedPay: round2(eligible.filter((row) => row.review === 'approved').reduce((sum, row) => sum + row.estimatedPay, 0)),
    // What was RECORDED as paid, not what the hours are worth now — an edit made
    // after payment must not silently change the amount that went out.
    paidPay: round2(paidRows.reduce((sum, row) => sum + (row.paidAmount ?? row.estimatedPay), 0)),
    unpaidPay: round2(eligible.filter((row) => row.payment !== 'paid').reduce((sum, row) => sum + row.estimatedPay, 0)),
    needsReview: eligible.filter((row) => row.review === 'needs_review').length,
    approved: eligible.filter((row) => row.review === 'approved').length,
    unpaid: eligible.filter((row) => row.payment !== 'paid').length,
    paid: paidRows.length,
    sent: eligible.filter((row) => row.payment === 'sent').length,
    noHours: rows.filter((row) => row.hours === 0).length,
    ineligible: rows.filter((row) => !row.eligible).length,
    locked: eligible.filter((row) => row.locked).length,
    flagged: eligible.filter((row) => row.warnings.some((warning) => PAY_WARNING_SEVERITY[warning] === 'warn')).length,
  };
}

export function payPeriodState(
  rows: CrewPayRow[],
  totals: PeriodTotals,
  period: PayPeriod,
  flags?: { reopened?: boolean },
): PayPeriodState {
  if (rows.length === 0) return 'empty';
  // Paid outranks reopened: a period that was reopened and then paid again in
  // full has nothing left to be careful about.
  if (totals.crewCount > 0 && totals.paid === totals.crewCount) return 'paid';
  if (flags?.reopened) return 'reopened';
  if (totals.paid > 0) return 'partially-paid';
  if (totals.needsReview > 0) return 'needs-review';
  if (totals.crewCount > 0 && totals.approved === totals.crewCount) return 'approved';
  if (period.open) return 'open';
  return 'ready';
}

export type PeriodAction = {
  id: 'resolve' | 'review' | 'approve' | 'pay' | 'finish' | 'record';
  label: string;
  help: string;
};

/**
 * The one thing to do next.
 *
 * One primary action per state, deliberately. A screen with three equally loud
 * buttons is a screen where somebody marks a period paid before they've read it.
 */
export function periodPrimaryAction(state: PayPeriodState, totals: PeriodTotals): PeriodAction | null {
  if (state === 'empty') return null;
  if (totals.needsReview > 0) {
    return {
      id: 'review',
      label: `Review ${totals.needsReview} ${totals.needsReview === 1 ? 'entry' : 'entries'}`,
      help: 'Sort these out and the hours can be approved.',
    };
  }
  if (state === 'paid') {
    return { id: 'record', label: 'View payment record', help: 'Everyone with hours in this period has been marked paid.' };
  }
  if (state === 'partially-paid') {
    return {
      id: 'finish',
      label: `Finish payments (${totals.unpaid} left)`,
      help: 'Some of this crew is still unpaid for this period.',
    };
  }
  if (totals.approved === totals.crewCount && totals.crewCount > 0) {
    return { id: 'pay', label: 'Mark period as paid', help: 'Hours are approved. Record the payment once the money goes out.' };
  }
  return {
    id: 'approve',
    label: 'Approve hours',
    help: 'Agree these hours and what they come to, so payment can be recorded against them.',
  };
}

// -- Guards ------------------------------------------------------------------

/** Why this row can't be marked paid, or null when it can. */
export function payBlockedReason(row: CrewPayRow): string | null {
  if (!row.eligible) return row.ineligibleReason;
  if (row.payment === 'paid') return `${row.name} is already marked paid for this period.`;
  if (row.hours <= 0) return `${row.name} has no hours in this period.`;
  if (row.blockers.length > 0) return `${row.name}: ${PAY_WARNING_HELP[row.blockers[0]]}`;
  return null;
}

/** Why the period can't be marked paid in one go, or null when it can. */
export function markPeriodBlockedReason(rows: CrewPayRow[]): string | null {
  const payable = rows.filter((row) => row.eligible && row.hours > 0 && row.payment !== 'paid');
  if (payable.length === 0) return 'There is nobody left to pay in this period.';
  const unapproved = payable.filter((row) => row.review !== 'approved');
  if (unapproved.length > 0) {
    const names = unapproved.slice(0, 3).map((row) => row.name).join(', ');
    const rest = unapproved.length > 3 ? ` and ${unapproved.length - 3} more` : '';
    return `${names}${rest} ${unapproved.length === 1 ? 'has' : 'have'} hours that aren’t approved yet.`;
  }
  // Ineligible rows (labor with nobody on it) don't block the period — they're
  // listed as excluded in the confirmation instead, so the count still adds up.
  return null;
}

/** Everything the confirmation modal has to show before money is recorded. */
export type PayConfirmation = {
  rows: CrewPayRow[];
  crewCount: number;
  hours: number;
  amount: number;
  excluded: { name: string; reason: string }[];
  warnings: { warning: PayWarning; names: string[] }[];
  /** True when the owner has to tick "I've reviewed these" before continuing. */
  requiresAcknowledgement: boolean;
};

export function buildPayConfirmation(rows: CrewPayRow[], selectedIds: string[]): PayConfirmation {
  const wanted = new Set(selectedIds);
  const chosen = rows.filter((row) => wanted.has(row.crewId ?? 'unassigned'));
  const included = chosen.filter((row) => payBlockedReason(row) === null && row.review === 'approved');
  const includedIds = new Set(included.map((row) => row.crewId));
  const excluded = chosen
    .filter((row) => !includedIds.has(row.crewId))
    .map((row) => ({
      name: row.name,
      reason: payBlockedReason(row) ?? `${row.name}’s hours aren’t approved yet.`,
    }));

  const grouped = new Map<PayWarning, string[]>();
  for (const row of included) {
    for (const warning of row.warnings) {
      if (PAY_WARNING_SEVERITY[warning] !== 'warn') continue;
      grouped.set(warning, [...(grouped.get(warning) ?? []), row.name]);
    }
  }

  return {
    rows: included,
    crewCount: included.length,
    hours: round2(included.reduce((sum, row) => sum + row.hours, 0)),
    amount: round2(included.reduce((sum, row) => sum + row.estimatedPay, 0)),
    excluded,
    warnings: [...grouped.entries()].map(([warning, names]) => ({ warning, names })),
    requiresAcknowledgement: grouped.size > 0,
  };
}

// -- Formatting --------------------------------------------------------------

export function payMoney(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

/** "18h 32m" — how a contractor says it, and how the hours column reads. */
export function hoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0h 00m';
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  // 7.999 hours rounds to 8h 00m, not 7h 60m.
  return minutes === 60 ? `${whole + 1}h 00m` : `${whole}h ${String(minutes).padStart(2, '0')}m`;
}

/** "3 days left in this pay period (5 of 7 days)" — the progress line. */
export function periodProgress(period: PayPeriod, now = new Date()): { daysTotal: number; daysDone: number; daysLeft: number } {
  const DAY = 24 * 60 * 60 * 1000;
  const start = new Date(period.startIso).getTime();
  const end = new Date(period.endIso).getTime();
  const daysTotal = Math.max(1, Math.round((end - start) / DAY));
  const elapsed = Math.floor((now.getTime() - start) / DAY);
  const daysDone = Math.max(0, Math.min(daysTotal, elapsed + (now.getTime() >= start ? 1 : 0)));
  return { daysTotal, daysDone, daysLeft: Math.max(0, daysTotal - daysDone) };
}

// -- Export ------------------------------------------------------------------

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The period as a spreadsheet.
 *
 * Approval status and payment status are columns, because a file that only says
 * "Danny, 18.5 hours, $444.80" is the file somebody pays from twice. Exporting
 * changes no status here — it is recorded in the period's history as an export
 * and nothing more.
 */
export function buildPayCsv(rows: CrewPayRow[], rangeLabel: string): string {
  const grid: (string | number)[][] = [
    [
      'Crew member',
      'Role',
      'Regular hours',
      'Overtime hours',
      'Total hours',
      'Rate',
      'Estimated pay',
      'Approval status',
      'Payment status',
      'Payment date',
      'Payment method',
      'Payment reference',
      'Amount paid',
      'Jobs',
      'Pay period',
    ],
    ...rows.map((row) => [
      row.name,
      row.roleLabel ?? '',
      row.regularHours,
      row.overtimeHours,
      row.hours,
      row.rateVaries ? 'Varies' : row.rate ?? '',
      row.estimatedPay.toFixed(2),
      PAY_STATUS_LABEL[reviewStateOf(row.status) === 'approved' ? 'approved' : row.status],
      PAYMENT_STATE_LABEL[row.payment],
      row.record?.paymentDate ?? '',
      row.record?.paymentMethod ? PAYMENT_METHOD_LABEL[row.record.paymentMethod] : '',
      row.record?.paymentReference ?? '',
      row.paidAmount === null ? '' : row.paidAmount.toFixed(2),
      row.jobIds.length,
      rangeLabel,
    ]),
  ];
  return grid.map((line) => line.map(csvCell).join(',')).join('\n');
}

// -- Audit -------------------------------------------------------------------

export type PayEventAction =
  | 'hours_approved'
  | 'approval_undone'
  | 'marked_sent'
  | 'marked_paid'
  | 'paid_undone'
  | 'period_closed'
  | 'period_reopened'
  | 'entry_unlocked'
  | 'export_created';

export const PAY_EVENT_LABEL: Record<PayEventAction, string> = {
  hours_approved: 'Hours approved',
  approval_undone: 'Approval undone',
  marked_sent: 'Sent to payroll',
  marked_paid: 'Marked paid',
  paid_undone: 'Paid status undone',
  period_closed: 'Period closed',
  period_reopened: 'Period reopened',
  entry_unlocked: 'Entry unlocked',
  export_created: 'Export created',
};

export type PayEvent = {
  id: string;
  action: PayEventAction;
  summary: string;
  actorEmail: string | null;
  reason: string | null;
  crewId: string | null;
  crewName: string | null;
  createdAt: string;
};
