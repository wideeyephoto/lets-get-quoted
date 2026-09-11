import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getHaloSettings,
  updateHaloSettings,
  qualifyAndPreviewJob,
  launchHaloCampaign,
  pauseHaloCampaign,
  resumeHaloCampaign,
  killHaloCampaign,
  triggerNeighborhoodHaloOnJobComplete,
  DEFAULT_HALO_SETTINGS,
} from '@/lib/neighborhood-halo-service';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/job-photo-storage', () => ({
  createJobPhotoLinks: vi.fn().mockResolvedValue([
    { path: 'photo1.jpg', url: 'https://example.com/photo1.jpg' },
    { path: 'photo2.jpg', url: 'https://example.com/photo2.jpg' },
  ]),
}));

vi.mock('@/lib/google-ads-api', () => ({
  isGoogleAdsConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/meta-ads-api', () => ({
  isMetaAdsConfigured: vi.fn().mockReturnValue(false),
  provisionManagedMetaCampaign: vi.fn(),
  pauseMetaCampaign: vi.fn().mockResolvedValue({ success: true, message: 'Paused' }),
  resumeMetaCampaign: vi.fn().mockResolvedValue({ success: true, message: 'Resumed' }),
  activateMetaCampaign: vi.fn(),
  fetchMetaCampaignDailySpend: vi.fn(),
}));

