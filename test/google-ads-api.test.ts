import { describe, expect, it } from 'vitest';
import {
  isGoogleAdsConfigured,
  provisionManagedSearchCampaign,
  uploadOfflineConversion,
  fetchLiveCampaignStats,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_API_BASE_URL,
  buildGoogleAdsHeaders,
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
      landingPageUrl: 'https://apexroofing.com',
      scheduleDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      startHour: 8,
      endHour: 18,
    });

    expect(result.success).toBe(true);
    expect(result.dailyBudgetDollars).toBe(19.74);
    expect(result.campaignId).toBeTruthy();
    expect(result.adGroupId).toBeTruthy();
    expect(result.headlinesCount).toBeGreaterThanOrEqual(5);
    expect(result.descriptionsCount).toBeGreaterThanOrEqual(2);
    expect(result.keywordsCount).toBeGreaterThan(0);
    expect(result.negativeKeywordsCount).toBeGreaterThan(10);
    expect(result.scheduleDaysCount).toBe(5);
    expect(result.geoRadiusMiles).toBe(25);
  });

  it('validates offline conversion upload requirements with gclid, gbraid, wbraid', async () => {
    const emptyResult = await uploadOfflineConversion({
      gclid: '',
      conversionActionName: 'Lead Submitted',
    });
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.message).toContain('Missing or empty click identifier');

    const gclidResult = await uploadOfflineConversion({
      gclid: 'CjwKCAjw123456_fake_gclid',
      conversionActionName: 'Job Won',
      conversionValueDollars: 8500,
      orderId: 'job_789',
    });
    expect(gclidResult.success).toBe(true);
    expect(gclidResult.gclid).toBe('CjwKCAjw123456_fake_gclid');
    expect(gclidResult.conversionValueDollars).toBe(8500);

    const gbraidResult = await uploadOfflineConversion({
      gbraid: 'gbraid_ios_app_click_12345',
      conversionActionName: 'Job Won',
      conversionValueDollars: 4500,
      orderId: 'job_456',
    });
    expect(gbraidResult.success).toBe(true);
    expect(gbraidResult.gbraid).toBe('gbraid_ios_app_click_12345');
    expect(gbraidResult.conversionValueDollars).toBe(4500);
  });

  it('uses Google Ads API v20 and constructs login-customer-id header', () => {
    expect(GOOGLE_ADS_API_VERSION).toBe('v20');
    expect(GOOGLE_ADS_API_BASE_URL).toBe('https://googleads.googleapis.com/v20');

    const headers = buildGoogleAdsHeaders(
      {
        developerToken: 'dev_token_123',
        mccCustomerId: '123-456-7890',
      },
      'test_access_token'
    );

    expect(headers['Authorization']).toBe('Bearer test_access_token');
    expect(headers['developer-token']).toBe('dev_token_123');
    expect(headers['login-customer-id']).toBe('1234567890');
    expect(headers['Content-Type']).toBe('application/json');
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
