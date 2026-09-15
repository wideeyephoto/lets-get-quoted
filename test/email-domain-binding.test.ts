import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSendingDomain } from '@/lib/resend-domains';

afterEach(() => vi.unstubAllGlobals());

describe('provider binding ownership', () => {
  it('never adopts a provider domain after a rejected creation', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Domain already exists' }), { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    await expect(createSendingDomain('someone.example')).rejects.toThrow(/403/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('reuses an existing binding only when the owning row supplies its ID', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'owned', name: 'contractor.example', status: 'verified', records: [] })));
    vi.stubGlobal('fetch', fetch);
    expect((await createSendingDomain('contractor.example', 'owned')).id).toBe('owned');
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.resend.com/domains/owned');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a mismatched saved binding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'owned', name: 'other.example', status: 'verified', records: [] }))));
    await expect(createSendingDomain('contractor.example', 'owned')).rejects.toThrow(/different domain/);
  });
});
