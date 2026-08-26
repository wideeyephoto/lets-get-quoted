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
    getCustomerPermitSummary: vi.fn().mockResolvedValue({
      statusBadge: 'Permit Issued',
      stage: 'issued',
      stageIndex: 3,
      totalStages: 5,
      authorityName: 'City of Royal Oak',
      agencyName: 'Community Development Department',
      permitNumber: '2026-RO-8492',
      verificationUrl: 'https://accessmygov.com/?uid=1349',
      milestones: [],
      headline: 'Permit Officially Issued',
      description: 'Active permit on file',
      isCompliant: true,
      lastUpdated: '2026-08-26T12:00:00Z',
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { GET } from '../src/app/api/jobs/[id]/permits/customer/route';

describe('Customer Permit Summary API Route - GET /api/jobs/:id/permits/customer', () => {
  const validJobId = '11111111-1111-4111-a111-111111111111';
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

    const res = await GET(new Request('http://localhost/api/jobs/1/permits/customer'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(401);
  });

  it('returns sanitized summary on 200 for authorized user', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    const res = await GET(new Request('http://localhost/api/jobs/1/permits/customer'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.statusBadge).toBe('Permit Issued');
    expect(body.summary.permitNumber).toBe('2026-RO-8492');
  });
});
