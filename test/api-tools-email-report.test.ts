import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/tools/email-report/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  clientIpFrom: vi.fn(),
}));

vi.mock('resend', () => {
  const sendMock = vi.fn();
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: sendMock }
    })),
    __sendMock: sendMock,
  };
});

describe('Tools Email Report Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitMock: any;
  let clientIpFromMock: any;
  let resendMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    process.env.RESEND_API_KEY = 'test_key';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue({});

    checkRateLimitMock = (await import('@/lib/rate-limit')).checkRateLimit;
    checkRateLimitMock.mockResolvedValue(true);

    clientIpFromMock = (await import('@/lib/rate-limit')).clientIpFrom;
    clientIpFromMock.mockReturnValue('1.2.3.4');

    resendMock = (await import('resend') as any).__sendMock;
    resendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
  });

  const makeReq = (body: any) => {
    return new NextRequest('http://localhost/api/tools/email-report', { method: 'POST', body: JSON.stringify(body) });
  };

  it('fails if rate limited on IP', async () => {
    checkRateLimitMock.mockImplementation((admin: any, key: string) => !key.includes('ip'));
    const res = await POST(makeReq({}));
    expect(res.status).toBe(429);
  });

  it('fails on invalid body', async () => {
    const req = new NextRequest('http://localhost/api/tools/email-report', { method: 'POST', body: '{bad' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails on invalid email', async () => {
    const res = await POST(makeReq({ email: 'bad' }));
    expect(res.status).toBe(400);
  });

  it('fails if rate limited on email', async () => {
    checkRateLimitMock.mockImplementation((admin: any, key: string) => !key.includes('to:'));
    const res = await POST(makeReq({ email: 'a@a.com' }));
    expect(res.status).toBe(429);
  });

  it('sends email', async () => {
    const res = await POST(makeReq({ email: 'a@a.com', toolName: 'My Tool', summary: 'Hello <script> alert(1); http://bad.com' }));
    expect(res.status).toBe(200);
    expect(resendMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'a@a.com',
      subject: 'Your My Tool Summary • Let’s Get Quoted',
      text: expect.stringContaining('Hello script alert(1); [link removed]'),
    }));
  });

  it('handles resend error', async () => {
    resendMock.mockResolvedValue({ error: new Error('resend fail') });
    const res = await POST(makeReq({ email: 'a@a.com' }));
    expect(res.status).toBe(502);
  });

  it('handles resend throw', async () => {
    resendMock.mockRejectedValue(new Error('resend throw'));
    const res = await POST(makeReq({ email: 'a@a.com' }));
    expect(res.status).toBe(500);
  });
});
