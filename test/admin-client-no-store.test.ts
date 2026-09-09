import { describe, expect, it, vi } from 'vitest';

import { createAdminClient, noStoreFetch } from '@/lib/auth';

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
    // A worker that claims the same row ten times looks identical to one doing
    // real work. Exercise the actual transport so moving the factory does not
    // invalidate this check or hide a lost no-store option.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-admin-key');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', {
      headers: { 'Content-Type': 'application/json' },
    }));
    try {
      const result = await createAdminClient().from('voice_events').select('id');
      expect(result.error).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain('/rest/v1/voice_events');
      expect(spy.mock.calls[0][1]?.cache).toBe('no-store');
    } finally {
      spy.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
