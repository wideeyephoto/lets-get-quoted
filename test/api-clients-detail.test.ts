import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/clients/[id]/detail/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/client-detail', () => ({
  loadClientDetail: vi.fn(),
}));

describe('Clients Detail Route', () => {
  let createSupabaseServerClientMock: any;
  let getCurrentMembershipMock: any;
  let loadHeldCapabilitiesMock: any;
  let loadClientDetailMock: any;
  
  const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    vi.clearAllMocks();

    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    loadHeldCapabilitiesMock = (await import('@/lib/auth')).loadHeldCapabilities;
    loadClientDetailMock = (await import('@/lib/client-detail')).loadClientDetail;

    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_123' } } })
      }
    });

    getCurrentMembershipMock.mockResolvedValue({
      accountId: 'acct_123',
      role: 'owner'
    });

    loadClientDetailMock.mockResolvedValue({ id: VALID_UUID, name: 'John Doe' });
  });

  const runRoute = async (id: string = VALID_UUID) => {
    const req = new NextRequest('http://localhost/api/clients/1/detail');
    return await GET(req as any, { params: Promise.resolve({ id }) });
  };

  it('fails if no user', async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
    });
    
    const res = await runRoute();
    expect(res.status).toBe(401);
  });

  it('fails if no account id', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null, role: 'owner' });
    
    const res = await runRoute();
    expect(res.status).toBe(403);
  });

  it('fails if non-owner without capabilities', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_123', role: 'office' });
    loadHeldCapabilitiesMock.mockResolvedValue(new Set()); // No clients.read
    
    const res = await runRoute();
    expect(res.status).toBe(403);
  });

  it('fails if invalid uuid', async () => {
    const res = await runRoute('not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('fails if client not found', async () => {
    loadClientDetailMock.mockResolvedValue(null);
    const res = await runRoute();
    expect(res.status).toBe(404);
  });

  it('handles db error', async () => {
    loadClientDetailMock.mockRejectedValue(new Error('DB Error'));
    const res = await runRoute();
    expect(res.status).toBe(500);
  });

  it('returns client detail for owner', async () => {
    const res = await runRoute();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.detail.name).toBe('John Doe');
    expect(loadClientDetailMock).toHaveBeenCalledWith(
      expect.anything(),
      'acct_123',
      VALID_UUID,
      { isOwner: true, canSeeQuotes: true }
    );
  });

  it('returns client detail for office with capabilities', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_123', role: 'office' });
    loadHeldCapabilitiesMock.mockResolvedValue(new Set(['clients.read', 'quotes.read']));
    
    const res = await runRoute();
    expect(res.status).toBe(200);
    expect(loadClientDetailMock).toHaveBeenCalledWith(
      expect.anything(),
      'acct_123',
      VALID_UUID,
      { isOwner: false, canSeeQuotes: true }
    );
  });
});
