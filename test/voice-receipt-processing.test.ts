import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { VoiceReceipt } from '@/lib/voice/provider';
import {
  ingestVoiceEvent,
  processVoiceReceipt,
  SupabaseVoiceReceiptProcessingStore,
  type VoiceReceiptClaim,
  type VoiceReceiptProcessingStore,
} from '@/lib/voice/receipt-processing';

const EVENT = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';
const CALL = '33333333-3333-4333-8333-333333333333';
const admin = {} as SupabaseClient;

const receipt: VoiceReceipt = {
  provider: 'signalwire',
  providerCallId: CALL,
  eventType: 'post_conversation',
  projectId: 'project',
  spaceId: 'space',
  callStartMicros: 1,
  callAnswerMicros: 2,
  callEndMicros: 3,
  aiStartMicros: 2,
  aiEndMicros: 3,
  callerNumber: '+15551234567',
  summary: 'Needs an estimate.',
  callLog: [{ role: 'user', content: 'I need an estimate.', timestamp: null }],
};

const claimed = (attemptNumber = 1): VoiceReceiptClaim => ({
  status: 'claimed',
  eventId: EVENT,
  claimToken: TOKEN,
  attemptNumber,
  retryAfterSeconds: null,
});

function store(overrides: Partial<VoiceReceiptProcessingStore> = {}) {
  return {
    claim: vi.fn().mockResolvedValue(claimed()),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue({ status: 'retryable', retryAfterSeconds: 5 }),
    ...overrides,
  } satisfies VoiceReceiptProcessingStore;
}

const settled = (reconcile: 'no_admission' | 'unbillable_receipt' | 'settlement_failed' | null = null) => ({
  minutes: reconcile === 'unbillable_receipt' ? null : 1,
  billed: reconcile === null,
  leadId: 'lead-1',
  reconcile,
});

describe('voice receipt processing ownership', () => {
  it('settles and completes one claimed event under its stable event id', async () => {
    const queue = store();
    const settle = vi.fn().mockResolvedValue(settled());

    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toEqual({ status: 'processed', minutes: 1 });
    expect(settle).toHaveBeenCalledWith(admin, receipt, { voiceEventId: EVENT });
    expect(queue.complete).toHaveBeenCalledWith(claimed());
    expect(queue.fail).not.toHaveBeenCalled();
  });

  it('does not settle an event the database has already processed', async () => {
    const queue = store({
      claim: vi.fn().mockResolvedValue({
        status: 'processed', eventId: EVENT, claimToken: null,
        attemptNumber: 1, retryAfterSeconds: null,
      }),
    });
    const settle = vi.fn();

    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toEqual({ status: 'processed_before', retryAfterSeconds: null });
    expect(settle).not.toHaveBeenCalled();
    expect(queue.complete).not.toHaveBeenCalled();
  });

  it('lets only one of two concurrent duplicate deliveries settle', async () => {
    let calls = 0;
    const queue = store({
      claim: vi.fn().mockImplementation(async () => {
        calls += 1;
        return calls === 1
          ? claimed()
          : {
            status: 'busy', eventId: EVENT, claimToken: null,
            attemptNumber: 1, retryAfterSeconds: 300,
          };
      }),
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const settle = vi.fn().mockImplementation(async () => {
      await held;
      return settled();
    });

    const first = processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle });
    await vi.waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toEqual({ status: 'busy', retryAfterSeconds: 300 });
    release();
    await expect(first).resolves.toEqual({ status: 'processed', minutes: 1 });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(queue.complete).toHaveBeenCalledTimes(1);
  });

  it('marks an unexpected settlement throw retryable instead of abandoning it', async () => {
    const queue = store();
    const boom = new Error('transient database failure');

    await expect(processVoiceReceipt(admin, EVENT, receipt, {
      store: queue,
      settle: vi.fn().mockRejectedValue(boom),
    })).resolves.toEqual({
      status: 'retryable_failure',
      reason: 'voice_receipt_handler_threw',
      retryAfterSeconds: 5,
      error: boom,
      minutes: null,
    });
    expect(queue.fail).toHaveBeenCalledWith(
      claimed(), 'voice_receipt_handler_threw', true,
    );
  });

  it('retries a lost sole-transcript projection and then completes once', async () => {
    const queue = store({
      claim: vi.fn()
        .mockResolvedValueOnce(claimed(1))
        .mockResolvedValueOnce(claimed(2)),
    });
    let transcriptRows = 0;
    const settle = vi.fn()
      .mockRejectedValueOnce(new Error('Voice call history write failed (57014).'))
      .mockImplementationOnce(async () => {
        transcriptRows += 1;
        return settled();
      });

    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toMatchObject({ status: 'retryable_failure' });
    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toEqual({ status: 'processed', minutes: 1 });
    expect(queue.fail).toHaveBeenCalledTimes(1);
    expect(queue.complete).toHaveBeenCalledTimes(1);
    expect(transcriptRows).toBe(1);
  });

  it('retries an ambiguous post-lead failure and completes with exactly one lead', async () => {
    const queue = store({
      claim: vi.fn()
        .mockResolvedValueOnce(claimed(1))
        .mockResolvedValueOnce(claimed(2)),
    });
    let settlementAttempts = 0;
    let leadCount = 0;
    const settle = vi.fn().mockImplementation(async () => {
      settlementAttempts += 1;
      if (settlementAttempts === 1) {
        // The INSERT committed but its response was lost. The real createLead
        // path resolves the second attempt by source_voice_event_id.
        leadCount += 1;
        throw new Error('response lost after lead insert');
      }
      return settled();
    });

    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toMatchObject({ status: 'retryable_failure' });
    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toEqual({ status: 'processed', minutes: 1 });
    expect(settle).toHaveBeenCalledTimes(2);
    expect(queue.fail).toHaveBeenCalledTimes(1);
    expect(queue.complete).toHaveBeenCalledTimes(1);
    expect(leadCount).toBe(1);
  });

  it('does not run settlement again when only the completion response was lost', async () => {
    const lost = new Error('completion response lost after commit');
    const queue = store({
      claim: vi.fn()
        .mockResolvedValueOnce(claimed(1))
        .mockResolvedValueOnce({
          status: 'processed', eventId: EVENT, claimToken: null,
          attemptNumber: 1, retryAfterSeconds: null,
        }),
      complete: vi.fn().mockRejectedValueOnce(lost),
    });
    const settle = vi.fn().mockResolvedValue(settled());

    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .rejects.toBe(lost);
    await expect(processVoiceReceipt(admin, EVENT, receipt, { store: queue, settle }))
      .resolves.toEqual({ status: 'processed_before', retryAfterSeconds: null });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(queue.fail).not.toHaveBeenCalled();
  });

  it('retries a definite settlement failure but terminally parks unbillable input', async () => {
    const retryQueue = store();
    const retry = await processVoiceReceipt(admin, EVENT, receipt, {
      store: retryQueue,
      settle: vi.fn().mockResolvedValue(settled('settlement_failed')),
    });
    expect(retry).toMatchObject({ status: 'retryable_failure', reason: 'settlement_failed' });
    expect(retryQueue.fail).toHaveBeenCalledWith(claimed(), 'settlement_failed', true);

    const terminalQueue = store({
      fail: vi.fn().mockResolvedValue({ status: 'exhausted', retryAfterSeconds: null }),
    });
    const terminal = await processVoiceReceipt(admin, EVENT, receipt, {
      store: terminalQueue,
      settle: vi.fn().mockResolvedValue(settled('unbillable_receipt')),
    });
    expect(terminal).toMatchObject({ status: 'terminal_failure', reason: 'unbillable_receipt' });
    expect(terminalQueue.fail).toHaveBeenCalledWith(claimed(), 'unbillable_receipt', false);
  });
});

