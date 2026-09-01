import { describe, expect, it } from 'vitest';
import {
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_API_BASE_URL,
  provisionManagedSearchCampaign,
  uploadOfflineConversion,
  buildGoogleAdsHeaders,
} from '@/lib/google-ads-api';
import {
  enqueueOfflineConversion,
  processOfflineConversionItem,
  syncLeadWonConversion,
} from '@/lib/google-ads-conversion-outbox';
import { parseAttribution } from '@/lib/attribution';
import { buildGoogleAdsOfflineConversion } from '@/lib/ad-closed-loop-sync';

describe('Google Ads v20 Lead Engine & Closed-Loop Suite', () => {
  describe('1. API Version & Protocol Conformance', () => {
    it('targets Google Ads API v20 base URL', () => {
      expect(GOOGLE_ADS_API_VERSION).toBe('v20');
      expect(GOOGLE_ADS_API_BASE_URL).toBe('https://googleads.googleapis.com/v20');
    });

    it('formats headers with unhyphenated login-customer-id', () => {
      const headers = buildGoogleAdsHeaders(
        {
          developerToken: 'mock_dev_token',
          mccCustomerId: '987-654-3210',
        },
        'mock_token'
      );

      expect(headers['developer-token']).toBe('mock_dev_token');
      expect(headers['login-customer-id']).toBe('9876543210');
      expect(headers['Authorization']).toBe('Bearer mock_token');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('2. Full Multi-Resource Campaign Provisioning', () => {
    it('provisions complete campaign specification with ad schedule, geo proximity, and negative keywords', async () => {
      const result = await provisionManagedSearchCampaign({
        accountId: 'acc_test_v20',
        businessName: 'Summit Plumbing Pros',
        trade: 'Plumbing',
        city: 'Denver, CO',
        radiusMiles: 30,
        monthlyBudgetDollars: 1200,
        services: ['Water Heater Replacement', 'Drain Cleaning', 'Emergency Pipe Repair'],
        phone: '303-555-0199',
        landingPageUrl: 'https://summitplumbing.com',
        scheduleDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        startHour: 6,
        endHour: 20,
        customFocus: 'Focus on high-ticket tankless water heaters and commercial emergencies',
        competitorExclusions: ['Roto-Rooter', 'Mr. Rooter'],
      });

      expect(result.success).toBe(true);
      expect(result.campaignId).toBeTruthy();
      expect(result.adGroupId).toBeTruthy();
      expect(result.status).toBe('simulated');
      expect(result.dailyBudgetDollars).toBe(39.47);
      expect(result.scheduleDaysCount).toBe(5);
      expect(result.geoRadiusMiles).toBe(30);
      expect(result.headlinesCount).toBeGreaterThanOrEqual(5);
      expect(result.descriptionsCount).toBeGreaterThanOrEqual(2);
      expect(result.keywordsCount).toBeGreaterThan(0);
      expect(result.negativeKeywordsCount).toBeGreaterThan(15);
      expect(result.message).toContain('v20');
    });
  });

  describe('3. Attribution Ingestion for Privacy-Safe Click IDs', () => {
    it('parses gclid, gbraid, and wbraid from landing query parameters', () => {
      const gclidUrl = 'https://summitplumbing.com?gclid=CjwKCAjw123_gclid_token&utm_source=google&utm_medium=cpc';
      const gclidAttr = parseAttribution(gclidUrl);
      expect(gclidAttr?.clickId).toBe('CjwKCAjw123_gclid_token');
      expect(gclidAttr?.clickIdType).toBe('gclid');
      expect(gclidAttr?.source).toBe('google');

      const gbraidUrl = 'https://summitplumbing.com?gbraid=gbraid_ios_token_777';
      const gbraidAttr = parseAttribution(gbraidUrl);
      expect(gbraidAttr?.clickId).toBe('gbraid_ios_token_777');
      expect(gbraidAttr?.clickIdType).toBe('gbraid');
      expect(gbraidAttr?.source).toBe('google');

      const wbraidUrl = 'https://summitplumbing.com?wbraid=wbraid_web_token_888';
      const wbraidAttr = parseAttribution(wbraidUrl);
      expect(wbraidAttr?.clickId).toBe('wbraid_web_token_888');
      expect(wbraidAttr?.clickIdType).toBe('wbraid');
      expect(wbraidAttr?.source).toBe('google');
    });
  });

  describe('4. Durable Offline Conversion Outbox & Enhanced Data', () => {
    it('enqueues and processes conversion with gbraid and first-party hashed identifiers', async () => {
      const outboxItem = enqueueOfflineConversion({
        accountId: 'acc_test_v20',
        leadId: 'lead_won_101',
        orderId: 'lead_won_101',
        conversionActionName: 'customers/1234567890/conversionActions/987654321',
        conversionValueDollars: 4850,
        currencyCode: 'USD',
        conversionDateTime: '2026-09-01 10:00:00+00:00',
        gbraid: 'gbraid_sample_click_999',
        email: 'HomeOwner@Denver.com',
        phone: '303-555-1234',
        firstName: 'John',
        lastName: 'Doe',
        postalCode: '80202',
      });

      expect(outboxItem.status).toBe('pending');
      expect(outboxItem.id).toContain('conv_outbox_');

      const uploadResult = await processOfflineConversionItem(outboxItem);
      expect(uploadResult.success).toBe(true);
      expect(uploadResult.gbraid).toBe('gbraid_sample_click_999');
      expect(uploadResult.enhancedConversionsActive).toBe(true);
      expect(outboxItem.status).toBe('uploaded');
    });

    it('syncLeadWonConversion seamlessly uploads won quote revenue', async () => {
      const result = await syncLeadWonConversion({
        accountId: 'acc_test_v20',
        leadId: 'lead_won_202',
        wonValueDollars: 9200,
        gclid: 'gclid_won_test_456',
        email: 'customer@colorado.org',
        phone: '7205559988',
        firstName: 'Elena',
        lastName: 'Rostova',
      });

      expect(result.success).toBe(true);
      expect(result.gclid).toBe('gclid_won_test_456');
      expect(result.conversionValueDollars).toBe(9200);
      expect(result.enhancedConversionsActive).toBe(true);
    });

    it('builds compliant Google Ads conversion payload structure with wbraid', () => {
      const payload = buildGoogleAdsOfflineConversion({
        transactionId: 'tx_999',
        accountId: 'acc_test_v20',
        amountDollars: 3400,
        wbraid: 'wbraid_verified_555',
        customerEmail: 'test@contractor.com',
      });

      expect(payload).not.toBeNull();
      expect(payload?.wbraid).toBe('wbraid_verified_555');
      expect(payload?.conversionValue).toBe(3400);
      expect(payload?.userIdentifiers?.length).toBeGreaterThan(0);
    });
  });
});
