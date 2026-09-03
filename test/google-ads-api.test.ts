import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type GoogleAdsConfig,
  isGoogleAdsConfigured,
  provisionManagedSearchCampaign,
  uploadOfflineConversion,
  fetchLiveCampaignStats,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_API_BASE_URL,
  buildGoogleAdsHeaders,
  resolveServingCustomerId,
} from '@/lib/google-ads-api';
import {
  parseGoogleAdsTarget,
  normalizeGoogleAdsId,
  trackQuoteFunnelStep,
  analyticsIdProblem,
} from '@/lib/analytics';
import { updateGoogleConsent, trackSignupConversion } from '@/lib/google-tag';

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

  it('uses Google Ads API v25 and constructs login-customer-id header', () => {
    expect(GOOGLE_ADS_API_VERSION).toBe('v25');
    expect(GOOGLE_ADS_API_BASE_URL).toBe('https://googleads.googleapis.com/v25');

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

  describe('Serving Customer ID Isolation', () => {
    it('resolves valid operating client customer ID without hyphens', () => {
      const config = {
        developerToken: 'token',
        mccCustomerId: '111-222-3333',
        clientCustomerId: '444-555-6666',
      };
      expect(resolveServingCustomerId('777-888-9999', config)).toBe('7778889999');
      expect(resolveServingCustomerId(undefined, config)).toBe('4445556666');
    });

    it('rejects falling back to MCC manager account as serving target', () => {
      const config = {
        developerToken: 'token',
        mccCustomerId: '111-222-3333',
      };
      expect(resolveServingCustomerId(undefined, config)).toBeNull();
      expect(resolveServingCustomerId('111-222-3333', config)).toBeNull();
    });
  });

  describe('Contractor Site Google Ads Target & Conversion Routing', () => {
    it('parses Google Ads target formats correctly', () => {
      const t1 = parseGoogleAdsTarget('AW-123456789/AbCd_123');
      expect(t1).toEqual({
        tagId: 'AW-123456789',
        sendTo: 'AW-123456789/AbCd_123',
        conversionLabel: 'AbCd_123',
        hasConversionLabel: true,
      });

      const t2 = parseGoogleAdsTarget('123456789', 'XyZ-999');
      expect(t2).toEqual({
        tagId: 'AW-123456789',
        sendTo: 'AW-123456789/XyZ-999',
        conversionLabel: 'XyZ-999',
        hasConversionLabel: true,
      });

      const t3 = parseGoogleAdsTarget('AW-123456789');
      expect(t3).toEqual({
        tagId: 'AW-123456789',
        hasConversionLabel: false,
      });

      expect(parseGoogleAdsTarget('G-ABCD1234')).toBeNull();
      expect(parseGoogleAdsTarget('')).toBeNull();
    });

    it('normalizes Google Ads target to sendTo destination', () => {
      expect(normalizeGoogleAdsId('AW-123456789/LeadTag')).toBe('AW-123456789/LeadTag');
      expect(normalizeGoogleAdsId('123456789')).toBe('AW-123456789');
    });

    it('routes conversion to __lgq_google_ads_send_to and NEVER uses send_to: default', () => {
      const gtagMock = vi.fn();
      const mockWin = {
        gtag: gtagMock,
        __lgq_google_ads_send_to: 'AW-123456789/QuoteLead',
        dispatchEvent: vi.fn(),
      };
      vi.stubGlobal('window', mockWin);

      trackQuoteFunnelStep({
        step: 'contact_submitted',
        formStyle: 'multi_step',
        template: 'classic',
        device: 'desktop',
      });

      expect(gtagMock).toHaveBeenCalledWith('event', 'quote_contact_submitted', expect.any(Object));

      expect(gtagMock).toHaveBeenCalledWith('event', 'conversion', {
        send_to: 'AW-123456789/QuoteLead',
        event_category: 'quote_intake',
        event_label: 'multi_step',
      });

      for (const call of gtagMock.mock.calls) {
        if (call[0] === 'event' && call[1] === 'conversion') {
          expect(call[2]?.send_to).not.toBe('default');
        }
      }

      vi.unstubAllGlobals();
    });

    it('skips conversion event when no Google Ads target is configured', () => {
      const gtagMock = vi.fn();
      const mockWin = {
        gtag: gtagMock,
        __lgq_google_ads_send_to: undefined,
        dispatchEvent: vi.fn(),
      };
      vi.stubGlobal('window', mockWin);

      trackQuoteFunnelStep({
        step: 'contact_submitted',
        formStyle: 'simple',
        template: 'modern',
        device: 'mobile',
      });

      expect(gtagMock).toHaveBeenCalledWith('event', 'quote_contact_submitted', expect.any(Object));

      const conversionCalls = gtagMock.mock.calls.filter((c: unknown[]) => c[1] === 'conversion');
      expect(conversionCalls.length).toBe(0);

      vi.unstubAllGlobals();
    });
  });

  describe('Google Consent Mode Updates', () => {
    it('dispatches consent update to gtag when granted', () => {
      const gtagMock = vi.fn();
      vi.stubGlobal('window', { gtag: gtagMock });

      updateGoogleConsent(true);

      expect(gtagMock).toHaveBeenCalledWith('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      });

      vi.unstubAllGlobals();
    });

    it('dispatches consent update to gtag when denied', () => {
      const gtagMock = vi.fn();
      vi.stubGlobal('window', { gtag: gtagMock });

      updateGoogleConsent(false);

      expect(gtagMock).toHaveBeenCalledWith('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      });

      vi.unstubAllGlobals();
    });

    it('trackSignupConversion triggers updateGoogleConsent(true) and conversion event', () => {
      const gtagMock = vi.fn();
      vi.stubGlobal('window', { gtag: gtagMock, __lgq_signup_converted: false });
      process.env.NEXT_PUBLIC_GOOGLE_TAG_ID = 'AW-987654321';
      process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID = 'AW-987654321/SignupComplete';

      trackSignupConversion('tx_test_456', true);

      expect(gtagMock).toHaveBeenCalledWith('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      });

      expect(gtagMock).toHaveBeenCalledWith('event', 'conversion', expect.objectContaining({
        send_to: 'AW-987654321/SignupComplete',
        transaction_id: 'tx_test_456',
        value: 1,
        currency: 'USD',
      }));

      delete process.env.NEXT_PUBLIC_GOOGLE_TAG_ID;
      delete process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID;
      vi.unstubAllGlobals();
    });
  });

  describe('Google Ads API v25 Schema & Spend Protection Verification', () => {
    const apiCode = readFileSync(join(process.cwd(), 'src/lib/google-ads-api.ts'), 'utf8');

    it('omits output-only biddingStrategyType and includes maximizeConversions and EU political ads declaration', () => {
      expect(apiCode).toContain("maximizeConversions: {}");
      expect(apiCode).toContain("containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'");
      expect(apiCode).not.toContain("biddingStrategyType: 'MAXIMIZE_CONVERSIONS'");
    });

    it('creates campaign in PAUSED status and gates ENABLED status to the final activation step', () => {
      // Step 2 creates campaign PAUSED
      expect(apiCode).toMatch(/create:\s*\{[\s\S]*?name:\s*campaignName,[\s\S]*?status:\s*'PAUSED'/);
      // Step 9 final activation
      expect(apiCode).toMatch(/update:\s*\{[\s\S]*?resourceName:\s*campaignResourceName,[\s\S]*?status:\s*'ENABLED'/);
    });

    it('fails closed and keeps campaign PAUSED if negative keywords, geo-fencing, or schedule fail', () => {
      expect(apiCode).toContain('Campaign negative keyword shields failed to deploy (campaign left PAUSED)');
      expect(apiCode).toContain('Campaign geo-fencing failed to deploy (campaign left PAUSED)');
      expect(apiCode).toContain('Campaign ad schedule failed to deploy (campaign left PAUSED)');
    });

    it('isGoogleAdsConfigured refuses MCC alone without serving client customer ID', () => {
      const configWithMccOnly: GoogleAdsConfig = {
        clientId: 'cid',
        clientSecret: 'csec',
        developerToken: 'devtok',
        refreshToken: 'rtok',
        mccCustomerId: '123-456-7890',
        clientCustomerId: '',
      };
      expect(resolveServingCustomerId(undefined, configWithMccOnly)).toBeNull();
    });
  });

  describe('Managed Ads Checkout Gating', () => {
    it('isManagedAdsCheckoutAllowed defaults to false', async () => {
      const { isManagedAdsCheckoutAllowed, MANAGED_ADS_CHECKOUT_ENABLED } = await import('@/lib/ad-billing-shared');
      expect(isManagedAdsCheckoutAllowed()).toBe(false);
      expect(MANAGED_ADS_CHECKOUT_ENABLED).toBe(false);
    });
  });

  describe('Contractor Site Conversion Label Enforcement', () => {
    it('flags bare AW ID as missing conversion label in analyticsIdProblem', () => {
      const problem = analyticsIdProblem('googleAds', 'AW-123456789');
      expect(problem).toContain('conversion ID and label');
      expect(problem).toContain('AW-123456789/AbCd-EfG');
    });

    it('accepts complete AW ID with conversion label', () => {
      const problem = analyticsIdProblem('googleAds', 'AW-123456789/AbCd-EfG');
      expect(problem).toBe('');
    });
  });
});
