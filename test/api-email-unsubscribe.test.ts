import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from '@/app/api/email/unsubscribe/route';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/email-suppression', () => ({
  parseUnsubscribeToken: vi.fn(),
  suppressEmail: vi.fn(),
}));

vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: vi.fn(),
}));

describe('Email Unsubscribe API Route', () => {
  let createAdminClientMock: any;
  let parseUnsubscribeTokenMock: any;
  let suppressEmailMock: any;
  let logWebhookFailureMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue({});

    parseUnsubscribeTokenMock = (await import('@/lib/email-suppression')).parseUnsubscribeToken;
    parseUnsubscribeTokenMock.mockReturnValue({ accountId: 'acct_123', email: 'test@example.com' });

    suppressEmailMock = (await import('@/lib/email-suppression')).suppressEmail;
    suppressEmailMock.mockResolvedValue(true);

    logWebhookFailureMock = (await import('@/lib/webhook-failures')).logWebhookFailure;
    logWebhookFailureMock.mockResolvedValue(undefined);
  });

  const createPostRequest = (url: string) => {
    return new NextRequest(url, { method: 'POST' });
  };
  
  const createGetRequest = (url: string) => {
    return new NextRequest(url, { method: 'GET' });
  };

  describe('POST', () => {
    it('successfully records unsubscribe', async () => {
      const req = createPostRequest('http://localhost/api/email/unsubscribe?token=valid_token');
      const res = await POST(req);
      expect(res.status).toBe(200);
      
      expect(parseUnsubscribeTokenMock).toHaveBeenCalledWith('valid_token');
      expect(suppressEmailMock).toHaveBeenCalledWith(
        expect.any(Object),
        'acct_123',
        'test@example.com',
        'one_click_unsubscribe'
      );
      expect(logWebhookFailureMock).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid token', async () => {
      parseUnsubscribeTokenMock.mockReturnValue(null);
      const req = createPostRequest('http://localhost/api/email/unsubscribe?token=invalid');
      const res = await POST(req);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toBe('Invalid unsubscribe token');
      expect(suppressEmailMock).not.toHaveBeenCalled();
    });

    it('returns 500 and logs failure if suppressEmail fails', async () => {
      suppressEmailMock.mockResolvedValue(false);
      const req = createPostRequest('http://localhost/api/email/unsubscribe?token=valid_token');
      const res = await POST(req);
      expect(res.status).toBe(500);
      
      const data = await res.json();
      expect(data.error).toBe('Failed to record unsubscribe');
      expect(logWebhookFailureMock).toHaveBeenCalledWith(expect.objectContaining({
        source: 'resend',
        eventType: 'one_click_unsubscribe',
        referenceId: 'acct_123:test@example.com',
      }));
    });

    it('returns 500 and logs failure on unexpected error', async () => {
      suppressEmailMock.mockRejectedValue(new Error('DB connection lost'));
      const req = createPostRequest('http://localhost/api/email/unsubscribe?token=valid_token');
      const res = await POST(req);
      expect(res.status).toBe(500);
      
      const data = await res.json();
      expect(data.error).toBe('Internal error processing unsubscribe');
      expect(logWebhookFailureMock).toHaveBeenCalledWith(expect.objectContaining({
        source: 'resend',
        eventType: 'one_click_unsubscribe',
        errorMessage: 'DB connection lost',
      }));
    });
  });

  describe('GET', () => {
    it('redirects to unsubscribe page with token', async () => {
      const req = createGetRequest('http://localhost/api/email/unsubscribe?token=valid_token');
      const res = await GET(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/unsubscribe?token=valid_token');
    });

    it('redirects to unsubscribe error page without token', async () => {
      const req = createGetRequest('http://localhost/api/email/unsubscribe');
      const res = await GET(req);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/unsubscribe?error=1');
    });
  });
});
