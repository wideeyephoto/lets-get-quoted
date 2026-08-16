import {
  PRICING_CATALOG_VERSION,
  getBillingPlan,
  parseBillingPlanId,
  platformFeeCents,
  type BillingPlanId,
} from '@/lib/billing/catalog';

export type PaymentFeeSnapshot = {
  planCode: BillingPlanId;
  catalogVersion: typeof PRICING_CATALOG_VERSION;
  feeRateBps: number;
  feeRate: number;
  grossAmountCents: number;
  eligibleServiceSubtotalCents: number;
  applicationFeeCents: number;
};

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

/**
 * The service subtotal after the invoice discount, before tax or tips.
 * Invalid inputs fail closed; a valid 0-100 percentage is rounded once to cents.
 */
export function discountAdjustedServiceSubtotalCents(subtotalCents: number, discountPercent: number): number {
  const subtotal = requireNonNegativeInteger(subtotalCents, 'subtotalCents');
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error('discountPercent must be a finite number between 0 and 100.');
  }
  const discount = discountPercent;
  const discountCents = Math.round(subtotal * discount / 100);
  return subtotal - discountCents;
}

export type ProportionalFeeBasisInput = {
  invoiceGrossCents: number;
  invoiceEligibleServiceSubtotalCents: number;
  grossPaidBeforeCents: number;
  grossPaymentCents: number;
};

/**
 * Allocates the eligible service subtotal across deposits/installments.
 *
 * The calculation uses cumulative targets, so arbitrary installment splits
 * always add back to the exact eligible subtotal when the invoice is paid in
 * full. This prevents tax rounding from leaking into LGQ's application fee.
 */
export function allocateEligibleServiceSubtotalCents(input: ProportionalFeeBasisInput): number {
  const invoiceGross = requireNonNegativeInteger(input.invoiceGrossCents, 'invoiceGrossCents');
  const eligibleTotal = requireNonNegativeInteger(
    input.invoiceEligibleServiceSubtotalCents,
    'invoiceEligibleServiceSubtotalCents',
  );
  const paidBefore = requireNonNegativeInteger(input.grossPaidBeforeCents, 'grossPaidBeforeCents');
  const grossPayment = requireNonNegativeInteger(input.grossPaymentCents, 'grossPaymentCents');

  if (eligibleTotal > invoiceGross) {
    throw new Error('invoiceEligibleServiceSubtotalCents cannot exceed invoiceGrossCents.');
  }
  if (paidBefore > invoiceGross) {
    throw new Error('grossPaidBeforeCents cannot exceed invoiceGrossCents.');
  }

  // A final payment may explicitly overpay the remaining balance. Clamp only
  // that modeled case so cumulative allocation can never exceed the invoice.
  const paidAfter = Math.min(invoiceGross, paidBefore + grossPayment);

  if (invoiceGross === 0 || eligibleTotal === 0 || paidAfter <= paidBefore) return 0;

  const targetBefore = Math.round(paidBefore * eligibleTotal / invoiceGross);
  const targetAfter = paidAfter === invoiceGross
    ? eligibleTotal
    : Math.round(paidAfter * eligibleTotal / invoiceGross);

  return Math.max(0, targetAfter - targetBefore);
}

export function createPaymentFeeSnapshot(input: {
  plan: unknown;
  grossAmountCents: number;
  eligibleServiceSubtotalCents: number;
}): PaymentFeeSnapshot {
  const planId = parseBillingPlanId(input.plan);
  if (!planId) throw new Error('A recognized billing plan is required to snapshot a payment fee.');

  const plan = getBillingPlan(planId);
  const grossAmountCents = requireNonNegativeInteger(input.grossAmountCents, 'grossAmountCents');
  const eligibleServiceSubtotalCents = requireNonNegativeInteger(
    input.eligibleServiceSubtotalCents,
    'eligibleServiceSubtotalCents',
  );
  if (eligibleServiceSubtotalCents > grossAmountCents) {
    throw new Error('eligibleServiceSubtotalCents cannot exceed grossAmountCents.');
  }

  return {
    planCode: plan.id,
    catalogVersion: PRICING_CATALOG_VERSION,
    feeRateBps: plan.platformFeeBps,
    feeRate: plan.platformFeeBps / 10_000,
    grossAmountCents,
    eligibleServiceSubtotalCents,
    applicationFeeCents: platformFeeCents(eligibleServiceSubtotalCents, plan),
  };
}
