import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';

let mockCreatedSessionConfig: any = null;

vi.mock('@/lib/stripe', () => ({
  toCents: (d: number) => Math.round(d * 100),
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: async (config: any) => {
          mockCreatedSessionConfig = config;
          return { id: 'cs_test_scale', url: 'https://checkout.stripe.com/pay/cs_test_scale' };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async () => ({ url: 'https://billing.stripe.com/portal' }),
      },
    },
  }),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: 'acc_scale_test', stripe_customer_id: 'cus_mock_123', business_name: 'Apex Roofing' },
          }),
          maybeSingle: async () => ({
            data: { id: 'acc_scale_test', stripe_customer_id: 'cus_mock_123', business_name: 'Apex Roofing' },
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import {
  createAdBudgetCheckoutSession,
  handleAdBudgetWebhookEvent,
  pauseAdCampaign,
  resumeAdCampaign,
  syncAccountAdSpendUsage,
} from '@/lib/ad-billing';
import * as metaAdsModule from '@/lib/meta-ads-api';
import * as googleAdsModule from '@/lib/google-ads-api';

describe('Multi-Channel Ads Autopilot — Provisioning & Spend Reconciliation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED = 'true';
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
    mockCreatedSessionConfig = null;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createAdBudgetCheckoutSession — Multi-Channel Validation & Metadata', () => {
    it('embeds channel budget allocations in Stripe Checkout metadata for Scale bundle', async () => {
      const res = await createAdBudgetCheckoutSession({
        accountId: 'acc_scale_test',
        bundleId: 'scale',
        businessName: 'Apex Roofing',
        trade: 'Roofing',
        city: 'Denver',
        returnUrl: 'https://apexroofing.com/dashboard/marketing/ads',
      });

      expect(res.sessionId).toBe('cs_test_scale');
      expect(mockCreatedSessionConfig).toBeTruthy();
      expect(mockCreatedSessionConfig.metadata.bundle_id).toBe('scale');
      expect(mockCreatedSessionConfig.metadata.meta_spend_dollars).toBe('427');
      expect(mockCreatedSessionConfig.metadata.search_spend_dollars).toBe('1800');
      expect(mockCreatedSessionConfig.metadata.retargeting_spend_dollars).toBe('200');
    });

    it('blocks multi-channel checkout in production when Meta credentials are not configured', async () => {
      process.env.VERCEL_ENV = 'production';
      process.env.GOOGLE_ADS_CLIENT_ID = 'mock';
      process.env.GOOGLE_ADS_CLIENT_SECRET = 'mock';
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'mock';
      process.env.GOOGLE_ADS_REFRESH_TOKEN = 'mock';
      process.env.GOOGLE_ADS_CLIENT_CUSTOMER_ID = '1234567890';

      delete process.env.META_ACCESS_TOKEN;
      delete process.env.META_AD_ACCOUNT_ID;

      await expect(
        createAdBudgetCheckoutSession({
          accountId: 'acc_scale_prod',
          bundleId: 'scale',
          businessName: 'Apex Roofing',
          trade: 'Roofing',
          city: 'Denver',
          returnUrl: 'https://apexroofing.com/dashboard/marketing/ads',
        })
      ).rejects.toThrow(/Meta Ads automated provisioning is currently undergoing configuration/);
    });
  });

  describe('handleAdBudgetWebhookEvent — Dual Provisioning & State Persistence', () => {
    it('provisions both Google Search and Meta Feed campaigns and records both in wallet state', async () => {
      let savedSiteContent: any = null;

      const mockAdmin: any = {
        from: (table: string) => {
          if (table === 'sites') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'site_scale_123',
                      account_id: 'acc_scale_test',
                      subdomain: 'apexroofing',
                      content: {},
                    },
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: async () => {
                  savedSiteContent = payload.content;
                  return { error: null };
                },
              }),
            };
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        },
      };

      vi.spyOn(googleAdsModule, 'provisionManagedSearchCampaign').mockResolvedValue({
        success: true,
        campaignId: 'gads_998877665',
        campaignResourceName: 'customers/123/campaigns/998877665',
        adGroupId: 'ag_9988',
        status: 'active',
        dailyBudgetDollars: 59.21,
        headlinesCount: 5,
        descriptionsCount: 4,
        keywordsCount: 20,
        negativeKeywordsCount: 50,
      });

      vi.spyOn(metaAdsModule, 'provisionManagedMetaCampaign').mockResolvedValue({
        success: true,
        campaignId: 'meta_112233445',
        adSetId: 'adset_5566',
        creativeId: 'cr_7788',
        adId: 'ad_9900',
        status: 'active',
        dailyBudgetDollars: 14.05,
        headline: 'Top-Rated Roofing in Denver',
        primaryText: 'Get a quote today',
        message: 'Meta campaign deployed',
      });

      const sessionEvent: Stripe.Event = {
        id: 'evt_checkout_scale',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_scale_live_123',
            payment_status: 'paid',
            subscription: 'sub_scale_123',
            customer: 'cus_scale_123',
            metadata: {
              kind: 'ad_budget',
              funding_model: 'weekly_drip',
              account_id: 'acc_scale_test',
              bundle_id: 'scale',
              meta_spend_dollars: '427',
              search_spend_dollars: '1800',
              retargeting_spend_dollars: '200',
              business_name: 'Apex Roofing',
              trade: 'Roofing',
              city: 'Denver',
              weekly_ad_spend_cents: '56000',
              weekly_fee_cents: '2800',
              monthly_budget_cents: '242700',
            },
          } as unknown as Stripe.Checkout.Session,
        },
      } as Stripe.Event;

      const processed = await handleAdBudgetWebhookEvent(sessionEvent, mockAdmin);
      expect(processed).toBe(true);
      expect(savedSiteContent).toBeTruthy();

      const adState = savedSiteContent.adCampaign;
      expect(adState.status).toBe('active');
      expect(adState.googleCampaignId).toBe('gads_998877665');
      expect(adState.metaCampaignId).toBe('meta_112233445');
      expect(adState.metaAdSetId).toBe('adset_5566');
      expect(adState.metaProvisioningStatus).toBe('active');
      expect(adState.channelAllocations).toEqual({
        googleSpendMonthlyDollars: 1800,
        metaSpendMonthlyDollars: 427,
        retargetingMonthlyDollars: 200,
      });
    });
  });

  describe('Campaign Pause / Resume Dual Control', () => {
    it('dispatches pause to both Google and Meta campaigns', async () => {
      const gSpy = vi.spyOn(googleAdsModule, 'updateGoogleAdsCampaignStatus').mockResolvedValue({
        success: true,
        campaignId: 'gads_123',
        status: 'PAUSED',
        message: 'Paused',
      });

      const mSpy = vi.spyOn(metaAdsModule, 'pauseMetaCampaign').mockResolvedValue({
        success: true,
        message: 'Meta campaign paused',
      });

      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_1',
                  content: {
                    adCampaign: {
                      status: 'active',
                      googleCampaignId: 'gads_123',
                      metaCampaignId: 'meta_456',
                    },
                  },
                },
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }),
      };

      const res = await pauseAdCampaign(mockAdmin, 'acc_test');
      expect(res.success).toBe(true);
      expect(gSpy).toHaveBeenCalledWith('gads_123', 'PAUSED');
      expect(mSpy).toHaveBeenCalledWith('meta_456');
    });

    it('dispatches resume to both Google and Meta campaigns', async () => {
      const gSpy = vi.spyOn(googleAdsModule, 'updateGoogleAdsCampaignStatus').mockResolvedValue({
        success: true,
        campaignId: 'gads_123',
        status: 'ENABLED',
        message: 'Resumed',
      });

      const mSpy = vi.spyOn(metaAdsModule, 'resumeMetaCampaign').mockResolvedValue({
        success: true,
        message: 'Meta campaign resumed',
      });

      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_1',
                  content: {
                    adCampaign: {
                      status: 'paused',
                      googleCampaignId: 'gads_123',
                      metaCampaignId: 'meta_456',
                    },
                  },
                },
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }),
      };

      const res = await resumeAdCampaign(mockAdmin, 'acc_test');
      expect(res.success).toBe(true);
      expect(gSpy).toHaveBeenCalledWith('gads_123', 'ENABLED');
      expect(mSpy).toHaveBeenCalledWith('meta_456');
    });
  });

  describe('syncAccountAdSpendUsage — Multi-Channel Spend Aggregation & Wallet Protection', () => {
    it('aggregates Google ($30) and Meta ($15) daily spend into a single $45 wallet debit', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      vi.spyOn(googleAdsModule, 'fetchGoogleAdsCampaignDailySpend').mockResolvedValue({
        success: true,
        data: [
          {
            date: todayStr,
            spendCents: 3000,
            clicks: 5,
            impressions: 120,
            conversions: 1,
          },
        ],
      });

      vi.spyOn(metaAdsModule, 'fetchMetaCampaignDailySpend').mockResolvedValue({
        success: true,
        spendCents: 1500,
        clicks: 10,
        impressions: 400,
        conversions: 1,
        date: todayStr,
      });

      let updatedState: any = null;
      const mockAdmin: any = {
        rpc: async () => ({ error: { message: 'no rpc in mock' } }),
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_1',
                  content: {
                    adCampaign: {
                      status: 'active',
                      googleCampaignId: 'gads_123',
                      metaCampaignId: 'meta_456',
                      walletBalanceCents: 25000,
                      dailySpendHistory: [],
                    },
                  },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              updatedState = payload.content.adCampaign;
              return { error: null };
            },
          }),
        }),
      };

      const syncResult = await syncAccountAdSpendUsage(mockAdmin, 'acc_test');
      expect(syncResult.success).toBe(true);
      expect(syncResult.spendRecordedCents).toBe(4500); // $30 + $15 = $45

      expect(updatedState).toBeTruthy();
      expect(updatedState.walletBalanceCents).toBe(20500); // $250 - $45 = $205
      expect(updatedState.dailySpendHistory.length).toBe(1);
      expect(updatedState.dailySpendHistory[0].spendCents).toBe(4500);
      expect(updatedState.dailySpendHistory[0].clicks).toBe(15);
      expect(updatedState.dailySpendHistory[0].impressions).toBe(520);
      expect(updatedState.dailySpendHistory[0].conversions).toBe(2);
    });

    it('calculates delta spend correctly on repeated sync calls without double debiting wallet', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      // Google now reports $35 (up from $30) and Meta still reports $15 (total $50, up from $45)
      vi.spyOn(googleAdsModule, 'fetchGoogleAdsCampaignDailySpend').mockResolvedValue({
        success: true,
        data: [
          {
            date: todayStr,
            spendCents: 3500,
            clicks: 6,
            impressions: 140,
            conversions: 1,
          },
        ],
      });

      vi.spyOn(metaAdsModule, 'fetchMetaCampaignDailySpend').mockResolvedValue({
        success: true,
        spendCents: 1500,
        clicks: 10,
        impressions: 400,
        conversions: 1,
        date: todayStr,
      });

      let updatedState: any = null;
      const mockAdmin: any = {
        rpc: async () => ({ error: { message: 'no rpc in mock' } }),
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_1',
                  content: {
                    adCampaign: {
                      status: 'active',
                      googleCampaignId: 'gads_123',
                      metaCampaignId: 'meta_456',
                      walletBalanceCents: 20500, // already debited $45 previously
                      spendThisMonthCents: 4500,
                      totalSpendAllTimeCents: 4500,
                      lastSpendSyncAt: `${todayStr}T10:00:00Z`,
                      dailySpendHistory: [
                        {
                          date: todayStr,
                          spendCents: 4500,
                          clicks: 15,
                          impressions: 520,
                          conversions: 2,
                          source: 'google_ads_api',
                          recordedAt: `${todayStr}T10:00:00Z`,
                        },
                      ],
                    },
                  },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              updatedState = payload.content.adCampaign;
              return { error: null };
            },
          }),
        }),
      };

      const syncResult = await syncAccountAdSpendUsage(mockAdmin, 'acc_test');
      expect(syncResult.success).toBe(true);
      expect(syncResult.spendRecordedCents).toBe(5000); // day total is $50

      expect(updatedState).toBeTruthy();
      // Delta was $50 - $45 = $5. New balance should be $205 - $5 = $200
      expect(updatedState.walletBalanceCents).toBe(20000);
      expect(updatedState.spendThisMonthCents).toBe(5000);
      expect(updatedState.dailySpendHistory.length).toBe(1);
      expect(updatedState.dailySpendHistory[0].spendCents).toBe(5000);
      expect(updatedState.dailySpendHistory[0].clicks).toBe(16);
    });
  });
});
