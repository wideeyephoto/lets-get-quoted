import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('connected payment worker tests inject database dependencies');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('connected payment worker tests inject provider dependencies');
  },
}));

import {
  processClaimedConnectedPaymentProjection,
  runConnectedPaymentProjectionBatch,
  SupabaseConnectedPaymentProjectionWorkerQueue,
  type ConnectedPaymentProjectionWorkerDependencies,
} from '@/lib/billing/connected-payment-projection-worker';
import type {
  ConnectedPaymentProjectionResolver,
  ConnectedPaymentProjectionStore,
  ConnectedPaymentProjectorClaim,
  ConnectedPaymentLateSuccessHandler,
} from '@/lib/billing/connected-payment-event-projector';

const EVENT_ONE = '10000000-0000-4000-8000-000000000001';
const EVENT_TWO = '20000000-0000-4000-8000-000000000002';
const TOKEN_ONE = '30000000-0000-4000-8000-000000000003';
const TOKEN_TWO = '40000000-0000-4000-8000-000000000004';
const WORKSPACE_ID = '50000000-0000-4000-8000-000000000005';
const PAYMENT_ID = '60000000-0000-4000-8000-000000000006';
const MERCHANT_ID = 'acct_merchant123';
const PROVIDER_EVENT_ID = 'evt_connected123';
const SESSION_ID = 'cs_test_connected123';

function claim(
  billingEventId = EVENT_ONE,
  claimToken = TOKEN_ONE,
  attemptCount = 1,
): ConnectedPaymentProjectorClaim {
  return Object.freeze({
    status: 'claimed',
    billingEventId,
    claimToken,
    attemptCount,
    providerEventId: PROVIDER_EVENT_ID,
    eventType: 'checkout.session.completed',
    checkoutSessionId: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    merchantAccountId: MERCHANT_ID,
    livemode: false,
    providerCreatedAt: '2026-08-16T01:00:00.000Z',
  });
}

function terminalClaim(): ConnectedPaymentProjectorClaim {
  return Object.freeze({
    ...claim(EVENT_ONE, TOKEN_ONE, 8),
    status: 'failed_terminal',
    claimToken: null,
  });
}

