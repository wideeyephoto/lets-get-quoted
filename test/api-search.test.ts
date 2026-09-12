import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/search/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/workspace-search', () => ({
  searchWorkspaceEverything: vi.fn(),
}));

describe('Search Route', () => {
  let createSupabaseServerClientMock: any;
  let getUserMock: any;
  let getCurrentMembershipMock: any;
  let loadHeldCapabilitiesMock: any;
  let searchWorkspaceEverythingMock: any;
  let createAdminClientMock: any;

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
    loadHeldCapabilitiesMock.mockResolvedValue(new Set(['jobs.read', 'clients.read']));

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue({});

    searchWorkspaceEverythingMock = (await import('@/lib/workspace-search')).searchWorkspaceEverything;
    searchWorkspaceEverythingMock.mockResolvedValue({ jobs: [], clients: [] });
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/search?q=foo');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('fails if no active workspace', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const req = new NextRequest('http://localhost/api/search?q=foo');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('fails if crew', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'crew' });
    const req = new NextRequest('http://localhost/api/search?q=foo');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('searches workspace for owner', async () => {
    const req = new NextRequest('http://localhost/api/search?q=foo&limit=10');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobs).toBeDefined();
    
    expect(searchWorkspaceEverythingMock).toHaveBeenCalledWith(
      expect.anything(),
      'acct_1',
      'foo',
      {
        limitPerSection: 10,
        permissions: {
          canReadJobs: true,
          canReadClients: true,
          canReadCrew: true,
          canReadLeads: true,
        }
      }
    );
  });

  it('searches workspace for office with capabilities', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'office' });
    loadHeldCapabilitiesMock.mockResolvedValue(new Set(['jobs.read']));
    
    const req = new NextRequest('http://localhost/api/search?q=foo');
    const res = await GET(req);
    expect(res.status).toBe(200);
    
    expect(searchWorkspaceEverythingMock).toHaveBeenCalledWith(
      expect.anything(),
      'acct_1',
      'foo',
      {
        limitPerSection: 6,
        permissions: {
          canReadJobs: true,
          canReadClients: false,
          canReadCrew: false,
          canReadLeads: false,
        }
      }
    );
  });

  it('returns 500 on db error', async () => {
    searchWorkspaceEverythingMock.mockRejectedValue(new Error('db error'));
    const req = new NextRequest('http://localhost/api/search?q=foo');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
