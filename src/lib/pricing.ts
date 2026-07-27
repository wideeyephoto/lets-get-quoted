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
