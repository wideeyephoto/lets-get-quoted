import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/csp-report/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  clientIpFrom: vi.fn(),
}));

describe('CSP Report Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitMock: any;
  let clientIpFromMock: any;
  let consoleWarnSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    checkRateLimitMock = (await import('@/lib/rate-limit')).checkRateLimit;
    checkRateLimitMock.mockResolvedValue(true);

    clientIpFromMock = (await import('@/lib/rate-limit')).clientIpFrom;
    clientIpFromMock.mockReturnValue('1.2.3.4');
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('drops report if rate limited', async () => {
    checkRateLimitMock.mockResolvedValue(false);
    
    const req = new NextRequest('http://localhost/api/csp-report', {
      method: 'POST',
      body: JSON.stringify({ 'csp-report': { 'document-uri': 'foo' } }),
    });
    
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('accepts legacy csp-report', async () => {
    const req = new NextRequest('http://localhost/api/csp-report', {
      method: 'POST',
      body: JSON.stringify({
        'csp-report': {
          'document-uri': 'http://example.com',
          'violated-directive': 'script-src',
          'blocked-uri': 'http://evil.com/script.js',
        }
      }),
    });
    
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[csp-report] script-src blocked=http://evil.com/script.js on=http://example.com'
    );
  });

  it('accepts Reporting API array', async () => {
    const req = new NextRequest('http://localhost/api/csp-report', {
      method: 'POST',
      body: JSON.stringify([{
        body: {
          'document-uri': 'http://example.com',
          'effective-directive': 'style-src',
          'blocked-uri': 'inline',
        }
      }]),
    });
    
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[csp-report] style-src blocked=inline on=http://example.com'
    );
  });

  it('handles invalid json', async () => {
    const req = new NextRequest('http://localhost/api/csp-report', {
      method: 'POST',
      body: 'invalid',
    });
    
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('handles rate limiter failure gracefully', async () => {
    checkRateLimitMock.mockRejectedValue(new Error('Redis down'));
    
    const req = new NextRequest('http://localhost/api/csp-report', {
      method: 'POST',
      body: JSON.stringify({
        'csp-report': {
          'violated-directive': 'img-src'
        }
      }),
    });
    
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[csp-report] img-src blocked=unknown on=unknown'
    );
  });
});
