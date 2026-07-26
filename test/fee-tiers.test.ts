import { describe, it, expect } from 'vitest';
import {
  computeFeeRate,
  getTierInfo,
  computePlatformFee,
  computePlatformFeeCents,
  toCents,
  fromCents,
} from '@/lib/stripe';

// The trailing-12mo volume brackets (half-open [min, next.min)):
//   Tier 1 [0, 100k)      1.25%
//   Tier 2 [100k, 300k)   1.00%
//   Tier 3 [300k, 750k)   0.80%
//   Tier 4 [750k, ∞)      0.65%
// These tests pin the boundary behavior: a silent off-by-one here would
// mis-bill every transaction, so exact-edge cases matter most.

describe('computeFeeRate', () => {
  it('applies tier 1 below the first boundary', () => {
    expect(computeFeeRate(0)).toBe(0.0125);
    expect(computeFeeRate(50_000)).toBe(0.0125);
    expect(computeFeeRate(99_999.99)).toBe(0.0125);
  });

  it('treats each boundary as the START of the higher tier (inclusive min)', () => {
    expect(computeFeeRate(100_000)).toBe(0.01); // exactly at tier 2 floor
    expect(computeFeeRate(300_000)).toBe(0.008); // exactly at tier 3 floor
    expect(computeFeeRate(750_000)).toBe(0.0065); // exactly at tier 4 floor
  });

  it('holds the tier just below the next boundary', () => {
    expect(computeFeeRate(100_000 - 0.01)).toBe(0.0125);
    expect(computeFeeRate(300_000 - 0.01)).toBe(0.01);
    expect(computeFeeRate(750_000 - 0.01)).toBe(0.008);
  });

  it('stays on the top tier for very high volume', () => {
    expect(computeFeeRate(1_000_000)).toBe(0.0065);
    expect(computeFeeRate(50_000_000)).toBe(0.0065);
  });

  it('falls back to tier 1 for a nonsensical negative volume', () => {
    expect(computeFeeRate(-1)).toBe(0.0125);
  });
});

describe('getTierInfo', () => {
  it('is always consistent with computeFeeRate, including on every boundary', () => {
    const samples = [
      0, 1, 50_000, 99_999.99, 100_000, 100_000.01, 200_000, 299_999.99, 300_000,
      300_000.01, 500_000, 749_999.99, 750_000, 750_000.01, 1_000_000, -5,
    ];
    for (const v of samples) {
      expect(getTierInfo(v).rate).toBe(computeFeeRate(v));
    }
  });

  it('reports tier 1 with progress toward tier 2', () => {
    const info = getTierInfo(50_000);
    expect(info.tier).toBe(1);
    expect(info.rate).toBe(0.0125);
    expect(info.minVolume).toBe(0);
    expect(info.maxVolume).toBe(100_000);
    expect(info.nextTier).toEqual({ tier: 2, rate: 0.01, minVolume: 100_000 });
    expect(info.amountToNextTier).toBe(50_000);
    expect(info.progressToNext).toBe(0.5);
  });

  it('rolls to the next tier exactly at the boundary with progress reset to 0', () => {
    const info = getTierInfo(100_000);
    expect(info.tier).toBe(2);
    expect(info.rate).toBe(0.01);
    expect(info.minVolume).toBe(100_000);
    expect(info.maxVolume).toBe(300_000);
    expect(info.nextTier).toEqual({ tier: 3, rate: 0.008, minVolume: 300_000 });
    expect(info.amountToNextTier).toBe(200_000);
    expect(info.progressToNext).toBe(0);
  });

  it('measures the distance to the next tier from mid-bracket', () => {
    const info = getTierInfo(300_000);
    expect(info.tier).toBe(3);
    expect(info.amountToNextTier).toBe(450_000); // 750k - 300k
    expect(info.progressToNext).toBe(0);
  });

  it('caps out at the top tier with no next tier', () => {
    const info = getTierInfo(900_000);
    expect(info.tier).toBe(4);
    expect(info.rate).toBe(0.0065);
    expect(info.maxVolume).toBeNull();
    expect(info.nextTier).toBeNull();
    expect(info.progressToNext).toBeNull();
    expect(info.amountToNextTier).toBeNull();
  });

  it('never lets progress escape 0..1', () => {
    for (const v of [0, 50_000, 99_999.99, 100_000, 749_999.99]) {
      const p = getTierInfo(v).progressToNext;
      if (p !== null) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('toCents / fromCents', () => {
  it('rounds to whole cents (no float drift)', () => {
    expect(toCents(10)).toBe(1000);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30
    expect(fromCents(1999)).toBe(19.99);
    expect(fromCents(2999.6)).toBe(30); // rounds the cent first
  });

  it('round-trips a dollar amount losslessly', () => {
    for (const dollars of [0, 0.01, 1, 19.99, 100.5, 1234.56]) {
      expect(fromCents(toCents(dollars))).toBe(dollars);
    }
  });
});

describe('computePlatformFee', () => {
  it('computes the fee in cents, rounding once at the cent', () => {
    // $500 at 1.25% = $6.25 = 625c
    expect(computePlatformFeeCents(500, 0.0125)).toBe(625);
    // $1000 at 1.0% = $10.00 = 1000c
    expect(computePlatformFeeCents(1000, 0.01)).toBe(1000);
    // $333.33 at 0.8%: round(33333 * 0.008) = round(266.664) = 267c
    expect(computePlatformFeeCents(333.33, 0.008)).toBe(267);
  });

  it('expresses the same fee in dollars', () => {
    expect(computePlatformFee(500, 0.0125)).toBe(6.25);
    expect(computePlatformFee(1000, 0.01)).toBe(10);
    expect(computePlatformFee(333.33, 0.008)).toBe(2.67);
  });

  it('is the exact inverse pairing: toCents(dollars fee) === fee cents', () => {
    for (const amount of [500, 1000, 333.33, 12_500, 87.49]) {
      const rate = computeFeeRate(amount * 3); // arbitrary realistic rate
      expect(toCents(computePlatformFee(amount, rate))).toBe(computePlatformFeeCents(amount, rate));
    }
  });
});
