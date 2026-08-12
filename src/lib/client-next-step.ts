// Straight from money-format rather than through lib/jobs, which re-exports it:
// this module is pure arithmetic-free string picking and has no business
// pulling the quote/costing module in behind it.
import { formatUsdExact } from './money-format';

/**
 * WHAT THE CUSTOMER DOES NEXT, decided once.
 *
 * The customer's job page ends in a rail that says what is left to do and gives
 * them a button that does it. Those were three separate ternaries over the same
 * five conditions — the sentence, the href, and the button label — and they did
 * not agree with each other. The sentence checked for an unfunded payment plan
 * BEFORE an open scheduling request; the href and the label checked scheduling
 * first. So an approved job with both showed:
 *
 *     "Set up how you would like to pay, and the job is booked in."
 *     [ Choose a start date ]  →  #dates
 *
 * …and #dates is not on that page. `scheduleSection` is explicitly null while a
 * plan is pending its deposit (dates come after the money is arranged), so the
 * button pointed at an anchor that had not been rendered and clicking it did
 * nothing at all — no navigation, no error, on the one screen where the customer
 * is trying to give somebody money.
 *
 * A dead anchor cannot be fixed by correcting one branch, because the shape is
 * what produced it: three lists in three orders, edited one at a time. This is
 * one ordered list of candidates, each carrying its own sentence, link and
 * label, and the first one that applies wins all three. Adding a step means
 * adding a row, and the three can no longer disagree.
 *
 * ORDER IS THE SPEC, and it mirrors what the page actually renders:
 *   1. A deposit that is due — the page gates everything else behind it.
 *   2. A payment plan waiting to be set up — `scheduleSection` renders null in
 *      this state, so scheduling MUST NOT be offered above it.
 *   3. An open scheduling request.
 *   4. A payment waiting.
 *   5. A start date already confirmed, which is news rather than a task, so it
 *      sits below anything that still needs doing.
 */
export type NextStep = {
  /** The sentence in the rail. */
  copy: string;
  /** Where the button goes. Null when there is nothing for them to do. */
  href: string | null;
  /** The button's words. Null exactly when href is. */
  label: string | null;
};

export type NextStepInput = {
  businessName: string;
  /** A deposit request that is still unpaid. */
  depositPayment: { id: string; amount: number } | null;
  /** `plan?.status`, or null when there is no payment plan. */
  planStatus: string | null;
  /** A scheduling request the customer can still answer. */
  scheduleOpen: boolean;
  /** The confirmed start date, already formatted, or null. */
  scheduledLabel: string | null;
  /** The first still-open payment request, if any. */
  openPayment: { id: string; amount: number } | null;
};

export function clientNextStep(input: NextStepInput): NextStep {
  const { businessName, depositPayment, planStatus, scheduleOpen, scheduledLabel, openPayment } = input;

  const candidates: (NextStep | null)[] = [
    depositPayment
      ? {
          copy: 'Your deposit is the last step before the work is booked in.',
          href: `/pay/${depositPayment.id}`,
          label: `Pay ${formatUsdExact(depositPayment.amount)} deposit`,
        }
      : null,
    planStatus === 'pending_deposit'
      ? {
          copy: 'Set up how you would like to pay, and the job is booked in.',
          // #plan, NOT #dates. This is the case that was broken: the dates
          // section does not exist while a plan is pending.
          href: '#plan',
          label: 'Set up payment',
        }
      : null,
    scheduleOpen
      ? { copy: 'Choose the start date that suits you.', href: '#dates', label: 'Choose a start date' }
      : null,
    openPayment
      ? {
          copy: 'There is one payment waiting below.',
          href: `/pay/${openPayment.id}`,
          label: `Pay ${formatUsdExact(openPayment.amount)}`,
        }
      : null,
    scheduledLabel ? { copy: `See you on ${scheduledLabel}.`, href: null, label: null } : null,
  ];

  return (
    candidates.find((candidate): candidate is NextStep => candidate !== null) ?? {
      copy: `${businessName} will be in touch about scheduling.`,
      href: null,
      label: null,
    }
  );
}
