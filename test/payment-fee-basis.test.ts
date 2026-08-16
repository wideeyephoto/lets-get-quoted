import { describe, expect, it } from 'vitest';
import {
  allocateEligibleServiceSubtotalCents,
  createPaymentFeeSnapshot,
  discountAdjustedServiceSubtotalCents,
} from '@/lib/billing/payment-fee';

describe('LGQ payment fee basis', () => {
  it('uses the discount-adjusted service subtotal before tax', () => {
    expect(discountAdjustedServiceSubtotalCents(100_00, 10)).toBe(90_00);
    expect(discountAdjustedServiceSubtotalCents(100_00, 0)).toBe(100_00);
    expect(discountAdjustedServiceSubtotalCents(100_00, 100)).toBe(0);
  });

  it('allocates deposits proportionally and exactly excludes tax', () => {
    const first = allocateEligibleServiceSubtotalCents({
      invoiceGrossCents: 107_00,
      invoiceEligibleServiceSubtotalCents: 100_00,
      grossPaidBeforeCents: 0,
      grossPaymentCents: 50_00,
    });
    const second = allocateEligibleServiceSubtotalCents({
      invoiceGrossCents: 107_00,
      invoiceEligibleServiceSubtotalCents: 100_00,
      grossPaidBeforeCents: 50_00,
      grossPaymentCents: 57_00,
    });

    expect(first).toBe(4_673);
    expect(second).toBe(5_327);
    expect(first + second).toBe(100_00);
  });

  it('preserves the exact eligible total across equal installments', () => {
    const allocations = [0, 36_00, 72_00].map((grossPaidBeforeCents) =>
      allocateEligibleServiceSubtotalCents({
        invoiceGrossCents: 108_00,
        invoiceEligibleServiceSubtotalCents: 100_00,
        grossPaidBeforeCents,
        grossPaymentCents: 36_00,
      }),
    );

    expect(allocations).toEqual([3_333, 3_334, 3_333]);
    expect(allocations.reduce((sum, value) => sum + value, 0)).toBe(100_00);
  });

  it('clamps an explicit final overpayment without inventing fee basis', () => {
    expect(allocateEligibleServiceSubtotalCents({
      invoiceGrossCents: 108_00,
      invoiceEligibleServiceSubtotalCents: 100_00,
      grossPaidBeforeCents: 100_00,
      grossPaymentCents: 50_00,
    })).toBe(741);

  });

  it('fails closed on malformed fee-basis inputs', () => {
    expect(() => discountAdjustedServiceSubtotalCents(100_00, -10)).toThrow(/discountPercent/i);
    expect(() => discountAdjustedServiceSubtotalCents(100_00, 150)).toThrow(/discountPercent/i);
    expect(() => discountAdjustedServiceSubtotalCents(Number.NaN, 10)).toThrow(/subtotalCents/i);

    expect(() => allocateEligibleServiceSubtotalCents({
      invoiceGrossCents: Number.NaN,
      invoiceEligibleServiceSubtotalCents: 100_00,
      grossPaidBeforeCents: 0,
      grossPaymentCents: 50_00,
    })).toThrow(/invoiceGrossCents/i);

    expect(() => allocateEligibleServiceSubtotalCents({
      invoiceGrossCents: 100_00,
      invoiceEligibleServiceSubtotalCents: 101_00,
      grossPaidBeforeCents: 0,
      grossPaymentCents: 50_00,
    })).toThrow(/cannot exceed/i);

    expect(() => allocateEligibleServiceSubtotalCents({
      invoiceGrossCents: 100_00,
      invoiceEligibleServiceSubtotalCents: 90_00,
      grossPaidBeforeCents: 101_00,
      grossPaymentCents: 1_00,
    })).toThrow(/grossPaidBeforeCents/i);
  });

  it('creates an immutable plan/version/rate snapshot from eligible cents', () => {
    expect(createPaymentFeeSnapshot({
      plan: 'scale',
      grossAmountCents: 108_00,
      eligibleServiceSubtotalCents: 100_00,
    })).toEqual({
      planCode: 'scale',
      catalogVersion: '2026-08-15-preview',
      feeRateBps: 10,
      feeRate: 0.001,
      grossAmountCents: 108_00,
      eligibleServiceSubtotalCents: 100_00,
      applicationFeeCents: 10,
    });
  });

  it('maps legacy development plans safely while the database migrates', () => {
    expect(createPaymentFeeSnapshot({
      plan: 'free',
      grossAmountCents: 250_00,
      eligibleServiceSubtotalCents: 250_00,
    }).planCode).toBe('flex');

    expect(createPaymentFeeSnapshot({
      plan: 'pro',
      grossAmountCents: 250_00,
      eligibleServiceSubtotalCents: 250_00,
    }).planCode).toBe('growth');
  });

  it('fails closed when the plan or monetary snapshot is invalid', () => {
    expect(() => createPaymentFeeSnapshot({
      plan: 'mystery-tier',
      grossAmountCents: 250_00,
      eligibleServiceSubtotalCents: 250_00,
    })).toThrow(/recognized billing plan/i);

    expect(() => createPaymentFeeSnapshot({
      plan: 'flex',
      grossAmountCents: Number.NaN,
      eligibleServiceSubtotalCents: 0,
    })).toThrow(/grossAmountCents/i);

    expect(() => createPaymentFeeSnapshot({
      plan: 'flex',
      grossAmountCents: 100_00,
      eligibleServiceSubtotalCents: 101_00,
    })).toThrow(/cannot exceed/i);
  });
});
