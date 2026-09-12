import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

vi.mock('@/lib/leads', () => ({
  getLead: vi.fn(),
  getLeadTriage: vi.fn(),
}));

vi.mock('@/lib/public-api/lead-dto', () => ({
  toPublicLeadDto: vi.fn((lead) => ({ id: lead.id, public: true })),
  parseUpdateLeadInput: vi.fn(),
}));

import { GET, PATCH } from '@/app/api/v1/leads/[id]/route';

describe('V1 Leads ID Route', () => {
  let getLeadMock: any;
  let getLeadTriageMock: any;
  let parseUpdateLeadInputMock: any;
  let adminMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    getLeadMock = (await import('@/lib/leads')).getLead;
    getLeadTriageMock = (await import('@/lib/leads')).getLeadTriage;
    parseUpdateLeadInputMock = (await import('@/lib/public-api/lead-dto')).parseUpdateLeadInput;
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'L1', name: 'Updated' },
        error: null
      })
    };
  });

  describe('GET', () => {
    it('handles missing id', async () => {
      const req = new NextRequest('http://localhost/api/v1/leads/1');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: {} });
      expect(res.status).toBe(404);
    });

    it('handles not found', async () => {
      getLeadMock.mockResolvedValue(null);
      const req = new NextRequest('http://localhost/api/v1/leads/L1');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: { id: 'L1' } });
      expect(res.status).toBe(404);
    });

    it('returns lead', async () => {
      getLeadMock.mockResolvedValue({ id: 'L1' });
      const req = new NextRequest('http://localhost/api/v1/leads/L1');
      const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'L1' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('L1');
    });
  });

  describe('PATCH', () => {
    it('handles missing id', async () => {
      const req = new NextRequest('http://localhost/api/v1/leads/1', { method: 'PATCH', body: '{}' });
      const res = await (PATCH as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: {} });
      expect(res.status).toBe(404);
    });

    it('handles not found', async () => {
      getLeadMock.mockResolvedValue(null);
      const req = new NextRequest('http://localhost/api/v1/leads/L1', { method: 'PATCH', body: '{}' });
      const res = await (PATCH as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: { id: 'L1' } });
      expect(res.status).toBe(404);
    });

    it('handles invalid json', async () => {
      getLeadMock.mockResolvedValue({ id: 'L1' });
      const req = new NextRequest('http://localhost/api/v1/leads/L1', { method: 'PATCH', body: '{bad' });
      const res = await (PATCH as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: { id: 'L1' } });
      expect(res.status).toBe(400);
    });

    it('handles validation error', async () => {
      getLeadMock.mockResolvedValue({ id: 'L1' });
      parseUpdateLeadInputMock.mockReturnValue({ errors: ['bad'] });
      const req = new NextRequest('http://localhost/api/v1/leads/L1', { method: 'PATCH', body: '{}' });
      const res = await (PATCH as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' }, { params: { id: 'L1' } });
      expect(res.status).toBe(400);
    });

    it('updates lead', async () => {
      getLeadMock.mockResolvedValue({ id: 'L1' });
      getLeadTriageMock.mockReturnValue({ urgent: true });
      parseUpdateLeadInputMock.mockReturnValue({ patch: { name: 'New Name', triage: { urgent: false } } });
      const req = new NextRequest('http://localhost/api/v1/leads/L1', { method: 'PATCH', body: '{}' });
      const res = await (PATCH as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'L1' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('L1');
    });

    it('handles db error', async () => {
      getLeadMock.mockResolvedValue({ id: 'L1' });
      getLeadTriageMock.mockReturnValue({});
      parseUpdateLeadInputMock.mockReturnValue({ patch: { name: 'New Name' } });
      adminMock.single = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') });
      const req = new NextRequest('http://localhost/api/v1/leads/L1', { method: 'PATCH', body: '{}' });
      await expect((PATCH as any)(req, { admin: adminMock, accountId: 'acct_1' }, { params: { id: 'L1' } })).rejects.toThrow('db error');
    });
  });
});
