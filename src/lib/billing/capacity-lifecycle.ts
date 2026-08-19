/**
 * Stripe's subscription vocabulary, mapped onto the capacity ledger's three states.
 *
 * PURE AND SEPARATE FROM THE WORKER on purpose. Stripe has nine statuses and
 * workspace_purchased_capacity has three, so this is a judgement, not a
 * translation — and every one of these judgements decides whether a workspace
 * keeps capacity it is no longer paying for, or loses capacity it is. That
 * belongs somewhere it can be read and argued with, not inline in a loop.
 *
 * THE RULE BEHIND THE TABLE: only map to `canceled` when the subscription can
 * never bill again. `canceled` is TERMINAL in the ledger — the state machine has
 * no edge out of it, and a resumed subscription is a new Stripe subscription
 * with a new id, so it gets a new row. Mapping a recoverable state to `canceled`
 * would permanently destroy capacity the customer is still entitled to and no
 * later sweep could undo it. Mapping a dead state to `past_due` merely costs us
 * money until somebody notices. Those two mistakes are not the same size, and
 * the table is biased accordingly.
 */

export const CAPACITY_LEDGER_STATUSES = ['active', 'past_due', 'canceled'] as const;
export type CapacityLedgerStatus = (typeof CAPACITY_LEDGER_STATUSES)[number];

/**
 * Every status Stripe documents for a Subscription, and what it means here.
 *
 * Written as a total map rather than a switch with a default, so adding a status
 * is a visible edit and an unknown one falls through to null instead of being
 * quietly swept into a bucket.
 */
const PROVIDER_STATUS_MAP: Readonly<Record<string, CapacityLedgerStatus>> = Object.freeze({
  // Paying, or inside a trial that will bill. Entitled either way.
  active: 'active',
  trialing: 'active',

  // Collection is failing but Stripe has not given up. This is the ledger's
  // grace state, and it deliberately still counts — the same grace the base plan
  // gives a failed renewal. Dropping a seat the instant a card fails would lock
  // an employee out of a job they are stood on to recover $5 Stripe is still
  // trying to collect.
  past_due: 'past_due',

  // Retries are exhausted and the invoices are still open. NOT canceled: Stripe
  // keeps the subscription and it can be revived by paying, under the SAME id —
  // which the ledger could never express, because canceled is terminal and a
  // revival would need a new row that would never be created. So this stays in
  // grace and costs us money rather than destroying entitlement irreversibly.
  unpaid: 'past_due',

  // The first payment has not succeeded yet. Our row only exists because a
  // Checkout Session was PAID, so seeing this should be impossible; treat it as
  // grace rather than asserting, because being wrong about impossible is cheap
  // here and terminal in the other direction.
  incomplete: 'past_due',

  // Paused collection. Resumable, so not terminal.
  paused: 'past_due',

  // The two genuinely dead states. incomplete_expired means the subscription
  // never activated and never will; canceled is canceled.
  incomplete_expired: 'canceled',
  canceled: 'canceled',
});

/**
 * Map one provider status. Returns null for anything unrecognised — a status
 * Stripe adds later must stop the row being touched at all, not be guessed into
 * the nearest bucket. The caller reports the count so a new status shows up as a
 * number somebody can act on rather than as silent drift.
 */
export function mapProviderSubscriptionStatus(status: unknown): CapacityLedgerStatus | null {
  if (typeof status !== 'string') return null;
  return PROVIDER_STATUS_MAP[status] ?? null;
}

/** The statuses this mapping knows, for tests and for the operator-facing docs. */
export function knownProviderSubscriptionStatuses(): readonly string[] {
  return Object.freeze(Object.keys(PROVIDER_STATUS_MAP));
}

/**
 * Stripe reports the period end as unix seconds. Null when absent rather than
 * epoch zero, because the RPC coalesces null to "leave it alone" and a 1970
 * timestamp would be written as fact.
 */
export function periodEndIso(currentPeriodEnd: unknown): string | null {
  if (typeof currentPeriodEnd !== 'number' || !Number.isFinite(currentPeriodEnd)) return null;
  if (currentPeriodEnd <= 0) return null;
  const date = new Date(currentPeriodEnd * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Outcomes apply_purchased_capacity_provider_state can return. */
export const CAPACITY_RECONCILE_OUTCOMES = [
  'active',
  'past_due',
  'canceled',
  'unchanged',
  'already_canceled',
  'not_found',
] as const;

export type CapacityReconcileOutcome = (typeof CAPACITY_RECONCILE_OUTCOMES)[number];

export function isCapacityReconcileOutcome(value: unknown): value is CapacityReconcileOutcome {
  return typeof value === 'string'
    && (CAPACITY_RECONCILE_OUTCOMES as readonly string[]).includes(value);
}
