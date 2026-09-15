import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/public/leads/verify-phone/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/lead-verification', () => ({
  leadVerificationToken: vi.fn(),
}));

vi.mock('@/lib/lead-phone-verification-readiness', () => ({
  loadLeadPhoneVerificationReadiness: vi.fn(),
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: vi.fn(),
}));

vi.mock('@/lib/site-content', () => ({
  getSiteContent: vi.fn(),
}));

vi.mock('@/lib/sms', () => ({
  sendVerificationCodeSms: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: vi.fn(),
  clientIpFrom: vi.fn(),
}));

describe('Public Leads Verify Phone Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitStrictMock: any;
  let clientIpFromMock: any;
  let siteMock: any;
  let getSiteContentMock: any;
  let loadLeadPhoneVerificationReadinessMock: any;
  let normalizeUsPhoneMock: any;
  let sendVerificationCodeSmsMock: any;
  let leadVerificationTokenMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    siteMock = vi.fn().mockResolvedValue({ data: { id: 'site_1', account_id: 'acct_1', company_name: 'Acme', content: {} } });

    const adminMock = {
      from: vi.fn((table: string) => {
        if (table === 'sites') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: siteMock }) }) }) };
        return { select: vi.fn() };
      })
    };

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue(adminMock);

    checkRateLimitStrictMock = (await import('@/lib/rate-limit')).checkRateLimitStrict;
    checkRateLimitStrictMock.mockResolvedValue(true);

    clientIpFromMock = (await import('@/lib/rate-limit')).clientIpFrom;
    clientIpFromMock.mockReturnValue('1.2.3.4');

    getSiteContentMock = (await import('@/lib/site-content')).getSiteContent;
    getSiteContentMock.mockReturnValue({ leadFilters: { phoneVerification: true } });

    loadLeadPhoneVerificationReadinessMock = (await import('@/lib/lead-phone-verification-readiness')).loadLeadPhoneVerificationReadiness;
    loadLeadPhoneVerificationReadinessMock.mockResolvedValue({ kind: 'ready', senderId: 's1' });

    normalizeUsPhoneMock = (await import('@/lib/phone')).normalizeUsPhone;
    normalizeUsPhoneMock.mockReturnValue('+1234567890');

    sendVerificationCodeSmsMock = (await import('@/lib/sms')).sendVerificationCodeSms;
    sendVerificationCodeSmsMock.mockResolvedValue(undefined);

    leadVerificationTokenMock = (await import('@/lib/lead-verification')).leadVerificationToken;
    leadVerificationTokenMock.mockReturnValue('tok_123');
  });

  it('fails if rate limited on ip', async () => {
    checkRateLimitStrictMock.mockImplementation((admin: any, key: string) => !key.includes('ip'));
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('fails if missing phone', async () => {
    normalizeUsPhoneMock.mockReturnValue(null);
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1' }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails if rate limited on phone/minute', async () => {
    checkRateLimitStrictMock.mockImplementation((admin: any, key: string) => !key.includes('phone:'));
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', phone: '123' }) });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('fails if rate limited on phone/day', async () => {
    checkRateLimitStrictMock.mockImplementation((admin: any, key: string) => !key.includes('phoneday'));
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', phone: '123' }) });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('fails if site not found', async () => {
    siteMock.mockResolvedValue({ data: null });
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', phone: '123' }) });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('skips if phoneVerification disabled', async () => {
    getSiteContentMock.mockReturnValue({ leadFilters: { phoneVerification: false } });
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', phone: '123' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe(true);
  });

  it('skips if not ready', async () => {
    loadLeadPhoneVerificationReadinessMock.mockResolvedValue({ kind: 'error', reason: 'no numbers' });
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', phone: '123' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe(true);
  });

  it('fails if sms throws', async () => {
    sendVerificationCodeSmsMock.mockRejectedValue(new Error('sms error'));
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', phone: '123' }) });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it('sends sms and returns token', async () => {
    const req = new NextRequest('http://localhost/api/public/leads/verify-phone', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', phone: '123' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBe('tok_123');
    expect(data.expiresAt).toBeDefined();
    expect(sendVerificationCodeSmsMock).toHaveBeenCalled();
  });
});
