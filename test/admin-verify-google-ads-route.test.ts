import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/verify-google-ads/route';
import * as verifier from '@/lib/google-ads-verifier';

describe('Admin Google Ads Live Verification Route Handler', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = 'test_cron_secret_123';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects unauthorized requests with HTTP 401', async () => {
    const req = new NextRequest('https://app.letsgetquoted.com/api/admin/verify-google-ads', {
      method: 'GET',
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('accepts valid Authorization Bearer header', async () => {
    vi.spyOn(verifier, 'runVerification').mockResolvedValueOnce({
      timestamp: new Date().toISOString(),
      apiVersion: 'v25',
      mode: 'live',
      servingCustomerId: '***-***-1544',
      steps: [],
      success: true,
      error: null,
    });
    vi.spyOn(verifier, 'runOfflineConversionVerification').mockResolvedValueOnce({
      timestamp: new Date().toISOString(),
      apiVersion: 'v25',
      mode: 'live',
      servingCustomerId: '***-***-1544',
      allowlisted: true,
      requiresDataManagerApi: false,
      steps: [],
      success: true,
      error: null,
    });

    const req = new NextRequest('https://app.letsgetquoted.com/api/admin/verify-google-ads', {
      method: 'GET',
      headers: {
        authorization: 'Bearer test_cron_secret_123',
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.writePath.success).toBe(true);
    expect(data.offlineConversions.allowlisted).toBe(true);
  });

  it('accepts valid secret query parameter and returns 207 when one probe fails', async () => {
    vi.spyOn(verifier, 'runVerification').mockResolvedValueOnce({
      timestamp: new Date().toISOString(),
      apiVersion: 'v25',
      mode: 'live',
      servingCustomerId: '***-***-1544',
      steps: [],
      success: true,
      error: null,
    });
    vi.spyOn(verifier, 'runOfflineConversionVerification').mockResolvedValueOnce({
      timestamp: new Date().toISOString(),
      apiVersion: 'v25',
      mode: 'live',
      servingCustomerId: '***-***-1544',
      allowlisted: false,
      requiresDataManagerApi: true,
      steps: [],
      success: false,
      error: 'DEVELOPER TOKEN RESTRICTION CONFIRMED',
    });

    const req = new NextRequest('https://app.letsgetquoted.com/api/admin/verify-google-ads?secret=test_cron_secret_123', {
      method: 'POST',
      body: JSON.stringify({ customerId: '2285671544' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(207);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.writePath.success).toBe(true);
    expect(data.offlineConversions.requiresDataManagerApi).toBe(true);
  });
});
