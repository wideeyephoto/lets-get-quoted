import { describe, expect, it, vi } from 'vitest';

import {
  processSmsInboundActionReceipt,
  runSmsInboundActionBatch,
  SupabaseSmsInboundActionStore,
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
  effectApplied: false,
});
const SHARED_CLAIM: SmsInboundActionClaim = Object.freeze({
  ...CLAIM,
  senderPurpose: 'lgq_shared',
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
const APPLIED_SHARED_CLAIM: SmsInboundActionClaim = Object.freeze({
  ...SHARED_CLAIM,
  effectApplied: true,
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
        sms_event_id: args.p_event_type === 'inbound_action_owner_alert'
          ? OWNER_EVENT
          : CUSTOMER_EVENT,
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
  it('strictly parses and preserves the applied-effect claim flag', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        claim_status: 'claimed',
        task_id: CLAIM.taskId,
        work_claim_token: CLAIM.claimToken,
        provider: CLAIM.provider,
        provider_event_id: CLAIM.providerEventId,
        account_id: CLAIM.accountId,
        sender_number_id: CLAIM.senderNumberId,
        sender_purpose: 'lgq_shared',
        from_number: CLAIM.fromNumber,
        effect_applied: true,
        stored_outcome: {
          action_kind: OUTCOME.actionKind,
          target_id: OUTCOME.targetId,
          decision: OUTCOME.decision,
          reply_kind: OUTCOME.replyKind,
          reply_body: OUTCOME.replyBody,
          owner_alert_phone: OUTCOME.ownerAlertPhone,
          owner_alert_body: OUTCOME.ownerAlertBody,
        },
      }],
      error: null,
    }));
    const actions = new SupabaseSmsInboundActionStore({ rpc } as never);

    await expect(actions.claimReceipt(RECEIPT)).resolves.toMatchObject({
      status: 'claimed',
      claim: { effectApplied: true },
    });
  });

  it('rejects a non-boolean applied-effect claim flag', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        claim_status: 'claimed',
        task_id: CLAIM.taskId,
        work_claim_token: CLAIM.claimToken,
        provider: CLAIM.provider,
        provider_event_id: CLAIM.providerEventId,
        account_id: CLAIM.accountId,
        sender_number_id: CLAIM.senderNumberId,
        sender_purpose: CLAIM.senderPurpose,
        from_number: CLAIM.fromNumber,
        effect_applied: 'false',
        stored_outcome: null,
      }],
      error: null,
    }));
    const actions = new SupabaseSmsInboundActionStore({ rpc } as never);

    await expect(actions.claimReceipt(RECEIPT)).rejects.toThrow('effect applied is invalid');
  });

  it('dispatches shared-number work to field intake without double-completing its atomic RPC', async () => {
    const db = admin();
    const actions = store({
      claimReceipt: vi.fn(async () => ({ status: 'claimed' as const, claim: SHARED_CLAIM })),
    });
    const fieldIntake = vi.fn(async () => ({
      handled: true,
      outcome: 'no_action' as const,
      intent: 'no_action',
    }));

    await expect(
      processSmsInboundActionReceipt(RECEIPT, db.client, actions, fieldIntake),
    ).resolves.toBe('completed');

    expect(fieldIntake).toHaveBeenCalledWith(SHARED_CLAIM, db.client);
    expect(actions.apply).not.toHaveBeenCalled();
    expect(actions.complete).not.toHaveBeenCalled();
    expect(actions.fail).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('resumes an already-applied shared claim through the legacy generic path', async () => {
    const db = admin();
    const actions = store({
      claimReceipt: vi.fn(async () => ({
        status: 'claimed' as const,
        claim: APPLIED_SHARED_CLAIM,
      })),
    });
    const fieldIntake = vi.fn();

    await expect(
      processSmsInboundActionReceipt(RECEIPT, db.client, actions, fieldIntake),
    ).resolves.toBe('completed');

    expect(fieldIntake).not.toHaveBeenCalled();
    expect(actions.apply).toHaveBeenCalledWith(APPLIED_SHARED_CLAIM);
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(actions.complete).toHaveBeenCalledWith(
      APPLIED_SHARED_CLAIM,
      CUSTOMER_EVENT,
      OWNER_EVENT,
    );
    expect(actions.fail).not.toHaveBeenCalled();
  });

  it('fails rather than counting an uncompleted shared field task as completed', async () => {
    const db = admin();
    const actions = store({
      claimBatch: vi.fn(async () => [SHARED_CLAIM]),
    });
    const fieldIntake = vi.fn(async () => ({
      handled: false,
      outcome: 'error' as const,
      errorMessage: 'GEMINI_API_KEY is not configured',
    }));

    await expect(runSmsInboundActionBatch(10, db.client, actions, fieldIntake)).resolves.toEqual({
      claimedCount: 1,
      completedCount: 0,
      failedCount: 1,
    });
    expect(actions.fail).toHaveBeenCalledWith(SHARED_CLAIM, 'inbound_action_internal');
    expect(actions.apply).not.toHaveBeenCalled();
    expect(actions.complete).not.toHaveBeenCalled();
  });

  it('counts a field no_action as completed only after its field RPC reports handled', async () => {
    const db = admin();
    const actions = store({
      claimBatch: vi.fn(async () => [SHARED_CLAIM]),
    });
    const fieldIntake = vi.fn(async () => ({
      handled: true,
      outcome: 'no_action' as const,
      intent: 'no_action',
    }));

    await expect(runSmsInboundActionBatch(5, db.client, actions, fieldIntake)).resolves.toEqual({
      claimedCount: 1,
      completedCount: 1,
      failedCount: 0,
    });
    expect(actions.fail).not.toHaveBeenCalled();
    expect(actions.complete).not.toHaveBeenCalled();
  });

  it('starts every claimed field task without serially consuming later leases', async () => {
    const secondClaim: SmsInboundActionClaim = Object.freeze({
      ...SHARED_CLAIM,
      taskId: '99999999-9999-4999-8999-999999999999',
      claimToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      providerEventId: 'provider-message-2',
    });
    const db = admin();
    const actions = store({
      claimBatch: vi.fn(async () => [SHARED_CLAIM, secondClaim]),
    });
    let started = 0;
    let releaseBoth!: () => void;
    const bothStarted = new Promise<void>((resolve) => { releaseBoth = resolve; });
    const fieldIntake = vi.fn(async () => {
      started += 1;
      if (started === 2) releaseBoth();
      await bothStarted;
      return { handled: true, outcome: 'completed' as const };
    });

    await expect(runSmsInboundActionBatch(5, db.client, actions, fieldIntake)).resolves.toEqual({
      claimedCount: 2,
      completedCount: 2,
      failedCount: 0,
    });
    expect(fieldIntake).toHaveBeenCalledTimes(2);
  });

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

  it('routes dedicated sender field task to field intake when texted by owner', async () => {
    const ownerClaim: SmsInboundActionClaim = Object.freeze({
      ...CLAIM,
      senderPurpose: 'contractor_dedicated',
      fromNumber: '+18103042061',
    });
    const fromMock = vi.fn((table: string) => {
      if (table !== 'accounts') throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { alert_phone: '+18103042061', high_value_sms_enabled: true },
              error: null,
            })),
          })),
        })),
      };
    });
    const db = { client: { rpc: vi.fn(), from: fromMock } as never };
    const actions = store({
      claimReceipt: vi.fn(async () => ({ status: 'claimed' as const, claim: ownerClaim })),
    });
    const fieldIntake = vi.fn(async () => ({
      handled: true,
      outcome: 'completed' as const,
      intent: 'append_internal_note',
    }));

    await expect(
      processSmsInboundActionReceipt(RECEIPT, db.client, actions, fieldIntake),
    ).resolves.toBe('completed');

    expect(fieldIntake).toHaveBeenCalledWith(ownerClaim, db.client);
    expect(actions.apply).not.toHaveBeenCalled();
    expect(actions.complete).not.toHaveBeenCalled();
  });

  it('routes dedicated sender customer reply to generic store.apply when sender is not owner', async () => {
    const customerClaim: SmsInboundActionClaim = Object.freeze({
      ...CLAIM,
      senderPurpose: 'contractor_dedicated',
      fromNumber: '+12485550111',
    });
    const fromMock = vi.fn((table: string) => {
      if (table !== 'accounts') throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { alert_phone: '+18103042061', high_value_sms_enabled: true },
              error: null,
            })),
          })),
        })),
      };
    });
    const db = admin();
    (db.client as unknown as Record<string, unknown>).from = fromMock;
    const actions = store({
      claimReceipt: vi.fn(async () => ({ status: 'claimed' as const, claim: customerClaim })),
    });
    const fieldIntake = vi.fn();

    await expect(
      processSmsInboundActionReceipt(RECEIPT, db.client, actions, fieldIntake),
    ).resolves.toBe('completed');

    expect(fieldIntake).not.toHaveBeenCalled();
    expect(actions.apply).toHaveBeenCalledWith(customerClaim);
    expect(actions.complete).toHaveBeenCalledWith(customerClaim, CUSTOMER_EVENT, OWNER_EVENT);
  });
});
