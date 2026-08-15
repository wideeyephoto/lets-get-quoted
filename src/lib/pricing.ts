// Canonical platform-fee model — the source of truth for the fee numbers shown
// on the homepage pricing band, the /pricing page, and the fee calculator, so
// the rate a contractor sees can never drift between pages.
//
// The fee is MARGINAL across trailing-12-month volume brackets (like income tax
// brackets): the first $100k of collected volume is charged at 1.25%, the next
// slice at 1.00%, and so on. It applies only to payments a homeowner actually
// makes through the platform. Standard Stripe processing is separate.

export type FeeTier = {
  tier: number;
  rate: string; // display, e.g. "1.25%"
  ratePct: number; // numeric percent, e.g. 1.25
  rangeLabel: string; // display, e.g. "$0–$100k"
  // Upper bound of this bracket in dollars; null = no cap (top tier).
  upTo: number | null;
};

export const FEE_TIERS: FeeTier[] = [
  { tier: 1, rate: '1.25%', ratePct: 1.25, rangeLabel: '$0–$100k', upTo: 100_000 },
  { tier: 2, rate: '1.00%', ratePct: 1.0, rangeLabel: '$100k–$300k', upTo: 300_000 },
  { tier: 3, rate: '0.80%', ratePct: 0.8, rangeLabel: '$300k–$750k', upTo: 750_000 },
  { tier: 4, rate: '0.65%', ratePct: 0.65, rangeLabel: '$750k+', upTo: null },
];

export const STRIPE_PROCESSING_NOTE = 'about 2.9% + 30¢ per card charge';

/**
 * STRIPE'S SIDE OF THE BILL — the half the pricing page named and never added up.
 *
 * The calculator answered "what does Let's Get Quoted cost" precisely and left
 * the much larger number — processing — as a parenthetical. A contractor
 * deciding whether $8,400 of work is worth taking by card wants one figure:
 * what lands in the bank. That needs both fees, so both live here.
 *
 * These are Stripe's standard published US rates, not ours, and we do not
 * receive them. They are worth stating anyway because the alternative is a
 * contractor discovering the processing fee on the first payout.
 *
 * A REAL BILL CAN DIFFER. Stripe charges more for international and AmEx cards,
 * and an account can negotiate its own rates. Everything computed from these is
 * labeled an estimate on the page for that reason.
 */
export type PaymentMethod = 'card' | 'ach';

/**
 * Offer ACH bank debit on one-off payments at or above this amount.
 *
 * DECLARED HERE, NOT IN lib/payments.ts, which is where it used to live and
 * where it is still re-exported from so the checkout paths read unchanged.
 * lib/payments pulls in the Supabase admin client, the Stripe SDK and the SMS
 * sender; the pricing calculator is a client component, and importing one
 * number from that module would have shipped all of it to the browser. This
 * file has no imports at all, deliberately.
 */
export const ACH_MIN_AMOUNT = 1000;

export const STRIPE_CARD_PCT = 2.9;
export const STRIPE_CARD_FIXED = 0.3;
/** ACH is a percentage with a hard ceiling, which is why big jobs favor it. */
export const STRIPE_ACH_PCT = 0.8;
export const STRIPE_ACH_CAP = 5;

/** Stripe's processing fee on a single payment of `amount`. */
export function stripeFeeFor(amount: number, method: PaymentMethod): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (method === 'ach') return Math.min(amount * (STRIPE_ACH_PCT / 100), STRIPE_ACH_CAP);
  return amount * (STRIPE_CARD_PCT / 100) + STRIPE_CARD_FIXED;
}

/**
 * One payment, both fees, and what is left.
 *
 * `volumeSoFar` is what the account has already collected this year, because
 * the platform fee is marginal across brackets — the rate on this job depends
 * on where the year already sits. Passing 0 gives the entry rate, which is what
 * a new contractor should be shown.
 */
export function paymentBreakdown(
  amount: number,
  method: PaymentMethod,
  volumeSoFar: number,
): { amount: number; platformFee: number; stripeFee: number; net: number } {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const platformFee = safeAmount * (marginalTierForVolume(volumeSoFar).ratePct / 100);
  const stripeFee = stripeFeeFor(safeAmount, method);
  return {
    amount: safeAmount,
    platformFee,
    stripeFee,
    net: safeAmount - platformFee - stripeFee,
  };
}

// Total platform fee for a full year of collected volume, summed across brackets.
export function platformFeeForVolume(volume: number): number {
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  let fee = 0;
  let lowerBound = 0;
  for (const tier of FEE_TIERS) {
    const upper = tier.upTo ?? Infinity;
    const sliceAmount = Math.min(volume, upper) - lowerBound;
    if (sliceAmount <= 0) break;
    fee += sliceAmount * (tier.ratePct / 100);
    lowerBound = upper;
    if (volume <= upper) break;
  }
  return fee;
}

// The rate the next dollar of volume is charged at — the realistic rate for a
// contractor's current job, given where their yearly volume already sits.
export function marginalTierForVolume(volume: number): FeeTier {
  const safe = Number.isFinite(volume) && volume > 0 ? volume : 0;
  return FEE_TIERS.find((tier) => tier.upTo === null || safe < tier.upTo) ?? FEE_TIERS[FEE_TIERS.length - 1];
}

/**
 * The volume at which a year of platform fees equals a given amount.
 *
 * The inverse of platformFeeForVolume, and the number the /pricing calculator
 * needs to answer the question it was raising and not answering: the default
 * example shows a $1,450 platform fee beside a $1,188 subscription, which is
 * 22% more, and the page said nothing about where the two cross. "Below
 * $X you pay less than the plan" is that sentence.
 *
 * Exact rather than searched: the fee is piecewise linear in volume, so walk
 * the brackets, and inside the one that contains the target divide back out by
 * its rate. Returns Infinity when no volume reaches the target — which cannot
 * happen while the top bracket is uncapped, but would the moment one is added.
 */
export function volumeForPlatformFee(targetFee: number): number {
  if (!Number.isFinite(targetFee) || targetFee <= 0) return 0;

  let feeSoFar = 0;
  let lowerBound = 0;
  for (const tier of FEE_TIERS) {
    const upper = tier.upTo ?? Infinity;
    const rate = tier.ratePct / 100;
    const feeAtTop = feeSoFar + (upper - lowerBound) * rate;
    if (targetFee <= feeAtTop) {
      return lowerBound + (targetFee - feeSoFar) / rate;
    }
    feeSoFar = feeAtTop;
    lowerBound = upper;
  }
  return Infinity;
}
