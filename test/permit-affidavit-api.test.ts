import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { POST } from '../src/app/api/permits/inspections/[id]/affidavit/route';

describe('Permit Inspection Photo Affidavit API Route - POST /api/permits/inspections/:id/affidavit', () => {
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';
  const mockPermitId = '44444444-4444-4444-a444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('compiles geotagged photo affidavit for remote inspection submission', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: mockPermitId,
            permit_number: 'BLD-2026-8819',
            authority_name: 'City of Royal Oak',
          },
        }),
      }),
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.write']));

    const req = new Request(`http://localhost/api/permits/inspections/${mockPermitId}/affidavit`, {
      method: 'POST',
      body: JSON.stringify({
        tradeMilestone: 'ice_barrier_dryin',
        jobAddress: '211 S Williams St, Royal Oak, MI',
        jobCoordinates: { latitude: 42.48948, longitude: -83.14465 },
        signatoryName: 'Marcus Builder',
        photos: [
          {
            photoId: 'photo-1',
            photoUrl: 'https://storage.example.com/p1.jpg',
            milestone: 'ice_barrier_dryin',
            caption: 'Ice and water barrier self-adhering membrane installed at eaves',
            takenAt: '2026-08-26T15:00:00Z',
            coordinates: { latitude: 42.48950, longitude: -83.14466 },
          },
        ],
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: mockPermitId }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.affidavit).toBeDefined();
    expect(json.affidavit.permitNumber).toBe('BLD-2026-8819');
    expect(json.affidavit.verificationSummary.allWithinGeoFence).toBe(true);
    expect(json.affidavit.attestationText).toContain('Marcus Builder');
  });
});
