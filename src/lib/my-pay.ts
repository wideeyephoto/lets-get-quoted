// The crew member's own view of their hours and pay.
//
// Everything in Hours & pay answers the owner's question — who do I owe, and
// when. This answers the other one, which nobody could ask before: what have I
// got coming, and is it right. A crew member clocks in and out all week and
// then finds out what it came to when the money lands, which is the worst
// possible moment to discover a shift is missing.
//
// The frozen approval lines exist to SETTLE that argument after the fact. Shown
// here, before payday, they mostly prevent it.
//
// Pure and clock-free — the caller passes today. Client-safe: no server imports,
// so the field app can render any of this either side of the boundary.

import type { PayDayView } from './pay-day';
import type { RoundingRule } from './labor-settings';

/** One piece of work, either as logged or as frozen into an approval. */
export type MyPayLine = {
  /**
   * The labor row this came from. Null only on a frozen line whose cost has
   * since been removed — which is exactly the case worth showing, so it can't
   * just be dropped.
   */
  costId: string | null;
  jobId: string | null;
  description: string;
  loggedAt: string;
  hours: number;
  rate: number;
  amount: number;
};

// -- Where this period stands ------------------------------------------------

export type MyPayStage = 'open' | 'pending' | 'approved' | 'sent' | 'paid';

export type MyPayStanding = {
  stage: MyPayStage;
  /** Hours behind the amount, from the best source available at this stage. */
  hours: number;
  amount: number;
  headline: string;
  detail: string;
  tone: 'ok' | 'warn' | 'alert' | 'muted';
};

/** Just enough of the owner's pay record for the crew member's own row. */
export type MyPayRecord = {
  status: 'draft' | 'needs_review' | 'approved' | 'sent' | 'paid';
  regularHours: number;
  overtimeHours: number;
  approvedAmount: number;
  approvedAt: string | null;
  paidAmount: number | null;
  paymentDate: string | null;
  paymentMethod: string | null;
};

/**
 * Where this period stands, in the crew member's terms.
 *
 * The amount comes from whichever source is furthest along: what was actually
 * paid, else what was approved, else what the logged hours currently come to.
 * Reading the live total for an already-approved period would show a number
 * nobody has agreed to — and a number that moves after it was agreed is the
 * thing this whole screen exists to make visible, not to paper over.
 */
export function myPayStanding(input: {
  record: MyPayRecord | null;
  loggedHours: number;
  loggedAmount: number;
  /** False while the period is still running, so nothing is late yet. */
  periodOver: boolean;
  payDay: PayDayView;
  /** For "paid on Friday" — the caller formats dates, this only picks words. */
  formatDate: (dateKey: string) => string;
}): MyPayStanding {
  const { record, loggedHours, loggedAmount, periodOver, payDay, formatDate } = input;

  if (record?.status === 'paid') {
    const amount = record.paidAmount ?? record.approvedAmount;
    const on = record.paymentDate ? formatDate(record.paymentDate) : null;
    return {
      stage: 'paid',
      hours: record.regularHours + record.overtimeHours,
      amount,
      headline: `Paid ${money(amount)}`,
      detail: [on ? `Sent ${on}` : 'Recorded as paid', record.paymentMethod ? methodLabel(record.paymentMethod) : null]
        .filter(Boolean)
        .join(' · '),
      tone: 'ok',
    };
  }

  if (record?.status === 'sent') {
    return {
      stage: 'sent',
      hours: record.regularHours + record.overtimeHours,
      amount: record.approvedAmount,
      headline: `${money(record.approvedAmount)} on the way`,
      // "Sent to payroll" is not the same as paid, and saying so plainly is
      // kinder than letting someone plan around money that hasn't moved.
      detail: `Your hours went to payroll. ${payDay.label}.`,
      tone: payDay.tone === 'alert' ? 'warn' : payDay.tone,
    };
  }

  if (record?.status === 'approved') {
    return {
      stage: 'approved',
      hours: record.regularHours + record.overtimeHours,
      amount: record.approvedAmount,
      headline: `${money(record.approvedAmount)} approved`,
      detail: `${payDay.label}.`,
      tone: payDay.tone,
    };
  }

  if (!periodOver) {
    return {
      stage: 'open',
      hours: loggedHours,
      amount: loggedAmount,
      headline: `${money(loggedAmount)} so far`,
      detail: loggedHours > 0 ? `${hoursLabel(loggedHours)} logged this period. ${payDay.label}.` : `Nothing logged yet. ${payDay.label}.`,
      // A period still running can't be late, whatever the pay day says.
      tone: 'muted',
    };
  }

  return {
    stage: 'pending',
    hours: loggedHours,
    amount: loggedAmount,
    headline: `${money(loggedAmount)} waiting`,
    detail:
      loggedHours > 0
        ? `${hoursLabel(loggedHours)} logged. Not approved yet. ${payDay.label}.`
        : `No hours logged in this period.`,
    tone: loggedHours > 0 ? payDay.tone : 'muted',
  };
}

// -- Does what was approved match what was worked? ---------------------------

