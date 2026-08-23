import { describe, expect, it, vi } from 'vitest';

import {
  runSmsDeliveryBatch,
  SmsDeliveryRpcError,
  type SmsDeliveryClaim,
  type SmsDeliveryMessenger,
  type SmsDeliveryRuntime,
  type SmsDeliveryStage,
  type SmsDeliveryStore,
} from '@/lib/sms-delivery-worker';
import {
  SIMULATED_PROVIDER_ID,
  SmsBillingRefusalError,
  SmsProviderRejectedError,
  type SmsProviderId,
} from '@/lib/sms-provider';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CLAIM: SmsDeliveryClaim = Object.freeze({
  claimToken: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  accountId: ACCOUNT,
  phoneNumber: '+12485550140',
  body: 'Let’s Get Quoted: a durable test message',
  messageKind: 'owner-high-value-lead',
  billingCategory: 'owner_alert',
  senderPurpose: 'lgq_shared',
  attemptNumber: 1,
  leaseExpiresAt: '2026-08-21T18:00:00.000Z',
});

const READY: SmsDeliveryStage = Object.freeze({
  status: 'ready',
  senderNumberId: '44444444-4444-4444-8444-444444444444',
  senderE164: '+19479412323',
  providerNumberId: 'pn_test',
});

function runtime(overrides: Partial<SmsDeliveryRuntime> = {}): SmsDeliveryRuntime {
  return {
    suppression: () => null,
    provider: () => 'signalwire',
    canaryAccounts: () => new Set(),
    ...overrides,
  };
}

function store(overrides: Partial<SmsDeliveryStore> = {}) {
  let claimed = false;
  const calls: string[] = [];
  const value: SmsDeliveryStore = {
    claimBatch: vi.fn(async () => {
      calls.push('claim');
      if (claimed) return [];
      claimed = true;
      return [CLAIM];
    }),
    stage: vi.fn(async () => { calls.push('stage'); return READY; }),
    markRequestStarted: vi.fn(async () => { calls.push('start'); }),
    rollbackPreRequestBoundary: vi.fn(async () => { calls.push('rollback'); }),
    complete: vi.fn(async () => { calls.push('complete'); }),
    fail: vi.fn(async (_claim, _code, retryable) => {
      calls.push(`fail:${retryable}`);
      if (calls.includes('start')) return 'indeterminate';
      return retryable ? 'retryable' : 'terminal';
    }),
    recordProviderRejection: vi.fn(async (_claim, _code, retryable) => {
      calls.push(`provider-rejection:${retryable}`);
      return retryable ? 'retryable' : 'terminal';
    }),
    defer: vi.fn(async (_claim, code) => { calls.push(`defer:${code}`); }),
    ...overrides,
  };
  return { value, calls };
}

type AfterBoundarySend = (
  claim: SmsDeliveryClaim,
  provider: SmsProviderId,
  senderE164: string,
) => Promise<string>;

function messenger(send: AfterBoundarySend = async () => 'sw-message-1') {
  return {
    send: vi.fn(async (claim, provider, senderE164, beforeRequest) => {
      await beforeRequest({ kind: 'unmetered' });
      return send(claim, provider, senderE164);
    }),
  } satisfies SmsDeliveryMessenger;
}

function preflightFailure(error: Error) {
  return {
    send: vi.fn(async () => { throw error; }),
  } satisfies SmsDeliveryMessenger;
}