function lateSuccessHandler(): ConnectedPaymentLateSuccessHandler {
  return {
    reconcile: vi.fn(),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

describe('dark connected-payment projection worker', () => {
  it('claims and completes a bounded batch strictly one event at a time', async () => {
    const first = claim();
    const second = claim(EVENT_TWO, TOKEN_TWO);
    const order: string[] = [];
    const queue = {
      claimNext: vi.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
    };
    const process = vi.fn(async (owned: ConnectedPaymentProjectorClaim) => {
      order.push(`start:${owned.billingEventId}`);
      await Promise.resolve();
      order.push(`end:${owned.billingEventId}`);
      return { status: 'replay_processed' as const, billingEventId: owned.billingEventId };
    });
    const dependencies: ConnectedPaymentProjectionWorkerDependencies = { queue, process };

    await expect(runConnectedPaymentProjectionBatch(2, dependencies)).resolves.toMatchObject({
      status: 'completed',
      requestedBatchSize: 2,
      selectedCount: 2,
      claimedCount: 2,
      errorCode: null,
    });
    expect(order).toEqual([
      `start:${EVENT_ONE}`,
      `end:${EVENT_ONE}`,
      `start:${EVENT_TWO}`,
      `end:${EVENT_TWO}`,
    ]);
    expect(queue.claimNext).toHaveBeenCalledTimes(2);
  });

  it('stops on an empty queue and enforces the hard batch bound', async () => {
    const dependencies: ConnectedPaymentProjectionWorkerDependencies = {
      queue: { claimNext: vi.fn().mockResolvedValue(null) },
      process: vi.fn(),
    };
    await expect(runConnectedPaymentProjectionBatch(25, dependencies)).resolves.toMatchObject({
      status: 'completed',
      selectedCount: 0,
      claimedCount: 0,
      results: [],
    });
    await expect(runConnectedPaymentProjectionBatch(0, dependencies)).rejects.toThrow(
      'between 1 and 25',
    );
    await expect(runConnectedPaymentProjectionBatch(26, dependencies)).rejects.toThrow(
      'between 1 and 25',
    );
  });

  it('uses fixed worker codes, drops exception text, and continues after an item failure', async () => {
    const first = claim();
    const second = claim(EVENT_TWO, TOKEN_TWO);
    const secret = 'customer@example.com / pi_secret / ch_secret';
    const queue = {
      claimNext: vi.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
    };
    const process = vi.fn()
      .mockRejectedValueOnce(new Error(secret))
      .mockResolvedValueOnce({ status: 'replay_processed', billingEventId: EVENT_TWO });

    const result = await runConnectedPaymentProjectionBatch(2, { queue, process });
    expect(result).toMatchObject({
      status: 'completed',
      selectedCount: 2,
      claimedCount: 2,
      results: [
        {
          status: 'worker_error',
          billingEventId: EVENT_ONE,
          errorCode: 'projection_worker_execution_error',
        },
        { status: 'replay_processed', billingEventId: EVENT_TWO },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('stops a selector failure with one fixed PII-free batch code', async () => {
    const secret = 'cus_private customer@example.com';
    const dependencies: ConnectedPaymentProjectionWorkerDependencies = {
      queue: { claimNext: vi.fn().mockRejectedValue(new Error(secret)) },
      process: vi.fn(),
    };
    const result = await runConnectedPaymentProjectionBatch(3, dependencies);
    expect(result).toEqual({
      status: 'claim_failed',
      requestedBatchSize: 3,
      selectedCount: 0,
      claimedCount: 0,
      results: [],
      errorCode: 'projection_worker_claim_error',
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('reports a database-dead-lettered eighth lease without provider or projection calls', async () => {
    const projectionStore = {
      claim: vi.fn(),
      plan: vi.fn(),
      resolveBinding: vi.fn(),
      project: vi.fn(),
      fail: vi.fn(),
    } satisfies ConnectedPaymentProjectionStore;
    const resolver = {
      loadProviderEvidence: vi.fn(),
      buildProjection: vi.fn(),
    } satisfies ConnectedPaymentProjectionResolver;

    await expect(processClaimedConnectedPaymentProjection(terminalClaim(), {
      projectionStore,
      resolver,
      lateSuccess: lateSuccessHandler(),
      now: () => new Date('2026-08-16T02:00:00.000Z'),
    })).resolves.toEqual({
      status: 'failed_terminal',
      billingEventId: EVENT_ONE,
      errorCode: 'projection_retry_attempt_limit',
    });
    expect(projectionStore.claim).not.toHaveBeenCalled();
    expect(projectionStore.resolveBinding).not.toHaveBeenCalled();
    expect(projectionStore.project).not.toHaveBeenCalled();
    expect(projectionStore.fail).not.toHaveBeenCalled();
    expect(resolver.loadProviderEvidence).not.toHaveBeenCalled();
    expect(resolver.buildProjection).not.toHaveBeenCalled();
  });

  it('hands one owned lease through the committed projector without a second claim', async () => {
    const owned = claim(EVENT_ONE, TOKEN_ONE, 8);
    const evidence = { workspaceId: WORKSPACE_ID } as never;
    const binding = { workspaceId: WORKSPACE_ID } as never;
    const projection = { schema: 'stripe_connected_payment_projection_v1' } as never;
    const resolveBinding = vi.fn().mockResolvedValue(binding);
    const project = vi.fn().mockResolvedValue({
      status: 'processed',
      paymentId: PAYMENT_ID,
      workspaceId: WORKSPACE_ID,
      applied: true,
      reconciliationStatus: 'reconciled',
    });
    const projectionStore = {
      claim: vi.fn(),
      plan: vi.fn().mockResolvedValue({ projectionKind: 'current' }),
      resolveBinding,
      project,
      fail: vi.fn(),
    } satisfies ConnectedPaymentProjectionStore;
    const resolver = {
      loadProviderEvidence: vi.fn().mockResolvedValue(evidence),
      buildProjection: vi.fn().mockReturnValue(projection),
    } satisfies ConnectedPaymentProjectionResolver;

    await expect(processClaimedConnectedPaymentProjection(owned, {
      projectionStore,
      resolver,
      lateSuccess: lateSuccessHandler(),
      now: () => new Date('2026-08-16T02:00:00.000Z'),
    })).resolves.toMatchObject({
      status: 'processed',
      billingEventId: EVENT_ONE,
      paymentId: PAYMENT_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(resolver.loadProviderEvidence).toHaveBeenCalledWith(owned);
    expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({
      billingEventId: EVENT_ONE,
      claimToken: TOKEN_ONE,
      evidence,
    }));
    expect(project).toHaveBeenCalledWith(expect.objectContaining({
      billingEventId: EVENT_ONE,
      claimToken: TOKEN_ONE,
      projection,
    }));
    expect(projectionStore.claim).not.toHaveBeenCalled();
    expect(projectionStore.fail).not.toHaveBeenCalled();
  });

  it('parses only exact owned or terminal rows from the service-only selector RPC', async () => {
    const row = {
      claim_status: 'claimed',
      billing_event_id: EVENT_ONE,
      claim_token: TOKEN_ONE,
      attempt_count: 1,
      provider_event_id: PROVIDER_EVENT_ID,
      event_type: 'checkout.session.completed',
      checkout_session_id: SESSION_ID,
      workspace_id: WORKSPACE_ID,
      merchant_account_id: MERCHANT_ID,
      livemode: false,
      provider_created_at: '2026-08-16T01:00:00.000Z',
    };
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const queue = new SupabaseConnectedPaymentProjectionWorkerQueue({ rpc } as never);
    await expect(queue.claimNext()).resolves.toEqual(claim());
    expect(rpc).toHaveBeenCalledWith('claim_next_due_stripe_connected_payment_event');

    rpc.mockResolvedValueOnce({
      data: [{ ...row, claim_status: 'claimed', attempt_count: 9 }],
      error: null,
    });
    await expect(queue.claimNext()).rejects.toThrow('ownership is invalid');

    rpc.mockResolvedValueOnce({
      data: [{ ...row, event_type: 'checkout.session.expired' }],
      error: null,
    });
    await expect(queue.claimNext()).rejects.toThrow('outside the success projector');
  });
});
