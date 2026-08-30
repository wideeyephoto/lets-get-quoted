import { describe, expect, it } from 'vitest';
import {
  generateSeasonalAdCopy,
  checkCampaignCapacityGuard,
} from '@/lib/google-ads-generator';

describe('Google Ads Enhancements', () => {
  it('generates emergency and storm seasonal ad copy angles', () => {
    const emergency = generateSeasonalAdCopy('Plumber', 'Austin, TX', 'emergency');
    expect(emergency.headlineHooks.some((h) => h.includes('Emergency'))).toBe(true);
    expect(emergency.descriptionHook).toContain('24/7');

    const storm = generateSeasonalAdCopy('Roofing', 'Miami, FL', 'storm_seasonal');
    expect(storm.headlineHooks.some((h) => h.includes('Storm'))).toBe(true);
    expect(storm.descriptionHook).toContain('damage');
  });

  it('triggers capacity auto-pause guard when website is fully booked', () => {
    const activeFullyBooked = {
      fullyBooked: {
        enabled: true,
        until: '2026-12-31',
        message: 'Booked solid',
      },
    };

    const guardActive = checkCampaignCapacityGuard(activeFullyBooked, new Date('2026-08-30'));
    expect(guardActive.shouldPauseBidding).toBe(true);
    expect(guardActive.reason).toContain('Fully Booked');

    const expiredFullyBooked = {
      fullyBooked: {
        enabled: true,
        until: '2026-01-01',
        message: 'Booked',
      },
    };

    const guardExpired = checkCampaignCapacityGuard(expiredFullyBooked, new Date('2026-08-30'));
    expect(guardExpired.shouldPauseBidding).toBe(false);

    const disabledFullyBooked = {
      fullyBooked: {
        enabled: false,
      },
    };

    const guardDisabled = checkCampaignCapacityGuard(disabledFullyBooked);
    expect(guardDisabled.shouldPauseBidding).toBe(false);
  });
});
