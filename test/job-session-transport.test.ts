import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { jobAccessFetch } from '@/lib/job-access-fetch';
import { getJob } from '@/lib/jobs';

// This checks application transport compatibility, not database authorization.
// Database protections are tested by test:pg17:job-access against PostgreSQL 17.
describe('session getJob compatibility with column-restricted jobs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the shared getJob used by permits and voice retains its wildcard through job_access', async () => {
    const requests: URL[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      if (url.pathname === '/rest/v1/jobs') return new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), { status: 403 });
      return new Response(JSON.stringify([{ id: 'job-a', account_id: 'account-a', scope: 'Permitted work', quoted_amount: 0, quote_items: null }]), { headers: { 'Content-Type': 'application/json' } });
    }));
    const sessionClient = createClient('https://fixture.supabase.co', 'fixture-key', {
      auth: { persistSession: false }, global: { fetch: jobAccessFetch },
    });
    const result = await getJob(sessionClient, 'account-a', 'job-a');
    expect(result?.scope).toBe('Permitted work');
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe('/rest/v1/job_access');
    expect(requests[0].searchParams.get('select')).toBe('*');
    expect(requests[0].searchParams.get('account_id')).toBe('eq.account-a');
    expect(requests[0].searchParams.get('id')).toBe('eq.job-a');
    expect(requests[0].searchParams.get('deleted_at')).toBe('is.null');
  });
});
