import { describe, expect, it, vi } from 'vitest';
import {
  isGoogleAdsConfigured,
  provisionManagedSearchCampaign,
  uploadOfflineConversion,
  fetchLiveCampaignStats,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_API_BASE_URL,
  buildGoogleAdsHeaders,
  resolveServingCustomerId,
  normalizeLsaTradeCategory,
  fetchLocalServicesLeads,
  fetchLocalServicesLeadConversations,
  updateLocalServicesLeadStatus,
  appendLocalServicesLeadConversation,
  disputeLocalServicesLead,
  transformLsaLeadToCrm,
  ingestLocalServicesLeads,
} from '@/lib/google-ads-api';
import {
  parseGoogleAdsTarget,
  normalizeGoogleAdsId,
  trackQuoteFunnelStep,
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

  it('uses Google Ads API v22 and constructs login-customer-id header', () => {
    expect(GOOGLE_ADS_API_VERSION).toBe('v22');
    expect(GOOGLE_ADS_API_BASE_URL).toBe('https://googleads.googleapis.com/v22');

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

  describe('Google Local Services Ads (LSA) Lead Ingestion & Management', () => {
    it('normalizes trade categories accurately from LSA category and service IDs', () => {
      expect(normalizeLsaTradeCategory('SERVICE_CATEGORY_ROOFING', 'leak_repair')).toBe('Roofing');
      expect(normalizeLsaTradeCategory('SERVICE_CATEGORY_HVAC', 'heat_pump_replacement')).toBe('HVAC');
      expect(normalizeLsaTradeCategory('SERVICE_CATEGORY_PLUMBER', 'tankless_water_heater')).toBe('Plumbing');
      expect(normalizeLsaTradeCategory('SERVICE_CATEGORY_ELECTRICIAN', 'panel_upgrade')).toBe('Electrical');
      expect(normalizeLsaTradeCategory('SERVICE_CATEGORY_PAINTER', 'interior_painting')).toBe('Painting');
      expect(normalizeLsaTradeCategory('SERVICE_CATEGORY_FENCING', 'wood_privacy_fence')).toBe('Fencing');
      expect(normalizeLsaTradeCategory(null, null)).toBe('Contracting Service');
    });

    it('fetches Local Services leads with rich contact details and trade info', async () => {
      const result = await fetchLocalServicesLeads({ limit: 10 });

      expect(result.success).toBe(true);
      expect(result.leads.length).toBeGreaterThanOrEqual(1);
      expect(result.totalChargedLeads).toBeGreaterThan(0);

      const phoneLead = result.leads.find((l) => l.leadType === 'PHONE_CALL');
      expect(phoneLead).toBeDefined();
      expect(phoneLead?.contactDetails.consumerName).toBeTruthy();
      expect(phoneLead?.contactDetails.phoneNumber).toBeTruthy();
      expect(phoneLead?.tradeCategory).toBe('Roofing');
      expect(phoneLead?.leadCharged).toBe(true);
    });

    it('filters Local Services leads by status and lead type', async () => {
      const callOnly = await fetchLocalServicesLeads({ leadType: ['PHONE_CALL'] });
      expect(callOnly.success).toBe(true);
      expect(callOnly.leads.every((l) => l.leadType === 'PHONE_CALL')).toBe(true);

      const bookedOnly = await fetchLocalServicesLeads({ leadStatus: ['BOOKED'] });
      expect(bookedOnly.success).toBe(true);
      expect(bookedOnly.leads.every((l) => l.leadStatus === 'BOOKED')).toBe(true);
    });

    it('fetches lead conversations including call duration, recording URLs, and message texts', async () => {
      const convResult = await fetchLocalServicesLeadConversations('lsa_lead_1001');

      expect(convResult.success).toBe(true);
      expect(convResult.conversations.length).toBeGreaterThanOrEqual(1);

      const firstConv = convResult.conversations[0];
      expect(firstConv.leadId).toBe('lsa_lead_1001');
      expect(firstConv.phoneCallDetails?.callDurationSeconds).toBeGreaterThan(0);
      expect(firstConv.phoneCallDetails?.callRecordingUrl).toContain('recording');
    });

    it('updates Local Services lead status cleanly', async () => {
      const updateRes = await updateLocalServicesLeadStatus({
        leadId: 'lsa_lead_1001',
        status: 'BOOKED',
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.leadId).toBe('lsa_lead_1001');
      expect(updateRes.status).toBe('BOOKED');
    });

    it('appends communication notes to Local Services lead conversations', async () => {
      const appendRes = await appendLocalServicesLeadConversation({
        leadId: 'lsa_lead_1002',
        conversationChannel: 'MESSAGE',
        text: 'Followed up via text to confirm Friday estimate window.',
      });

      expect(appendRes.success).toBe(true);
      expect(appendRes.leadId).toBe('lsa_lead_1002');
    });

    it('submits disputes for invalid or out-of-area leads with refund pending state', async () => {
      const disputeRes = await disputeLocalServicesLead({
        leadId: 'lsa_lead_1001',
        reason: 'JOB_OUTSIDE_SERVICE_AREA',
        explanation: 'Customer is located 75 miles away outside our 25-mile service boundary.',
      });

      expect(disputeRes.success).toBe(true);
      expect(disputeRes.leadId).toBe('lsa_lead_1001');
      expect(disputeRes.disputeId).toBeTruthy();
      expect(disputeRes.creditState).toBe('PENDING');
      expect(disputeRes.message).toContain('JOB_OUTSIDE_SERVICE_AREA');
    });

    it('transforms LSA leads into CRM intake schema with proper triage flags and urgency scores', () => {
      const mockLead = {
        id: 'lsa_lead_test',
        resourceName: 'customers/123/localServicesLeads/lsa_lead_test',
        categoryId: 'SERVICE_CATEGORY_ROOFING',
        serviceId: 'roof_leak_repair',
        tradeCategory: 'Roofing',
        contactDetails: {
          consumerName: 'Alice Walker',
          phoneNumber: '+15125550199',
          email: 'alice@example.com',
        },
        leadType: 'PHONE_CALL' as const,
        leadStatus: 'NEW' as const,
        leadCharged: true,
        creationDateTime: '2026-09-01T12:00:00Z',
        note: 'Emergency storm damage inquiry',
      };

      const mockConvs = [
        {
          id: 'conv_1',
          resourceName: 'customers/123/conv_1',
          leadId: 'lsa_lead_test',
          leadResourceName: 'customers/123/localServicesLeads/lsa_lead_test',
          conversationChannel: 'PHONE_CALL' as const,
          participantType: 'CONSUMER' as const,
          eventDateTime: '2026-09-01T12:00:00Z',
          phoneCallDetails: {
            callDurationMillis: 95000,
            callDurationSeconds: 95,
            callRecordingUrl: 'https://example.com/call.mp3',
          },
        },
      ];

      const crmLead = transformLsaLeadToCrm(mockLead, mockConvs);

      expect(crmLead.source).toBe('google_lsa');
      expect(crmLead.name).toBe('Alice Walker');
      expect(crmLead.phone).toBe('+15125550199');
      expect(crmLead.trade).toBe('Roofing');
      expect(crmLead.triageScore).toBe('hot');
      expect(crmLead.triageFlags).toContain('google_guaranteed');
      expect(crmLead.triageFlags).toContain('phone_call');
      expect(crmLead.triageFlags).toContain('call_recording_available');
      expect(crmLead.triageFlags).toContain('lsa_charged');
      expect(crmLead.callRecordingUrl).toBe('https://example.com/call.mp3');
      expect(crmLead.callDurationSeconds).toBe(95);
      expect(crmLead.notes).toContain('Emergency storm damage inquiry');
    });

    it('runs end-to-end ingestion pipeline and produces normalized CRM leads', async () => {
      const ingestionResult = await ingestLocalServicesLeads({ limit: 5 });

      expect(ingestionResult.success).toBe(true);
      expect(ingestionResult.ingestedCount).toBeGreaterThanOrEqual(1);
      expect(ingestionResult.leads.length).toBe(ingestionResult.ingestedCount);
      expect(ingestionResult.leads[0].source).toBe('google_lsa');
      expect(ingestionResult.leads[0].trade).toBeTruthy();
    });
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
      });

      const t2 = parseGoogleAdsTarget('123456789', 'XyZ-999');
      expect(t2).toEqual({
        tagId: 'AW-123456789',
        sendTo: 'AW-123456789/XyZ-999',
        conversionLabel: 'XyZ-999',
      });

      const t3 = parseGoogleAdsTarget('AW-123456789');
      expect(t3).toEqual({
        tagId: 'AW-123456789',
        sendTo: 'AW-123456789',
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

      trackSignupConversion('tx_test_456');

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
});

