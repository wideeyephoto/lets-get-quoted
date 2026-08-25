import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/jobs/[id]/lien-waiver/route';

let mockUser: { id: string } | null = null;
let mockMembership: { accountId: string | null; role: string } = { accountId: 'acc-1', role: 'owner' };
let mockJobs: Array<{
  id: string;
  ref: string;
  account_id: string;
  client_name: string;
  address: string;
  scope: string;
  status: string;
}> = [];

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser }, error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (col1: string, val1: string) => ({
          eq: (col2: string, val2: string) => ({
            maybeSingle: async () => {
              if (table === 'jobs') {
                const found = mockJobs.find((j) => (j as any)[col1] === val1 && (j as any)[col2] === val2);
                return { data: found || null, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: async () => mockMembership,
  loadHeldCapabilities: async (role: string) => {
    if (role === 'owner') return new Set(['jobs.read', 'invoices.read']);
    if (role === 'office_with_jobs') return new Set(['jobs.read']);
    return new Set<string>();
  },
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: async () => 'Apex Plumbing LLC',
}));

vi.mock('@/lib/lien-waiver-pdf', () => ({
  generateLienWaiverPdf: async () => Buffer.from('%PDF-1.4 Mock PDF Content'),
}));

describe('Lien Waiver API Security & Authorization', () => {
  beforeEach(() => {
    mockUser = { id: 'user-1' };
    mockMembership = { accountId: 'acc-1', role: 'owner' };
    mockJobs = [
      {
        id: 'job-100',
        ref: '1001',
        account_id: 'acc-1',
        client_name: 'John Doe',
        address: '123 Main St',
        scope: 'Pipe repair',
        status: 'in_progress',
      },
    ];
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockUser = null;
    const req = new Request('https://app.letsgetquoted.com/api/jobs/job-100/lien-waiver');
    const res = await GET(req, { params: { id: 'job-100' } });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('rejects users without active workspace with 403', async () => {
    mockMembership = { accountId: null, role: 'owner' };
    const req = new Request('https://app.letsgetquoted.com/api/jobs/job-100/lien-waiver');
    const res = await GET(req, { params: { id: 'job-100' } });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('No active workspace');
  });

  it('rejects unauthorized office members lacking jobs.read or invoices.read with 403', async () => {
    mockMembership = { accountId: 'acc-1', role: 'office' };
    const req = new Request('https://app.letsgetquoted.com/api/jobs/job-100/lien-waiver');
    const res = await GET(req, { params: { id: 'job-100' } });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('rejects cross-tenant access with 404 (job belongs to different account)', async () => {
    mockMembership = { accountId: 'acc-2', role: 'owner' };
    const req = new Request('https://app.letsgetquoted.com/api/jobs/job-100/lien-waiver');
    const res = await GET(req, { params: { id: 'job-100' } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Job not found');
  });

  it('rejects invalid waiver type with 400', async () => {
    const req = new Request('https://app.letsgetquoted.com/api/jobs/job-100/lien-waiver?type=invalid_type');
    const res = await GET(req, { params: { id: 'job-100' } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid lien waiver type');
  });

  it('rejects invalid amount with 400', async () => {
    const req = new Request('https://app.letsgetquoted.com/api/jobs/job-100/lien-waiver?amount=-500');
    const res = await GET(req, { params: { id: 'job-100' } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid payment amount');
  });

  it('generates PDF with correct headers for authorized request', async () => {
    const req = new Request(
      'https://app.letsgetquoted.com/api/jobs/job-100/lien-waiver?type=conditional_progress&amount=1500',
    );
    const res = await GET(req, { params: { id: 'job-100' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
