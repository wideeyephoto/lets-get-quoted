import Stripe from 'stripe';

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }

  cachedClient = new Stripe(key, { typescript: true });
  return cachedClient;
}

// -- Trailing-12mo volume-based platform fee (see BUILD-BRIEF.md pricing model) --
// Marginal/no-reset: whichever bracket the trailing volume falls into determines
// the rate applied to the CURRENT transaction. Never retroactively re-rated.
const FEE_TIERS = [
  { tier: 1, minVolume: 0, maxVolume: 100_000, rate: 0.0125 },
  { tier: 2, minVolume: 100_000, maxVolume: 300_000, rate: 0.01 },
  { tier: 3, minVolume: 300_000, maxVolume: 750_000, rate: 0.008 },
  { tier: 4, minVolume: 750_000, maxVolume: null, rate: 0.0065 },
] as const;

export function computeFeeRate(trailingVolume: number): number {
  const tier = [...FEE_TIERS].reverse().find((t) => trailingVolume >= t.minVolume);
  return tier ? tier.rate : FEE_TIERS[0].rate;
}

export type TierInfo = {
  tier: number;
  rate: number;
  trailingVolume: number;
  minVolume: number;
  maxVolume: number | null;
  nextTier: { tier: number; rate: number; minVolume: number } | null;
  progressToNext: number | null; // 0..1, null if already at the top tier
  amountToNextTier: number | null; // dollars remaining to reach next tier, null if top tier
};

export function getTierInfo(trailingVolume: number): TierInfo {
  const currentIndex = [...FEE_TIERS].reverse().findIndex((t) => trailingVolume >= t.minVolume);
  const current = FEE_TIERS[FEE_TIERS.length - 1 - currentIndex] ?? FEE_TIERS[0];
  const next = FEE_TIERS[FEE_TIERS.indexOf(current) + 1] ?? null;

  return {
    tier: current.tier,
    rate: current.rate,
    trailingVolume,
    minVolume: current.minVolume,
    maxVolume: current.maxVolume,
    nextTier: next ? { tier: next.tier, rate: next.rate, minVolume: next.minVolume } : null,
    progressToNext: next ? Math.min(1, (trailingVolume - current.minVolume) / (next.minVolume - current.minVolume)) : null,
    amountToNextTier: next ? Math.max(0, next.minVolume - trailingVolume) : null,
  };
}

// -- Dollar <-> cent helpers (app stores amounts in dollars; Stripe wants cents) --
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}
