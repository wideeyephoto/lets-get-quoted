import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { loadStatus } from '@/lib/platform-status';
import sitemap from '@/app/sitemap';
import { middleware } from '@/middleware';
import { isMarketingPath } from '@/lib/tenant-host';

/**
 * The public status page (G5).
 *
 * THE FAILURE THIS FILE EXISTS FOR. The first version of the page logged a
 * failed query, carried on with an empty array, and therefore rendered "All
 * Systems Operational" — so the single moment the page exists for, the database
 * being unreachable, was the moment it reassured every customer. A status page
 * that lies during an outage is worse than not having one, and nothing would
 * have gone red.
 *
 * The database half — which columns a browser role may read, and whether an
 * RLS-protected table can still be truncated — is not assertable from source
 * and is proved against a real PostgreSQL by
 * scripts/verify-status-page-boundary.mjs (npm run verify:status-boundary).
 * What is pinned here is the part that engine cannot see: the page's own
 * reading of a failed query, and the column list it asks for.
 */

type Row = Record<string, unknown>;

/** A minimal stand-in for the PostgREST builder chain the page uses. */
function fakeClient(outcome: { data: Row[] | null; error: unknown }) {
  const calls: { table?: string; columns?: string; filter?: [string, unknown]; limit?: number } = {};
  const builder: any = {
    select(columns: string) { calls.columns = columns; return builder; },
    eq(column: string, value: unknown) { calls.filter = [column, value]; return builder; },
    order() { return builder; },
    limit(n: number) { calls.limit = n; return Promise.resolve(outcome); },
  };
  return { client: { from(table: string) { calls.table = table; return builder; } }, calls };
}

const incident = (over: Partial<Row> = {}): Row => ({
  id: 'i1', kind: 'incident', title: 'Checkout failing', description: 'Card payments are erroring.',
  severity: 'critical', impact_summary: null, resolution_summary: null,
  started_at: '2026-09-11T10:00:00.000Z', resolved_at: null, ...over,
});

describe('when the status page cannot read the incident log', () => {
  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logged = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { logged.mockRestore(); });

  // The exact regression. A query error used to be logged and then discarded.
  it('reports unknown rather than operational', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'column platform_incidents.published does not exist' } });
    expect((await loadStatus(client)).state).toBe('unavailable');
  });

  // What a transport that gave up mid-flight looks like: no error object, no
  // rows either. Falling through on `data ?? []` reads as healthy.
  it('reports unknown for a null payload that carries no error', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect((await loadStatus(client)).state).toBe('unavailable');
  });

  // Missing configuration must not be indistinguishable from good news.
  it('reports unknown when there is no client to ask', async () => {
    expect((await loadStatus(null)).state).toBe('unavailable');
  });

  it('says so out loud so the failure is in the logs', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await loadStatus(client);
    expect(logged).toHaveBeenCalled();
  });
});

describe('what the status page reads', () => {
  // Every column here is one anon is granted in
  // 20260911094000_platform_incidents_published.sql. `select *` is what the
  // first version asked for, and against that grant it now 403s — but the
  // reason to name them is that the internal half of an incident write-up must
  // never be requested in the first place.
  const PRIVATE = ['root_cause', 'owner', 'created_by', 'external_url', 'affected_services'];

  it('asks for named columns, never *', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await loadStatus(client);
    expect(calls.table).toBe('platform_incidents');
    expect(calls.columns).toBeTruthy();
    expect(calls.columns).not.toContain('*');
    for (const column of PRIVATE) expect(calls.columns, `${column} must not be requested`).not.toContain(column);
  });

  it('asks only for published rows', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await loadStatus(client);
    expect(calls.filter).toEqual(['published', true]);
  });

  // Nothing renders the private half either — a column that reaches the page is
  // a column that can reach a customer.
  it('never renders an internal field', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/status/page.tsx'), 'utf8');
    const body = source.slice(source.indexOf('function Incident'));
    for (const column of PRIVATE) expect(body, `${column} is rendered on the public page`).not.toContain(`incident.${column}`);
  });
});

describe('what the status page concludes', () => {
  it('is operational when nothing is open', async () => {
    const { client } = fakeClient({ data: [incident({ resolved_at: '2026-09-11T11:00:00.000Z' })], error: null });
    const view = await loadStatus(client);
    expect(view.state).toBe('operational');
    if (view.state === 'operational') expect(view.past).toHaveLength(1);
  });

  it('is operational with nothing published at all', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect((await loadStatus(client)).state).toBe('operational');
  });

  it('is an incident while an unresolved incident is published', async () => {
    const { client } = fakeClient({ data: [incident()], error: null });
    const view = await loadStatus(client);
    expect(view.state).toBe('incident');
    if (view.state === 'incident') expect(view.active).toHaveLength(1);
  });

  // A release is a point-in-time note and never resolves. Counting one as an
  // open incident would park the page on red permanently.
  it('does not treat an unresolved release as an outage', async () => {
    const { client } = fakeClient({ data: [incident({ kind: 'release', resolved_at: null })], error: null });
    const view = await loadStatus(client);
    expect(view.state).toBe('operational');
    if (view.state === 'operational') expect(view.past).toHaveLength(1);
  });
});

describe('where the status page is advertised', () => {
  it('is in the sitemap, on the apex', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://letsgetquoted.com/status');
  });

  // Without this the app host answers /status as a second copy of the URL the
  // sitemap publishes — the duplicate-host problem src/app/sitemap.ts documents.
  it('is a path the middleware keeps on the apex', () => {
    expect(isMarketingPath('/status')).toBe(true);
  });
});

describe('how long the status page may be cached', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'letsgetquoted.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.letsgetquoted.com';
  });

  const get = (path: string) =>
    middleware(
      new NextRequest(`https://letsgetquoted.com${path}`, {
        headers: { host: 'letsgetquoted.com', 'x-forwarded-host': 'letsgetquoted.com' },
      }),
    );

  const maxAge = (header: string | null, directive: string) => {
    const found = header?.match(new RegExp(`${directive}=(\\d+)`));
    return found ? Number(found[1]) : null;
  };

  /**
   * Making /status a marketing path is what keeps the app host from answering it
   * as a duplicate — but marketing copy is cached at the edge for an hour, with
   * a day of stale-while-revalidate behind it. Inherited here, that means an
   * edge keeps serving "All Systems Operational" for an hour into an outage:
   * the same failure as swallowing a query error, moved to the CDN.
   */
  it('is not held at the edge for the marketing hour', async () => {
    const header = (await get('/status')).headers.get('cache-control');
    expect(header).toBeTruthy();
    expect(maxAge(header, 's-maxage')).toBeLessThanOrEqual(60);
    expect(maxAge(header, 'stale-while-revalidate')).toBeLessThanOrEqual(60);
  });

  it('leaves the marketing pages on their own long cache', async () => {
    const header = (await get('/security')).headers.get('cache-control');
    expect(maxAge(header, 's-maxage')).toBe(3600);
  });
});
