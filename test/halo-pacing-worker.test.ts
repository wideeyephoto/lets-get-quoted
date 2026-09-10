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

  function fixture(overrides: any = {}) {
    const row = { id: 'halo', account_id: 'account', status: 'active', meta_campaign_id: '123', budget_dollars: 25, spend_dollars: 0,
      created_at: new Date(Date.now()-86400000).toISOString(), updated_at: new Date().toISOString(), expires_at: new Date(Date.now()+86400000).toISOString(), ...overrides };
    const admin: any = { rpc: vi.fn().mockResolvedValue({ data: true }), from: () => ({ select: () => ({ in: () => ({ is: async () => ({ data: [row], error: null }) }) }) }) };
    return { admin, row };
  }
  it('refreshes lifetime metrics instead of incrementing synthetic spend', async () => {
    vi.mocked(fetchMetaCampaignDailySpend).mockResolvedValue({ success: true, spendCents: 450, impressions: 340, clicks: 14 } as never);
    const { admin } = fixture(); const result = await runHaloPacingWorker(admin);
    expect(result.advanced).toBe(1); expect(result.totalDailySpendDollars).toBe(4.5);
    expect(fetchMetaCampaignDailySpend).toHaveBeenCalledWith('123', undefined, 'maximum');
    expect(admin.rpc).toHaveBeenCalledWith('sync_halo_metrics', expect.objectContaining({ p_spend_cents: 450 }));
  });
  it('requests a stop at expiry and keeps funds held during settlement', async () => {
    const { killHaloCampaign } = await import('@/lib/neighborhood-halo-service'); vi.mocked(killHaloCampaign).mockResolvedValue({ status: 'paused' } as never);
    const { admin } = fixture({ expires_at: '2020-01-01' }); const result = await runHaloPacingWorker(admin);
    expect(killHaloCampaign).toHaveBeenCalledWith(admin, 'account', 'halo', 'duration_complete'); expect(result.completed).toBe(0);
  });
  it('reconciles stopped campaigns until final settlement completes', async () => {
    const { killHaloCampaign } = await import('@/lib/neighborhood-halo-service'); vi.mocked(killHaloCampaign).mockResolvedValue({ status: 'completed' } as never);
    const { admin } = fixture({ status: 'paused', settlement_requested_at: '2020-01-01' }); expect((await runHaloPacingWorker(admin)).completed).toBe(1);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('reports provider pause failures without announcing completion', async () => {
    const { killHaloCampaign } = await import('@/lib/neighborhood-halo-service'); vi.mocked(killHaloCampaign).mockRejectedValueOnce(new Error('Pause failed'));
    const { admin } = fixture({ expires_at: '2020-01-01' }); const result = await runHaloPacingWorker(admin); expect(result.pauseFailures).toBe(1); expect(result.completed).toBe(0);
  });
  it('does not fabricate metrics when insights fails', async () => {
    vi.mocked(fetchMetaCampaignDailySpend).mockResolvedValueOnce({ success: false } as never); const { admin } = fixture();
    expect((await runHaloPacingWorker(admin)).pauseFailures).toBe(1); expect(admin.rpc).not.toHaveBeenCalled();
  });
  it('refuses simulated campaigns and reports failed metric writes', async () => {
    const simulated = fixture({ meta_campaign_id: 'meta_123' }); expect((await runHaloPacingWorker(simulated.admin)).pauseFailures).toBe(1); expect(simulated.admin.rpc).not.toHaveBeenCalled();
    const { admin } = fixture(); admin.rpc.mockResolvedValue({ data: null, error: { message: 'DB unavailable' } }); expect((await runHaloPacingWorker(admin)).pauseFailures).toBe(1);
  });
  it('recovers abandoned provisioning and pauses zero-click campaigns', async () => {
    const { killHaloCampaign } = await import('@/lib/neighborhood-halo-service'); vi.mocked(killHaloCampaign).mockResolvedValue({ status: 'killed' } as never);
    const pending = fixture({ status: 'pending_provisioning', updated_at: '2020-01-01' }); await runHaloPacingWorker(pending.admin); expect(killHaloCampaign).toHaveBeenCalledWith(pending.admin, 'account', 'halo', 'incomplete_provisioning');
    vi.mocked(fetchMetaCampaignDailySpend).mockResolvedValueOnce({ success: true, spendCents: 450, clicks: 0, impressions: 0 } as never);
    const zero = fixture({ created_at: new Date(Date.now()-74*3600000).toISOString() }); expect((await runHaloPacingWorker(zero.admin)).killed).toBe(1);
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
