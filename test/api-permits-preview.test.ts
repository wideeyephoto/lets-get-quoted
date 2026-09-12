import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/permits/preview/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: vi.fn(),
  clientIpFrom: vi.fn(),
}));

vi.mock('@/lib/permit-intel/permit-service', () => ({
  getPermitIntelligence: vi.fn(),
}));

vi.mock('@/lib/permit-intel/permit-history-service', () => ({
  getPropertyPermitHistory: vi.fn(),
}));

describe('Permits Preview Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitStrictMock: any;
  let clientIpFromMock: any;
  let getPermitIntelligenceMock: any;
  let getPropertyPermitHistoryMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    checkRateLimitStrictMock = (await import('@/lib/rate-limit')).checkRateLimitStrict;
    checkRateLimitStrictMock.mockResolvedValue(true);

    clientIpFromMock = (await import('@/lib/rate-limit')).clientIpFrom;
    clientIpFromMock.mockReturnValue('1.2.3.4');

    getPermitIntelligenceMock = (await import('@/lib/permit-intel/permit-service')).getPermitIntelligence;
    getPermitIntelligenceMock.mockResolvedValue({ id: 'intel_1' });

    getPropertyPermitHistoryMock = (await import('@/lib/permit-intel/permit-history-service')).getPropertyPermitHistory;
    getPropertyPermitHistoryMock.mockResolvedValue([{ id: 'hist_1' }]);
  });

  it('fails if rate limited', async () => {
    checkRateLimitStrictMock.mockResolvedValue(false);
    const req = new NextRequest('http://localhost/api/permits/preview?address=123');
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  it('fails if no address', async () => {
    const req = new NextRequest('http://localhost/api/permits/preview');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns intel and history', async () => {
    const req = new NextRequest('http://localhost/api/permits/preview?address=123 Main St&discipline=plumbing');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.ok).toBe(true);
    expect(data.data.id).toBe('intel_1');
    expect(data.history[0].id).toBe('hist_1');
    
    expect(getPermitIntelligenceMock).toHaveBeenCalledWith({ address: '123 Main St', discipline: 'plumbing' });
    expect(getPropertyPermitHistoryMock).toHaveBeenCalledWith('123 Main St');
  });

  it('defaults to building discipline', async () => {
    const req = new NextRequest('http://localhost/api/permits/preview?address=123 Main St');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getPermitIntelligenceMock).toHaveBeenCalledWith({ address: '123 Main St', discipline: 'building' });
  });

  it('fails with 500 if error', async () => {
    getPermitIntelligenceMock.mockRejectedValue(new Error('api error'));
    const req = new NextRequest('http://localhost/api/permits/preview?address=123');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
