// Proof-to-Pay milestones — the rules.
//
// A milestone is a named stage of work carrying what was promised, the proof it
// happened, and the amount due. The one thing that makes it more than a label is
// the GATE: a payment cannot be requested until the proof exists.
//
// That gate is enforced server-side in requestMilestonePayment. Everything here
// is pure, so what blocks a request is testable, and so the button's disabled
// state and the server's refusal are computed by the same function rather than
// drifting into disagreement.

export type MilestoneKind = 'deposit' | 'stage' | 'final';
export type PhotoPhase = 'before' | 'after';

export type Milestone = {
  id: string;
  title: string;
  scope: string | null;
  amount: number;
  sortOrder: number;
  kind: MilestoneKind;
  requireBeforePhotos: number;
  requireAfterPhotos: number;
  submittedAt: string | null;
  paymentId: string | null;
};

export type MilestoneTask = { id: string; title: string; done: boolean };
export type MilestonePhoto = { id: string; path: string; phase: PhotoPhase; caption: string | null; url?: string };

/** The payment behind a milestone, once one has been requested. */
export type MilestonePayment = {
  id: string;
  status: 'requested' | 'processing' | 'paid' | 'failed' | 'refunded' | 'disputed';
  amount: number;
};

export type MilestoneProof = {
  tasks: MilestoneTask[];
  photos: MilestonePhoto[];
};

export type MilestoneStatus =
  /** Defined, no work proven yet. */
  | 'planned'
  /** Some proof in, not all of it. */
  | 'in_progress'
  /** Everything required is there. The contractor can ask to be paid. */
  | 'ready'
  /** Asked for. The homeowner has a Pay button. */
  | 'awaiting_payment'
  | 'paid'
  /** Money came back. Deliberately its own state — not "unpaid". */
  | 'refunded'
  | 'failed';

// -- The gate -----------------------------------------------------------------

export type Readiness = {
  ready: boolean;
  /** Specific and actionable. "Not ready" on its own is a dead end for the user. */
  blockers: string[];
  tasksDone: number;
  tasksTotal: number;
  beforeCount: number;
  afterCount: number;
};

export function countPhotos(photos: MilestonePhoto[], phase: PhotoPhase): number {
  return photos.filter((photo) => photo.phase === phase).length;
}

/**
 * Can this milestone's payment be requested?
 *
 * Every blocker names what is missing and how much of it. A contractor looking
 * at a disabled button needs to know which two photos to go and take, not that
 * the system is unhappy with them.
 */
export function milestoneReadiness(milestone: Milestone, proof: MilestoneProof): Readiness {
  const tasksTotal = proof.tasks.length;
  const tasksDone = proof.tasks.filter((task) => task.done).length;
  const beforeCount = countPhotos(proof.photos, 'before');
  const afterCount = countPhotos(proof.photos, 'after');

  const blockers: string[] = [];

  // Money first: it's the one blocker that isn't about site work, and the one a
  // contractor will otherwise hunt for after clearing everything else.
  if (!(milestone.amount > 0)) blockers.push('Set an amount for this milestone.');

  const outstanding = tasksTotal - tasksDone;
  if (outstanding > 0) {
    blockers.push(`${outstanding} of ${tasksTotal} checklist item${tasksTotal === 1 ? '' : 's'} still to tick off.`);
  }

  const beforeShort = milestone.requireBeforePhotos - beforeCount;
  if (beforeShort > 0) {
    blockers.push(`Add ${beforeShort} more “before” photo${beforeShort === 1 ? '' : 's'}.`);
  }
  const afterShort = milestone.requireAfterPhotos - afterCount;
  if (afterShort > 0) {
    blockers.push(`Add ${afterShort} more “after” photo${afterShort === 1 ? '' : 's'}.`);
  }

  return { ready: blockers.length === 0, blockers, tasksDone, tasksTotal, beforeCount, afterCount };
}

/**
 * Where this milestone stands.
 *
 * The PAYMENT is the source of truth once one exists — a milestone whose payment
 * was refunded is 'refunded', not 'paid' and not 'ready', because pretending it
 * is either would let the same work be billed twice or look unbilled forever.
 */
export function milestoneStatus(
  milestone: Milestone,
  proof: MilestoneProof,
  payment: MilestonePayment | null,
): MilestoneStatus {
  if (payment) {
    if (payment.status === 'paid') return 'paid';
    if (payment.status === 'refunded') return 'refunded';
    if (payment.status === 'failed') return 'failed';
    // requested / processing / disputed all mean "asked for, not settled".
    return 'awaiting_payment';
  }

  const readiness = milestoneReadiness(milestone, proof);
  if (readiness.ready) return 'ready';

  const started = readiness.tasksDone > 0 || readiness.beforeCount > 0 || readiness.afterCount > 0;
  return started ? 'in_progress' : 'planned';
}

/** Whether a fresh payment request is allowed. */
export function canRequestPayment(
  milestone: Milestone,
  proof: MilestoneProof,
  payment: MilestonePayment | null,
): boolean {
  // A live request blocks another. A refused or refunded one does not — the
  // work still happened, and the contractor has to be able to ask again.
  if (payment && ['requested', 'processing', 'paid', 'disputed'].includes(payment.status)) return false;
  return milestoneReadiness(milestone, proof).ready;
}

// -- Progress -----------------------------------------------------------------

