import type { Permission } from '@/lib/staff';

/**
 * What resolving a Quick Stop actually does, and therefore what it takes.
 *
 * The four outcomes in the console's "Resolve / adjudicate" dropdown are not
 * one action. Two of them issue a 100% Stripe refund of the fee, pulling money
 * back out of the contractor's connected account, and one of those also writes
 * an account-wide Quick Stop lock. The other two set a status for the record.
 *
 * All four used to sit behind `account.support`, which is what the weakest of
 * them needs — so support, risk and ops could each move money without holding
 * money.refund, while the refund box directly above on the same page correctly
 * refused them and said "refunds need the finance role".
 *
 * This lives in its own pure module because the policy had two homes: the
 * server action enforcing it and the dropdown deciding what to offer. Two
 * copies of an authorization rule drift, and the direction they drift in is
 * always "the UI offers something the server refuses" — which costs a staff
 * member their typed note to a crash, or worse, quietly stops matching.
 */

export const QUICK_STOP_OUTCOMES = ['no_show', 'contractor_cancel', 'completed', 'disputed'] as const;

export type QuickStopOutcome = (typeof QUICK_STOP_OUTCOMES)[number];

export function isQuickStopOutcome(value: string): value is QuickStopOutcome {
  return (QUICK_STOP_OUTCOMES as readonly string[]).includes(value);
}

type OutcomeSpec = {
  label: string;
  /** ALL of these are required. An outcome crossing two boundaries needs both. */
  permissions: readonly Permission[];
};

export const QUICK_STOP_OUTCOME: Record<QuickStopOutcome, OutcomeSpec> = {
  // Refunds in full AND locks the account's Quick Stops on an escalating tier
  // (10 days → 30 days → effectively indefinite). The lock writes the same two
  // columns the console gates on account.enforce, so this needs both.
  no_show: { label: 'No-show (full refund + record)', permissions: ['money.refund', 'account.enforce'] },
  // Refunds in full. No enforcement side effect.
  contractor_cancel: { label: 'Contractor cancel (full refund)', permissions: ['money.refund'] },
  // Record-keeping only.
  completed: { label: 'Mark completed', permissions: ['account.support'] },
  disputed: { label: 'Flag as disputed', permissions: ['account.support'] },
};

/** The outcomes a role may actually submit — what the dropdown should offer. */
export function allowedQuickStopOutcomes(granted: readonly Permission[]): QuickStopOutcome[] {
  return QUICK_STOP_OUTCOMES.filter((key) =>
    QUICK_STOP_OUTCOME[key].permissions.every((p) => granted.includes(p)),
  );
}
