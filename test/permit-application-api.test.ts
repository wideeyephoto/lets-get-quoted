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
    compilePermitApplication: vi.fn().mockResolvedValue({
      authority: { name: 'City of Royal Oak', agencyName: 'Building Division', department: 'Inspection' },
      applicant: { companyName: 'Royal Roofing LLC', contactName: 'John Builder', licenseNumber: '2101234' },
      property: { ownerName: 'Homeowner', streetAddress: '211 S Williams St', city: 'Royal Oak', state: 'MI', zip: '48067' },
      workScope: { trade: 'Roofing', detailedDescription: 'Tear off & Replace', estimatedCost: 8500 },
      certification: { signatureDate: '2026-08-26', section23aNotice: 'Legal notice' },
    }),
    generatePermitApplicationHtml: vi.fn().mockReturnValue('<html><body>Application</body></html>'),
    registerPermitDocument: vi.fn().mockResolvedValue({
      id: 'doc-1',
      fileName: 'Permit-Application.html',
      documentType: 'application_draft',
    }),
    updatePermitCase: vi.fn().mockResolvedValue({
      id: 'case-1',
      applicationStatus: 'ready_for_review',
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { GET, POST } from '../src/app/api/jobs/[id]/permits/application/route';

describe('Permit Application API Route - GET & POST /api/jobs/:id/permits/application', () => {
  const validJobId = '11111111-1111-4111-a111-111111111111';
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated GET requests with 401', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits/application'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(401);
  });

  it('returns compiled application data and html on valid GET request', async () => {
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
      address: '211 S Williams St, Royal Oak, MI',
    } as any);

    const res = await GET(new Request('http://localhost/api/jobs/foo/permits/application'), {
      params: { id: validJobId },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.html).toContain('Application');
  });

  it('saves application draft document on POST request', async () => {
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
    vi.mocked(getJob).mockResolvedValue({
      id: validJobId,
      account_id: mockAccountId,
      address: '211 S Williams St, Royal Oak, MI',
    } as any);

    const res = await POST(
      new Request('http://localhost/api/jobs/foo/permits/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: '<html><body>Application</body></html>' }),
      }),
      { params: { id: validJobId } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.document.documentType).toBe('application_draft');
  });
});