describe('durable SMS delivery worker', () => {
  it('does not claim when the deployment gate suppresses outbound SMS', async () => {
    const fake = store();
    const result = await runSmsDeliveryBatch(
      10,
      fake.value,
      messenger(),
      runtime({ suppression: () => 'switched-off' }),
    );
    expect(result).toMatchObject({ disabledReason: 'switched-off', claimedCount: 0 });
    expect(fake.value.claimBatch).not.toHaveBeenCalled();
  });

  it('stages, marks the no-return boundary, sends, then completes in order', async () => {
    const fake = store();
    const delivery = messenger(async (_claim, provider, sender) => {
      fake.calls.push(`send:${provider}:${sender}`);
      return 'sw-message-1';
    });
    const result = await runSmsDeliveryBatch(1, fake.value, delivery, runtime());
    expect(result).toMatchObject({ claimedCount: 1, completedCount: 1, failedCount: 0 });
    expect(fake.calls).toEqual([
      'claim', 'stage', 'start', 'send:signalwire:+19479412323', 'complete',
    ]);
    expect(fake.value.markRequestStarted).toHaveBeenCalledWith(CLAIM, { kind: 'unmetered' });
  });

  it('uses a distinct billing hold for a provider-safe retry attempt', async () => {
    const source = (await import('node:fs')).readFileSync(
      'src/lib/sms-delivery-worker.ts', 'utf8',
    );
    expect(source).toContain('messageKey: `sms:${claim.eventId}:attempt:${claim.attemptNumber}`');
  });

  it('defers a non-canary account before staging or egress', async () => {
    const fake = store();
    const delivery = messenger();
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      delivery,
      runtime({ canaryAccounts: () => new Set(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']) }),
    );
    expect(result.deferredCount).toBe(1);
    expect(fake.calls).toEqual(['claim', 'defer:sms_canary_account_not_enabled']);
    expect(delivery.send).not.toHaveBeenCalled();
  });

  it('defers a traffic purpose that has not passed its release gate', async () => {
    const fake = store();
    const delivery = messenger();
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      delivery,
      runtime({ purposeEnabled: () => false }),
    );
    expect(result.deferredCount).toBe(1);
    expect(fake.calls).toEqual(['claim', 'defer:sms_sender_purpose_not_enabled']);
    expect(delivery.send).not.toHaveBeenCalled();
  });

  it('defers a task whose individually assigned sender is not ready', async () => {
    const fake = store({
      stage: vi.fn(async () => ({
        status: 'blocked_sender' as const, senderNumberId: null,
        senderE164: null, providerNumberId: null,
      })),
    });
    const delivery = messenger();
    const result = await runSmsDeliveryBatch(1, fake.value, delivery, runtime());
    expect(result.deferredCount).toBe(1);
    expect(fake.calls).toContain('defer:sms_sender_not_ready');
    expect(delivery.send).not.toHaveBeenCalled();
  });

  it('accepts a send-time consent cancellation without provider egress', async () => {
    const fake = store({
      stage: vi.fn(async () => ({
        status: 'cancelled' as const, senderNumberId: null,
        senderE164: null, providerNumberId: null,
      })),
    });
    const delivery = messenger();
    const result = await runSmsDeliveryBatch(1, fake.value, delivery, runtime());
    expect(result.cancelledCount).toBe(1);
    expect(delivery.send).not.toHaveBeenCalled();
    expect(fake.value.markRequestStarted).not.toHaveBeenCalled();
  });

  it('may retry a transport failure that happened before request start', async () => {
    const fake = store({ stage: vi.fn(async () => { throw new TypeError('transport'); }) });
    const result = await runSmsDeliveryBatch(1, fake.value, messenger(), runtime());
    expect(result.failedCount).toBe(1);
    expect(fake.calls).toContain('fail:true');
  });

  it('keeps a request-start database failure on the pre-request retry path', async () => {
    const fake = store({
      markRequestStarted: vi.fn(async () => {
        throw new SmsDeliveryRpcError('08006');
      }),
    });
    const providerSend = vi.fn(async () => 'sw-message-1');
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      messenger(providerSend),
      runtime(),
    );
    expect(result).toMatchObject({ failedCount: 1, indeterminateCount: 0 });
    expect(providerSend).not.toHaveBeenCalled();
    expect(fake.value.rollbackPreRequestBoundary).toHaveBeenCalledWith(CLAIM);
    expect(fake.value.fail).toHaveBeenCalledWith(
      CLAIM,
      'sms_worker_transport_error',
      true,
    );
  });

  it.each([
    ['P5101', 'sms_consent_not_current', false],
    ['P5102', 'sms_sender_not_ready', true],
    ['P5103', 'sms_sender_opted_out', false],
    ['P5105', 'sms_payment_transition_superseded', false],
  ] as const)(
    'keeps final-boundary readiness failure %s before provider egress',
    async (rpcCode, errorCode, retryable) => {
      const fake = store({
        markRequestStarted: vi.fn(async () => { throw new SmsDeliveryRpcError(rpcCode); }),
      });
      const providerSend = vi.fn(async () => 'sw-message-1');
      await runSmsDeliveryBatch(1, fake.value, messenger(providerSend), runtime());
      expect(providerSend).not.toHaveBeenCalled();
      expect(fake.value.rollbackPreRequestBoundary).toHaveBeenCalledWith(CLAIM);
      expect(fake.value.fail).toHaveBeenCalledWith(CLAIM, errorCode, retryable);
    },
  );

  it('compensates a committed request marker whose response was lost before egress', async () => {
    let boundaryStarted = false;
    const fake = store({
      markRequestStarted: vi.fn(async () => {
        boundaryStarted = true;
        throw new SmsDeliveryRpcError('08006');
      }),
      rollbackPreRequestBoundary: vi.fn(async () => {
        boundaryStarted = false;
      }),
      fail: vi.fn(async (_claim, _code, retryable) => {
        return boundaryStarted ? 'indeterminate' : retryable ? 'retryable' : 'terminal';
      }),
    });
    const providerSend = vi.fn(async () => 'sw-message-1');

    const result = await runSmsDeliveryBatch(1, fake.value, messenger(providerSend), runtime());

    expect(result).toMatchObject({ failedCount: 1, indeterminateCount: 0 });
    expect(providerSend).not.toHaveBeenCalled();
    expect(fake.value.rollbackPreRequestBoundary).toHaveBeenCalledWith(CLAIM);
    expect(fake.value.fail).toHaveBeenCalledWith(CLAIM, 'sms_worker_transport_error', true);
  });

  it('pins a billing refusal as terminal before the request boundary', async () => {
    const fake = store();
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      preflightFailure(new SmsBillingRefusalError()),
      runtime(),
    );
    expect(result).toMatchObject({ failedCount: 1, indeterminateCount: 0 });
    expect(fake.value.markRequestStarted).not.toHaveBeenCalled();
    expect(fake.value.fail).toHaveBeenCalledWith(CLAIM, 'sms_billing_refused', false);
  });

  it('marks every error after request start indeterminate and never retryable', async () => {
    const fake = store();
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      messenger(async () => { throw new TypeError('connection reset'); }),
      runtime(),
    );
    expect(result.indeterminateCount).toBe(1);
    expect(fake.calls).toEqual(['claim', 'stage', 'start', 'fail:false']);
  });

  it('terminal-fails a definitive provider rejection after request start', async () => {
    const fake = store();
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      messenger(async () => {
        throw new SmsProviderRejectedError(400, 'carrier said no', false);
      }),
      runtime(),
    );
    expect(result).toMatchObject({ failedCount: 1, indeterminateCount: 0 });
    expect(fake.value.fail).not.toHaveBeenCalled();
    expect(fake.value.recordProviderRejection).toHaveBeenCalledWith(
      CLAIM,
      'sms_provider_rejected_400',
      false,
    );
    expect(fake.calls).toEqual([
      'claim', 'stage', 'start', 'provider-rejection:false',
    ]);
  });

  it('safely retries a definitive provider throttle after request start', async () => {
    const fake = store();
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      messenger(async () => {
        throw new SmsProviderRejectedError(429, 'slow down', true);
      }),
      runtime(),
    );
    expect(result).toMatchObject({ failedCount: 1, indeterminateCount: 0 });
    expect(fake.value.fail).not.toHaveBeenCalled();
    expect(fake.value.recordProviderRejection).toHaveBeenCalledWith(
      CLAIM,
      'sms_provider_rejected_429',
      true,
    );
  });

  it('terminal-fails a suppression sentinel that never crossed the request boundary', async () => {
    const fake = store();
    const result = await runSmsDeliveryBatch(
      1,
      fake.value,
      {
        send: vi.fn(async () => SIMULATED_PROVIDER_ID),
      },
      runtime(),
    );
    expect(result).toMatchObject({ failedCount: 1, indeterminateCount: 0 });
    expect(fake.value.complete).not.toHaveBeenCalled();
    expect(fake.value.markRequestStarted).not.toHaveBeenCalled();
    expect(fake.value.fail).toHaveBeenCalledWith(
      CLAIM,
      'sms_provider_suppressed_before_request',
      false,
    );
  });
});
