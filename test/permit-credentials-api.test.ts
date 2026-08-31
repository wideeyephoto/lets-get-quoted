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
    listContractorCredentials: vi.fn().mockResolvedValue([
      { id: 'c-1', holderName: 'Royal Roofing', credentialType: 'state_license', status: 'active' },
    ]),
    saveContractorCredential: vi.fn().mockResolvedValue({
      id: 'c-1',
      holderName: 'Royal Roofing',
      credentialType: 'state_license',
      status: 'active',
    }),
    deleteContractorCredential: vi.fn().mockResolvedValue(true),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { GET, POST } from '../src/app/api/contractor/credentials/route';
import { DELETE } from '../src/app/api/contractor/credentials/[id]/route';

describe('Contractor Credentials Vault API Routes', () => {
  const validCredId = '11111111-1111-4111-a111-111111111111';
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

    const res = await GET();
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

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns credentials list on GET for office user', async () => {
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

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentials).toBeDefined();
    expect(body.credentials.length).toBe(1);
  });

  it('creates or updates a credential on POST', async () => {
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

    const res = await POST(
      new Request('http://localhost/api/contractor/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialType: 'state_license',
          holderName: 'Royal Roofing',
          issuingAuthority: 'Michigan LARA',
          licenseNumber: '2101234567',
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.credential.holderName).toBe('Royal Roofing');
  });

  it('deletes a credential on DELETE', async () => {
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

    const res = await DELETE(new Request('http://localhost/api/contractor/credentials/foo'), {
  params: Promise.resolve({ id: validCredId }),
});

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
