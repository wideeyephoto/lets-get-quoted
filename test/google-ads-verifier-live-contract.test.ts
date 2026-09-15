import { afterEach, describe, expect, it, vi } from 'vitest';
import { runVerification, runOfflineConversionVerification } from '@/lib/google-ads-verifier';

const options = { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh', mccCustomerId: '1111111111', customerId: '2222222222', conversionActionId: '3333333333' };
const budget = 'customers/2222222222/campaignBudgets/1';
const campaign = 'customers/2222222222/campaigns/2';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => vi.unstubAllGlobals());

function writeFetch(fail: 'create' | 'cleanup' | 'account' | null = null) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body).startsWith('{') ? String(init.body) : '{}') : {};
    if (url.includes('oauth2')) return json({ access_token: 'access' });
    if (url.includes('listAccessible')) return json({ resourceNames: ['customers/2222222222'] });
    if (body.query?.includes('FROM customer')) return json({ results: [{ customer: { currencyCode: 'USD', timeZone: 'America/New_York' } }] }, fail === 'account' ? 403 : 200);
    if (body.query) return json({ results: [] });
    if (body.operations?.[0]?.remove) return json({}, fail === 'cleanup' ? 400 : 200);
    if (url.includes('campaignBudgets')) return json({ results: [{ resourceName: budget }] });
    if (body.operations?.[0]?.create) return json({ results: [{ resourceName: campaign }] }, fail === 'create' ? 400 : 200);
    return json({});
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('live verifier safety and result accuracy', () => {
  it('creates only a paused campaign and removes both test resources without developer headers', async () => {
    const mock = writeFetch();
    const report = await runVerification(options);
    expect(report.success).toBe(true);
    const calls = mock.mock.calls;
    const operations = calls.flatMap(([, init]) => String(init?.body).startsWith('{') ? JSON.parse(String(init?.body)).operations || [] : []);
    expect(operations).toContainEqual({ remove: campaign });
    expect(operations).toContainEqual({ remove: budget });
    expect(operations.find((op) => op.create?.campaignBudget)?.create.status).toBe('PAUSED');
    expect(JSON.stringify(operations)).not.toContain('ENABLED');
    for (const [, init] of calls) expect(new Headers(init?.headers).has('developer-token')).toBe(false);
  });

  it('removes the budget even when campaign creation fails', async () => {
    const mock = writeFetch('create');
    expect((await runVerification(options)).success).toBe(false);
    expect(mock.mock.calls.some(([, init]) => String(init?.body).includes(`"remove":"${budget}"`))).toBe(true);
  });

  it('fails instead of claiming successful cleanup when Google rejects removal', async () => {
    writeFetch('cleanup');
    const report = await runVerification(options);
    expect(report.success).toBe(false);
    expect(report.error).toContain('cleanup failed');
  });

  it('does not create anything after a failed account read', async () => {
    const mock = writeFetch('account');
    expect((await runVerification(options)).success).toBe(false);
    expect(mock.mock.calls.some(([url]) => url.includes(':mutate'))).toBe(false);
  });

  it('validates the real conversion action without recording synthetic conversions', async () => {
    const mock = vi.fn().mockResolvedValueOnce(json({ access_token: 'access' })).mockResolvedValueOnce(json({}));
    vi.stubGlobal('fetch', mock);
    const report = await runOfflineConversionVerification(options);
    expect(report).toMatchObject({ success: true, validationOnly: true, conversionRecorded: false });
    const init = mock.mock.calls[1][1];
    expect(JSON.parse(init.body)).toMatchObject({ validateOnly: true, partialFailure: true, conversions: [{ conversionAction: 'customers/2222222222/conversionActions/3333333333' }] });
    expect(new Headers(init.headers).has('developer-token')).toBe(false);
  });

  it('rejects HTTP 200 partial failures as failed conversion validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ access_token: 'access' })).mockResolvedValueOnce(json({ partialFailureError: { message: 'Invalid conversion action' } })));
    const report = await runOfflineConversionVerification(options);
    expect(report.success).toBe(false);
    expect(report.error).toContain('Invalid conversion action');
  });
});
