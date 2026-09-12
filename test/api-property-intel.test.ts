import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/property-intel/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/property-intel', () => ({
  getPropertyIntelligence: vi.fn(),
}));

describe('Property Intel Route', () => {
  let getCurrentMembershipMock: any;
  let loadHeldCapabilitiesMock: any;
  let createSupabaseServerClientMock: any;
  let getPropertyIntelligenceMock: any;
  let getUserMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } });
    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock }
    });

    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'owner' });

    loadHeldCapabilitiesMock = (await import('@/lib/auth')).loadHeldCapabilities;
    loadHeldCapabilitiesMock.mockResolvedValue(new Set(['jobs.read', 'leads.read']));

    getPropertyIntelligenceMock = (await import('@/lib/property-intel')).getPropertyIntelligence;
    getPropertyIntelligenceMock.mockResolvedValue({ yearBuilt: 1990 });
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/property-intel?address=123');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('fails if no accountId', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const req = new NextRequest('http://localhost/api/property-intel?address=123');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('fails if crew', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
    const req = new NextRequest('http://localhost/api/property-intel?address=123');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('fails if lacking capabilities', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'office' });
    loadHeldCapabilitiesMock.mockResolvedValue(new Set());
    const req = new NextRequest('http://localhost/api/property-intel?address=123');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('fails if missing address and coords', async () => {
    const req = new NextRequest('http://localhost/api/property-intel');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('fails if invalid lat', async () => {
    const req = new NextRequest('http://localhost/api/property-intel?lat=91&lng=0');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('fails if invalid lng', async () => {
    const req = new NextRequest('http://localhost/api/property-intel?lat=0&lng=181');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns intel for address', async () => {
    const req = new NextRequest('http://localhost/api/property-intel?address=123 Main St');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.yearBuilt).toBe(1990);
    expect(getPropertyIntelligenceMock).toHaveBeenCalledWith({ address: '123 Main St', lat: undefined, lng: undefined });
  });

  it('returns empty if no intel', async () => {
    getPropertyIntelligenceMock.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/property-intel?address=123 Main St');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toBeNull();
  });

  it('fails with 500 if error', async () => {
    getPropertyIntelligenceMock.mockRejectedValue(new Error('api error'));
    const req = new NextRequest('http://localhost/api/property-intel?address=123 Main St');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
