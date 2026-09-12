import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

import { GET, DELETE } from '@/app/api/v1/webhook-subscriptions/[id]/route';

describe('V1 Webhook Subscriptions ID Route', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: '1', created_at: '2023-01-01', updated_at: '2023-01-01' },
        error: null
      })
    };
  });

  describe('GET', () => {
    it('handles missing id', async () => {
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/1');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: {} });
      expect(res.status).toBe(404);
    });

    it('handles not found', async () => {
      adminMock.maybeSingle.mockResolvedValue({ data: null, error: null });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/S1');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: { id: 'S1' } });
      expect(res.status).toBe(404);
    });

    it('returns sub', async () => {
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/S1');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'S1' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('1');
    });
  });

  describe('DELETE', () => {
    it('handles missing id', async () => {
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/1', { method: 'DELETE' });
      const res = await (DELETE as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: {} });
      expect(res.status).toBe(404);
    });

    it('handles db error', async () => {
      adminMock.delete.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('db error') }) }) });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/S1', { method: 'DELETE' });
      await expect((DELETE as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'S1' } })).rejects.toThrow('db error');
    });

    it('deletes sub', async () => {
      adminMock.delete.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
      const req = new NextRequest('http://localhost/api/v1/webhook-subscriptions/S1', { method: 'DELETE' });
      const res = await (DELETE as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'S1' } });
      expect(res.status).toBe(204);
    });
  });
});