describe('voice receipt processing RPC adapter', () => {
  const ingestInput = {
    providerCallId: CALL,
    eventType: 'post_conversation',
    providerProjectId: 'project',
    providerSpaceId: 'space',
    expectedProjectId: 'project',
    expectedSpaceId: 'space',
    payload: { call_id: CALL },
  } as const;

  it('retries one unique-insert race so an identical concurrent replay can compare', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'race' } })
      .mockResolvedValueOnce({
        data: [{ voice_event_id: EVENT, inserted: false, admitted: true }], error: null,
      });

    await expect(ingestVoiceEvent({ rpc } as unknown as SupabaseClient, ingestInput))
      .resolves.toEqual({ voiceEventId: EVENT, inserted: false, admitted: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });

  it('rejects missing project or space scope before calling the database', async () => {
    for (const over of [
      { expectedProjectId: '' },
      { expectedSpaceId: '' },
      { providerProjectId: null },
      { providerSpaceId: null },
    ]) {
      const rpc = vi.fn();
      await expect(ingestVoiceEvent(
        { rpc } as unknown as SupabaseClient,
        { ...ingestInput, ...over },
      )).rejects.toMatchObject({
        name: 'VoiceReceiptProcessingRpcError', rpcCode: '22023', operation: 'scope validation',
      });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it('surfaces an exact-scope mismatch as a terminal database rejection', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'voice event project does not match this deployment' },
    });
    await expect(ingestVoiceEvent(
      { rpc } as unknown as SupabaseClient,
      { ...ingestInput, providerProjectId: 'other-project' },
    )).rejects.toMatchObject({
      name: 'VoiceReceiptProcessingRpcError', rpcCode: '22023', operation: 'ingest',
    });
  });

  it('still rejects changed immutable input when the replay also returns 23505', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null, error: { code: '23505', message: 'different immutable input' },
    });

    await expect(ingestVoiceEvent({ rpc } as unknown as SupabaseClient, ingestInput))
      .rejects.toMatchObject({
        name: 'VoiceReceiptProcessingRpcError', rpcCode: '23505', operation: 'ingest',
      });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('uses token-bound service RPCs for claim, completion, and failure', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{
          claim_status: 'claimed', claim_token: TOKEN,
          attempt_number: 2, retry_after_seconds: null,
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [{ failure_status: 'retryable', retry_after_seconds: 10 }], error: null,
      });
    const adapter = new SupabaseVoiceReceiptProcessingStore(
      { rpc } as unknown as SupabaseClient,
    );

    const claim = await adapter.claim(EVENT);
    await adapter.complete(claim);
    await adapter.fail(claim, 'settlement_failed', true);

    expect(rpc.mock.calls).toEqual([
      ['claim_voice_event_processing', { p_voice_event_id: EVENT }],
      ['complete_voice_event_processing', {
        p_voice_event_id: EVENT, p_claim_token: TOKEN,
      }],
      ['fail_voice_event_processing', {
        p_voice_event_id: EVENT,
        p_claim_token: TOKEN,
        p_error_code: 'settlement_failed',
        p_retryable: true,
      }],
    ]);
  });
});
