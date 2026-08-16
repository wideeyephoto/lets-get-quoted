import { describe, expect, it } from 'vitest';
import { BILLING_PLAN_IDS, BILLING_PLANS, platformFeePercent } from '@/lib/billing/catalog';
import { PLAN_PRICE_OPTIONS, platformFeeForVolume, volumeForPlatformFee } from '@/lib/pricing';

describe('the public pricing projection', () => {
  it('projects every base price and fee from the canonical catalog', () => {
    expect(PLAN_PRICE_OPTIONS.map((plan) => plan.id)).toEqual(BILLING_PLAN_IDS);
    for (const option of PLAN_PRICE_OPTIONS) {
      expect(option.platformFeePct).toBe(platformFeePercent(option.id));
      expect(option.monthlyPrice).toContain(`${BILLING_PLANS[option.id].monthlyPriceCents / 100}`);
    }
  });

  it('calculates and reverses fees at each plan rate', () => {
    for (const plan of BILLING_PLAN_IDS) {
      const fee = platformFeeForVolume(250_000, plan);
      expect(volumeForPlatformFee(fee, plan)).toBeCloseTo(250_000, 6);
    }
  });

  it('treats nothing and nonsense as zero', () => {
    expect(platformFeeForVolume(Number.NaN)).toBe(0);
    expect(volumeForPlatformFee(0)).toBe(0);
    expect(volumeForPlatformFee(-5)).toBe(0);
  });
});
