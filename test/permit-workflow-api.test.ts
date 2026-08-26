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
    updatePermitCase: vi.fn().mockResolvedValue({
      id: 'case-1',
      applicationStatus: 'issued',
      externalPermitNumber: 'PB-2026-101',
    }),
    syncPermitTasksToChecklist: vi.fn().mockResolvedValue({
      added: 3,
      existing: 1,
      tasks: [],
    }),
    recordPermitFeeExpense: vi.fn().mockResolvedValue({
      id: 'cost-1',
      amount: 125,
      category: 'Permit & Government Fees',
    }),
    listPermitDocuments: vi.fn().mockResolvedValue([]),
    registerPermitDocument: vi.fn().mockResolvedValue({
      id: 'doc-1',
      fileName: 'permit-app.pdf',
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { POST as workflowPOST } from '../src/app/api/jobs/[id]/permits/workflow/route';
import { GET as docsGET, POST as docsPOST } from '../src/app/api/jobs/[id]/permits/documents/route';

describe('Permit Workflow API Routes - Security & Execution', () => {
  const validJobId = '11111111-1111-4111-a111-111111111111';
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects workflow mutations from users without jobs.write capability with 403', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'office',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read'])); // only read, not write

    const res = await workflowPOST(
      new Request('http://localhost/api/jobs/foo/permits/workflow', {
        method: 'POST',
        body: JSON.stringify({ action: 'update_status', applicationStatus: 'issued' }),
      }),
      { params: { id: validJobId } },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('jobs.write required');
  });

  it('executes update_status action for authorized user', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId, email: 'owner@test.com' } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set());
    vi.mocked(getJob).mockResolvedValue({ id: validJobId, account_id: mockAccountId } as any);

    const res = await workflowPOST(
      new Request('http://localhost/api/jobs/foo/permits/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          applicationStatus: 'issued',
          externalPermitNumber: 'PB-2026-101',
        }),
      }),
      { params: { id: validJobId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.permitCase.applicationStatus).toBe('issued');
  });

  it('executes sync_tasks action to add permit items to checklist', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId, email: 'owner@test.com' } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set());
    vi.mocked(getJob).mockResolvedValue({ id: validJobId, account_id: mockAccountId } as any);

    const res = await workflowPOST(
      new Request('http://localhost/api/jobs/foo/permits/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_tasks',
          authorityName: 'City of Royal Oak',
          documents: ['Application'],
          inspections: ['Final Inspection'],
        }),
      }),
      { params: { id: validJobId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.added).toBe(3);
  });

  it('executes record_fee action to log permit fee to job costs', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId, email: 'owner@test.com' } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    });

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set());
    vi.mocked(getJob).mockResolvedValue({ id: validJobId, account_id: mockAccountId } as any);

    const res = await workflowPOST(
      new Request('http://localhost/api/jobs/foo/permits/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_fee',
          feeAmount: 125,
          authorityName: 'City of Royal Oak',
        }),
      }),
      { params: { id: validJobId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.cost.amount).toBe(125);
  });

  it('handles document listing and document registration with validation', async () => {
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

    const getRes = await docsGET(new Request('http://localhost/api/jobs/foo/permits/documents'), {
      params: { id: validJobId },
    });
    expect(getRes.status).toBe(200);

    const postRes = await docsPOST(
      new Request('http://localhost/api/jobs/foo/permits/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'permit-plan.pdf',
          storagePath: 'acc-1/job-1/permit-plan.pdf',
        }),
      }),
      { params: { id: validJobId } },
    );
    expect(postRes.status).toBe(200);
  });
});
