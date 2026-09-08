import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { recoverVoiceReceipt, runVoiceReceiptRecovery } from '@/lib/voice/receipt-recovery';
import { processVoiceReceipt } from '@/lib/voice/receipt-processing';

const EVENT = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const CALL = '33333333-3333-4333-8333-333333333333';
const scope = { projectId: 'project', spaceId: 'space' };
const now = Date.parse('2026-09-08T18:00:00Z');
const transcript = [{ role: 'user', content: 'Please call me about a repair', timestamp: 1 }];
const payload = {
  action: 'post_conversation', call_id: CALL, project_id: 'project', space_id: 'space',
  call_start_date: now * 1000 - 70e6, call_answer_date: now * 1000 - 65e6,
  call_end_date: now * 1000 - 5e6, ai_start_date: now * 1000 - 60e6, ai_end_date: now * 1000 - 6e6,
  summary: 'Needs a repair', structured_post_prompt: { caller_name: 'Test', urgency: 'urgent' },
};

function fixture(overrides: Record<string, unknown> = {}, failedTable?: string) {
  const tables: Record<string, unknown> = {
    voice_events: { id: EVENT, provider: 'signalwire', provider_call_id: CALL, account_id: ACCOUNT,
      provider_project_id: 'project', provider_space_id: 'space', processing_status: 'failed',
      received_at: new Date(now - 3600000).toISOString(), payload },
    voice_call_admissions: { account_id: ACCOUNT },
    voice_calls: { voice_event_id: EVENT, transcript, is_provisional: false, ended_at: new Date(now - 5000).toISOString() },
    ...overrides,
  };
  const filters: unknown[][] = [];
  const admin = {
    from: (table: string) => {
      const query = {
        select: vi.fn().mockImplementation(() => query),
        eq: vi.fn().mockImplementation((...args: unknown[]) => { filters.push([table, ...args]); return query; }),
        maybeSingle: async () => ({ data: tables[table], error: table === failedTable ? { code: 'XX000' } : null }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const process = vi.fn<typeof processVoiceReceipt>().mockResolvedValue({ status: 'processed', minutes: 1 });
  return { admin, process, filters, tables };
}

describe('stored voice receipt recovery', () => {
  it('defaults to a read-only readiness check', async () => {
    const f = fixture();
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now }, f.process)).resolves.toEqual({ status: 'ready' });
    expect(f.process).not.toHaveBeenCalled();
  });

  it('rehydrates the saved transcript and structured summary under the original event ID', async () => {
    const f = fixture();
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toEqual({ status: 'processed', minutes: 1 });
    expect(f.process).toHaveBeenCalledWith(f.admin, EVENT, expect.objectContaining({
      providerCallId: CALL, summary: 'Needs a repair', structuredPostPrompt: payload.structured_post_prompt, callLog: transcript,
    }));
    expect(f.filters).toContainEqual(['voice_calls', 'account_id', ACCOUNT]);
    expect(f.filters).toContainEqual(['voice_calls', 'provider_call_id', CALL]);
  });

  it.each(['processed', 'ignored'])('does not restart %s events', async (processing_status) => {
    const f = fixture();
    (f.tables.voice_events as Record<string, unknown>).processing_status = processing_status;
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toEqual({ status: 'not_pending' });
    expect(f.process).not.toHaveBeenCalled();
  });

  it.each([
    { provider_project_id: 'other' }, { provider_space_id: 'other' }, { account_id: null }, { provider: 'other' },
  ])('refuses event scope mismatch: %j', async (patch) => {
    const f = fixture();
    Object.assign(f.tables.voice_events as object, patch);
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toMatchObject({ status: 'needs_review', reason: 'scope_mismatch' });
    expect(f.process).not.toHaveBeenCalled();
  });

  it.each([{ call_id: 'other' }, { project_id: 'other' }, { space_id: 'other' }, { SWMLCall: { call_id: 'other' } }])('refuses payload drift: %j', async (patch) => {
    const f = fixture();
    (f.tables.voice_events as Record<string, unknown>).payload = { ...payload, ...patch };
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toMatchObject({ status: 'needs_review', reason: 'payload_scope_mismatch' });
    expect(f.process).not.toHaveBeenCalled();
  });

  it('refuses an admission from another workspace', async () => {
    const f = fixture({ voice_call_admissions: { account_id: EVENT } });
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toMatchObject({ reason: 'admission_mismatch' });
    expect(f.process).not.toHaveBeenCalled();
  });

  it.each([null, { transcript: null }, { is_provisional: true }, { ended_at: null }, { voice_event_id: CALL }])('never guesses missing or incomplete history: %j', async (patch) => {
    const f = fixture();
    f.tables.voice_calls = patch === null ? null : { ...(f.tables.voice_calls as object), ...patch };
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toMatchObject({ reason: 'missing_complete_projection' });
    expect(f.process).not.toHaveBeenCalled();
  });

  it.each([now - 86400000, now + 1000, NaN])('does not send stale or invalidly dated notifications: %s', async (received) => {
    const f = fixture();
    (f.tables.voice_events as Record<string, unknown>).received_at = Number.isFinite(received) ? new Date(received).toISOString() : 'invalid';
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toMatchObject({ reason: 'outside_automatic_recovery_window' });
    expect(f.process).not.toHaveBeenCalled();
  });

  it.each(['voice_events', 'voice_call_admissions', 'voice_calls'])('does not process through a %s read failure', async (table) => {
    const f = fixture({}, table);
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).rejects.toThrow('read failed');
    expect(f.process).not.toHaveBeenCalled();
  });

  it.each(['busy', 'deferred', 'exhausted', 'processed_before'] as const)('preserves the atomic processor %s result', async (status) => {
    const f = fixture();
    f.process.mockResolvedValue({ status, retryAfterSeconds: status === 'busy' || status === 'deferred' ? 5 : null });
    await expect(recoverVoiceReceipt(f.admin, EVENT, { scope, now, apply: true }, f.process)).resolves.toMatchObject({ status });
    expect(f.process).toHaveBeenCalledTimes(1);
  });
});

describe('bounded receipt recovery worker', () => {
  it('selects only due retries and expired leases, limits work, and exposes failures', async () => {
    const filters: unknown[][] = [];
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'not', 'gte', 'or', 'order']) {
      query[method] = (...args: unknown[]) => { filters.push([method, ...args]); return query; };
    }
    query.limit = (count: number) => { filters.push(['limit', count]); return Promise.resolve({ data: [{ id: EVENT }, { id: CALL }], error: null }); };
    const admin = { from: () => query } as unknown as SupabaseClient;
    const recover = vi.fn<typeof recoverVoiceReceipt>()
      .mockResolvedValueOnce({ status: 'processed', minutes: 1 })
      .mockResolvedValueOnce({ status: 'needs_review', reason: 'missing_complete_projection' });
    await expect(runVoiceReceiptRecovery({ admin, scope, now, recover })).resolves.toMatchObject({ considered: 2, processed: 1, failed: 1, needsReview: 1 });
    expect(filters).toContainEqual(['limit', 5]);
    expect(filters.find((f) => f[0] === 'or')?.[1]).toContain('next_attempt_at.lte.');
    expect(filters.find((f) => f[0] === 'or')?.[1]).toContain('processing_lease_expires_at.lte.');
    expect(recover).toHaveBeenCalledWith(admin, EVENT, { scope, now, apply: true });
  });
});
