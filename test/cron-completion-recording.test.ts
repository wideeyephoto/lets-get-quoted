import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

// Mock dependencies before importing the module under test.
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  deleteFn: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
  maybeSingle: vi.fn(),
}));

// Build a chainable Supabase mock that returns itself for every method except terminal calls.
function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'lt', 'order', 'limit', 'not']) {
    chain[name] = vi.fn(() => chain);
  }
  chain.maybeSingle = mocks.maybeSingle;
  Object.assign(chain, overrides);
  return chain;
}

const insertChain = makeChain();
const updateChain = makeChain();
const deleteChain = makeChain();

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      if (table !== 'cron_runs') throw new Error(`Unexpected table: ${table}`);
      return {
        insert: vi.fn(() => { mocks.insert(); return insertChain; }),
        update: vi.fn(() => { mocks.update(); return updateChain; }),
        delete: vi.fn(() => { mocks.deleteFn(); return deleteChain; }),
        select: vi.fn(() => insertChain),
        eq: vi.fn(() => insertChain),
      };
    }),
  }),
}));

// Must import after mocks are set up.
import { cronRoute } from '@/lib/cron-runs';

function makeRequest(secret: string): Request {
  return new Request('https://example.com/api/cron/test-job', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Deterministic random for prune-odds: never prune unless explicitly tested.
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  vi.stubEnv('CRON_SECRET', 'test-secret-123');
  // Default: startRun succeeds with a valid ID.
  mocks.maybeSingle.mockResolvedValue({ data: { id: 'run-uuid-001' }, error: null });
  // Default: update succeeds.
  (updateChain.eq as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
  // Default: delete succeeds.
  (deleteChain.lt as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('cron completion recording', () => {
  it('records ok=true for a successful worker', async () => {
    const handler = cronRoute('test-job', async () => ({ processed: 5 }));
    const response = await handler(makeRequest('test-secret-123'));
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('records ok=false when the worker throws', async () => {
    const handler = cronRoute('test-job', async () => { throw new Error('worker exploded'); });
    const response = await handler(makeRequest('test-secret-123'));
    expect(response.status).toBe(500);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.error).toContain('test-job');
  });

  it('records ok=false when worker returns logical failures', async () => {
    const handler = cronRoute('test-job', async () => ({ failures: 3, processed: 7 }));
    const response = await handler(makeRequest('test-secret-123'));
    expect(response.status).toBe(500);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('returns 401 without recording when auth fails', async () => {
    const handler = cronRoute('test-job', async () => ({ ok: true }));
    const response = await handler(makeRequest('wrong-secret'));
    expect(response.status).toBe(401);
    // No database writes should occur for unauthenticated requests.
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('still completes the worker when startRun DB insert fails', async () => {
    // startRun returns error -> runId is null.
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } });
    const workerFn = vi.fn(async () => ({ processed: 1 }));
    const handler = cronRoute('test-job', workerFn);
    const response = await handler(makeRequest('test-secret-123'));
    // Worker still runs and returns success.
    expect(response.status).toBe(200);
    expect(workerFn).toHaveBeenCalledTimes(1);
    // finishRun is a no-op because runId is null, so no update call.
    expect(mocks.update).not.toHaveBeenCalled();
  });

  describe('finishRun DB error handling (the main fix)', () => {
    it('logs an error when the update returns a Supabase error object', async () => {
      // The update succeeds at the network level but returns a DB error.
      (updateChain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'connection reset during write' },
      });
      const handler = cronRoute('test-job', async () => ({ processed: 1 }));
      const response = await handler(makeRequest('test-secret-123'));
      // The run still returns 200 — recording must never break the run.
      expect(response.status).toBe(200);
      // The error is logged, not swallowed silently.
      expect(console.error).toHaveBeenCalledWith(
        'cron_runs finish write error:',
        'connection reset during write',
      );
    });

    it('logs an error when the update throws a network exception', async () => {
      (updateChain.eq as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const handler = cronRoute('test-job', async () => ({ processed: 1 }));
      const response = await handler(makeRequest('test-secret-123'));
      expect(response.status).toBe(200);
      expect(console.error).toHaveBeenCalledWith('cron_runs finish failed:', 'ECONNREFUSED');
    });

    it('logs an error when finish-after-throw encounters a DB error', async () => {
      (updateChain.eq as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'constraint violation on cron_runs' },
      });
      const handler = cronRoute('test-job', async () => { throw new Error('worker failed'); });
      const response = await handler(makeRequest('test-secret-123'));
      expect(response.status).toBe(500);
      // Both the worker error and the DB write error are logged.
      expect(console.error).toHaveBeenCalledWith('test-job cron failed:', 'worker failed');
      expect(console.error).toHaveBeenCalledWith(
        'cron_runs finish write error:',
        'constraint violation on cron_runs',
      );
    });
  });

  describe('pruneOldRuns DB error handling', () => {
    it('logs an error when prune delete returns a Supabase error', async () => {
      // Force the prune path: Math.random returns 0 (which means floor(0 * 50) === 0).
      vi.spyOn(Math, 'random').mockReturnValue(0);
      (deleteChain.lt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'prune permission denied' },
      });
      const handler = cronRoute('test-job', async () => ({ processed: 1 }));
      await handler(makeRequest('test-secret-123'));
      expect(console.error).toHaveBeenCalledWith(
        'cron_runs prune write error:',
        'prune permission denied',
      );
    });
  });
});
