import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/crew/work-history/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/crew', () => ({
  listCrewWorkHistory: vi.fn(),
}));

describe('Crew Work History Route', () => {
  let createAdminClientMock: any;
  let getCurrentMembershipMock: any;
  let createSupabaseServerClientMock: any;
  let listCrewWorkHistoryMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    
    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    listCrewWorkHistoryMock = (await import('@/lib/crew')).listCrewWorkHistory;

    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_123' } } }) }
    });

    getCurrentMembershipMock.mockResolvedValue({
      accountId: 'acct_123',
      role: 'owner'
    });

    createAdminClientMock.mockReturnValue('fake_admin');
    
    listCrewWorkHistoryMock.mockResolvedValue([
      { amount: 100 },
      { amount: 150 },
    ]);
  });

  it('fails if no user', async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
    });
    
    const req = new NextRequest('http://localhost/api/crew/work-history?crewId=crew_1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('fails if no account id or not owner', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_123', role: 'office' });
    
    const req = new NextRequest('http://localhost/api/crew/work-history?crewId=crew_1');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('fails if no crewId', async () => {
    const req = new NextRequest('http://localhost/api/crew/work-history');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns work history and total paid', async () => {
    const req = new NextRequest('http://localhost/api/crew/work-history?crewId=crew_1');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(listCrewWorkHistoryMock).toHaveBeenCalledWith('fake_admin', 'acct_123', 'crew_1');
    expect(data.history).toEqual([{ amount: 100 }, { amount: 150 }]);
    expect(data.totalPaid).toBe(250);
  });

  it('handles errors from listCrewWorkHistory', async () => {
    listCrewWorkHistoryMock.mockRejectedValue(new Error('Fetch failed'));
    
    const req = new NextRequest('http://localhost/api/crew/work-history?crewId=crew_1');
    const res = await GET(req);
    
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Fetch failed');
  });
});
