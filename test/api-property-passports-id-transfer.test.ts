import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/property-passports/[id]/transfer/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/property-passport-data', () => ({
  transferPropertyPassport: vi.fn(),
}));

describe('Property Passports Transfer Route', () => {
  let getCurrentMembershipMock: any;
  let loadHeldCapabilitiesMock: any;
  let createSupabaseServerClientMock: any;
  let transferPropertyPassportMock: any;
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
    loadHeldCapabilitiesMock.mockResolvedValue(new Set(['jobs.write', 'clients.write']));

    transferPropertyPassportMock = (await import('@/lib/property-passport-data')).transferPropertyPassport;
    transferPropertyPassportMock.mockResolvedValue({ id: 'pp_1', homeowner_name: 'Alice' });
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/property-passports/1/transfer', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('fails if no accountId', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const req = new NextRequest('http://localhost/api/property-passports/1/transfer', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });

  it('fails if lacking capabilities', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
    loadHeldCapabilitiesMock.mockResolvedValue(new Set());
    const req = new NextRequest('http://localhost/api/property-passports/1/transfer', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });

  it('fails if missing homeownerName', async () => {
    const req = new NextRequest('http://localhost/api/property-passports/1/transfer', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('transfers passport', async () => {
    const req = new NextRequest('http://localhost/api/property-passports/1/transfer', {
      method: 'POST',
      body: JSON.stringify({ homeownerName: 'Alice', homeownerPhone: '123', homeownerEmail: 'a@a.com', transferNote: 'sold' })
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.passport.homeowner_name).toBe('Alice');
    expect(transferPropertyPassportMock).toHaveBeenCalledWith(expect.anything(), 'acct_1', '1', { name: 'Alice', phone: '123', email: 'a@a.com' }, 'sold');
  });

  it('fails with 500 on db error', async () => {
    transferPropertyPassportMock.mockRejectedValue(new Error('db error'));
    const req = new NextRequest('http://localhost/api/property-passports/1/transfer', {
      method: 'POST',
      body: JSON.stringify({ homeownerName: 'Alice' })
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(500);
  });
});
