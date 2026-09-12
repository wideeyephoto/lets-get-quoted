import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/property-passports/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/property-passport-data', () => ({
  listPropertyPassports: vi.fn(),
  createPropertyPassport: vi.fn(),
}));

describe('Property Passports Route', () => {
  let getCurrentMembershipMock: any;
  let loadHeldCapabilitiesMock: any;
  let createSupabaseServerClientMock: any;
  let listPropertyPassportsMock: any;
  let createPropertyPassportMock: any;
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
    loadHeldCapabilitiesMock.mockResolvedValue(new Set(['jobs.read', 'jobs.write']));

    listPropertyPassportsMock = (await import('@/lib/property-passport-data')).listPropertyPassports;
    listPropertyPassportsMock.mockResolvedValue([{ id: 'pp_1', address: '123 Main St' }]);

    createPropertyPassportMock = (await import('@/lib/property-passport-data')).createPropertyPassport;
    createPropertyPassportMock.mockResolvedValue({ id: 'pp_2', address: '456 Oak St' });
  });

  describe('GET', () => {
    it('fails if no user', async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const req = new NextRequest('http://localhost/api/property-passports');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('fails if no accountId', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: null });
      const req = new NextRequest('http://localhost/api/property-passports');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('fails if missing jobs.read and clients.read', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
      loadHeldCapabilitiesMock.mockResolvedValue(new Set());
      const req = new NextRequest('http://localhost/api/property-passports');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('returns passports', async () => {
      const req = new NextRequest('http://localhost/api/property-passports?clientId=client_1');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.passports).toHaveLength(1);
      expect(listPropertyPassportsMock).toHaveBeenCalledWith(expect.anything(), 'acct_1', 'client_1');
    });

    it('fails with 500 on error', async () => {
      listPropertyPassportsMock.mockRejectedValue(new Error('db error'));
      const req = new NextRequest('http://localhost/api/property-passports');
      const res = await GET(req);
      expect(res.status).toBe(500);
    });
  });

  describe('POST', () => {
    it('fails if no user', async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const req = new NextRequest('http://localhost/api/property-passports', { method: 'POST', body: JSON.stringify({}) });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('fails if no accountId', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: null });
      const req = new NextRequest('http://localhost/api/property-passports', { method: 'POST', body: JSON.stringify({}) });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('fails if missing jobs.write and clients.write', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
      loadHeldCapabilitiesMock.mockResolvedValue(new Set());
      const req = new NextRequest('http://localhost/api/property-passports', { method: 'POST', body: JSON.stringify({}) });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('fails if missing address or homeownerName', async () => {
      const req = new NextRequest('http://localhost/api/property-passports', { method: 'POST', body: JSON.stringify({ address: '123 Main' }) });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('creates passport', async () => {
      const req = new NextRequest('http://localhost/api/property-passports', {
        method: 'POST',
        body: JSON.stringify({ address: '456 Oak St', homeownerName: 'Bob' })
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.passport.id).toBe('pp_2');
      expect(createPropertyPassportMock).toHaveBeenCalled();
    });

    it('fails with 500 on error', async () => {
      createPropertyPassportMock.mockRejectedValue(new Error('db error'));
      const req = new NextRequest('http://localhost/api/property-passports', {
        method: 'POST',
        body: JSON.stringify({ address: '456 Oak St', homeownerName: 'Bob' })
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });
});
