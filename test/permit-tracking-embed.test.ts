import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/job-tracking', () => ({
  getTrackingByToken: vi.fn(),
  recordTrackingView: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/permit-intel/customer-portal', () => ({
  getCustomerPermitSummary: vi.fn(),
}));

import { getTrackingByToken } from '@/lib/job-tracking';
import { getCustomerPermitSummary } from '@/lib/permit-intel/customer-portal';
import TrackPage from '../src/app/track/[token]/page';

describe('Homeowner Live Tracking Page - Permit Trust Embed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches sanitized municipal permit summary for active job visit and renders badge', async () => {
    vi.mocked(getTrackingByToken).mockResolvedValueOnce({
      trackingId: 'trk-1',
      accountId: 'acc-1',
      jobId: 'job-1',
      status: 'en_route',
      businessName: 'Royal Roofing LLC',
      crewFirstName: 'Dave',
      dest: { lat: 42.4895, lng: -83.1446 },
      destLabel: '211 S Williams St',
      tech: { lat: 42.485, lng: -83.14 },
      viewState: { id: 'trk-1', first_viewed_at: null, last_viewed_at: null, view_count: 0 },
    } as any);

    vi.mocked(getCustomerPermitSummary).mockResolvedValueOnce({
      statusBadge: 'Permit Issued',
      stage: 'issued',
      stageIndex: 3,
      totalStages: 5,
      authorityName: 'City of Royal Oak',
      agencyName: 'Building Division',
      permitNumber: '2026-RO-8492',
      verificationUrl: 'https://accessmygov.com/?uid=1349',
      milestones: [],
      headline: 'Permit Officially Issued',
      description: 'Active permit on file',
      isCompliant: true,
      lastUpdated: '2026-08-26T12:00:00Z',
    });

    const jsx = await TrackPage({
      params: Promise.resolve({ token: 'valid-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(getCustomerPermitSummary).toHaveBeenCalledWith(expect.anything(), 'acc-1', 'job-1');
    expect(jsx).toBeDefined();
  });
});
