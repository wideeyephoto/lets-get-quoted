import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/verify-google-ads/data-manager/route';
import { runOfflineConversionVerification } from '@/lib/google-ads-verifier';

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('GOOGLE_DATA_MANAGER_CLIENT_ID', 'client');
  vi.stubEnv('GOOGLE_DATA_MANAGER_CLIENT_SECRET', 'client-secret');
  vi.stubEnv('GOOGLE_DATA_MANAGER_REFRESH_TOKEN', 'refresh-secret');
  vi.stubEnv('GOOGLE_ADS_CLIENT_CUSTOMER_ID', '2222222222');
  vi.stubEnv('GOOGLE_ADS_CONVERSION_ACTION_ID_WON_JOB', '3333333333');
  vi.stubEnv('GOOGLE_ADS_CONVERSION_TRANSPORT', 'data-manager');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('rejects unauthorized requests before any outbound traffic', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  expect((await GET(new NextRequest('https://example.com/api/admin/verify-google-ads/data-manager'))).status).toBe(401);
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('verifies only and never returns credentials or customer identifiers', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'private-token' })).mockResolvedValueOnce(Response.json({}));
  const response = await GET(new NextRequest('https://example.com/api/admin/verify-google-ads/data-manager', { headers: { authorization: 'Bearer test-secret' } }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({ ok: true, transport: 'data-manager', validationOnly: true, conversionRecorded: false, productionTransportEnabled: true });
  expect(JSON.stringify(body)).not.toMatch(/private-token|client-secret|refresh-secret|2222222222/);
  expect(JSON.parse(String(mock.mock.calls[1][1]?.body)).validateOnly).toBe(true);
});
it('uses Data Manager in the combined verifier after cutover', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'private-token' })).mockResolvedValueOnce(Response.json({}));
  const result = await runOfflineConversionVerification();
  expect(result).toMatchObject({ success: true, apiVersion: 'data-manager-v1', validationOnly: true, conversionRecorded: false });
  expect(mock.mock.calls[1][0]).toBe('https://datamanager.googleapis.com/v1/events:ingest');
});
