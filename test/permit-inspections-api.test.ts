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
    listJobInspections: vi.fn().mockResolvedValue([
      { id: 'insp-1', title: 'Mid-Roof Inspection', status: 'required' },
    ]),
    initializeRequiredInspections: vi.fn().mockResolvedValue([
      { id: 'insp-1', title: 'Mid-Roof Inspection', status: 'required' },
      { id: 'insp-2', title: 'Final Building Inspection', status: 'required' },
    ]),
    scheduleInspection: vi.fn().mockResolvedValue({
      id: 'insp-1',
      title: 'Mid-Roof Inspection',
      status: 'scheduled',
      scheduledDate: '2026-08-28',
    }),
    recordInspectionResult: vi.fn().mockResolvedValue({
      inspection: { id: 'insp-1', title: 'Mid-Roof Inspection', status: 'passed' },
      allPassed: false,
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { GET as listGET, POST as initPOST } from '../src/app/api/jobs/[id]/permits/inspections/route';
import { PATCH as itemPATCH } from '../src/app/api/jobs/[id]/permits/inspections/[inspectionId]/route';

describe('Permit Inspections API Routes - Security & Execution', () => {
  const validJobId = '11111111-1111-4111-a111-111111111111';
  const validInspId = '22222222-2222-4222-a222-222222222222';
  const mockAccountId = '33333333-3333-4333-a333-333333333333';
  const mockUserId = '44444444-4444-4444-a444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests to inspection list with 401', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);

    const res = await listGET(new Request('http://localhost/api/jobs/foo/permits/inspections'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(401);
  });

  it('returns inspections on GET for authorized office user', async () => {
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

    const res = await listGET(new Request('http://localhost/api/jobs/foo/permits/inspections'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inspections).toBeDefined();
    expect(body.inspections.length).toBe(1);
  });

  it('initializes required inspections on POST', async () => {
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

    const res = await initPOST(
      new Request('http://localhost/api/jobs/foo/permits/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredTitles: ['Mid-Roof', 'Final'] }),
      }),
      { params: { id: validJobId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inspections.length).toBe(2);
  });

  it('schedules inspection date on PATCH with action=schedule', async () => {
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

    const res = await itemPATCH(
      new Request('http://localhost/api/jobs/foo/permits/inspections/bar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule',
          scheduledDate: '2026-08-28',
          inspectorName: 'Bob',
        }),
      }),
      { params: { id: validJobId, inspectionId: validInspId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inspection.status).toBe('scheduled');
  });

  it('records pass/fail outcome on PATCH with action=record_result', async () => {
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

    const res = await itemPATCH(
      new Request('http://localhost/api/jobs/foo/permits/inspections/bar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_result',
          status: 'passed',
          inspectorName: 'Bob',
        }),
      }),
      { params: { id: validJobId, inspectionId: validInspId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inspection.status).toBe('passed');
  });
});
