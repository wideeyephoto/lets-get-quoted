import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchGoogleAdsCampaignDailySpend,
  updateCampaignBidModifier,
  teardownPartialCampaign,
  resolveServingCustomerId,
} from '@/lib/google-ads-api';
import {
  syncAccountAdSpendUsage,
  processAllAdSpendSync,
  executeWalletRefillCharge,
  processAllWalletAutoRefills,
} from '@/lib/ad-billing';
import { preserveAdCampaign } from '@/lib/site-content';

describe('Google Ads Launch Hardening & Defect Remediation Suite', () => {
  describe('1. Serving Customer ID Guard & MCC Rejection', () => {
    it('resolveServingCustomerId strictly refuses MCC/manager account ID', () => {
      const config = {
        mccCustomerId: '111-222-3333',
        clientCustomerId: '111-222-3333', // identical to MCC
      };
      expect(resolveServingCustomerId(undefined, config)).toBeNull();
      expect(resolveServingCustomerId('1112223333', config)).toBeNull();
      expect(resolveServingCustomerId('444-555-6666', config)).toBe('4445556666');
    });

    it('updateCampaignBidModifier fails closed when serving customer ID is not resolved', async () => {
      const res = await updateCampaignBidModifier({
        campaignId: 'camp_123',
        bidModifier: 1.35,
        config: {
          developerToken: 'mock-dev-token',
          clientId: 'mock-client-id',
          clientSecret: 'mock-secret',
          refreshToken: 'mock-refresh-token',
          mccCustomerId: '111-222-3333',
          clientCustomerId: '111-222-3333', // MCC ID supplied as client ID
        },
      });
      // Without a distinct serving clientCustomerId, it must fail closed and refuse MCC
      expect(res.success).toBe(false);
      expect(res.message).toContain('Google Ads requires a valid serving advertiser account ID');
    });

    it('fetchGoogleAdsCampaignDailySpend fails closed when serving customer ID is not resolved', async () => {
      const res = await fetchGoogleAdsCampaignDailySpend('camp_123');
      expect(res.success).toBe(false);
      expect(res.totalSpendCents).toBe(0);
      expect(res.message).toMatch(/Google Ads API (not configured|requires an active serving advertiser)/);
    });
  });

  describe('2. Compensating Teardown on Partial Provisioning Failure', () => {
    it('issues REMOVED mutation on orphaned campaign resource', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ resourceName: 'customers/123/campaigns/456' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const msg = await teardownPartialCampaign(
        '1234567890',
        'customers/1234567890/campaigns/456',
        { Authorization: 'Bearer test' }
      );

      expect(fetchSpy).toHaveBeenCalled();
      const [url, req] = fetchSpy.mock.calls[0];
      expect(url).toContain('/customers/1234567890/campaigns:mutate');
      const body = JSON.parse(req?.body as string);
      expect(body.operations[0].update.status).toBe('REMOVED');
      expect(body.operations[0].updateMask).toBe('status');
      expect(msg).toContain('orphaned campaign REMOVED');

      fetchSpy.mockRestore();
    });
  });

  describe('3. Emergency Kill-Switch Halts Wallet Auto-Refills', () => {
    const originalEnv = process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED;
      } else {
        process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED = originalEnv;
      }
    });

    it('processAllWalletAutoRefills immediately halts and returns pausedByKillSwitch when flag is false', async () => {
      process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED = 'false';

      const mockAdmin = {} as any;
      const res = await processAllWalletAutoRefills(mockAdmin);

      expect(res.processed).toBe(0);
      expect(res.refilled).toBe(0);
      expect(res.pausedByKillSwitch).toBe(true);
    });

    it('executeWalletRefillCharge refuses off-session charge when flag is false unless force is set', async () => {
      process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED = 'false';

      const mockAdmin = {} as any;
      const res = await executeWalletRefillCharge({
        admin: mockAdmin,
        accountId: 'acc_test_123',
      });

      expect(res.success).toBe(false);
      expect(res.refilled).toBe(false);
      expect(res.message).toContain('Automated wallet refills are paused while Managed Ads checkout is in private preview');
    });
  });

  describe('4. Spend-Sync Fails Closed on API Errors (No False Green)', () => {
    it('syncAccountAdSpendUsage fails closed and records lastSpendSyncError when Google Ads API rejects', async () => {
      const siteContent = {
        adCampaign: {
          status: 'active',
          fundingModel: 'auto_refill_wallet',
          walletBalanceCents: 20000,
          googleCampaignId: 'camp_live_999',
        },
      };

      let updatedState: any = null;
      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'site_123', content: siteContent },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              updatedState = payload.content?.adCampaign;
              return { error: null };
            },
          }),
        }),
      };

      const res = await syncAccountAdSpendUsage(mockAdmin, 'acc_123');

      // Since fetchGoogleAdsCampaignDailySpend fails in unconfigured test env,
      // it must return success: false and record the error!
      expect(res.success).toBe(false);
      expect(res.spendRecordedCents).toBe(0);
      expect(res.message).toMatch(/Google Ads (API not configured|spend query failed)/);
      expect(updatedState?.lastSpendSyncError).toBeDefined();
    });

    it('processAllAdSpendSync accurately counts succeeded and failed accounts', async () => {
      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            not: () => ({
              data: [
                {
                  id: 'site_1',
                  account_id: 'acc_1',
                  content: {
                    adCampaign: {
                      status: 'active',
                      googleCampaignId: 'camp_live_1',
                    },
                  },
                },
              ],
            }),
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_1',
                  content: {
                    adCampaign: {
                      status: 'active',
                      googleCampaignId: 'camp_live_1',
                    },
                  },
                },
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      };

      const result = await processAllAdSpendSync(mockAdmin);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].accountId).toBe('acc_1');
    });
  });

  describe('5. CMS Content & Ad Wallet Concurrency Safety', () => {
    it('preserveAdCampaign preserves wallet balance and campaign state during website builder saves', () => {
      const storedContent = {
        company_name: 'Original Name',
        adCampaign: {
          status: 'active',
          fundingModel: 'auto_refill_wallet',
          walletBalanceCents: 18500,
          spendThisMonthCents: 6500,
          googleCampaignId: 'camp_live_777',
        },
      };

      // Incoming content from website builder opened earlier (without adCampaign or with stale balance)
      const incomingContent = {
        company_name: 'Updated Company Name',
        headline: 'New Shiny Headline',
      };

      const preserved = preserveAdCampaign(storedContent, incomingContent);

      expect(preserved.company_name).toBe('Updated Company Name');
      expect(preserved.headline).toBe('New Shiny Headline');
      expect((preserved as any).adCampaign).toBeDefined();
      expect((preserved as any).adCampaign.walletBalanceCents).toBe(18500);
      expect((preserved as any).adCampaign.googleCampaignId).toBe('camp_live_777');
    });
  });
});
