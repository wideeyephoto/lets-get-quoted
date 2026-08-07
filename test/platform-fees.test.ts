import { describe, it, expect } from 'vitest';
import { summarizeFeeWindow, type FeeRefundRow } from '@/lib/platform-fees';

// The shipped defect these cover: gross fees were summed over `status = 'paid'`
// while reversals were summed over anything refunded in the window. A full
// refund flips status to 'refunded' in the same write that sets refunded_at, so
// the payment left the gross population and stayed in the reversal one — and
// the platform's headline fee number went negative on a payment where nothing
// had happened.
//
// The arithmetic is pure so the sign of the answer is checkable without a
// database. What the fix actually changed lives in the QUERY (paid_at rather
// than status), so these tests assert the contract the query now has to satisfy:
// a refunded payment is still present in `paidRows`.

const refund = (over: Partial<FeeRefundRow>): FeeRefundRow => ({
  id: 'p1',
  account_id: 'a1',
  label: null,
  amount: 1000,
  refunded_amount: 1000,
  platform_fee_refunded: 30,
  refunded_at: '2026-08-10T00:00:00Z',
  ...over,
});

describe('a payment collected and fully refunded in the same window', () => {
  it('nets to zero, not to minus the fee', () => {
    // The row appears in BOTH sets, which is the point: it was collected in the
    // window (so it is gross) and returned in the window (so it is reversed).
    const result = summarizeFeeWindow([{ platform_fee: 30 }], [refund({})]);
    expect(result.grossFees).toBe(30);
    expect(result.feesReversed).toBe(30);
    expect(result.netFees).toBe(0);
  });

  it('was the old behaviour that produced a negative fee', () => {
    // Reconstructs what the pre-fix query fed in: the refunded row excluded
    // from gross by `status = 'paid'`, but still counted as a reversal.
    const asItWas = summarizeFeeWindow([], [refund({})]);
    expect(asItWas.netFees).toBe(-30);
  });
});

describe('a partial refund', () => {
  it('keeps the part of the fee we did not hand back', () => {
    const result = summarizeFeeWindow(
      [{ platform_fee: 30 }],
      [refund({ refunded_amount: 400, platform_fee_refunded: 12 })],
    );
    expect(result.netFees).toBe(18);
    expect(result.refunds).toBe(400);
  });
});

describe('a refund of a payment collected before the window', () => {
  it('still subtracts, because the money left in this window', () => {
    // Nothing in paidRows — the charge was collected months ago — so the window
    // legitimately reports a negative net. This is the one case where a negative
    // number is the truth rather than the bug, and the fix must not suppress it.
    const result = summarizeFeeWindow([], [refund({ platform_fee_refunded: 30 })]);
    expect(result.netFees).toBe(-30);
  });
});

describe('rows with nothing recorded', () => {
  it('treats a null fee as zero rather than NaN', () => {
    const result = summarizeFeeWindow(
      [{ platform_fee: null }, { platform_fee: 25 }],
      [refund({ platform_fee_refunded: null })],
    );
    expect(result.grossFees).toBe(25);
    expect(result.feesReversed).toBe(0);
    expect(result.netFees).toBe(25);
  });

  // Refunds predating the platform_fee_refunded column read as null, and a null
  // there means "unknown", not "nothing was returned". Counting it as zero
  // overstates net fees — but inventing a proportional guess would be worse, so
  // the pages mark those rows with an em dash instead of a figure.
  it('counts the refund itself even when the fee reversal is unknown', () => {
    const result = summarizeFeeWindow([{ platform_fee: 30 }], [refund({ platform_fee_refunded: null })]);
    expect(result.refunds).toBe(1000);
    expect(result.netFees).toBe(30);
  });
});

describe('the payment count', () => {
  it('counts payments collected, including ones later refunded', () => {
    const result = summarizeFeeWindow(
      [{ platform_fee: 30 }, { platform_fee: 10 }, { platform_fee: 0 }],
      [refund({})],
    );
    expect(result.paymentsProcessed).toBe(3);
  });
});

describe('an empty window', () => {
  it('is zero across the board rather than NaN', () => {
    const result = summarizeFeeWindow([], []);
    expect(result).toEqual({ paymentsProcessed: 0, grossFees: 0, feesReversed: 0, netFees: 0, refunds: 0 });
  });
});
