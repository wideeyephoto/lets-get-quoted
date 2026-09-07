import { describe, expect, it, vi, beforeEach } from 'vitest';
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

  it('pauses live Meta campaign when campaign completes duration', async () => {
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
      spend_dollars: 25.0,
      daily_budget_dollars: 5.0,
      impressions: 500,
      clicks: 20,
      leads_generated: 2,
      meta_campaign_id: 'camp_meta_live_completed_123',
      center_lat: 34.05,
      center_lng: -118.24,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    };

    let updatedPayload: any = null;
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
    } as never;

    const res = await runHaloPacingWorker(mockAdmin);
    expect(res.processed).toBe(1);
    expect(res.completed).toBe(1);
    expect(pauseMetaCampaign).toHaveBeenCalledWith('camp_meta_live_completed_123');
    expect(updatedPayload?.status).toBe('completed');
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
});
