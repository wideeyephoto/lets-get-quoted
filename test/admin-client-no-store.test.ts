import { describe, expect, it, vi } from 'vitest';

import { noStoreFetch } from '@/lib/auth';

describe('the admin client never reads from the Next data cache', () => {
  it('forces cache: no-store on every request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    try {
      await noStoreFetch('https://example.test/rest/v1/rpc/whatever', { method: 'POST' });
      expect(spy).toHaveBeenCalledTimes(1);
      const init = spy.mock.calls[0][1] as RequestInit;
      expect(init.cache).toBe('no-store');
      // The caller's own options must survive; only caching is overridden.
      expect(init.method).toBe('POST');
    } finally {
      spy.mockRestore();
    }
  });

  it('is wired into createAdminClient', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/auth.ts', 'utf8');
    // A worker that claims the same row ten times looks identical to one doing
    // real work, so this wiring is pinned rather than assumed.
    expect(source).toMatch(/global:\s*\{\s*fetch:\s*noStoreFetch\s*\}/);
  });
});
