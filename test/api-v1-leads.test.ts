import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

vi.mock('@/lib/leads', () => ({
  createLead: vi.fn(),
}));

vi.mock('@/lib/public-api/lead-dto', () => ({
  toPublicLeadDto: vi.fn((lead) => ({ id: lead.id, public: true })),
  parseCreateLeadInput: vi.fn(),
}));

import { GET, POST } from '@/app/api/v1/leads/route';

describe('V1 Leads Route', () => {
  let createLeadMock: any;
  let parseCreateLeadInputMock: any;
  let adminMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    createLeadMock = (await import('@/lib/leads')).createLead;
    parseCreateLeadInputMock = (await import('@/lib/public-api/lead-dto')).parseCreateLeadInput;
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({
        data: [{ id: '1', created_at: '2023-01-01' }, { id: '2', created_at: '2023-01-02' }],
        error: null
      }))
    };
  });

  describe('GET', () => {
    it('returns leads', async () => {
      const req = new NextRequest('http://localhost/api/v1/leads');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data[0].id).toBe('1');
    });

    it('filters leads', async () => {
      const req = new NextRequest('http://localhost/api/v1/leads?status=new&email=a@a.com&phone=123&updated_since=2023-01-01');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' });
      expect(res.status).toBe(200);
    });

    it('handles cursor', async () => {
      const cursor = Buffer.from(JSON.stringify({ createdAt: '2023-01-01', id: '1' })).toString('base64');
      const req = new NextRequest(`http://localhost/api/v1/leads?cursor=${cursor}`);
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' });
      expect(res.status).toBe(200);
    });

    it('handles invalid cursor', async () => {
      const req = new NextRequest(`http://localhost/api/v1/leads?cursor=bad`);
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' });
      expect(res.status).toBe(200);
    });

    it('handles db error', async () => {
      adminMock.then = vi.fn((resolve, reject) => reject(new Error('db error')));
      const req = new NextRequest('http://localhost/api/v1/leads');
      await expect((GET as any)(req, { admin: adminMock, accountId: 'acct_1' })).rejects.toThrow('db error');
    });
  });

  describe('POST', () => {
    it('handles invalid json', async () => {
      const req = new NextRequest('http://localhost/api/v1/leads', { method: 'POST', body: '{bad' });
      const res = await (POST as any)(req, { requestId: 'req_1' });
      expect(res.status).toBe(400);
    });

    it('handles validation error', async () => {
      parseCreateLeadInputMock.mockReturnValue({ errors: ['bad'] });
      const req = new NextRequest('http://localhost/api/v1/leads', { method: 'POST', body: '{}' });
      const res = await (POST as any)(req, { requestId: 'req_1' });
      expect(res.status).toBe(400);
    });

    it('creates lead', async () => {
      parseCreateLeadInputMock.mockReturnValue({ leadInput: { name: 'test' } });
      createLeadMock.mockResolvedValue({ id: '123' });
      const req = new NextRequest('http://localhost/api/v1/leads', { method: 'POST', body: '{}' });
      const res = await (POST as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' });
      expect(res.status).toBe(201);
      expect(createLeadMock).toHaveBeenCalledWith(adminMock, 'acct_1', { name: 'test' });
    });
  });
});
