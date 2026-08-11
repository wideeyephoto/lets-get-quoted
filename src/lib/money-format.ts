/**
 * Printing an amount, with no dependencies.
 *
 * Split out of @/lib/jobs so the customer's quote page can format the running
 * total in the browser without dragging the jobs module — and through it the
 * Supabase client — into the bundle a homeowner downloads on their phone.
 *
 * There is exactly one implementation because there was very nearly two. The
 * client page previously carried its own `formatUsd`, which is how a page ends
 * up showing a homeowner one number in the itemised list and a differently
 * rounded one in the summary. @/lib/jobs re-exports `formatMoneyExact` from
 * here, so a change to how money looks happens once.
 */

/**
 * To the cent, always. Grouped thousands, sign outside the symbol.
 *
 * NaN and Infinity print as $0.00 rather than reaching a customer: a page that
 * says "$NaN" is one somebody rings about, and there is no amount this function
 * could invent that would be better than zero at telling them something is
 * wrong.
 */
export function formatUsdExact(n: number): string {
  const cents = Math.round((Number.isFinite(n) ? n : 0) * 100) || 0;
  const abs = Math.abs(cents) / 100;
  return (cents < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Whole dollars. For a number that is MOVING — the mid-animation frames of a
 * counting total — where two decimal places are unreadable noise. Never for a
 * number at rest, and never for anything a customer is asked to add up: that is
 * what produced a $1,750 deposit and four rows of $438 totalling $3,502 under a
 * sentence promising the parts summed to the whole.
 */
export function formatUsdRounded(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return (safe < 0 ? '-$' : '$') + Math.abs(Math.round(safe)).toLocaleString('en-US');
}
