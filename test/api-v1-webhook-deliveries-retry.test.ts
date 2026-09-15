import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

import { POST } from '@/app/api/v1/webhook-deliveries/[id]/retry/route';

describe('V1 Webhook Deliveries Retry Route', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      rpc: vi.fn().mockResolvedValue({
        data: true,
        error: null
      })
    };
  });

  it('handles missing id', async () => {
    const req = new NextRequest('http://localhost/api/v1/webhook-deliveries/1/retry', { method: 'POST' });
    const res = await (POST as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: {} });
    expect(res.status).toBe(404);
  });

  it('handles rpc error', async () => {
    adminMock.rpc.mockResolvedValue({ data: null, error: new Error('rpc fail') });
    const req = new NextRequest('http://localhost/api/v1/webhook-deliveries/D1/retry', { method: 'POST' });
    const res = await (POST as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: { id: 'D1' } });
    expect(res.status).toBe(404);
  });

  it('handles not true response', async () => {
    adminMock.rpc.mockResolvedValue({ data: false, error: null });
    const req = new NextRequest('http://localhost/api/v1/webhook-deliveries/D1/retry', { method: 'POST' });
    const res = await (POST as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: { id: 'D1' } });
    expect(res.status).toBe(404);
  });

  it('retries delivery', async () => {
    const req = new NextRequest('http://localhost/api/v1/webhook-deliveries/D1/retry', { method: 'POST' });
    const res = await (POST as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'D1' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.delivery_id).toBe('D1');
    expect(adminMock.rpc).toHaveBeenCalledWith('retry_webhook_delivery', { p_delivery_id: 'D1', p_account_id: 'acct_1' });
  });
});
