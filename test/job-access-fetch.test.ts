import { afterEach, describe, expect, it, vi } from 'vitest';
import { jobAccessFetch, jobAccessRequestUrl } from '@/lib/job-access-fetch';

describe('permission-aware job request transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('routes job reads and writes to the safe view and preserves filters', () => {
    const url = new URL(jobAccessRequestUrl('https://project.supabase.co/rest/v1/jobs?select=*&id=eq.fixture&order=created_at.desc'));
    expect(url.pathname).toBe('/rest/v1/job_access');
    expect(url.searchParams.get('select')).toBe('*');
    expect(url.searchParams.get('id')).toBe('eq.fixture');
    expect(url.searchParams.get('order')).toBe('created_at.desc');
  });
  it('preserves embedded JSON names and relationship hints', () => {
    const url = new URL('https://project.supabase.co/rest/v1/payments');
    url.searchParams.set('select', 'id,job:jobs!payments_job_id_fkey(id,quoted_amount),jobs(ref),invoice:invoices(id,job:jobs!inner(ref))');
    const changed = new URL(jobAccessRequestUrl(url.toString()));
    expect(changed.pathname).toBe('/rest/v1/payments');
    expect(changed.searchParams.get('select')).toBe('id,job:job_access!payments_job_id_fkey(id,quoted_amount),jobs:job_access(ref),invoice:invoices(id,job:job_access!inner(ref))');
  });
  it('does not rewrite auth, storage, similarly named resources or values', () => {
    for (const path of ['/auth/v1/token?grant_type=password', '/storage/v1/object/jobs/photo', '/rest/v1/recurring_jobs?select=*', '/rest/v1/jobs_archive?scope=eq.jobs']) {
      const url = `https://project.supabase.co${path}`;
      expect(jobAccessRequestUrl(url)).toBe(url);
    }
  });
  it('preserves the real session, request body, abort signal and cache option', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('[]'));
    vi.stubGlobal('fetch', fetchSpy);
    const controller = new AbortController();
    const init = { method: 'PATCH', headers: { Authorization: 'Bearer test-session' },
      body: JSON.stringify({ scope: 'Permitted edit' }), signal: controller.signal, cache: 'no-store' as const };
    await jobAccessFetch('https://project.supabase.co/rest/v1/jobs?id=eq.fixture', init);
    expect(fetchSpy).toHaveBeenCalledWith('https://project.supabase.co/rest/v1/job_access?id=eq.fixture', init);
  });
  it('also preserves Request objects used by fetch wrappers', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('[]'));
    vi.stubGlobal('fetch', fetchSpy);
    const request = new Request('https://project.supabase.co/rest/v1/jobs', {
      method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' }, body: '{"scope":"test"}',
    });
    await jobAccessFetch(request);
    const actual = fetchSpy.mock.calls[0][0] as Request;
    expect(actual.url).toBe('https://project.supabase.co/rest/v1/job_access');
    expect(actual.method).toBe('POST');
    expect(actual.headers.get('Authorization')).toBe('Bearer test-session');
    expect(await actual.text()).toBe('{"scope":"test"}');
  });
});
