import {
  BILLING_PLAN_IDS,
  BILLING_PLANS,
  formatUsdFromCents,
  platformFeePercent,
  type BillingPlanId,
} from '@/lib/billing/catalog';

/**
 * Public pricing helpers.
 *
 * Base prices and LGQ platform-fee rates are projected from the canonical
 * billing catalog. Public pages may shape this data for their layout, but must
 * not maintain a second rate table or infer a rate from payment volume.
 */
export type PublicPlanPrice = {
  id: BillingPlanId;
  name: string;
  monthlyPrice: string;
  annualMonthlyPrice: string;
  platformFee: string;
  platformFeePct: number;
};

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export const PLAN_PRICE_OPTIONS: readonly PublicPlanPrice[] = BILLING_PLAN_IDS.map((id) => {
  const plan = BILLING_PLANS[id];
  const fee = platformFeePercent(plan);
  return Object.freeze({
    id,
    name: plan.name,
    monthlyPrice: `${formatUsdFromCents(plan.monthlyPriceCents)}/month`,
    annualMonthlyPrice: `${formatUsdFromCents(plan.annualPriceCents / 12)}/month billed annually`,
    platformFee: formatPercent(fee),
    platformFeePct: fee,
  });
});

export const FLEX_PRICE = PLAN_PRICE_OPTIONS[0];
export const LOWEST_PLATFORM_FEE = PLAN_PRICE_OPTIONS[PLAN_PRICE_OPTIONS.length - 1].platformFee;
export const PLAN_FEE_RANGE_LABEL = `${FLEX_PRICE.platformFee}–${LOWEST_PLATFORM_FEE}`;
export const PUBLIC_PRICING_SUMMARY =
  `Flex starts at ${FLEX_PRICE.monthlyPrice} plus a ${FLEX_PRICE.platformFee} LGQ platform fee. ` +
  'Solo, Growth, and Scale add a base subscription and lower that fee to 0.50%, 0.25%, or 0.10%.';
export const FEATURE_PRICING_NOTE = `Included on every base plan. ${PUBLIC_PRICING_SUMMARY}`;

/**
 * Compatibility shape for older, noindexed homepage concepts. These entries
 * are plans, not volume brackets; new code should use PLAN_PRICE_OPTIONS.
 */
export type FeeTier = PublicPlanPrice & {
  tier: number;
  rate: string;
  ratePct: number;
  rangeLabel: string;
  upTo: null;
};

/** @deprecated Use PLAN_PRICE_OPTIONS. */
export const FEE_TIERS: readonly FeeTier[] = PLAN_PRICE_OPTIONS.map((plan, index) => ({
  ...plan,
  tier: index + 1,
  rate: plan.platformFee,
  ratePct: plan.platformFeePct,
  rangeLabel: `${plan.name} · ${plan.monthlyPrice}`,
  upTo: null,
}));

export const STRIPE_PROCESSING_NOTE = 'processing and payment-infrastructure costs set by Stripe';

export type PaymentMethod = 'card' | 'ach';

/**
 * Offer ACH bank debit on one-off payments at or above this amount.
 *
 * This stays in the import-safe pricing module because client-side payment
 * explanations also need the threshold. The active payment rail re-exports it.
 */
export const ACH_MIN_AMOUNT = 1000;

export const STRIPE_CARD_PCT = 2.9;
export const STRIPE_CARD_FIXED = 0.3;
export const STRIPE_ACH_PCT = 0.8;
export const STRIPE_ACH_CAP = 5;

/** Estimated Stripe processing fee on a single payment. */
export function stripeFeeFor(amount: number, method: PaymentMethod): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (method === 'ach') return Math.min(amount * (STRIPE_ACH_PCT / 100), STRIPE_ACH_CAP);
  return amount * (STRIPE_CARD_PCT / 100) + STRIPE_CARD_FIXED;
}

/** Estimated LGQ platform fee for annual eligible service subtotal on a plan. */
export function platformFeeForVolume(volume: number, plan: BillingPlanId = 'flex'): number {
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  return volume * (platformFeePercent(plan) / 100);
}

/** Eligible service subtotal that produces a target LGQ fee on a plan. */
export function volumeForPlatformFee(targetFee: number, plan: BillingPlanId = 'flex'): number {
  if (!Number.isFinite(targetFee) || targetFee <= 0) return 0;
  return targetFee / (platformFeePercent(plan) / 100);
}

/** One estimated payment, with the selected plan's fee and Stripe's fee split. */
export function paymentBreakdown(
  amount: number,
  method: PaymentMethod,
  plan: BillingPlanId = 'flex',
): { amount: number; platformFee: number; stripeFee: number; net: number } {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const platformFee = platformFeeForVolume(safeAmount, plan);
  const stripeFee = stripeFeeFor(safeAmount, method);
  return {
    amount: safeAmount,
    platformFee,
    stripeFee,
    net: safeAmount - platformFee - stripeFee,
  };
}