describe('Neighborhood Halo Service', () => {
  const accountId = 'acc_test_123';
  const jobId = 'job_test_456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getHaloSettings & updateHaloSettings', () => {
    it('returns default settings when account has no record', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as never;

      const settings = await getHaloSettings(mockSupabase, accountId);
      expect(settings.accountId).toBe(accountId);
      expect(settings.autoLaunchEnabled).toBe(false);
      expect(settings.defaultRadiusMiles).toBe(1.0);
      expect(settings.perJobBudgetDollars).toBe(25.0);
      expect(settings.monthlySpendCapDollars).toBe(250.0);
      expect(settings.requirePhotos).toBe(true);
    });

    it('updates halo settings via upsert', async () => {
      const updatedRow = {
        account_id: accountId,
        auto_launch_enabled: true,
        default_radius_miles: 1.5,
        per_job_budget_dollars: 30.0,
        monthly_spend_cap_dollars: 300.0,
        require_photos: false,
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'neighborhood_halo_settings') {
            return {
              upsert: vi.fn().mockResolvedValue({ error: null }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      } as never;

      const result = await updateHaloSettings(mockSupabase, accountId, {
        autoLaunchEnabled: true,
        defaultRadiusMiles: 1.5,
        perJobBudgetDollars: 30.0,
        monthlySpendCapDollars: 300.0,
        requirePhotos: false,
      });

      expect(result.autoLaunchEnabled).toBe(true);
      expect(result.defaultRadiusMiles).toBe(1.5);
      expect(result.perJobBudgetDollars).toBe(30.0);
    });
  });

  describe('qualifyAndPreviewJob', () => {
    it('generates sanitized address and creative preview for completed job', async () => {
      const mockJob = {
        id: jobId,
        account_id: accountId,
        ref: 'JOB-101',
        status: 'complete',
        address: '1428 Maple Ave, Rochester, MI 48307',
        quoted_amount: 4500,
        scope: 'Roof replacement',
        trade: 'Roofing',
        lat: 42.6806,
        lng: -83.1338,
        created_at: '2026-09-01T12:00:00Z',
        photo_paths: ['photo1.jpg', 'photo2.jpg'],
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'jobs') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockJob, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'accounts' || table === 'sites') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { business_name: 'Apex Roofing', phone: '555-123-4567', subdomain: 'apex' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as never;

      const preview = await qualifyAndPreviewJob(mockSupabase, accountId, jobId);

      expect(preview.qualification.qualified).toBe(true);
      expect(preview.sanitizedAddress).toContain('Maple Ave');
      expect(preview.photoUrls.length).toBe(2);
      expect(preview.creative?.copy.headline).toBeDefined();
      expect(preview.creative?.copy.headline).toContain('Maple Ave');
    });
  });

  describe('durable launch and delivery lifecycle', () => {
    let rows: any[];
    let job: any;
    let reserveError: any;
    let writeError: any;
    let admin: any;
    let meta: typeof import('@/lib/meta-ads-api');
    beforeEach(async () => {
      rows = []; reserveError = null; writeError = null;
      job = { id: jobId, account_id: accountId, status: 'complete', address: '100 Main St, Austin, TX 78701', lat: 30.27, lng: -97.74, photo_paths: ['photo.jpg'] };
      meta = await import('@/lib/meta-ads-api');
      vi.mocked(meta.isMetaAdsConfigured).mockReturnValue(true);
      vi.mocked(meta.provisionManagedMetaCampaign).mockResolvedValue({ success: true, status: 'paused', campaignId: '123', adSetId: '456', creativeId: '789', adId: '999', dailyBudgetDollars: 5, headline: 'Example', primaryText: 'Example', message: 'Created' });
      vi.mocked(meta.activateMetaCampaign).mockResolvedValue({ success: true, message: 'Active' });
      vi.mocked(meta.pauseMetaCampaign).mockResolvedValue({ success: true, message: 'Paused' });
      vi.mocked(meta.fetchMetaCampaignDailySpend).mockResolvedValue({ success: true, spendCents: 700, clicks: 2, impressions: 30, conversions: 0, date: '2026-09-10' });
      admin = { rpc: vi.fn(async (name, args) => {
        if (name === 'claim_halo_delivery' || name === 'release_halo_delivery') return { data: true, error: null };
        if (name === 'reserve_halo_campaign') {
          if (reserveError) return { data: null, error: reserveError };
          const row = { ...args.p_details, id: args.p_campaign_id, account_id: args.p_account_id }; rows.push(row); return { data: row };
        }
        if (name === 'settle_halo_campaign') { const row = rows.find(r => r.id === args.p_campaign_id); Object.assign(row, { status: args.p_status, spend_dollars: args.p_spend_cents / 100 }); return { data: row }; }
        throw new Error(`Unexpected RPC ${name}`);
      }), from: (table: string) => {
        const filters: any = {}; let update: any;
        const result = () => {
          if (table === 'jobs') return { data: job };
          if (table === 'neighborhood_halo_settings') return { data: null };
          if (table === 'accounts') return { data: { business_name: 'Example Plumbing' } };
          if (table === 'sites') return { data: { subdomain: 'example', content: {} } };
          const matched = rows.filter(r => Object.entries(filters).every(([k,v]) => r[k] === v));
          if (update && !writeError) matched.forEach(r => Object.assign(r, update));
          return { data: matched, error: update ? writeError : null };
        };
        const q: any = { select: () => q, eq: (k: string,v: unknown) => { filters[k] = v; return q; }, is: () => q, in: () => q, gte: () => q, order: () => q, limit: () => q,
          update: (value: any) => { update = value; return q; },
          maybeSingle: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] || null : r.data }; },
          single: async () => q.maybeSingle(), then: (resolve: any) => Promise.resolve(result()).then(resolve) }; return q;
      } };
      const { createAdminClient } = await import('@/lib/auth'); vi.mocked(createAdminClient).mockReturnValue(admin);
    });
    function existing(overrides: any = {}) { const row = { id: 'halo', account_id: accountId, status: 'active', meta_campaign_id: '123', meta_ad_set_id: '456', meta_ad_id: '999', wallet_deducted_cents: 2500, spend_dollars: 0, budget_dollars: 25, expires_at: new Date(Date.now()+86400000).toISOString(), ...overrides }; rows.push(row); return row; }
    it('reserves funds and persists all provider IDs before activation', async () => {
      vi.mocked(meta.activateMetaCampaign).mockImplementation(async () => { expect(rows[0]).toMatchObject({ status: 'pending_provisioning', meta_campaign_id: '123', meta_ad_set_id: '456', meta_ad_id: '999' }); return { success: true, message: 'Active' }; });
      const result = await launchHaloCampaign(admin, accountId, jobId);
      expect(result.status).toBe('active'); expect(meta.provisionManagedMetaCampaign).toHaveBeenCalledWith(expect.objectContaining({ startPaused: true, lifetimeBudgetDollars: 25, imageUrl: 'https://example.com/photo1.jpg' }));
    });
    it('does not reserve money for missing coordinates, configuration, or incomplete jobs', async () => {
      job.lat = null; await expect(launchHaloCampaign(admin, accountId, jobId)).rejects.toThrow(/coordinates/);
      job.lat = 30; vi.mocked(meta.isMetaAdsConfigured).mockReturnValue(false); await expect(launchHaloCampaign(admin, accountId, jobId)).rejects.toThrow(/configured/);
      job.status = 'scheduled'; await expect(launchHaloCampaign(admin, accountId, jobId)).rejects.toThrow(/completed/); expect(admin.rpc).not.toHaveBeenCalled();
    });
    it.each(['INSUFFICIENT_WALLET_BALANCE', 'Monthly Halo spending cap exceeded', 'An existing Halo covers this zone'])('propagates reservation failure: %s', async message => {
      reserveError = { message }; await expect(launchHaloCampaign(admin, accountId, jobId)).rejects.toThrow(message); expect(meta.provisionManagedMetaCampaign).not.toHaveBeenCalled();
    });
    it('stops a partial provider launch and releases its unused reservation', async () => {
      vi.mocked(meta.provisionManagedMetaCampaign).mockResolvedValue({ success: false, status: 'failed', campaignId: '123', dailyBudgetDollars: 5, headline: '', primaryText: '', message: 'Creative rejected' });
      await expect(launchHaloCampaign(admin, accountId, jobId)).rejects.toThrow(/Creative rejected/);
      expect(meta.pauseMetaCampaign).toHaveBeenCalledWith('123'); expect(rows[0].status).toBe('failed'); expect(meta.activateMetaCampaign).not.toHaveBeenCalled();
    });
    it('never activates when saving provider resources fails', async () => {
      writeError = { message: 'DB unavailable' }; await expect(launchHaloCampaign(admin, accountId, jobId)).rejects.toThrow(); expect(meta.activateMetaCampaign).not.toHaveBeenCalled();
    });
    it('pauses, then resumes all saved delivery resources', async () => {
      existing(); expect((await pauseHaloCampaign(admin, accountId, 'halo')).status).toBe('paused'); expect((await resumeHaloCampaign(admin, accountId, 'halo')).status).toBe('active');
      expect(meta.activateMetaCampaign).toHaveBeenCalledWith({ campaignId: '123', adSetId: '456', adId: '999' });
    });
    it('preserves paused state when provider resume fails', async () => {
      const row = existing({ status: 'paused' }); vi.mocked(meta.activateMetaCampaign).mockResolvedValue({ success: false, message: 'Provider unavailable' });
      await expect(resumeHaloCampaign(admin, accountId, 'halo')).rejects.toThrow(/unavailable/); expect(row.status).toBe('paused');
    });
    it('refuses resume after settlement, expiry, or termination', async () => {
      const row = existing({ status: 'killed' }); await expect(resumeHaloCampaign(admin, accountId, 'halo')).rejects.toThrow(/paused/);
      row.status = 'paused'; row.expires_at = '2020-01-01'; await expect(resumeHaloCampaign(admin, accountId, 'halo')).rejects.toThrow(/expired/);
      row.settlement_requested_at = new Date().toISOString(); await expect(resumeHaloCampaign(admin, accountId, 'halo')).rejects.toThrow(/reconciled/);
    });
    it('holds funds while stopped spend is still being reported, then settles once', async () => {
      const row = existing(); const stopped = await killHaloCampaign(admin, accountId, 'halo'); expect(stopped.status).toBe('paused');
      expect(admin.rpc.mock.calls.filter((c: any[]) => c[0] === 'settle_halo_campaign')).toHaveLength(0);
      row.settlement_requested_at = new Date(Date.now()-73*3600000).toISOString(); expect((await killHaloCampaign(admin, accountId, 'halo')).status).toBe('killed');
      await killHaloCampaign(admin, accountId, 'halo'); expect(admin.rpc.mock.calls.filter((c: any[]) => c[0] === 'settle_halo_campaign')).toHaveLength(1);
    });
    it('retains funds if provider pause or final insights fails', async () => {
      existing({ settlement_requested_at: new Date(Date.now()-73*3600000).toISOString(), settlement_status: 'killed' });
      vi.mocked(meta.pauseMetaCampaign).mockResolvedValue({ success: false, message: 'Pause failed' }); await expect(killHaloCampaign(admin, accountId, 'halo')).rejects.toThrow(/Pause failed/);
      vi.mocked(meta.pauseMetaCampaign).mockResolvedValue({ success: true, message: 'Paused' }); vi.mocked(meta.fetchMetaCampaignDailySpend).mockResolvedValue({ success: false } as never);
      await expect(killHaloCampaign(admin, accountId, 'halo')).rejects.toThrow(/final spend/); expect(admin.rpc.mock.calls.filter((c: any[]) => c[0] === 'settle_halo_campaign')).toHaveLength(0);
    });
    it('refuses cross-account delivery changes', async () => { existing({ account_id: 'other' }); await expect(killHaloCampaign(admin, accountId, 'halo')).rejects.toThrow(/not found/); expect(meta.pauseMetaCampaign).not.toHaveBeenCalled(); });
  });

  describe('triggerNeighborhoodHaloOnJobComplete', () => {
    it('does nothing when autoLaunchEnabled is false', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { auto_launch_enabled: false },
                error: null,
              }),
            }),
          }),
        }),
      } as never;

      const res = await triggerNeighborhoodHaloOnJobComplete(mockSupabase, accountId, jobId);
      expect(res).toBeNull();
    });
  });
});
