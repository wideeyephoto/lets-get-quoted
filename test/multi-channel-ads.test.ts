import { describe, expect, it } from 'vitest';
import {
  generateMetaAdCopy,
  generateRetargetingAdCopy,
  calculateMultiChannelBudget,
  SMART_BUNDLES,
  getSmartBundle,
} from '@/lib/multi-channel-ads';

describe('Multi-Channel Ads Engine', () => {
  it('provides 3 high-converting Weekly Drip Smart Growth Bundles', () => {
    expect(SMART_BUNDLES).toHaveLength(3);

    const launch = getSmartBundle('launch');
    expect(launch.name).toBe('Launch Plan');
    expect(launch.weeklyAmountDollars).toBe(176);
    expect(launch.weeklyAdSpendDollars).toBe(160);
    expect(launch.weeklyFeeDollars).toBe(16);
    expect(launch.monthlyAverageDollars).toBe(763);
    expect(launch.channels).toContain('google_search');

    const growth = getSmartBundle('growth');
    expect(growth.name).toBe('Growth Engine');
    expect(growth.weeklyAmountDollars).toBe(330);
    expect(growth.weeklyAdSpendDollars).toBe(300);
    expect(growth.weeklyFeeDollars).toBe(30);
    expect(growth.monthlyAverageDollars).toBe(1430);
    expect(growth.channels).toContain('google_search');
    expect(growth.channels).toContain('google_retargeting');

    const scale = getSmartBundle('scale');
    expect(scale.name).toBe('Scale & Dominate');
    expect(scale.weeklyAmountDollars).toBe(616);
    expect(scale.weeklyAdSpendDollars).toBe(560);
    expect(scale.weeklyFeeDollars).toBe(56);
    expect(scale.monthlyAverageDollars).toBe(2669);
    expect(scale.channels).toContain('meta_social');
  });

  it('generates high-converting Meta feed ad copy for contractors', () => {
    const meta = generateMetaAdCopy({
      businessName: 'Apex Roofing & Restoration',
      trade: 'Roofing',
      city: 'Austin, TX',
      services: ['Roof Replacement', 'Leak Repair'],
    });

    expect(meta.primaryText).toContain('Apex Roofing & Restoration');
    expect(meta.primaryText).toContain('Austin');
    expect(meta.headline).toContain('Top-Rated Roofing in Austin');
    expect(meta.callToAction).toBe('Get Quote');
  });

  it('adjusts Meta ad copy for storm damage angles', () => {
    const stormMeta = generateMetaAdCopy({
      businessName: 'Apex Roofing',
      trade: 'Roofing',
      city: 'Dallas, TX',
      services: ['Emergency Tarping'],
      seasonalAngle: 'storm_seasonal',
    });

    expect(stormMeta.primaryText).toContain('Severe weather');
    expect(stormMeta.headline).toContain('Storm Damage');
    expect(stormMeta.callToAction).toBe('Claim Offer');
  });

  it('generates Google Display retargeting banner copy', () => {
    const retargeting = generateRetargetingAdCopy({
      businessName: 'Evergreen HVAC',
      trade: 'HVAC',
      city: 'Phoenix, AZ',
    });

    expect(retargeting.headline).toBe('Still Need HVAC in Phoenix?');
    expect(retargeting.offerBadge).toContain('$250 Off');
    expect(retargeting.cta).toBe('Claim Your Estimate');
  });

  it('calculates multi-channel budgets with 10% platform management fee', () => {
    const searchOnly = calculateMultiChannelBudget({
      searchSpendDollars: 600,
    });
    expect(searchOnly.totalAdSpendDollars).toBe(600);
    expect(searchOnly.platformFeeDollars).toBe(60);
    expect(searchOnly.totalMonthlyDollars).toBe(660);
    expect(searchOnly.activeChannels).toEqual(['google_search']);

    const multi = calculateMultiChannelBudget({
      searchSpendDollars: 600,
      retargetingEnabled: true,
      retargetingSpendDollars: 100,
      metaEnabled: true,
      metaSpendDollars: 200,
    });
    expect(multi.totalAdSpendDollars).toBe(900);
    expect(multi.platformFeeDollars).toBe(90);
    expect(multi.totalMonthlyDollars).toBe(990);
    expect(multi.activeChannels).toEqual(['google_search', 'google_retargeting', 'meta_social']);
  });
});
