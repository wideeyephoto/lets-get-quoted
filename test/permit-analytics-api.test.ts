import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/permit-intel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permit-intel')>();
  return {
    ...actual,
    getPermitAnalytics: vi.fn().mockResolvedValue({
      activePermitsCount: 5,
      closedPermitsCount: 12,
      totalPermitsCount: 17,
      avgApprovalTurnaroundDays: 3.4,
      inspectionPassRate: 95.2,
      totalGovernmentFees: 2450,
      avgFeePerPermit: 144.12,
      statusDistribution: {
        draft: 1,
        submitted: 1,
        in_review: 1,
        issued: 2,
        inspection_scheduled: 0,
        closed: 12,
      },
      regionalBenchmarks: [
        {
          authorityId: 'mi-royal-oak',
          authorityName: 'City of Royal Oak',
          avgTurnaroundDays: 3.2,
          totalPermits: 10,
          activePermits: 3,
          passRate: 95.2,
        },
      ],
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { GET } from '../src/app/api/contractor/permits/analytics/route';

describe('Permit Analytics API Route - GET /api/contractor/permits/analytics', () => {
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('rejects crew role with 403', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'crew',
    });

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns aggregated analytics on 200 for office / owner', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set());

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analytics).toBeDefined();
    expect(body.analytics.activePermitsCount).toBe(5);
    expect(body.analytics.avgApprovalTurnaroundDays).toBe(3.4);
    expect(body.analytics.regionalBenchmarks.length).toBe(1);
  });
});
