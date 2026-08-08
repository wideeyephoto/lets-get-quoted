import { describe, it, expect } from 'vitest';
import { FEE_TIERS, platformFeeForVolume, volumeForPlatformFee } from '@/lib/pricing';

/**
 * volumeForPlatformFee is the inverse of platformFeeForVolume, and it is shown
 * to a contractor as "below $X you pay less than that plan". An inverse that is
 * a little wrong is worse than no figure at all: it is a specific number, in
 * dollars, next to a decision.
 */
describe('the break-even volume', () => {
  it('round-trips through the forward function at every scale', () => {
    for (const volume of [0, 1_000, 50_000, 100_000, 100_001, 250_000, 300_000, 749_999, 750_000, 2_000_000]) {
      const fee = platformFeeForVolume(volume);
      if (fee <= 0) continue;
      expect(volumeForPlatformFee(fee)).toBeCloseTo(volume, 6);
    }
  });

  it('lands exactly on a bracket boundary', () => {
    // The first bracket ends at $100k, charged at 1.25% — $1,250 of fee.
    const first = FEE_TIERS[0];
    const feeAtBoundary = (first.upTo as number) * (first.ratePct / 100);
    expect(feeAtBoundary).toBe(1250);
    expect(volumeForPlatformFee(1250)).toBeCloseTo(100_000, 6);
    // A dollar more of fee has to come from the SECOND bracket's lower rate,
    // so it buys more volume than a dollar in the first would.
    expect(volumeForPlatformFee(1251)).toBeCloseTo(100_100, 6);
  });

  it('treats nothing and nonsense as zero rather than guessing', () => {
    expect(volumeForPlatformFee(0)).toBe(0);
    expect(volumeForPlatformFee(-5)).toBe(0);
    expect(volumeForPlatformFee(Number.NaN)).toBe(0);
  });

  it('never returns Infinity while the top bracket is uncapped', () => {
    expect(FEE_TIERS[FEE_TIERS.length - 1].upTo).toBeNull();
    expect(Number.isFinite(volumeForPlatformFee(1_000_000))).toBe(true);
  });
});
