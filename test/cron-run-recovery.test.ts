import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.admin }));
import { cronRoute } from '@/lib/cron-runs';

type Row = Record<string, unknown> & { id: string };

// Exercise the actual PostgREST client at its HTTP boundary. A start response
// can fail before the write or be lost after commit; these are different states.
function database(start: 'rejected' | 'committed-response-lost' | 'ok', finishFails = false) {
  const rows = new Map<string, Row>();
  const requests: Array<{ method: string; body: Row; merge: boolean }> = [];
  let generated = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname !== '/rest/v1/cron_runs') throw new Error(`Unexpected request: ${url.pathname}`);
    const method = init?.method ?? 'GET';
    const body = JSON.parse(String(init?.body)) as Row;
    const merge = new Headers(init?.headers).get('prefer')?.includes('resolution=merge-duplicates') ?? false;
    requests.push({ method, body, merge });
    if (method !== 'POST') throw new Error(`Unexpected write: ${method}`);

    if (merge) {
      if (url.searchParams.get('on_conflict') !== 'id') throw new Error('Recovery must use the primary key');
      if (finishFails) return Response.json({ message: 'completion unavailable' }, { status: 503 });
      rows.set(body.id, { ...rows.get(body.id), ...body });
      return new Response(null, { status: 201 });
    }

    if (start !== 'rejected') {
      const id = body.id ?? `database-generated-${++generated}`;
      rows.set(id, { ...body, id });
    }
    if (start !== 'ok') return Response.json({ message: 'Gateway Timeout' }, { status: 504 });
    return Response.json(body, { status: 201 });
  });
  mocks.admin.mockReturnValue(createClient('https://cron-test.supabase.co', 'test-key', {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false },
  }));
  return { rows, requests };
}

const request = () => new Request('https://example.com/api/cron/test-job', {
  headers: { authorization: 'Bearer test-secret' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('cron recording after an uncertain start write', () => {
  it.each(['rejected', 'committed-response-lost', 'ok'] as const)('saves one completed row when start is %s', async (start) => {
    const db = database(start);
    const worker = vi.fn(async () => ({ checked: 1, errors: 0 }));

    const response = await cronRoute('test-job', worker)(request());

    expect(response.status).toBe(200);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(db.requests).toHaveLength(2);
    expect(db.rows.size).toBe(1);
    const row = [...db.rows.values()][0];
    expect(row).toMatchObject({
      id: db.requests[0].body.id, job: 'test-job', started_at: db.requests[0].body.started_at,
      ok: true, summary: { checked: 1, errors: 0 }, error: null,
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.finished_at).toEqual(expect.any(String));
    expect(row.duration_ms).toEqual(expect.any(Number));
  });

  it.each(['throw', 'logical'] as const)('retains a %s failure after the initial record is rejected', async (failure) => {
    const db = database('rejected');
    const worker = vi.fn(async () => {
      if (failure === 'throw') throw new Error('provider unavailable');
      return { checked: 1, errors: 1 };
    });

    const response = await cronRoute('test-job', worker)(request());

    expect(response.status).toBe(500);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(db.rows.size).toBe(1);
    const row = [...db.rows.values()][0];
    expect(row.ok).toBe(false);
    expect(row.error).toContain(failure === 'throw' ? 'provider unavailable' : 'errors=1');
    expect(row.summary).toEqual(failure === 'throw' ? null : { checked: 1, errors: 1 });
  });

  it('keeps concurrent invocations distinct while each uncertain insert commits', async () => {
    const db = database('committed-response-lost');
    const worker = vi.fn(async () => ({ checked: 1 }));
    const handler = cronRoute('test-job', worker);

    const responses = await Promise.all([handler(request()), handler(request())]);

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(worker).toHaveBeenCalledTimes(2);
    expect(db.requests).toHaveLength(4);
    expect(db.rows.size).toBe(2);
    expect([...db.rows.values()].every((row) => row.ok === true && row.finished_at)).toBe(true);
  });

  it('returns the worker result once when both recording writes fail', async () => {
    const db = database('rejected', true);
    const worker = vi.fn(async () => ({ checked: 1 }));

    const response = await cronRoute('test-job', worker)(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checked: 1 });
    expect(worker).toHaveBeenCalledTimes(1);
    expect(db.requests).toHaveLength(2);
    expect(db.rows.size).toBe(0);
    expect(console.error).toHaveBeenCalledWith('cron_runs finish write error:', 'completion unavailable');
  });

  it('does not record or run an unauthenticated request', async () => {
    const db = database('rejected');
    const worker = vi.fn();
    const response = await cronRoute('test-job', worker)(new Request('https://example.com/api/cron/test-job'));
    expect(response.status).toBe(401);
    expect(worker).not.toHaveBeenCalled();
    expect(db.requests).toHaveLength(0);
  });
});
