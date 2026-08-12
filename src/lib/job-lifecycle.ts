/**
 * WHERE A JOB IS, AND WHAT IS OWED ON IT — decided once.
 *
 * The job record could say four things about itself at the same time. One real
 * page showed: a "Scheduled" badge, "In progress" selected in the Job Details
 * form, a "Job started" button, an "I'm on my way" panel, and a dominant "Mark
 * Job Completed" — for a job whose service date had not arrived. Every one of
 * those was reading a different signal (the badge derives from payments and
 * invoices, the form shows the raw `job_status` enum, the buttons check their
 * own preconditions), and none of them was wrong on its own terms.
 *
 * The money had the same shape of problem in a more expensive place. A $99.94
 * quote, a "$100" summary, two $250 deposit requests already sent, and a
 * pipeline still cheerfully advising "Request payment". Nothing anywhere added
 * up what had been asked for against what had been agreed.
 *
 * So: one ladder of stages, one primary action per stage, and one money summary
 * that subtracts. Pure and dependency-free — every caller derives, nobody
 * invents.
 */

export type JobStage =
  | 'pricing'
  | 'quote_sent'
  | 'approved'
  | 'scheduled'
  | 'in_progress'
  | 'complete'
  | 'settled'
  | 'archived';

/** The order they happen in, for progress rails and for "have we passed X". */
export const JOB_STAGE_ORDER: JobStage[] = [
  'pricing',
  'quote_sent',
  'approved',
  'scheduled',
  'in_progress',
  'complete',
  'settled',
];

export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  pricing: 'Quote needed',
  quote_sent: 'Awaiting approval',
  approved: 'Approved — needs a date',
  scheduled: 'Scheduled',
  in_progress: 'Work in progress',
  complete: 'Work finished — payment due',
  settled: 'Complete',
  archived: 'Archived',
};

export type JobStageInput = {
  status: string;
  quotedAmount: number;
  startedAt: string | null;
  scheduledFor: string | null;
  /** Live client-view links. Zero means the customer has never been sent it. */
  clientLinkCount: number;
  /** Everything still owed on the job, in cents. */
  remainingCents: number;
};

export function jobStage(input: JobStageInput): JobStage {
  if (input.status === 'archived') return 'archived';
  if (input.status === 'complete') return input.remainingCents > 0 ? 'complete' : 'settled';
  if (input.startedAt) return 'in_progress';
  // Accepted, by any of the routes that count as acceptance.
  if (input.status !== 'new_lead') return input.scheduledFor ? 'scheduled' : 'approved';
  if (!(input.quotedAmount > 0)) return 'pricing';
  return input.clientLinkCount > 0 ? 'quote_sent' : 'pricing';
}

/**
 * THE ONE BUTTON THAT SHOULD LOOK LIKE A BUTTON, for this stage.
 *
 * `key` names an action the page already has; the page maps it to the control.
 * Null means no single next step is obvious, and the page should not manufacture
 * urgency — an unapproved quote is waiting on somebody else, and nothing the
 * contractor presses changes that.
 *
 * "Mark job complete" is deliberately absent before `in_progress`. It was the
 * loudest control on a page for a job that had not started, which is an
 * invitation to close a job early and then unpick the review text that went out
 * with it.
 */
export type PrimaryActionKey =
  | 'price'
  | 'send_quote'
  | 'schedule'
  | 'start'
  | 'complete'
  | 'request_payment'
  | 'request_review';

export type PrimaryAction = { key: PrimaryActionKey; label: string } | null;

export function primaryJobAction(
  stage: JobStage,
  input: {
    /** The account's own today, as YYYY-MM-DD. Never the server's UTC date. */
    todayKey: string;
    scheduledFor: string | null;
    reviewConfigured: boolean;
    reviewAlreadyRequested: boolean;
  },
): PrimaryAction {
  switch (stage) {
    case 'pricing':
      return { key: 'price', label: 'Price this job' };
    case 'quote_sent':
      // Waiting on the customer. Nothing here is the contractor's move.
      return null;
    case 'approved':
      return { key: 'schedule', label: 'Schedule the work' };
    case 'scheduled':
      // Only from the day itself. Starting a job three days early is a typo,
      // not an intention, and the button that invites it should not be the
      // brightest thing on the screen until the day arrives.
      return input.scheduledFor && input.scheduledFor <= input.todayKey
        ? { key: 'start', label: 'Job started' }
        : null;
    case 'in_progress':
      return { key: 'complete', label: 'Mark job complete' };
    case 'complete':
      return { key: 'request_payment', label: 'Request payment' };
    case 'settled':
      return input.reviewConfigured && !input.reviewAlreadyRequested
        ? { key: 'request_review', label: 'Request a review' }
        : null;
    default:
      return null;
  }
}

