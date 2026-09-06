import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runHaloPacingWorker } from '@/lib/billing/halo-pacing-worker';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/neighborhood-halo-service', () => ({
  killHaloCampaign: vi.fn().mockResolvedValue({ id: 'halo_dead', status: 'killed' }),
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
      days_active: 4, // on next run, will hit 5 and complete
      budget_dollars: 25.0,
      spend_dollars: 20.0,
      daily_budget_dollars: 5.0,
      impressions: 200,
      clicks: 8,
      leads_generated: 1,
      center_lat: 42.68,
      center_lng: -83.13,
      radius_miles: 1.0,
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
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
    expect(res.totalDailySpendDollars).toBe(5.0);
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
});
