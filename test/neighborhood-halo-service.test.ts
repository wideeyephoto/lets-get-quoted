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

  describe('launchHaloCampaign', () => {
    it('refuses launch if monthly spend cap would be exceeded', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'neighborhood_halo_settings') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { ...DEFAULT_HALO_SETTINGS, monthly_spend_cap_dollars: 50.0, per_job_budget_dollars: 25.0 },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'neighborhood_halo_campaigns') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({
                      data: [{ budget_dollars: 40.0 }],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as never;

      await expect(launchHaloCampaign(mockSupabase, accountId, jobId)).rejects.toThrow(
        /Monthly Neighborhood Halo budget cap \(\$50\) would be exceeded/
      );
    });

    it('refuses launch if job is not completed', async () => {
      const mockJob = {
        id: jobId,
        account_id: accountId,
        status: 'in_progress',
        address: '1428 Maple Ave, Rochester, MI 48307',
        photo_paths: ['p1.jpg'],
      };

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'neighborhood_halo_settings') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            };
          }
          if (table === 'neighborhood_halo_campaigns') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
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
          return {};
        }),
      } as never;

      await expect(launchHaloCampaign(mockSupabase, accountId, jobId)).rejects.toThrow(
        /Job must be marked completed before launching a Neighborhood Halo campaign/
      );
    });
  });

  describe('pause, resume, and kill campaign', () => {
    it('pauses and resumes an active campaign', async () => {
      const pausedRow = { id: 'halo_1', account_id: accountId, status: 'paused', street_name: 'Maple Ave' };
      const activeRow = { id: 'halo_1', account_id: accountId, status: 'active', street_name: 'Maple Ave' };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValueOnce({ data: pausedRow, error: null })
                    .mockResolvedValueOnce({ data: activeRow, error: null }),
                }),
              }),
            }),
          }),
        }),
      } as never;

      const paused = await pauseHaloCampaign(mockSupabase, accountId, 'halo_1');
      expect(paused.status).toBe('paused');

      const resumed = await resumeHaloCampaign(mockSupabase, accountId, 'halo_1');
      expect(resumed.status).toBe('active');
    });
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
