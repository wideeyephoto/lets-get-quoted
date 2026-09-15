import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

import { GET } from '@/app/api/v1/events/route';

describe('V1 Events Route', () => {
  it('fetches events', async () => {
    const adminMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  { id: '1', event_type: 'lead.created', aggregate_type: 'lead', aggregate_id: 'L1', payload: {}, occurred_at: '2023-01-01T00:00:00Z' }
                ],
                error: null
              })
            })
          })
        })
      })
    };

    const req = new NextRequest('http://localhost/api/v1/events');
    const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data[0].id).toBe('1');
    expect(data.data[0].event).toBe('lead.created');
  });

  it('filters by event type', async () => {
    const secondEqMock = vi.fn().mockReturnValue({ then: vi.fn((resolve) => resolve({ data: [], error: null })) });
    const limitMock = vi.fn().mockReturnValue({ then: vi.fn((resolve) => resolve({ data: [], error: null })), eq: secondEqMock });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const firstEqMock = vi.fn().mockReturnValue({ order: orderMock });
    const adminMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: firstEqMock
        })
      })
    };

    const req = new NextRequest('http://localhost/api/v1/events?event_type=lead.created');
    const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' });
    expect(res.status).toBe(200);
    expect(secondEqMock).toHaveBeenCalledWith('event_type', 'lead.created');
  });

  it('handles db error', async () => {
    const adminMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('db error')
              })
            })
          })
        })
      })
    };

    const req = new NextRequest('http://localhost/api/v1/events');
    await expect((GET as any)(req, { admin: adminMock, accountId: 'acct_1' })).rejects.toThrow('db error');
  });
});
