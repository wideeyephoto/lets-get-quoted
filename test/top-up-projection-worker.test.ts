import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('top-up worker tests inject database dependencies');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('top-up worker tests inject provider dependencies');
  },
}));

import {
  runTopUpProjectionCronBatch,
  summarizeTopUpProjectionBatch,
  stripeTopUpProjectionWorkerEnabled,
  STRIPE_TOP_UP_PROJECTION_BATCH_SIZE,
  STRIPE_TOP_UP_PROJECTION_WORKER_FLAG,
} from '@/lib/billing/billing-worker-cron';
import type { ProjectTopUpEventResult, TopUpProjectorClaim } from '@/lib/billing/top-up-event-projector';
import {
  processClaimedTopUpProjection,
  runTopUpProjectionBatch,
  type TopUpProjectionWorkerBatchResult,
  type TopUpProjectionWorkerDependencies,
  type TopUpProjectionWorkerItemResult,
} from '@/lib/billing/top-up-projection-worker';

const EVENT_ROW_ID = '10000000-0000-4000-8000-000000000001';
const CLAIM_TOKEN = '20000000-0000-4000-8000-000000000002';

function claim(overrides: Partial<TopUpProjectorClaim> = {}): TopUpProjectorClaim {
  return Object.freeze({
    status: 'claimed',
    billingEventId: EVENT_ROW_ID,
    claimToken: CLAIM_TOKEN,
    attemptCount: 1,
    providerEventId: 'evt_topupworker123',
    eventType: 'checkout.session.completed',
    checkoutSessionId: 'cs_test_topupworker',
    workspaceId: null,
    livemode: false,
    providerCreatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  }) as TopUpProjectorClaim;
}

function projected(projectionResult: string): ProjectTopUpEventResult {
  return {
    status: 'projected',
    billingEventId: EVENT_ROW_ID,
    projectionStatus: projectionResult === 'top_up_credits_granted' ? 'processed' : 'ignored',
    projectionResult,
    creditLotId: projectionResult === 'top_up_credits_granted'
      ? '60000000-0000-4000-8000-000000000006'
      : null,
    applied: projectionResult === 'top_up_credits_granted',
  } as ProjectTopUpEventResult;
}

function batch(results: TopUpProjectionWorkerItemResult[], over: Partial<TopUpProjectionWorkerBatchResult> = {}) {
  return {
    status: 'completed',
    requestedBatchSize: 10,
    selectedCount: results.length,
    claimedCount: results.length,
    results,
    errorCode: null,
    ...over,
  } as TopUpProjectionWorkerBatchResult;
}

