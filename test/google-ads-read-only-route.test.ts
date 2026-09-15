import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/verify-google-ads/read-only/route';

describe('Google Ads read-only production verification', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'probe-secret');
    vi.stubEnv('GOOGLE_ADS_CLIENT_ID', 'client-id');
    vi.stubEnv('GOOGLE_ADS_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('GOOGLE_ADS_REFRESH_TOKEN', 'refresh-token');
    vi.stubEnv('GOOGLE_ADS_MCC_CUSTOMER_ID', '111-222-3333');
    vi.stubEnv('GOOGLE_ADS_DEVELOPER_TOKEN', 'obsolete-secret');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const request = (authorized = true) => new NextRequest('https://app.letsgetquoted.com/api/admin/verify-google-ads/read-only', {
    headers: authorized ? { authorization: 'Bearer probe-secret' } : {},
  });

  it('rejects unauthorized callers before any provider request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect((await GET(request(false))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes OAuth and lists accounts without token headers, mutations, or secret disclosure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'private-access-token' }))
      .mockResolvedValueOnce(Response.json({ resourceNames: ['customers/1112223333', 'customers/4445556666'] }));
    const response = await GET(request());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, mode: 'read-only', upstreamStatus: 200, developerTokenHeaderSent: false, accessibleAccountCount: 2, managerAccountAccessible: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(String(fetchSpy.mock.calls[1][0])).toMatch(/\/v25\/customers:listAccessibleCustomers$/);
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer private-access-token' } });
    expect(fetchSpy.mock.calls[1][1]?.headers).not.toHaveProperty('developer-token');
    expect(fetchSpy.mock.calls[1][1]?.headers).not.toHaveProperty('login-customer-id');
    expect(JSON.stringify(data)).not.toMatch(/private-access-token|client-secret|refresh-token|obsolete-secret|1112223333/);
  });

  it('reports upstream failure without leaking its response body', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'private-access-token' }))
      .mockResolvedValueOnce(Response.json({ error: 'private-provider-detail' }, { status: 403 }));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, stage: 'account-discovery', upstreamStatus: 403 });
  });
});
