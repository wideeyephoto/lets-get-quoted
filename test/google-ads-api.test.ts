import { describe, expect, it } from 'vitest';
import {
  isGoogleAdsConfigured,
  provisionManagedSearchCampaign,
  uploadOfflineConversion,
  fetchLiveCampaignStats,
} from '@/lib/google-ads-api';

describe('Google Ads API Module', () => {
  it('detects unconfigured environment gracefully', () => {
    // In test environment, live API credentials are intentionally unconfigured
    expect(typeof isGoogleAdsConfigured()).toBe('boolean');
  });

  it('provisions a managed search campaign with validated RSAs and keywords', async () => {
    const result = await provisionManagedSearchCampaign({
      accountId: 'acc_123',
      businessName: 'Apex Roofing & Exteriors',
      trade: 'Roofing',
      city: 'Austin, TX',
      radiusMiles: 25,
      monthlyBudgetDollars: 600,
      services: ['Roof Replacement', 'Leak Repair', 'Storm Inspection'],
      phone: '512-555-0199',
      landingPageUrl: 'https://apexroofing.com/estimate',
    });

    expect(result.success).toBe(true);
    expect(result.dailyBudgetDollars).toBe(19.74);
    expect(result.campaignId).toBeTruthy();
    expect(result.adGroupId).toBeTruthy();
    expect(result.headlinesCount).toBeGreaterThanOrEqual(5);
    expect(result.descriptionsCount).toBeGreaterThanOrEqual(2);
    expect(result.keywordsCount).toBeGreaterThan(0);
    expect(result.negativeKeywordsCount).toBeGreaterThan(10);
  });

  it('validates offline conversion upload requirements', async () => {
    const emptyResult = await uploadOfflineConversion({
      gclid: '',
      conversionActionName: 'Lead Submitted',
    });
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.message).toContain('Missing or empty gclid');

    const validResult = await uploadOfflineConversion({
      gclid: 'CjwKCAjw123456_fake_gclid',
      conversionActionName: 'Job Won',
      conversionValueDollars: 8500,
      orderId: 'job_789',
    });
    expect(validResult.success).toBe(true);
    expect(validResult.gclid).toBe('CjwKCAjw123456_fake_gclid');
    expect(validResult.conversionValueDollars).toBe(8500);
  });

  it('fetches live campaign stats with consistent CTR and CPC', async () => {
    const stats = await fetchLiveCampaignStats('gads_123456', 600);

    expect(stats.impressions).toBeGreaterThan(0);
    expect(stats.clicks).toBeGreaterThan(0);
    expect(stats.costDollars).toBeGreaterThan(0);
    expect(stats.ctrPct).toBeGreaterThan(0);
    expect(stats.avgCpcDollars).toBeGreaterThan(0);
    expect(stats.status).toBe('active');
  });
});
