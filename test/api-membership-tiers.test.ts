import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/membership-tiers/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/membership-tiers', () => ({
  listMembershipTiers: vi.fn(),
  createMembershipTier: vi.fn(),
}));

describe('Membership Tiers Route', () => {
  let getCurrentMembershipMock: any;
  let loadHeldCapabilitiesMock: any;
  let createSupabaseServerClientMock: any;
  let listMembershipTiersMock: any;
  let createMembershipTierMock: any;
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

    listMembershipTiersMock = (await import('@/lib/membership-tiers')).listMembershipTiers;
    listMembershipTiersMock.mockResolvedValue([{ id: 'tier_1', name: 'Gold' }]);

    createMembershipTierMock = (await import('@/lib/membership-tiers')).createMembershipTier;
    createMembershipTierMock.mockResolvedValue({ id: 'tier_2', name: 'Silver' });
  });

  describe('GET', () => {
    it('fails if no user', async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it('fails if no accountId', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: null });
      const res = await GET();
      expect(res.status).toBe(403);
    });

    it('fails if missing jobs.read', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
      loadHeldCapabilitiesMock.mockResolvedValue(new Set());
      const res = await GET();
      expect(res.status).toBe(403);
    });

    it('returns tiers', async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tiers).toHaveLength(1);
      expect(data.tiers[0].name).toBe('Gold');
    });

    it('fails with 500 on db error', async () => {
      listMembershipTiersMock.mockRejectedValue(new Error('db error'));
      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe('POST', () => {
    it('fails if no user', async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const req = new NextRequest('http://localhost/api/membership-tiers', { method: 'POST', body: JSON.stringify({}) });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('fails if no accountId', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: null });
      const req = new NextRequest('http://localhost/api/membership-tiers', { method: 'POST', body: JSON.stringify({}) });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('fails if missing jobs.write', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
      loadHeldCapabilitiesMock.mockResolvedValue(new Set());
      const req = new NextRequest('http://localhost/api/membership-tiers', { method: 'POST', body: JSON.stringify({}) });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('fails if invalid body', async () => {
      const req = new NextRequest('http://localhost/api/membership-tiers', { method: 'POST', body: JSON.stringify({ name: 'Tier' }) });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('creates tier', async () => {
      const req = new NextRequest('http://localhost/api/membership-tiers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Silver', monthlyPrice: 100 })
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.tier.name).toBe('Silver');
      expect(createMembershipTierMock).toHaveBeenCalled();
    });

    it('fails with 500 on db error', async () => {
      createMembershipTierMock.mockRejectedValue(new Error('db error'));
      const req = new NextRequest('http://localhost/api/membership-tiers', {
        method: 'POST',
        body: JSON.stringify({ name: 'Silver', monthlyPrice: 100 })
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
    });
  });
});
