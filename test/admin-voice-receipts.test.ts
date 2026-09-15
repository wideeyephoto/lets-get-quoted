import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPendingVoiceReceipts, safeVoiceReference, voiceReceiptFailureStage, voiceReceiptRetryState, type PendingVoiceReceipt } from '@/lib/admin-voice-receipts';

const mocks = vi.hoisted(() => ({ scope: vi.fn() }));
vi.mock('@/lib/voice/auth', () => ({ signalWireVoiceScope: mocks.scope }));
const now = Date.parse('2026-09-09T01:00:00Z');
const base: PendingVoiceReceipt = {
  id: '11111111-1111-4111-8111-111111111111', account_id: '22222222-2222-4222-8222-222222222222',
  provider_call_id: '33333333-3333-4333-8333-333333333333', processing_status: 'failed', attempt_count: 1,
  received_at: new Date(now - 3600000).toISOString(), next_attempt_at: new Date(now - 1000).toISOString(),
  processing_lease_expires_at: null, last_error: 'settlement_failed',
};
beforeEach(() => { mocks.scope.mockReturnValue({ projectId: 'project', spaceId: 'space' }); });

describe('voice receipt operator retry state', () => {
  it.each([
    [{}, 'Ready for retry', true],
    [{ next_attempt_at: new Date(now + 1000).toISOString() }, 'Retry scheduled', false],
    [{ next_attempt_at: null }, 'Needs review', false],
    [{ attempt_count: 5 }, 'Needs review', false],
    [{ received_at: new Date(now - 86400000).toISOString() }, 'Needs review', false],
    [{ received_at: 'invalid' }, 'Needs review', false],
    [{ received_at: new Date(now + 1).toISOString() }, 'Needs review', false],
    [{ account_id: null }, 'Needs review', false],
    [{ processing_status: 'processing', processing_lease_expires_at: new Date(now + 1000).toISOString(), attempt_count: 5 }, 'Processing', false],
    [{ processing_status: 'processing', processing_lease_expires_at: new Date(now - 1000).toISOString() }, 'Ready for retry', true],
    [{ processing_status: 'processing', processing_lease_expires_at: null }, 'Needs review', false],
    [{ processing_status: 'received', received_at: new Date(now - 1000).toISOString() }, 'Waiting for processing', false],
    [{ processing_status: 'received', received_at: new Date(now - 300000).toISOString() }, 'Ready for retry', true],
    [{ processing_status: 'processed' }, 'Complete', false],
  ] as const)('classifies %j without overriding a lease or retry budget', (patch, label, retry) => {
    expect(voiceReceiptRetryState({ ...base, ...patch }, now)).toMatchObject({ label, retry });
  });
  it('never exposes raw errors or unvalidated provider references', () => {
    expect(voiceReceiptFailureStage('customer-phone=555-555-1234')).toBe('Unclassified processing failure');
    expect(voiceReceiptFailureStage('settlement_failed')).toBe('Usage settlement');
    expect(safeVoiceReference('555-555-1234')).toBeNull();
    expect(safeVoiceReference(base.provider_call_id)).toBe(base.provider_call_id);
  });
});

function client(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ['select','eq','in','order','limit']) query[key] = vi.fn(() => query);
  query.abortSignal = vi.fn().mockResolvedValue(result);
  const admin = { from: vi.fn(() => query) };
  return { admin: admin as unknown as SupabaseClient, query, from: admin.from };
}
describe('voice receipt operator query', () => {
  it('loads bounded scoped operational columns without transcripts, tokens, or payloads', async () => {
    const f = client({ data: [base], count: 101, error: null });
    await expect(loadPendingVoiceReceipts(f.admin)).resolves.toMatchObject({ available: true, total: 101, rows: [base] });
    expect(f.query.eq.mock.calls).toEqual([['provider','signalwire'],['provider_project_id','project'],['provider_space_id','space']]);
    expect(f.query.select.mock.calls[0][0]).not.toMatch(/payload|token|transcript|summary/);
    expect(f.query.limit).toHaveBeenCalledWith(100);
    expect(f.query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it.each([{ data: [], count: null, error: null }, { data: null, count: null, error: { code: '42703' } }])('does not turn an unavailable query into a healthy zero', async result => {
    const f = client(result);
    await expect(loadPendingVoiceReceipts(f.admin)).resolves.toEqual({ available: false, rows: [], total: null });
  });
  it('does not query an unconfigured provider scope', async () => {
    mocks.scope.mockReturnValue(null); const f = client({ data: [], count: 0 });
    expect((await loadPendingVoiceReceipts(f.admin)).available).toBe(false); expect(f.from).not.toHaveBeenCalled();
  });
  it('reports transport rejection as unavailable', async () => {
    const f = client(null); f.query.abortSignal.mockRejectedValue(new Error('timeout'));
    expect((await loadPendingVoiceReceipts(f.admin)).available).toBe(false);
  });
});
