import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VOICE_ALLOWANCE_WORKER_FLAG,
  runVoiceAllowanceBatch,
  voiceAllowanceWorkerEnabled,
} from '@/lib/billing/voice-allowance-worker';
import { cronSummaryHasFailures } from '@/lib/cron-jobs';

const rpc = vi.fn();
let candidates: { data: unknown; error: unknown };

const admin = {
  rpc: (...a: unknown[]) => rpc(...a),
  from() {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'neq', 'lte', 'gt', 'order']) chain[method] = () => chain;
    chain.limit = () => Promise.resolve(candidates);
    return chain;
  },
};

vi.mock('@/lib/auth', () => ({ createAdminClient: () => admin }));

const row = (id: string) => ({
  account_id: id,
  period_start: '2026-08-01T00:00:00Z',
  period_end: '2026-09-01T00:00:00Z',
});

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 100, error: null });
  candidates = { data: [row('a'), row('b')], error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the flag', () => {
  it('is off unless exactly 1', () => {
    for (const value of [undefined, '', '0', 'true', ' 1']) {
      expect(voiceAllowanceWorkerEnabled({ [VOICE_ALLOWANCE_WORKER_FLAG]: value })).toBe(false);
    }
    expect(voiceAllowanceWorkerEnabled({ [VOICE_ALLOWANCE_WORKER_FLAG]: '1' })).toBe(true);
  });

  it('is checked before anything else in the route', () => {
    // OFF must mean no secret read, no heartbeat row, no service-role client.
    // The route returning 404 before touching cronRoute is what guarantees that,
    // and it is the same shape the allowance-reset route uses.
    const route = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'cron', 'voice-allowance', 'route.ts'), 'utf8',
    );
    const guard = route.indexOf('voiceAllowanceWorkerEnabled()');
    const work = route.indexOf('authenticatedGET(request)');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(work);
  });
});

describe('sweeping', () => {
  it('grants for each candidate, using that workspace\'s own period', async () => {
    const summary = await runVoiceAllowanceBatch();
    expect(summary).toMatchObject({ considered: 2, granted: 2, minutes: 200, failed: 0 });
    expect(rpc).toHaveBeenCalledWith('grant_voice_minute_allowance', {
      p_account_id: 'a',
      p_period_start: '2026-08-01T00:00:00Z',
      p_period_end: '2026-09-01T00:00:00Z',
    });
  });

  it('counts a zero as skipped, not as a failure', async () => {
    // Zero means already granted this period, or nothing to grant. Both are the
    // ordinary case; treating either as an error would make a healthy run look
    // broken every fifteen minutes.
    rpc.mockResolvedValue({ data: 0, error: null });
    const summary = await runVoiceAllowanceBatch();
    expect(summary).toMatchObject({ granted: 0, skipped: 2, failed: 0, minutes: 0 });
    expect(cronSummaryHasFailures(summary as never)).toBe(false);
  });

  it('keeps going when one workspace fails, and says how many', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'locked' } });
    rpc.mockResolvedValueOnce({ data: 100, error: null });
    const summary = await runVoiceAllowanceBatch();
    expect(summary).toMatchObject({ considered: 2, granted: 1, failed: 1 });
    // The cron wrapper reads `failed` off the summary and reports the run as a
    // failure. That is the only reason a partial batch surfaces at all.
    expect(cronSummaryHasFailures(summary as never)).toBe(true);
  });

  it('survives a throw as well as an error', async () => {
    rpc.mockRejectedValueOnce(new Error('connection reset'));
    rpc.mockResolvedValueOnce({ data: 100, error: null });
    expect(await runVoiceAllowanceBatch()).toMatchObject({ granted: 1, failed: 1 });
  });

  it('refuses to guess a period for an entitlement that has none', async () => {
    // Inventing a month here would grant against a window the ledger does not
    // agree with, and the grant is keyed on that window.
    candidates = { data: [{ account_id: 'a', period_start: null, period_end: null }], error: null };
    const summary = await runVoiceAllowanceBatch();
    expect(summary).toMatchObject({ failed: 1, granted: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports an unreadable candidate list as nothing to do, not as work done', async () => {
    candidates = { data: null, error: { message: 'down' } };
    expect(await runVoiceAllowanceBatch()).toMatchObject({ considered: 0, granted: 0, failed: 0 });
  });

  it('says out loud when a full batch means there is more waiting', async () => {
    // A silent cap reads as "everything was covered" when it was not.
    candidates = { data: [row('a'), row('b')], error: null };
    expect(await runVoiceAllowanceBatch({ batchSize: 2 })).toMatchObject({ truncated: true });
    expect(await runVoiceAllowanceBatch({ batchSize: 5 })).toMatchObject({ truncated: false });
  });
});

describe('it stays away from the canonical reset', () => {
  it('calls its own RPC and never the four-resource one', async () => {
    await runVoiceAllowanceBatch();
    for (const [name] of rpc.mock.calls) {
      expect(name).toBe('grant_voice_minute_allowance');
    }
  });

  it('is registered as its own cron job, on its own schedule', () => {
    const jobs = readFileSync(join(process.cwd(), 'src', 'lib', 'cron-jobs.ts'), 'utf8');
    expect(jobs).toContain("job: 'voice-allowance'");
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    expect(vercel).toContain('/api/cron/voice-allowance');
  });
});
