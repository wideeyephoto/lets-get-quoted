import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

import { GET } from '@/app/api/v1/webhook-subscriptions/[id]/deliveries/route';

describe('V1 Webhook Subscriptions ID Deliveries Route', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: '1', created_at: '2023-01-01', updated_at: '2023-01-01', next_attempt_at: '2023-01-01', delivered_at: '2023-01-01' }],
        error: null
      })
    };
  });

  it('handles missing id', async () => {
    const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/1/deliveries');
    const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: {} });
    expect(res.status).toBe(404);
  });

  it('handles db error', async () => {
    adminMock.limit.mockResolvedValue({ data: null, error: new Error('db error') });
    const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/S1/deliveries');
    await expect((GET as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'S1' } })).rejects.toThrow('db error');
  });

  it('returns deliveries', async () => {
    const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/S1/deliveries');
    const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'S1' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data[0].id).toBe('1');
  });
});
