/**
 * How many seats a workspace has, said as a sum when it is one.
 *
 * Pure and free of `server-only` on purpose. The loader that reads the ledger
 * is service-role and belongs behind that guard (see purchased-seats.ts); the
 * arithmetic and the sentence do not, and locking a formatter to the server
 * means the first client component that needs it gets an import error rather
 * than a function.
 */

export type PurchasedSeats = Readonly<{
  crewUsers: number;
  officeUsers: number;
}>;

/** Nothing bought — and also what an unreadable ledger reports. */
export const NO_PURCHASED_SEATS: PurchasedSeats = Object.freeze({
  crewUsers: 0,
  officeUsers: 0,
});

/**
 * "3 (2 included + 1 purchased)", or just "2" when nothing was bought.
 *
 * The breakdown appears only when there is something to break down. A
 * contractor who has never bought a seat should not have to read a sum to learn
 * their plan allowance, and "+ 0 purchased" on every row is the kind of
 * completeness that makes a page harder to read rather than clearer.
 *
 * Negative purchased counts are treated as none. The ledger cannot produce one
 * -- `units` is positive and the RPC sums only active rows -- but this function
 * is what stands between a bad number and a sentence about somebody's
 * entitlement, and "2 (2 included + -1 purchased)" is worse than "2".
 */
export function describeSeatLimit(included: number, purchased: number): string {
  if (!Number.isFinite(included)) return '—';
  const extra = Number.isFinite(purchased) && purchased > 0 ? purchased : 0;
  const total = included + extra;
  if (extra === 0) return total.toLocaleString('en-US');
  return `${total.toLocaleString('en-US')} (${included.toLocaleString('en-US')} included`
    + ` + ${extra.toLocaleString('en-US')} purchased)`;
}
