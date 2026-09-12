import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/payroll/status/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: vi.fn(),
}));

describe('Payroll Status Route', () => {
  let requireOfficeContextMock: any;
  let unstableRethrowMock: any;
  let accountMock: any;
  let eventsMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    accountMock = vi.fn().mockResolvedValue({ data: { id: 'acct_1', name: 'Acme Corp' } });
    eventsMock = vi.fn().mockResolvedValue({ data: [{ id: 'evt_1', action: 'export_created' }] });

    const supabaseMock = {
      from: vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: accountMock
              })
            })
          };
        }
        if (table === 'pay_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: eventsMock
                  })
                })
              })
            })
          };
        }
        return { select: vi.fn() };
      })
    };

    requireOfficeContextMock = (await import('@/lib/auth')).requireOfficeContext;
    requireOfficeContextMock.mockResolvedValue({ supabase: supabaseMock, accountId: 'acct_1' });

    unstableRethrowMock = (await import('next/navigation')).unstable_rethrow;
  });

  it('returns payroll status', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.success).toBe(true);
    expect(data.account.name).toBe('Acme Corp');
    expect(data.providers.length).toBeGreaterThan(0);
    expect(data.recentSyncEvents.length).toBe(1);
    expect(requireOfficeContextMock).toHaveBeenCalledWith('crew_pay.read');
  });

  it('handles db error', async () => {
    const error = new Error('db error');
    requireOfficeContextMock.mockRejectedValue(error);
    
    const res = await GET();
    expect(res.status).toBe(500);
    expect(unstableRethrowMock).toHaveBeenCalledWith(error);
  });
});
