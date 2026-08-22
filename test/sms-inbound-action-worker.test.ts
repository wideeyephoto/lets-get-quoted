import { describe, expect, it, vi } from 'vitest';

import {
  processSmsInboundActionReceipt,
  SmsInboundActionRpcError,
  type SmsInboundActionClaim,
  type SmsInboundActionOutcome,
  type SmsInboundActionStore,
} from '@/lib/sms-inbound-action-worker';

const RECEIPT = '11111111-1111-4111-8111-111111111111';
const CLAIM: SmsInboundActionClaim = Object.freeze({
  taskId: '22222222-2222-4222-8222-222222222222',
  claimToken: '33333333-3333-4333-8333-333333333333',
  provider: 'signalwire',
  providerEventId: 'provider-message-1',
  accountId: '44444444-4444-4444-8444-444444444444',
  senderNumberId: '55555555-5555-4555-8555-555555555555',
  senderPurpose: 'contractor_dedicated',
  fromNumber: '+12485550111',
});
const CUSTOMER_EVENT = '66666666-6666-4666-8666-666666666666';
const OWNER_EVENT = '77777777-7777-4777-8777-777777777777';
const OUTCOME: SmsInboundActionOutcome = Object.freeze({
  actionKind: 'estimate',
  targetId: '88888888-8888-4888-8888-888888888888',
  decision: 'accept',
  replyKind: 'offer',
  replyBody: 'You are booked.',
  ownerAlertPhone: '+12485550199',
  ownerAlertBody: 'Jamie accepted.',
});

function admin(options: { failFirstEnqueue?: boolean } = {}) {
  let enqueueCalls = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'enqueue_sms_delivery') throw new Error(`Unexpected RPC ${name}`);
    enqueueCalls += 1;
    if (options.failFirstEnqueue && enqueueCalls === 1) {
      return { data: null, error: { code: '08006', message: 'response lost' } };
    }
    return {
      data: [{
        sms_event_id: args.p_billing_category === 'owner_alert' ? OWNER_EVENT : CUSTOMER_EVENT,
        task_state: 'queued',
        created: enqueueCalls <= 2,
      }],
      error: null,
    };
  });
  return { client: { rpc } as never, rpc };
}

function store(overrides: Partial<SmsInboundActionStore> = {}) {
  const value: SmsInboundActionStore = {
    claimReceipt: vi.fn(async () => ({ status: 'claimed' as const, claim: CLAIM })),
    claimBatch: vi.fn(async () => [CLAIM]),
    apply: vi.fn(async () => OUTCOME),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    ...overrides,
  };
  return value;
}

describe('durable inbound SMS action worker', () => {
  it('queues the stored reply and owner alert before completing the task', async () => {
    const db = admin();
    const actions = store();
    await expect(processSmsInboundActionReceipt(RECEIPT, db.client, actions)).resolves.toBe('completed');
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(actions.complete).toHaveBeenCalledWith(CLAIM, CUSTOMER_EVENT, OWNER_EVENT);
    expect(actions.fail).not.toHaveBeenCalled();
    const keys = db.rpc.mock.calls.map((call) => call[1].p_idempotency_key);
    expect(keys[0]).toMatch(/^inbound-reply:signalwire:offer:/);
    expect(keys[1]).toMatch(/^inbound-owner-alert:signalwire:/);
    expect(db.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_sender_purpose: 'contractor_dedicated',
      p_sender_number_id: CLAIM.senderNumberId,
    });
    expect(db.rpc.mock.calls[1]?.[1]).toMatchObject({
      p_billing_category: 'owner_alert',
      p_sender_purpose: 'lgq_shared',
      p_sender_number_id: null,
    });
  });

  it('never reuses a dispatch sender for an owner alert', async () => {
    const dispatchClaim = { ...CLAIM, senderPurpose: 'lgq_dispatch' as const };
    const db = admin();
    const actions = store({
      claimReceipt: vi.fn(async () => ({ status: 'claimed' as const, claim: dispatchClaim })),
    });
    await expect(processSmsInboundActionReceipt(RECEIPT, db.client, actions)).resolves.toBe('completed');
    const ownerAlert = db.rpc.mock.calls.find((call) => call[1].p_billing_category === 'owner_alert');
    expect(ownerAlert?.[1]).toMatchObject({
      p_sender_purpose: 'lgq_shared',
      p_sender_number_id: null,
    });
  });

  it('resumes a committed effect after the apply response is lost', async () => {
    let effectCommitted = false;
    let attempts = 0;
    const actions = store({
      apply: vi.fn(async () => {
        attempts += 1;
        if (!effectCommitted) {
          effectCommitted = true;
          throw new SmsInboundActionRpcError('08006');
        }
        return OUTCOME;
      }),
    });
    const firstDb = admin();
    await expect(processSmsInboundActionReceipt(RECEIPT, firstDb.client, actions)).rejects.toBeInstanceOf(SmsInboundActionRpcError);
    expect(actions.fail).toHaveBeenCalledTimes(1);
    const retryDb = admin();
    await expect(processSmsInboundActionReceipt(RECEIPT, retryDb.client, actions)).resolves.toBe('completed');
    expect(attempts).toBe(2);
    expect(retryDb.rpc).toHaveBeenCalledTimes(2);
    expect(actions.complete).toHaveBeenCalledTimes(1);
  });

  it('retries deterministic enqueue after an enqueue response failure', async () => {
    const actions = store();
    const firstDb = admin({ failFirstEnqueue: true });
    await expect(processSmsInboundActionReceipt(RECEIPT, firstDb.client, actions)).rejects.toThrow(/enqueue failed/i);
    expect(actions.fail).toHaveBeenCalledTimes(1);

    const retryDb = admin();
    await expect(processSmsInboundActionReceipt(RECEIPT, retryDb.client, actions)).resolves.toBe('completed');
    expect(actions.apply).toHaveBeenCalledTimes(2);
    expect(actions.complete).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue again when completion committed but its response was lost', async () => {
    let completed = false;
    const actions = store({
      claimReceipt: vi.fn(async () => completed
        ? { status: 'completed' as const, claim: null }
        : { status: 'claimed' as const, claim: CLAIM }),
      complete: vi.fn(async () => {
        completed = true;
        throw new TypeError('response lost');
      }),
      fail: vi.fn(async () => undefined),
    });
    const db = admin();
    await expect(processSmsInboundActionReceipt(RECEIPT, db.client, actions)).rejects.toThrow('response lost');
    expect(db.rpc).toHaveBeenCalledTimes(2);
    await expect(processSmsInboundActionReceipt(RECEIPT, db.client, actions)).resolves.toBe('completed');
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });

  it('does nothing while another lease owns the receipt', async () => {
    const actions = store({
      claimReceipt: vi.fn(async () => ({ status: 'busy' as const, claim: null })),
    });
    const db = admin();
    await expect(processSmsInboundActionReceipt(RECEIPT, db.client, actions)).resolves.toBe('busy');
    expect(actions.apply).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('does not retry or enqueue an exhausted receipt', async () => {
    const actions = store({
      claimReceipt: vi.fn(async () => ({ status: 'exhausted' as const, claim: null })),
    });
    const db = admin();
    await expect(processSmsInboundActionReceipt(RECEIPT, db.client, actions)).resolves.toBe('exhausted');
    expect(actions.apply).not.toHaveBeenCalled();
    expect(actions.fail).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
