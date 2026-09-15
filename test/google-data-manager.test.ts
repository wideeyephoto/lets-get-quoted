import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { buildDataManagerRequest, ingestDataManagerConversion, DATA_MANAGER_SCOPE } from '@/lib/google-data-manager';
import { uploadOfflineConversion } from '@/lib/google-ads-api';

const config = { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh', managerId: '1111111111', customerId: '2222222222' };
const params = { conversionActionName: '3333333333', orderId: 'stable-order', gclid: 'click', conversionDateTime: '2026-09-14 12:00:00+00:00', conversionValueDollars: 10 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function env() {
  vi.stubEnv('GOOGLE_DATA_MANAGER_CLIENT_ID', config.clientId);
  vi.stubEnv('GOOGLE_DATA_MANAGER_CLIENT_SECRET', config.clientSecret);
  vi.stubEnv('GOOGLE_DATA_MANAGER_REFRESH_TOKEN', config.refreshToken);
  vi.stubEnv('GOOGLE_ADS_MCC_CUSTOMER_ID', config.managerId);
  vi.stubEnv('GOOGLE_ADS_CLIENT_CUSTOMER_ID', config.customerId);
}
describe('Data Manager conversion migration', () => {
  it('declares an explicit source for offline CRM events, including validation probes', () => {
    expect(buildDataManagerRequest(params, config).events[0].eventSource).toBe('OTHER');
    expect(buildDataManagerRequest(params, config, true).events[0].eventSource).toBe('OTHER');
  });
  it('uses the action-owning advertiser, manager login and stable event ID', () => {
    expect(buildDataManagerRequest(params, config)).toMatchObject({ destinations: [{ operatingAccount: { accountType: 'GOOGLE_ADS', accountId: config.customerId }, loginAccount: { accountId: config.managerId }, productDestinationId: '3333333333' }], events: [{ transactionId: 'stable-order', eventTimestamp: '2026-09-14T12:00:00.000Z', adIdentifiers: { gclid: 'click' }, conversionValue: 10 }], validateOnly: false });
  });
  it('rejects a different advertiser conversion action and manager destination', () => {
    expect(() => buildDataManagerRequest({ ...params, conversionActionName: 'customers/9999999999/conversionActions/3' }, config)).toThrow('belong');
    expect(() => buildDataManagerRequest({ ...params, clientCustomerId: config.managerId }, config)).toThrow('advertiser');
  });
  it('normalizes and hashes identifiers without inventing consent or incomplete addresses', () => {
    const payload = buildDataManagerRequest({ ...params, email: ' A.B@gmail.com ', firstName: 'Name' }, config);
    const expected = createHash('sha256').update('ab@gmail.com').digest('hex');
    expect(payload.events[0].userData?.userIdentifiers).toEqual([{ emailAddress: expected }]);
    expect(payload).toHaveProperty('encoding', 'HEX');
    expect(payload).not.toHaveProperty('consent');
    expect(JSON.stringify(payload)).not.toContain('gmail');
  });
  it('requires a stable ID and timezone for uploads', () => {
    expect(() => buildDataManagerRequest({ ...params, orderId: undefined }, config)).toThrow('stable');
    expect(() => buildDataManagerRequest({ ...params, conversionDateTime: '2026-09-14 12:00:00' }, config)).toThrow('timezone');
  });
  it('does not use the legacy upload endpoint or developer header after cutover', async () => {
    env(); vi.stubEnv('GOOGLE_ADS_CONVERSION_TRANSPORT', 'data-manager');
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ access_token: 'token', scope: DATA_MANAGER_SCOPE })).mockResolvedValueOnce(json({ requestId: 'ingestion-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await uploadOfflineConversion(params);
    expect(result).toMatchObject({ success: true, transport: 'data-manager', requestId: 'ingestion-1' });
    expect(result.message).toContain('attribution is not yet confirmed');
    expect(fetchMock.mock.calls[1][0]).toBe('https://datamanager.googleapis.com/v1/events:ingest');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).has('developer-token')).toBe(false);
  });
  it('keeps validation-only requests non-recording and accepts the empty validation response', async () => {
    env(); const mock = vi.fn().mockResolvedValueOnce(json({ access_token: 'token', scope: DATA_MANAGER_SCOPE })).mockResolvedValueOnce(json({})); vi.stubGlobal('fetch', mock);
    expect((await ingestDataManagerConversion(params, true)).success).toBe(true);
    expect(JSON.parse(mock.mock.calls[1][1].body).validateOnly).toBe(true);
  });
  it('rejects missing scope before ingestion', async () => {
    env(); const mock = vi.fn().mockResolvedValue(json({ access_token: 'token', scope: 'https://www.googleapis.com/auth/adwords' })); vi.stubGlobal('fetch', mock);
    expect(await ingestDataManagerConversion(params)).toMatchObject({ success: false, stage: 'oauth' });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('does not expose provider-echoed secrets or claim success for rejected requests', async () => {
    env(); vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ access_token: 'token' })).mockResolvedValueOnce(json({ error: { message: 'secret@example.com token' } }, 403)));
    const result = await ingestDataManagerConversion(params);
    expect(result.success).toBe(false); expect(result.message).not.toContain('secret@example.com');
  });
  it('requires a request ID for actual ingestion', async () => {
    env(); vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ access_token: 'token' })).mockResolvedValueOnce(json({})));
    expect((await ingestDataManagerConversion(params)).success).toBe(false);
  });
});
