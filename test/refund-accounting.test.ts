import { describe, it, expect } from 'vitest';
import { reversedPlatformFee } from '@/lib/payments';

// Refunds are created with refund_application_fee: true, so Stripe hands our
// platform fee back in proportion to the refund. Nothing recorded that, so
// "Platform fees (30 days)" counted money we had already returned.

const fee = (over: Partial<Parameters<typeof reversedPlatformFee>[0]> = {}) =>
  reversedPlatformFee({ amount: 1000, platformFee: 30, refundedTotal: 0, ...over });

describe('how much of the platform fee went back', () => {
  it('returns the whole fee on a full refund', () => {
    expect(fee({ refundedTotal: 1000 })).toBe(30);
  });

  it('returns a proportional slice on a partial', () => {
    expect(fee({ refundedTotal: 500 })).toBe(15);
    expect(fee({ refundedTotal: 250 })).toBe(7.5);
  });

  it('returns nothing when nothing has been refunded', () => {
    expect(fee({ refundedTotal: 0 })).toBe(0);
  });

  // The two write paths — the synchronous one in refundPayment and the
  // charge.refunded webhook — both compute from the CUMULATIVE refunded total.
  // That is what makes them agree whichever lands first, and lets a redelivered
  // webhook recompute the same answer instead of adding to it.
  it('is a function of the cumulative total, so repeating it changes nothing', () => {
    const first = fee({ refundedTotal: 400 });
    expect(fee({ refundedTotal: 400 })).toBe(first);
    // Two partials of 400 then 300 arrive as 400 then 700, never as 300.
    expect(fee({ refundedTotal: 700 })).toBe(21);
  });

  it('rounds to whole cents rather than carrying float dust', () => {
    // 33.33% of 10.00 is 3.333…; a fee column is numeric(12,2).
    expect(fee({ amount: 30, platformFee: 10, refundedTotal: 10 })).toBe(3.33);
    expect(Number.isInteger(fee({ amount: 3, platformFee: 1, refundedTotal: 1 }) * 100)).toBe(true);
  });

  // Numerics arrive from the Postgres driver as strings.
  it('accepts the strings the driver actually hands over', () => {
    expect(reversedPlatformFee({ amount: '1000.00', platformFee: '30.00', refundedTotal: '500.00' })).toBe(15);
  });

  describe('refuses to invent a reversal', () => {
    it('never hands back more fee than was charged', () => {
      // A refundedTotal above the amount should not scale the fee past 100%.
      expect(fee({ refundedTotal: 5000 })).toBe(30);
    });

    it('returns zero for a payment that carries no fee', () => {
      expect(fee({ platformFee: null, refundedTotal: 1000 })).toBe(0);
      expect(fee({ platformFee: 0, refundedTotal: 1000 })).toBe(0);
    });

    it('returns zero rather than dividing by a missing amount', () => {
      expect(fee({ amount: 0, refundedTotal: 100 })).toBe(0);
      expect(fee({ amount: null, refundedTotal: 100 })).toBe(0);
      expect(fee({ amount: undefined, refundedTotal: 100 })).toBe(0);
    });

    it('returns zero for junk instead of NaN', () => {
      expect(fee({ amount: 'nonsense', refundedTotal: 100 })).toBe(0);
      expect(fee({ platformFee: 'nonsense', refundedTotal: 100 })).toBe(0);
      expect(fee({ refundedTotal: 'nonsense' })).toBe(0);
      expect(fee({ refundedTotal: Number.NaN })).toBe(0);
    });

    it('ignores a negative refund', () => {
      expect(fee({ refundedTotal: -100 })).toBe(0);
    });
  });
});
