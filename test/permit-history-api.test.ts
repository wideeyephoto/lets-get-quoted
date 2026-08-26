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

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { GET } from '../src/app/api/jobs/[id]/permits/history/route';

describe('Permit History API Route - GET /api/jobs/:id/permits/history', () => {
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

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits/history'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Sign in');
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

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits/history'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('returns 200 with historical permit records for valid job', async () => {
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
    vi.mocked(getJob).mockResolvedValue({
      id: validJobId,
      account_id: mockAccountId,
      address: '211 S Williams St, Royal Oak, MI 48067',
    } as any);

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits/history'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.authorityId).toBe('mi-royal-oak');
    expect(body.data.records.length).toBeGreaterThan(0);
    expect(body.data.portalSearchUrl).toContain('accessmygov.com');
  });
});
