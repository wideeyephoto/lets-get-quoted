import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/property-passports/[id]/equipment/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/property-passport-data', () => ({
  addEquipmentToPassport: vi.fn(),
}));

describe('Property Passports Equipment Route', () => {
  let getCurrentMembershipMock: any;
  let loadHeldCapabilitiesMock: any;
  let createSupabaseServerClientMock: any;
  let addEquipmentToPassportMock: any;
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
    loadHeldCapabilitiesMock.mockResolvedValue(new Set(['jobs.write']));

    addEquipmentToPassportMock = (await import('@/lib/property-passport-data')).addEquipmentToPassport;
    addEquipmentToPassportMock.mockResolvedValue({ id: 'eq_1', name: 'Furnace' });
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/property-passports/1/equipment', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('fails if no accountId', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const req = new NextRequest('http://localhost/api/property-passports/1/equipment', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });

  it('fails if lacking jobs.write', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
    loadHeldCapabilitiesMock.mockResolvedValue(new Set());
    const req = new NextRequest('http://localhost/api/property-passports/1/equipment', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });

  it('fails if missing name or brand', async () => {
    const req = new NextRequest('http://localhost/api/property-passports/1/equipment', { method: 'POST', body: JSON.stringify({ name: 'Furnace' }) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('adds equipment', async () => {
    const req = new NextRequest('http://localhost/api/property-passports/1/equipment', { method: 'POST', body: JSON.stringify({ name: 'Furnace', brand: 'Trane' }) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.equipment.id).toBe('eq_1');
    expect(addEquipmentToPassportMock).toHaveBeenCalledWith(expect.anything(), 'acct_1', '1', { name: 'Furnace', brand: 'Trane' });
  });

  it('fails with 500 on db error', async () => {
    addEquipmentToPassportMock.mockRejectedValue(new Error('db error'));
    const req = new NextRequest('http://localhost/api/property-passports/1/equipment', { method: 'POST', body: JSON.stringify({ name: 'Furnace', brand: 'Trane' }) });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(500);
  });
});