describe('draining the top-up inbox one lease at a time', () => {
  it('stops as soon as the queue is empty', async () => {
    const claimNext = vi.fn()
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(null);
    const process = vi.fn().mockResolvedValue(projected('top_up_credits_granted'));
    const deps = { queue: { claimNext }, process } satisfies TopUpProjectionWorkerDependencies;

    const result = await runTopUpProjectionBatch(10, deps);

    expect(result.status).toBe('completed');
    expect(result.selectedCount).toBe(1);
    expect(claimNext).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('never takes a second lease while one is being processed', async () => {
    const order: string[] = [];
    const claimNext = vi.fn(async () => {
      order.push('claim');
      return order.filter((o) => o === 'claim').length <= 3 ? claim() : null;
    });
    const process = vi.fn(async () => {
      order.push('process');
      return projected('top_up_credits_granted');
    });

    await runTopUpProjectionBatch(10, { queue: { claimNext }, process });

    expect(order.slice(0, 6)).toEqual([
      'claim', 'process', 'claim', 'process', 'claim', 'process',
    ]);
  });

  it('honours the batch bound rather than draining the queue', async () => {
    const claimNext = vi.fn().mockResolvedValue(claim());
    const process = vi.fn().mockResolvedValue(projected('top_up_credits_granted'));

    const result = await runTopUpProjectionBatch(3, { queue: { claimNext }, process });

    expect(result.selectedCount).toBe(3);
    expect(process).toHaveBeenCalledTimes(3);
  });

  it.each([0, -1, 26, 1.5, Number.NaN])('refuses an out-of-range batch size (%s)', async (size) => {
    const deps = {
      queue: { claimNext: vi.fn() },
      process: vi.fn(),
    } satisfies TopUpProjectionWorkerDependencies;
    await expect(runTopUpProjectionBatch(size, deps)).rejects.toThrow(/batch size must be between/i);
    expect(deps.queue.claimNext).not.toHaveBeenCalled();
  });

  it('reports a claim failure without losing what it already did', async () => {
    const claimNext = vi.fn()
      .mockResolvedValueOnce(claim())
      .mockRejectedValueOnce(new Error('rpc exploded'));
    const process = vi.fn().mockResolvedValue(projected('top_up_credits_granted'));

    const result = await runTopUpProjectionBatch(10, { queue: { claimNext }, process });

    expect(result.status).toBe('claim_failed');
    expect(result.errorCode).toBe('projection_worker_claim_error');
    expect(result.results).toHaveLength(1);
  });

  it('keeps a thrown item error out of the result and carries on', async () => {
    const claimNext = vi.fn()
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(claim())
      .mockResolvedValueOnce(null);
    const process = vi.fn()
      .mockRejectedValueOnce(new Error('secret cs_test_leak and a workspace id'))
      .mockResolvedValueOnce(projected('top_up_credits_granted'));

    const result = await runTopUpProjectionBatch(10, { queue: { claimNext }, process });

    expect(result.results[0]).toEqual({
      status: 'worker_error',
      billingEventId: EVENT_ROW_ID,
      errorCode: 'projection_worker_execution_error',
    });
    expect(JSON.stringify(result)).not.toContain('cs_test_leak');
    expect(result.results).toHaveLength(2);
  });

  it('short-circuits a dead letter before any Stripe read', async () => {
    const resolver = { loadSession: vi.fn() };
    const projectionStore = { claim: vi.fn(), project: vi.fn(), fail: vi.fn() };

    const result = await processClaimedTopUpProjection(
      claim({ status: 'failed_terminal', claimToken: null, attemptCount: 8 }),
      { projectionStore, resolver, now: () => new Date() },
    );

    expect(result).toEqual({
      status: 'failed_terminal',
      billingEventId: EVENT_ROW_ID,
      errorCode: 'projection_retry_attempt_limit',
    });
    expect(resolver.loadSession).not.toHaveBeenCalled();
    expect(projectionStore.claim).not.toHaveBeenCalled();
  });

  it('refuses to process a claim it does not own', async () => {
    await expect(processClaimedTopUpProjection(
      claim({ status: 'claimed', claimToken: null }),
      { projectionStore: { claim: vi.fn(), project: vi.fn(), fail: vi.fn() }, resolver: { loadSession: vi.fn() }, now: () => new Date() },
    )).rejects.toThrow(/requires an owned claim/i);
  });
});

describe('what the cron heartbeat records', () => {
  it('counts a grant, a replay of the same purchase, and an await separately', () => {
    const summary = summarizeTopUpProjectionBatch(batch([
      projected('top_up_credits_granted'),
      projected('top_up_credits_already_granted'),
      projected('top_up_awaiting_async_payment'),
    ]));

    expect(summary.granted).toBe(1);
    expect(summary.already_granted).toBe(1);
    expect(summary.awaiting_async_payment).toBe(1);
    expect(summary.failures).toBe(0);
  });

  it('surfaces paid-but-ungranted work without calling it a failure', () => {
    // A withheld SKU and a deferred capacity SKU are money taken that nobody has
    // fulfilled. They must be visible, and they must not page anyone.
    const summary = summarizeTopUpProjectionBatch(batch([
      projected('top_up_fulfillment_withheld'),
      projected('top_up_capacity_fulfillment_deferred'),
    ]));

    expect(summary.not_granted).toBe(2);
    expect(summary.failures).toBe(0);
    expect(summary.granted).toBe(0);
  });

  it('does not count ordinary terminal outcomes as anything owed', () => {
    const summary = summarizeTopUpProjectionBatch(batch([
      projected('top_up_payment_failed'),
      projected('top_up_checkout_expired'),
      projected('top_up_not_a_purchase'),
    ]));

    expect(summary.not_granted).toBe(0);
    expect(summary.granted).toBe(0);
    expect(summary.failures).toBe(0);
  });

  it('adds up every kind of failure', () => {
    const summary = summarizeTopUpProjectionBatch(batch([
      { status: 'failed_retryable', billingEventId: EVENT_ROW_ID, errorCode: 'provider_object_retrieve_failed' },
      { status: 'failed_terminal', billingEventId: EVENT_ROW_ID, errorCode: 'provider_mode_mismatch' },
      { status: 'worker_error', billingEventId: EVENT_ROW_ID, errorCode: 'projection_worker_execution_error' },
    ] as TopUpProjectionWorkerItemResult[], { status: 'claim_failed', errorCode: 'projection_worker_claim_error' }));

    expect(summary.retryable_failures).toBe(1);
    expect(summary.terminal_failures).toBe(1);
    expect(summary.worker_errors).toBe(1);
    expect(summary.claim_errors).toBe(1);
    expect(summary.failures).toBe(4);
  });

  it('counts a selected-but-unclaimed row as dead-lettered', () => {
    const summary = summarizeTopUpProjectionBatch(batch(
      [{ status: 'failed_terminal', billingEventId: EVENT_ROW_ID, errorCode: 'projection_retry_attempt_limit' }] as TopUpProjectionWorkerItemResult[],
      { selectedCount: 1, claimedCount: 0 },
    ));

    expect(summary.dead_lettered_without_provider).toBe(1);
  });

  it('reduces a configuration failure to one count, with no identifiers', async () => {
    // No injected dependencies, and createAdminClient throws in this suite.
    const summary = await runTopUpProjectionCronBatch();

    expect(summary.worker_errors).toBe(1);
    expect(summary.failures).toBe(1);
    expect(summary.requested).toBe(STRIPE_TOP_UP_PROJECTION_BATCH_SIZE);
    expect(JSON.stringify(summary)).not.toMatch(/inject database dependencies/);
  });
});

describe('the worker gate', () => {
  it('is off unless the flag is exactly 1', () => {
    expect(stripeTopUpProjectionWorkerEnabled({ [STRIPE_TOP_UP_PROJECTION_WORKER_FLAG]: '1' })).toBe(true);
    for (const value of [undefined, '', '0', 'true', ' 1', '1 ']) {
      expect(
        stripeTopUpProjectionWorkerEnabled({ [STRIPE_TOP_UP_PROJECTION_WORKER_FLAG]: value }),
        `${String(value)} must be off`,
      ).toBe(false);
    }
  });

  it('is bounded by a constant no request can change', () => {
    expect(STRIPE_TOP_UP_PROJECTION_BATCH_SIZE).toBe(10);
  });
});
