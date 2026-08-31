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
import { GET } from '../src/app/api/jobs/[id]/permits/route';

describe('Permits API Route Security & Authorization - GET /api/jobs/:id/permits', () => {
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

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Sign in');
  });

  it('rejects requests without an active workspace with 403', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: null,
      role: null,
    });

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('No active workspace');
  });

  it('rejects crew role users with 403 Forbidden', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'crew',
    });

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden for crew role');
  });

  it('rejects office users missing jobs.read capability with 403', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'office',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['leads.read']));

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Permission jobs.read required');
  });

  it('rejects malformed job UUIDs with 400', async () => {
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

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits'), {
  params: Promise.resolve({ id: 'invalid-job-id-123' }),
});

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid job id');
  });

  it('returns 404 when the job does not exist or belongs to another workspace', async () => {
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
    vi.mocked(getJob).mockResolvedValue(null);

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Job not found');
  });

  it('returns 200 with PermitWorkspaceDto for owner when job is found', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'case-1',
                account_id: mockAccountId,
                job_id: validJobId,
                requirement_verdict: 'required',
                application_status: 'not_started',
              },
              error: null,
            }),
          }),
        }),
      }),
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
      scope: 'Shingle tear-off and replacement',
    } as any);

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.summary.verdict).toBe('required');
    expect(body.data.authority.id).toBe('mi-royal-oak');
  });
});
