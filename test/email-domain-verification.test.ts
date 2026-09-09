import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerSendingDomainVerify } from '@/lib/resend-domains';

const domain = (status: string) => new Response(JSON.stringify({
  id: 'owned-binding', name: 'contractor.example', status, records: [],
}));

beforeEach(() => vi.stubEnv('RESEND_DOMAINS_API_KEY', 're_test_only'));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('asynchronous provider domain verification', () => {
  it('recognizes completed verification without restarting it as pending', async () => {
    let status = 'verified';
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      if (init.method === 'POST') status = 'pending';
      return domain(status);
    });
    vi.stubGlobal('fetch', fetch);
    expect((await triggerSendingDomainVerify('owned-binding'))?.status).toBe('verified');
    expect(status).toBe('verified');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('starts an unverified binding and reports its actual pending result', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(domain('not_started'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'owned-binding' })))
      .mockResolvedValueOnce(domain('pending'));
    vi.stubGlobal('fetch', fetch);
    expect((await triggerSendingDomainVerify('owned-binding'))?.status).toBe('pending');
    expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual(['GET', 'POST', 'GET']);
    expect(String(fetch.mock.calls[1][0])).toBe('https://api.resend.com/domains/owned-binding/verify');
  });

  it('does not attempt to verify a deleted provider binding', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    expect(await triggerSendingDomainVerify('owned-binding')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
