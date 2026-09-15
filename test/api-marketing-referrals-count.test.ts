import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/marketing/referrals/count/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('Marketing Referrals Count Route', () => {
  let getCurrentMembershipMock: any;
  let createSupabaseServerClientMock: any;
  let getUserMock: any;
  let selectMock1: any, selectMock2: any;
  let notMock1: any, notMock2: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } });

    notMock1 = vi.fn().mockResolvedValue({ count: 5 });
    selectMock1 = {
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              not: notMock1
            })
          })
        })
      })
    };

    notMock2 = vi.fn().mockResolvedValue({ count: 3 });
    selectMock2 = {
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            not: notMock2
          })
        })
      })
    };

    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock },
      from: vi.fn((table: string) => {
        if (table === 'leads') return { select: vi.fn().mockReturnValue(selectMock1) };
        if (table === 'extra_stop_requests') return { select: vi.fn().mockReturnValue(selectMock2) };
        return { select: vi.fn() };
      })
    });

    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1' });
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.count).toBe(0);
  });

  it('fails if no account', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const res = await GET();
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.count).toBe(0);
  });

  it('returns count', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(8); // 5 + 3
  });

  it('returns 0 on db error', async () => {
    notMock1.mockRejectedValue(new Error('db error'));
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(0);
  });
});
