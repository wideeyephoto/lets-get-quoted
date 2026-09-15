import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/voice/poll/route';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn(),
}));

describe('Voice Poll Route', () => {
  let requireOfficeContextMock: any;
  let unstable_rethrowMock: any;
  let supabaseMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    supabaseMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 5 }),
      or: vi.fn().mockResolvedValue({ count: 1 })
    };

    requireOfficeContextMock = (await import('@/lib/auth')).requireOfficeContext;
    requireOfficeContextMock.mockResolvedValue({ supabase: supabaseMock, accountId: 'acct_1' });

    unstable_rethrowMock = (await import('next/navigation')).unstable_rethrow;
    unstable_rethrowMock.mockImplementation(() => {});
  });

  const makeReq = (url: string) => new Request(url);

  it('polls new calls and active calls', async () => {
    const res = await GET(makeReq('http://localhost/api/voice/poll?since=2023-01-01T00:00:00Z'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newCallsCount).toBe(5);
    expect(data.hasActiveCalls).toBe(true);
  });

  it('handles empty results', async () => {
    supabaseMock.gte.mockResolvedValue({});
    supabaseMock.or.mockResolvedValue({});
    const res = await GET(makeReq('http://localhost/api/voice/poll'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.newCallsCount).toBe(0);
    expect(data.hasActiveCalls).toBe(false);
  });

  it('handles error', async () => {
    requireOfficeContextMock.mockRejectedValue(new Error('fail'));
    const res = await GET(makeReq('http://localhost/api/voice/poll'));
    expect(res.status).toBe(500);
    expect(unstable_rethrowMock).toHaveBeenCalled();
  });
});