/**
 * How far through the proof this milestone is, 0-100.
 *
 * Counts photos toward progress only up to what was REQUIRED: a tenth "after"
 * photo is not more evidence than the two that were asked for, and letting it
 * push the bar past everything else would make the number meaningless.
 */
export function milestoneProgressPct(milestone: Milestone, proof: MilestoneProof): number {
  const required =
    proof.tasks.length + milestone.requireBeforePhotos + milestone.requireAfterPhotos;
  if (required === 0) return milestone.amount > 0 ? 100 : 0;

  const done =
    proof.tasks.filter((task) => task.done).length +
    Math.min(milestone.requireBeforePhotos, countPhotos(proof.photos, 'before')) +
    Math.min(milestone.requireAfterPhotos, countPhotos(proof.photos, 'after'));

  return Math.round((done / required) * 100);
}

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  planned: 'Not started',
  in_progress: 'In progress',
  ready: 'Ready to bill',
  awaiting_payment: 'Payment requested',
  paid: 'Paid',
  refunded: 'Refunded',
  failed: 'Payment failed',
};

/** What the HOMEOWNER sees. Never "ready to bill" — that is not their news. */
export const MILESTONE_STATUS_CLIENT_LABEL: Record<MilestoneStatus, string> = {
  planned: 'Not started yet',
  in_progress: 'In progress',
  ready: 'Work complete',
  awaiting_payment: 'Ready to pay',
  paid: 'Paid',
  refunded: 'Refunded',
  failed: 'Payment did not go through',
};

// -- Money --------------------------------------------------------------------

export type MilestoneTotals = {
  planned: number;
  paid: number;
  /** Requested but not settled — money the homeowner has been asked for. */
  awaiting: number;
  /** Proven and unbilled: work done that nobody has asked to be paid for. */
  readyToBill: number;
};

/**
 * The four numbers an owner wants from a staged job.
 *
 * readyToBill is the one worth surfacing: it is work the crew finished and
 * proved, sitting there un-invoiced. That is the number this whole feature
 * exists to make visible.
 */
export function milestoneTotals(
  entries: Array<{ milestone: Milestone; proof: MilestoneProof; payment: MilestonePayment | null }>,
): MilestoneTotals {
  const totals: MilestoneTotals = { planned: 0, paid: 0, awaiting: 0, readyToBill: 0 };

  for (const entry of entries) {
    const amount = Number(entry.milestone.amount) || 0;
    totals.planned += amount;
    const status = milestoneStatus(entry.milestone, entry.proof, entry.payment);
    if (status === 'paid') totals.paid += Number(entry.payment?.amount ?? amount) || 0;
    else if (status === 'awaiting_payment') totals.awaiting += amount;
    else if (status === 'ready') totals.readyToBill += amount;
  }

  return {
    planned: round(totals.planned),
    paid: round(totals.paid),
    awaiting: round(totals.awaiting),
    readyToBill: round(totals.readyToBill),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Whether the milestones add up to the quote.
 *
 * Advisory, never blocking: a job that grew mid-build legitimately bills more
 * than it was quoted, and refusing that would just push people back to
 * off-system invoices. But an owner who has split £8,000 of work into £6,000 of
 * milestones should be told before they discover it at the end.
 */
export function milestoneCoverage(
  totalPlanned: number,
  quotedAmount: number,
): { difference: number; note: string | null } {
  const quoted = Number(quotedAmount) || 0;
  if (quoted <= 0 || totalPlanned <= 0) return { difference: 0, note: null };

  const difference = round(totalPlanned - quoted);
  // Ignore rounding dust — a £2 gap on an £8,000 job is not worth a warning.
  if (Math.abs(difference) < Math.max(1, quoted * 0.005)) return { difference: 0, note: null };

  return {
    difference,
    note: difference < 0
      ? `Your milestones come to ${money(totalPlanned)} of the ${money(quoted)} quoted — ${money(Math.abs(difference))} isn’t in a stage yet.`
      : `Your milestones come to ${money(totalPlanned)}, which is ${money(difference)} more than the ${money(quoted)} quoted.`,
  };
}

function money(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

/** Sensible starting stages for a contractor who has never made one. */
export const MILESTONE_PRESETS: Array<{ title: string; kind: MilestoneKind; percent: number; scope: string }> = [
  { title: 'Deposit', kind: 'deposit', percent: 25, scope: 'Booking confirmed and materials ordered.' },
  { title: 'Work started', kind: 'stage', percent: 25, scope: 'On site, prep and demolition complete.' },
  { title: 'Main work complete', kind: 'stage', percent: 30, scope: 'The bulk of the installation is finished.' },
  { title: 'Final sign-off', kind: 'final', percent: 20, scope: 'Everything finished, site cleared, walkthrough done.' },
];

/**
 * Split a quote across the preset stages.
 *
 * The last stage absorbs the rounding so the parts always sum to the whole —
 * milestones that add up to $9,999.98 of a $10,000 job is the kind of detail
 * that makes a customer distrust the rest of the document.
 */
export function presetAmounts(quotedAmount: number): number[] {
  const total = Math.max(0, Number(quotedAmount) || 0);
  if (total <= 0) return MILESTONE_PRESETS.map(() => 0);

  const amounts = MILESTONE_PRESETS.map((preset) => Math.round(total * (preset.percent / 100) * 100) / 100);
  const drift = round(total - amounts.reduce((sum, amount) => sum + amount, 0));
  amounts[amounts.length - 1] = round(amounts[amounts.length - 1] + drift);
  return amounts;
}
