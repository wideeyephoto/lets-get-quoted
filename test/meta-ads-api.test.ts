import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeAdAccountId,
  isMetaAdsConfigured,
  provisionManagedMetaCampaign,
  pauseMetaCampaign,
  resumeMetaCampaign,
  fetchMetaCampaignDailySpend,
  META_GRAPH_API_BASE_URL,
} from '@/lib/meta-ads-api';

describe('Meta Ads API — Configuration & Normalization', () => {
  it('normalizes ad account IDs by adding act_ prefix when missing', () => {
    expect(normalizeAdAccountId('123456789')).toBe('act_123456789');
    expect(normalizeAdAccountId('act_987654321')).toBe('act_987654321');
    expect(normalizeAdAccountId(null)).toBeNull();
    expect(normalizeAdAccountId('   ')).toBeNull();
  });

  it('correctly evaluates isMetaAdsConfigured based on token and ad account presence', () => {
    expect(
      isMetaAdsConfigured('12345', {
        accessToken: 'EAAB...',
        adAccountId: '12345', pageId: '6789',
      })
    ).toBe(true);

    expect(
      isMetaAdsConfigured(undefined, {
        accessToken: 'EAAB...',
        adAccountId: undefined,
      })
    ).toBe(false);

    expect(
      isMetaAdsConfigured('12345', {
        accessToken: undefined,
        adAccountId: '12345', pageId: '6789',
      })
    ).toBe(false);
  });
});

describe('Meta Ads API — Campaign Provisioning', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.VERCEL_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('refuses unconfigured campaigns in every environment', async () => {
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_AD_ACCOUNT_ID;

    const res = await provisionManagedMetaCampaign({
      accountId: 'acc_test',
      businessName: 'Apex Roofing',
      trade: 'Roofing',
      city: 'Austin, TX',
      radiusMiles: 25,
      monthlyBudgetDollars: 600,
      landingPageUrl: 'https://apexroofing.com',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('unconfigured');
    expect(res.campaignId).toBe('');
    expect(res.headline).toBeTruthy();
    expect(res.primaryText).toBeTruthy();
    expect(res.dailyBudgetDollars).toBeCloseTo(19.74, 1);
  });

  it('fails closed in production environment when credentials are not configured', async () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_AD_ACCOUNT_ID;

    const res = await provisionManagedMetaCampaign({
      accountId: 'acc_test',
      businessName: 'Apex Roofing',
      trade: 'Roofing',
      city: 'Austin, TX',
      radiusMiles: 25,
      monthlyBudgetDollars: 600,
      landingPageUrl: 'https://apexroofing.com',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('unconfigured');
    expect(res.message).toContain('Meta credentials, ad account, and page');
  });

  it('provisions Campaign, AdSet, Creative, and Ad and activates in two-stage activation', async () => {
    process.env.META_ACCESS_TOKEN = 'EAAB_test_token';
    process.env.META_AD_ACCOUNT_ID = 'act_11223344';
    process.env.META_PAGE_ID = '556677';
    process.env.META_PAGE_ID = '556677';

    const fetchCalls: Array<{ url: string; body: any }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const body = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push({ url, body });

      if (url.includes('/campaigns')) {
        return new Response(JSON.stringify({ id: '123' }), { status: 200 });
      }
      if (url.includes('/adsets')) {
        return new Response(JSON.stringify({ id: '456' }), { status: 200 });
      }
      if (url.includes('/adcreatives')) {
        return new Response(JSON.stringify({ id: '789' }), { status: 200 });
      }
      if (url.includes('/ads')) {
        return new Response(JSON.stringify({ id: '999' }), { status: 200 });
      }
      if (url.endsWith('/123') || url.endsWith('/456') || url.endsWith('/999')) {
        // Activation
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: 'Not Found' } }), { status: 404 });
    });

    const res = await provisionManagedMetaCampaign({
      accountId: 'acc_live',
      businessName: 'Texas Prime Roofing',
      trade: 'Roofing',
      city: 'San Antonio', latitude: 29.42, longitude: -98.49,
      radiusMiles: 20,
      monthlyBudgetDollars: 427,
      landingPageUrl: 'https://texasprimeroofing.com',
      durationDays: 5,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('active');
    expect(res.campaignId).toBe('123');
    expect(res.adSetId).toBe('456');
    expect(res.creativeId).toBe('789');
    expect(res.adId).toBe('999');

    // Verify 7 distinct calls: Campaign -> AdSet -> Creative -> Ad -> Camp Activation -> AdSet Activation -> Ad Activation
    expect(fetchCalls.length).toBe(7);
    expect(fetchCalls[0].body.status).toBe('PAUSED'); // Multi-stage activation starts PAUSED
    expect(fetchCalls[1].body.status).toBe('PAUSED');
    expect(fetchCalls[1].body.end_time).toMatch(/^\d{4}-\d{2}-\d{2}T/); // Provider-side duration bound
    expect(fetchCalls[3].body.status).toBe('PAUSED');
    expect(fetchCalls.slice(4).map(call => call.url.split('/').pop())).toEqual(['999', '456', '123']);
    expect(fetchCalls[4].body.status).toBe('ACTIVE'); // Campaign activation
    expect(fetchCalls[5].body.status).toBe('ACTIVE'); // AdSet activation
    expect(fetchCalls[6].body.status).toBe('ACTIVE'); // Ad activation
  });

  it('fails safely and reports failed status if Campaign creation throws an API error', async () => {
    process.env.META_ACCESS_TOKEN = 'EAAB_test_token';
    process.env.META_AD_ACCOUNT_ID = 'act_11223344';
    process.env.META_PAGE_ID = '556677';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: 'Permissions error: user does not have ads_management.' } }),
        { status: 403 }
      );
    });

    const res = await provisionManagedMetaCampaign({
      accountId: 'acc_err',
      businessName: 'Apex Roofing',
      trade: 'Roofing',
      city: 'Dallas', latitude: 32.78, longitude: -96.8,
      radiusMiles: 15,
      monthlyBudgetDollars: 300,
      landingPageUrl: 'https://apexroofing.com',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('failed');
    expect(res.message).toContain('Permissions error');
  });
});

describe('Meta Ads API — Lifecycle & Insights', () => {
  it('refuses simulated campaigns for live lifecycle operations', async () => {
    const pauseEmpty = await pauseMetaCampaign('');
    expect(pauseEmpty.success).toBe(false);

    const pauseRes = await pauseMetaCampaign('meta_123456789');
    expect(pauseRes.success).toBe(false);
    expect(pauseRes.message).toContain('Simulated');

    const resumeRes = await resumeMetaCampaign('meta_123456789');
    expect(resumeRes.success).toBe(false);
    expect(resumeRes.message).toContain('Simulated');
  });

  it('fetches daily spend insights from Meta Graph API', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              spend: '14.50',
              clicks: '8',
              impressions: '320',
              actions: [{ action_type: 'lead', value: '2' }],
            },
          ],
        }),
        { status: 200 }
      );
    });

    const res = await fetchMetaCampaignDailySpend('123', {
      accessToken: 'EAAB_test',
      adAccountId: 'act_123',
    });

    expect(res.success).toBe(true);
    expect(res.spendCents).toBe(1450);
    expect(res.clicks).toBe(8);
    expect(res.impressions).toBe(320);
    expect(res.conversions).toBe(2);
  });
});