/**
 * WHAT THE JOB IS WAITING ON, when the answer is "not you".
 *
 * primaryJobAction returns null in three states, and a hero with no bright
 * control and no sentence reads as a page that has run out of things to say.
 * It hasn't — it is waiting on the customer, on the calendar, or on nothing at
 * all, and those are different enough to be worth naming.
 *
 * Deliberately not an action. Manufacturing a button here is how "Request
 * payment" ended up beside "Mark Job Completed" on a job three days from its
 * start date: every stage got offered every control because no stage was
 * allowed to say "nothing yet".
 */
export function jobWaitNote(
  stage: JobStage,
  input: {
    clientName: string;
    /** The booked day, already formatted for reading. */
    scheduledLabel: string | null;
    reviewAlreadyRequested: boolean;
  },
): string | null {
  const who = input.clientName?.trim() || 'the customer';
  switch (stage) {
    case 'quote_sent':
      return `Waiting on ${who} to approve the quote.`;
    case 'scheduled':
      // Reached only when primaryJobAction declined to offer "Job started",
      // which is exactly when the booked day has not arrived.
      return input.scheduledLabel
        ? `Booked for ${input.scheduledLabel}. The start button turns on that morning.`
        : null;
    case 'settled':
      return input.reviewAlreadyRequested
        ? `Nothing outstanding — ${who} has already been asked for a review.`
        : 'Nothing outstanding on this job.';
    default:
      return null;
  }
}

/* --- the money, subtracted ------------------------------------------------- */

export type PaymentLike = { amount: number | string; status: string };

export type JobMoney = {
  /** What the customer agreed to: the quote plus approved change orders. */
  approvedCents: number;
  /** Asked for and not yet settled — requested plus processing. */
  requestedCents: number;
  paidCents: number;
  /** approved − paid − requested. NEGATIVE when more has been asked for than agreed. */
  remainingCents: number;
  /** How far past the approved total the asks have gone. Zero when they haven't. */
  overRequestedCents: number;
};

const cents = (value: number | string): number => Math.round((Number(value) || 0) * 100);

export function jobMoney(input: {
  quotedAmount: number;
  /** Approved change orders only — a pending one has not changed the deal. */
  approvedChangeOrderTotal?: number;
  payments: PaymentLike[];
}): JobMoney {
  const approvedCents = cents(input.quotedAmount) + cents(input.approvedChangeOrderTotal ?? 0);
  let requestedCents = 0;
  let paidCents = 0;
  for (const payment of input.payments) {
    // 'refunded' counts as neither: the money came back, and the request that
    // carried it is spent. 'failed' is not an outstanding ask either — it is a
    // thing to retry, and retrying re-raises it.
    if (payment.status === 'paid') paidCents += cents(payment.amount);
    else if (payment.status === 'requested' || payment.status === 'processing') requestedCents += cents(payment.amount);
  }
  const remainingCents = approvedCents - paidCents - requestedCents;
  return {
    approvedCents,
    requestedCents,
    paidCents,
    remainingCents,
    overRequestedCents: Math.max(0, -remainingCents),
  };
}

/**
 * Whether a NEW ask for `amountCents` would take the job past what was agreed.
 *
 * Not a refusal on its own — a contractor genuinely may need to collect more
 * than the quote (a change agreed on site, a price that moved). It is a
 * confirmation: the page states the overage in figures and the request goes
 * through only when somebody says yes to that sentence.
 */
export function overageForNewRequest(money: JobMoney, amountCents: number): number {
  if (money.approvedCents <= 0) return 0; // nothing agreed to exceed
  return Math.max(0, money.paidCents + money.requestedCents + Math.max(0, amountCents) - money.approvedCents);
}

/**
 * Whether splitting this job into stages is worth offering.
 *
 * "Split $99.94 into 4 stages" is the product talking to itself. Staged
 * payments earn their complexity on a job big enough that a homeowner would
 * hesitate to pay it all up front, and a multi-day job where proof of progress
 * is the thing being paid for.
 */
export const STAGE_SUGGESTION_MIN_CENTS = 150000; // $1,500

export function shouldSuggestStages(input: { quotedAmount: number; estimatedHours: number | null; dayHours?: number }): boolean {
  if (cents(input.quotedAmount) >= STAGE_SUGGESTION_MIN_CENTS) return true;
  const dayHours = input.dayHours && input.dayHours > 0 ? input.dayHours : 8;
  return (input.estimatedHours ?? 0) > dayHours * 1.5;
}
