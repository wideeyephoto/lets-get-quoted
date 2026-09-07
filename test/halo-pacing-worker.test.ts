import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runHaloPacingWorker } from '@/lib/billing/halo-pacing-worker';
import { pauseMetaCampaign, fetchMetaCampaignDailySpend } from '@/lib/meta-ads-api';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/neighborhood-halo-service', () => ({
  killHaloCampaign: vi.fn().mockResolvedValue({ id: 'halo_dead', status: 'killed' }),
}));

vi.mock('@/lib/meta-ads-api', () => ({
  fetchMetaCampaignDailySpend: vi.fn().mockResolvedValue({
    success: true,
    impressions: 340,
    clicks: 14,
    spendCents: 450,
  }),
  pauseMetaCampaign: vi.fn().mockResolvedValue({ success: true, message: 'Paused' }),
}));

describe('Halo Pacing Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('advances pacing for active campaign and completes when duration is reached', async () => {
    const activeCampaign = {
      id: 'halo_1',
      account_id: 'acc_1',
      job_id: 'job_1',
      street_name: 'Maple Ave',
      city: 'Rochester',
      status: 'active',
      duration_days: 5,
      days_active: 4,
      budget_dollars: 25.0,
      spend_dollars: 20.0,
      daily_budget_dollars: 5.0,
      impressions: 200,
      clicks: 8,
      leads_generated: 1,
      center_lat: 42.68,
      center_lng: -83.13,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    };

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [activeCampaign], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    } as never;

    const res = await runHaloPacingWorker(mockAdmin);
    expect(res.processed).toBe(1);
    expect(res.completed).toBe(1);
    expect(res.advanced).toBe(0);
    expect(res.totalDailySpendDollars).toBe(0);
  });

  it('advances active campaign by 1 day when duration not yet reached', async () => {
    const activeCampaign = {
      id: 'halo_2',
      account_id: 'acc_1',
      job_id: 'job_1',
      street_name: 'Oak Ridge Rd',
      city: 'Dallas',
      status: 'active',
      duration_days: 5,
      days_active: 1,
      budget_dollars: 25.0,
      spend_dollars: 5.0,
      daily_budget_dollars: 5.0,
      impressions: 80,
      clicks: 3,
      leads_generated: 0,
      center_lat: 32.77,
      center_lng: -96.79,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    };

    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [activeCampaign], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    } as never;

    const res = await runHaloPacingWorker(mockAdmin);
    expect(res.processed).toBe(1);
    expect(res.advanced).toBe(1);
    expect(res.completed).toBe(0);
    expect(res.totalDailySpendDollars).toBe(5.0);
  });

  it('reconciles real performance metrics from Meta Marketing API when meta_campaign_id is present', async () => {
    const metaCampaign = {
      id: 'halo_meta_1',
      account_id: 'acc_1',
      job_id: 'job_1',
      street_name: 'Pine Creek Rd',
      city: 'Austin',
      status: 'active',
      duration_days: 5,
      days_active: 2,
      budget_dollars: 25.0,
      spend_dollars: 10.0,
      daily_budget_dollars: 5.0,
      impressions: 150,
      clicks: 5,
      leads_generated: 1,
      meta_campaign_id: 'camp_meta_real_999',
      center_lat: 30.26,
      center_lng: -97.74,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    };

    let updatedPayload: any = null;
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [metaCampaign], error: null }),
          }),
        }),
        update: vi.fn().mockImplementation((payload) => {
          updatedPayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      }),
    } as never;

    const res = await runHaloPacingWorker(mockAdmin);
    expect(res.processed).toBe(1);
    expect(res.advanced).toBe(1);
    expect(updatedPayload).toBeDefined();
    expect(updatedPayload.impressions).toBe(340); // from Meta API mock
    expect(updatedPayload.clicks).toBe(14); // from Meta API mock
    expect(updatedPayload.spend_dollars).toBe(14.5); // 10.0 + 4.50 from Meta spend
  });

  it('pauses live Meta campaign when campaign completes duration and refunds unspent wallet balance', async () => {
    const expiredMetaCampaign = {
      id: 'halo_meta_exp',
      account_id: 'acc_1',
      job_id: 'job_1',
      street_name: 'Sunset Blvd',
      city: 'Los Angeles',
      status: 'active',
      duration_days: 5,
      days_active: 4,
      budget_dollars: 25.0,
      spend_dollars: 15.0,
      wallet_deducted_cents: 2500,
      daily_budget_dollars: 5.0,
      impressions: 300,
      clicks: 10,
      leads_generated: 1,
      meta_campaign_id: 'camp_meta_live_completed_123',
      center_lat: 34.05,
      center_lng: -118.24,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    };

    vi.mocked(fetchMetaCampaignDailySpend).mockResolvedValueOnce({
      success: true,
      impressions: 450,
      clicks: 18,
      spendCents: 400, // $4.00 additional -> final spend $19.00
      conversions: 2,
      date: '2026-09-07',
    });

    let updatedPayload: any = null;
    const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [expiredMetaCampaign], error: null }),
          }),
        }),
        update: vi.fn().mockImplementation((payload) => {
          updatedPayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      }),
      rpc: mockRpc,
    } as never;

    const res = await runHaloPacingWorker(mockAdmin);
    expect(res.processed).toBe(1);
    expect(res.completed).toBe(1);
    expect(res.pauseFailures).toBe(0);
    expect(pauseMetaCampaign).toHaveBeenCalledWith('camp_meta_live_completed_123');
    expect(updatedPayload?.status).toBe('completed');
    expect(updatedPayload?.spend_dollars).toBe(19.0);
    expect(updatedPayload?.impressions).toBe(450);
    expect(updatedPayload?.clicks).toBe(18);

    // Proven debited: $25 (2500c), actual spend: $19 (1900c) -> refundable: 600c ($6.00)
    expect(mockRpc).toHaveBeenCalledWith('atomic_ad_wallet_credit', {
      p_account_id: 'acc_1',
      p_payment_intent_id: 'refund_halo_complete_halo_meta_exp',
      p_credit_cents: 600,
      p_fee_cents: 0,
    });
  });

  it('leaves campaign active and increments pauseFailures when pauseMetaCampaign fails on completed campaign', async () => {
    vi.mocked(pauseMetaCampaign).mockResolvedValueOnce({
      success: false,
      message: 'Meta API rate limit or auth failure',
    });

    const expiredCampaign = {
      id: 'halo_fail_pause',
      account_id: 'acc_1',
      job_id: 'job_1',
      street_name: 'Sunset Blvd',
      city: 'Los Angeles',
      status: 'active',
      duration_days: 5,
      days_active: 5,
      budget_dollars: 25.0,
      spend_dollars: 20.0,
      wallet_deducted_cents: 2500,
      daily_budget_dollars: 5.0,
      impressions: 300,
      clicks: 10,
      leads_generated: 1,
      meta_campaign_id: 'camp_meta_rate_limited_999',
      center_lat: 34.05,
      center_lng: -118.24,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    };

    let updateCalled = false;
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [expiredCampaign], error: null }),
          }),
        }),
        update: vi.fn().mockImplementation(() => {
          updateCalled = true;
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      }),
      rpc: vi.fn(),
    } as never;

    const res = await runHaloPacingWorker(mockAdmin);
    expect(res.processed).toBe(1);
    expect(res.completed).toBe(0);
    expect(res.pauseFailures).toBe(1);
    expect(res.summary).toContain('1 pause failures');
    // Row must NOT have been updated to completed, stays active for next cron run retry
    expect(updateCalled).toBe(false);
  });

  it('does NOT add synthetic spend if Meta API insights fetch fails on live campaign', async () => {
    vi.mocked(fetchMetaCampaignDailySpend).mockResolvedValueOnce({
      success: false,
      message: 'Rate limit or network error',
      impressions: 0,
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      date: '2026-09-07',
    });

    const liveCampaign = {
      id: 'halo_meta_fail',
      account_id: 'acc_1',
      job_id: 'job_1',
      street_name: 'Elm St',
      city: 'Austin',
      status: 'active',
      duration_days: 5,
      days_active: 2,
      budget_dollars: 25.0,
      spend_dollars: 10.0,
      daily_budget_dollars: 5.0,
      impressions: 150,
      clicks: 5,
      leads_generated: 1,
      meta_campaign_id: 'camp_meta_real_999',
      center_lat: 30.26,
      center_lng: -97.74,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    };

    let updatedPayload: any = null;
    const mockAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [liveCampaign], error: null }),
          }),
        }),
        update: vi.fn().mockImplementation((payload) => {
          updatedPayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      }),
    } as never;

    const res = await runHaloPacingWorker(mockAdmin);
    expect(res.processed).toBe(1);
    expect(res.advanced).toBe(1);
    expect(res.totalDailySpendDollars).toBe(0);
    expect(updatedPayload?.spend_dollars).toBe(10.0); // Spend unchanged, NOT inflated
  });

  describe('halo-pacing cron route', () => {
    const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

    beforeEach(() => {
      process.env.CRON_SECRET = 'test-secret';
    });

    afterEach(() => {
      if (ORIGINAL_CRON_SECRET !== undefined) {
        process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
      } else {
        delete process.env.CRON_SECRET;
      }
    });

    it('surfaces pauseFailures and fails the run (status 500) when pauseFailures > 0', async () => {
      const { GET: haloPacingRoute } = await import('@/app/api/cron/halo-pacing/route');
      const { createAdminClient } = await import('@/lib/auth');

      const expiredCampaign = {
        id: 'halo_fail_pause_route',
        account_id: 'acc_1',
        status: 'active',
        duration_days: 5,
        days_active: 5,
        budget_dollars: 25.0,
        spend_dollars: 20.0,
        wallet_deducted_cents: 2500,
        daily_budget_dollars: 5.0,
        meta_campaign_id: 'camp_meta_fail_123',
        created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      };

      const cronBuilder: Record<string, any> = {};
      cronBuilder.insert = vi.fn(() => cronBuilder);
      cronBuilder.select = vi.fn(() => cronBuilder);
      cronBuilder.maybeSingle = vi.fn(async () => ({ data: { id: 'run_123' }, error: null }));
      cronBuilder.update = vi.fn(() => cronBuilder);
      cronBuilder.eq = vi.fn(async () => ({ data: null, error: null }));
      cronBuilder.delete = vi.fn(() => cronBuilder);
      cronBuilder.lt = vi.fn(async () => ({ data: null, error: null }));

      const haloBuilder: Record<string, any> = {};
      haloBuilder.select = vi.fn(() => haloBuilder);
      haloBuilder.in = vi.fn(() => haloBuilder);
      haloBuilder.is = vi.fn(async () => ({ data: [expiredCampaign], error: null }));
      haloBuilder.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));

      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === 'cron_runs') return cronBuilder;
          return haloBuilder;
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never);
      vi.mocked(pauseMetaCampaign).mockResolvedValueOnce({
        success: false,
        message: 'Rate limit',
      });

      const req = new Request('http://localhost/api/cron/halo-pacing', {
        headers: { authorization: 'Bearer test-secret' },
      });

      const res = await haloPacingRoute(req);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).toBe('halo-pacing reported failed work');
      expect(body.summary.pauseFailures).toBe(1);
      expect(body.summary.failures).toBe(1);
    });

    it('succeeds (status 200) and surfaces pauseFailures: 0 when no pause failures occur', async () => {
      const { GET: haloPacingRoute } = await import('@/app/api/cron/halo-pacing/route');
      const { createAdminClient } = await import('@/lib/auth');

      const cronBuilder: Record<string, any> = {};
      cronBuilder.insert = vi.fn(() => cronBuilder);
      cronBuilder.select = vi.fn(() => cronBuilder);
      cronBuilder.maybeSingle = vi.fn(async () => ({ data: { id: 'run_123' }, error: null }));
      cronBuilder.update = vi.fn(() => cronBuilder);
      cronBuilder.eq = vi.fn(async () => ({ data: null, error: null }));
      cronBuilder.delete = vi.fn(() => cronBuilder);
      cronBuilder.lt = vi.fn(async () => ({ data: null, error: null }));

      const haloBuilder: Record<string, any> = {};
      haloBuilder.select = vi.fn(() => haloBuilder);
      haloBuilder.in = vi.fn(() => haloBuilder);
      haloBuilder.is = vi.fn(async () => ({ data: [], error: null }));

      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === 'cron_runs') return cronBuilder;
          return haloBuilder;
        }),
      };

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never);

      const req = new Request('http://localhost/api/cron/halo-pacing', {
        headers: { authorization: 'Bearer test-secret' },
      });

      const res = await haloPacingRoute(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.pauseFailures).toBe(0);
      expect(body.failures).toBe(0);
    });
  });
});
