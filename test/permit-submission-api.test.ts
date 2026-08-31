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
    executePermitSubmission: vi.fn().mockResolvedValue({
      success: true,
      submissionId: 'case-1',
      externalReferenceNumber: 'SUB-20260826-JOB1',
      status: 'submitted',
      submittedAt: '2026-08-26T12:00:00Z',
      authorityName: 'City of Royal Oak',
      tier: 'tier2_guided_portal',
      permitCase: { id: 'case-1', applicationStatus: 'submitted' },
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { POST } from '../src/app/api/jobs/[id]/permits/submit/route';

describe('Permit Submission API Route - POST /api/jobs/:id/permits/submit', () => {
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

    const res = await POST(new Request('http://localhost/api/jobs/foo/permits/submit'), {
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

    const res = await POST(new Request('http://localhost/api/jobs/foo/permits/submit'), {
  params: Promise.resolve({ id: validJobId }),
});

    expect(res.status).toBe(403);
  });

  it('rejects payload missing explicit contractor authorization with 400', async () => {
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
    vi.mocked(getJob).mockResolvedValue({ id: validJobId, account_id: mockAccountId } as any);

    const res = await POST(
      new Request('http://localhost/api/jobs/foo/permits/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractorAuthorized: false }),
      }),
      { params: Promise.resolve({ id: validJobId }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('authorization is required');
  });

  it('executes authorized submission on valid POST request', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId, email: 'builder@example.com' } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set());
    vi.mocked(getJob).mockResolvedValue({ id: validJobId, account_id: mockAccountId } as any);

    const res = await POST(
      new Request('http://localhost/api/jobs/foo/permits/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorAuthorized: true,
          agreedToSection23a: true,
          authorizedByName: 'Master Builder',
          qualifyingLicenseNumber: '2101234567',
        }),
      }),
      { params: Promise.resolve({ id: validJobId }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.result.status).toBe('submitted');
    expect(body.result.externalReferenceNumber).toContain('SUB-');
  });
});
