import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn(),
}));

vi.mock('@/lib/permit-intel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permit-intel')>();
  return {
    ...actual,
    syncPermitCaseStatus: vi.fn().mockResolvedValue({
      jobId: '11111111-1111-4111-a111-111111111111',
      previousStatus: 'submitted',
      currentStatus: 'issued',
      changed: true,
      externalPermitNumber: 'PB26-1000',
      authorityName: 'City of Royal Oak',
      lastCheckedAt: '2026-08-26T12:00:00Z',
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { POST } from '../src/app/api/jobs/[id]/permits/sync/route';

describe('Permit Sync API Route - POST /api/jobs/:id/permits/sync', () => {
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

    const res = await POST(new Request('http://localhost/api/jobs/foo/permits/sync'), {
  params: Promise.resolve({ id: validJobId }),
});

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

    const res = await POST(new Request('http://localhost/api/jobs/foo/permits/sync'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(403);
  });

  it('synchronizes permit status on valid request from authorized user', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId, email: 'office@example.com' } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set());
    vi.mocked(getJob).mockResolvedValue({ id: validJobId, account_id: mockAccountId } as any);

    const res = await POST(new Request('http://localhost/api/jobs/foo/permits/sync'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.currentStatus).toBe('issued');
    expect(body.data.externalPermitNumber).toBe('PB26-1000');
  });
});