export type MyPayCheck = {
  loggedHours: number;
  approvedHours: number;
  /**
   * Logged after the approval was made, so genuinely not part of this payment.
   * Informational — this is normal, not a problem, and saying so stops it
   * reading as a missing shift.
   */
  loggedAfter: MyPayLine[];
  /** Logged BEFORE the approval and absent from it. The one worth asking about. */
  notIncluded: MyPayLine[];
  /** In the approval, but the live entry no longer says the same thing. */
  adjusted: Array<{ approved: MyPayLine; nowHours: number; nowRate: number }>;
  /** In the approval, and the entry behind it is gone. */
  removed: MyPayLine[];
  /** True when there is nothing to explain. */
  clean: boolean;
};

/**
 * Rounding moves an entry's hours legitimately, so a difference smaller than
 * the rule can produce is not a discrepancy — it's the rule. Flagging it would
 * teach a crew member to ignore this screen within about a week.
 */
export function toleranceFor(rounding: RoundingRule): number {
  if (rounding === 'quarter') return 0.125 + 0.0001;
  if (rounding === 'tenth') return 0.05 + 0.0001;
  return 0.005;
}

/**
 * Compare what was frozen at approval against what stands now.
 *
 * Matched on cost id, because that is the only thing both sides genuinely share
 * — descriptions get edited and timestamps get rounded. A frozen line whose
 * cost id is null has lost its anchor and is reported as removed, which is
 * true: whatever it was built from is no longer there.
 */
export function checkMyPay(input: {
  /** The live labor entries in this period. */
  logged: MyPayLine[];
  /** The lines frozen into the approval, empty when nothing is approved. */
  approved: MyPayLine[];
  approvedAt: string | null;
  tolerance?: number;
}): MyPayCheck {
  const tolerance = input.tolerance ?? 0.005;
  const loggedById = new Map(input.logged.filter((line) => line.costId).map((line) => [line.costId as string, line] as const));
  const approvedIds = new Set(input.approved.map((line) => line.costId).filter(Boolean) as string[]);

  const adjusted: MyPayCheck['adjusted'] = [];
  const removed: MyPayLine[] = [];

  for (const line of input.approved) {
    const live = line.costId ? loggedById.get(line.costId) : undefined;
    if (!live) {
      removed.push(line);
      continue;
    }
    if (Math.abs(live.hours - line.hours) > tolerance || Math.abs(live.rate - line.rate) > 0.005) {
      adjusted.push({ approved: line, nowHours: live.hours, nowRate: live.rate });
    }
  }

  const loggedAfter: MyPayLine[] = [];
  const notIncluded: MyPayLine[] = [];
  if (input.approved.length > 0) {
    for (const line of input.logged) {
      if (line.costId && approvedIds.has(line.costId)) continue;
      // No approval timestamp means we can't tell "added later" from "left out",
      // and the safer of the two to claim is the harmless one.
      if (!input.approvedAt || line.loggedAt > input.approvedAt) loggedAfter.push(line);
      else notIncluded.push(line);
    }
  }

  return {
    loggedHours: round2(input.logged.reduce((sum, line) => sum + line.hours, 0)),
    approvedHours: round2(input.approved.reduce((sum, line) => sum + line.hours, 0)),
    loggedAfter,
    notIncluded,
    adjusted,
    removed,
    clean: notIncluded.length === 0 && adjusted.length === 0 && removed.length === 0,
  };
}

/** One sentence naming what doesn't match, or null when everything does. */
export function checkSentence(check: MyPayCheck): string | null {
  const parts: string[] = [];
  if (check.notIncluded.length > 0) parts.push(`${count(check.notIncluded.length, 'entry', 'entries')} you logged before this was approved ${check.notIncluded.length === 1 ? 'is' : 'are'} not in it`);
  if (check.adjusted.length > 0) parts.push(`${count(check.adjusted.length, 'entry', 'entries')} changed after it was approved`);
  if (check.removed.length > 0) parts.push(`${count(check.removed.length, 'entry', 'entries')} behind it ${check.removed.length === 1 ? 'has' : 'have'} been removed`);
  if (parts.length === 0) return null;
  return `${sentenceJoin(parts)}. Worth asking about before payday.`;
}

// -- Small shared formatting -------------------------------------------------

/** "7h 30m" — how somebody says it out loud, not "7.5 h". */
export function hoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0h';
  const whole = Math.floor(hours + 1e-9);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 60) return `${whole + 1}h`;
  if (whole === 0) return `${minutes}m`;
  return minutes === 0 ? `${whole}h` : `${whole}h ${minutes}m`;
}

export function money(amount: number): string {
  return `$${(Math.round((Number(amount) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  transfer: 'Bank transfer',
  payroll: 'Payroll',
  other: 'Other',
};

export function methodLabel(method: string): string {
  return METHOD_LABEL[method] ?? method;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function sentenceJoin(parts: string[]): string {
  if (parts.length === 1) return capitalize(parts[0]);
  if (parts.length === 2) return capitalize(`${parts[0]}, and ${parts[1]}`);
  return capitalize(`${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
