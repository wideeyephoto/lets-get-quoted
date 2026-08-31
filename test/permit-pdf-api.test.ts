import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/permit-intel', () => ({
  compilePermitApplication: vi.fn(),
  generatePermitApplicationPdf: vi.fn(),
}));

import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { compilePermitApplication, generatePermitApplicationPdf } from '@/lib/permit-intel';
import { GET } from '../src/app/api/jobs/[id]/permits/pdf/route';

describe('Permit PDF Download API Route - GET /api/jobs/:id/permits/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const req = new Request('http://localhost/api/jobs/11111111-1111-1111-1111-111111111111/permits/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });
    expect(res.status).toBe(401);
  });

  it('streams PDF buffer with inline application/pdf headers for authorized user', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-1' } } }) },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: 'acc-1',
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    vi.mocked(compilePermitApplication).mockResolvedValueOnce({
      property: { streetAddress: '211 S Williams St' },
      authority: { name: 'City of Royal Oak' },
    } as any);

    const fakePdfBuffer = Buffer.from('%PDF-1.4 test stream');
    vi.mocked(generatePermitApplicationPdf).mockResolvedValueOnce(fakePdfBuffer);

    const req = new Request('http://localhost/api/jobs/11111111-1111-1111-1111-111111111111/permits/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('Permit-Application-');
  });
});
