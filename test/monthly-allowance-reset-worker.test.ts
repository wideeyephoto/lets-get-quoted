import { describe, expect, it, vi } from 'vitest';
import {
  classifyAllowanceResetWorkerFailure,
  runPaidPlanMonthlyAllowanceResetBatch,
  SupabasePaidPlanMonthlyAllowanceResetWorkerStore,
  type AllowanceResetWorkClaim,
  type AllowanceResetWorkOutcome,
  type PaidPlanMonthlyAllowanceResetWorkerStore,
} from '@/lib/billing/monthly-allowance-reset-worker';

const CLAIM_ONE: AllowanceResetWorkClaim = Object.freeze({
  claimToken: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  dueAt: '2026-09-15T00:00:00.000Z',
  attemptNumber: 1,
  leaseExpiresAt: '2026-09-15T00:05:00.000Z',
});
const CLAIM_TWO: AllowanceResetWorkClaim = Object.freeze({
  claimToken: '33333333-3333-4333-8333-333333333333',
  workspaceId: '44444444-4444-4444-8444-444444444444',
  dueAt: '2026-09-15T00:00:00.000Z',
  attemptNumber: 1,
  leaseExpiresAt: '2026-09-15T00:05:00.000Z',
});

function completed(claim: AllowanceResetWorkClaim): AllowanceResetWorkOutcome {
  return Object.freeze({
    status: 'completed',
    workerState: 'ready',
    attemptId: claim.claimToken,
    workspaceId: claim.workspaceId,
    resetOperationId: '55555555-5555-4555-8555-555555555555',
    billingSubscriptionId: '66666666-6666-4666-8666-666666666666',
    allowanceWindowStart: claim.dueAt,
    allowanceWindowEnd: '2026-10-15T00:00:00.000Z',
    insertedLotCount: 4,
    verifiedLotCount: 4,
    nextAllowanceResetAt: '2026-10-15T00:00:00.000Z',
    reason: null,
    retryable: false,
    deadLettered: false,
    nextAttemptAt: null,
  });
}

describe('dark paid-plan monthly allowance reset worker', () => {
  it('processes a bounded claim batch strictly one workspace at a time', async () => {
    const order: string[] = [];
    const claimBatch = vi.fn()
      .mockResolvedValueOnce([CLAIM_ONE])
      .mockResolvedValueOnce([CLAIM_TWO]);
    const execute = vi.fn(async (claim: AllowanceResetWorkClaim) => {
      order.push(`start:${claim.workspaceId}`);
      await Promise.resolve();
      order.push(`end:${claim.workspaceId}`);
      return completed(claim);
    });
    const fail = vi.fn();
    const store: PaidPlanMonthlyAllowanceResetWorkerStore = { claimBatch, execute, fail };

    await expect(runPaidPlanMonthlyAllowanceResetBatch(2, store)).resolves.toMatchObject({
      claimedCount: 2,
      outcomes: [{ status: 'completed' }, { status: 'completed' }],
    });
    expect(order).toEqual([
      `start:${CLAIM_ONE.workspaceId}`,
      `end:${CLAIM_ONE.workspaceId}`,
      `start:${CLAIM_TWO.workspaceId}`,
      `end:${CLAIM_TWO.workspaceId}`,
    ]);
    expect(claimBatch).toHaveBeenCalledTimes(2);
    expect(claimBatch).toHaveBeenNthCalledWith(1, 1);
    expect(claimBatch).toHaveBeenNthCalledWith(2, 1);
    expect(fail).not.toHaveBeenCalled();
  });

  it('records a fixed retryable transport code and continues the batch', async () => {
    const claimBatch = vi.fn()
      .mockResolvedValueOnce([CLAIM_ONE])
      .mockResolvedValueOnce([CLAIM_TWO]);
    const execute = vi.fn(async (claim: AllowanceResetWorkClaim) => {
      if (claim === CLAIM_ONE) throw new TypeError('untrusted network detail');
      return completed(claim);
    });
    const fail = vi.fn(async (claim: AllowanceResetWorkClaim, errorCode: string) => ({
      status: 'failed_retryable' as const,
      recordedOutcomeStatus: 'failed_retryable' as const,
      workerState: 'retry_wait' as const,
      attemptId: claim.claimToken,
      workspaceId: claim.workspaceId,
      retryable: true,
      deadLettered: false,
      nextAttemptAt: '2026-09-15T00:05:00.000Z',
      errorCode,
    }));
    const store: PaidPlanMonthlyAllowanceResetWorkerStore = { claimBatch, execute, fail };

    const result = await runPaidPlanMonthlyAllowanceResetBatch(2, store);
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual([
      'failed_retryable', 'completed',
    ]);
    expect(fail).toHaveBeenCalledWith(CLAIM_ONE, 'worker_transport_error');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('fails closed on unknown errors', () => {
    expect(classifyAllowanceResetWorkerFailure(new Error('unknown')))
      .toBe('worker_internal_error');
    expect(classifyAllowanceResetWorkerFailure(new TypeError('fetch failed')))
      .toBe('worker_transport_error');
  });

  it('retries the empty-code transport shape returned by postgrest-js', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '' } }));
    const store = new SupabasePaidPlanMonthlyAllowanceResetWorkerStore({ rpc } as never);
    const error = await store.claimBatch(1).catch((caught: unknown) => caught);

    expect(classifyAllowanceResetWorkerFailure(error)).toBe('worker_transport_error');
    expect(rpc).toHaveBeenCalledWith(
      'claim_due_paid_plan_allowance_reset_work',
      { p_batch_size: 1 },
    );
  });

  it('rejects invalid or store-violating batch bounds before execution', async () => {
    const store: PaidPlanMonthlyAllowanceResetWorkerStore = {
      claimBatch: vi.fn(async () => [CLAIM_ONE, CLAIM_TWO]),
      execute: vi.fn(async (claim) => completed(claim)),
      fail: vi.fn(),
    };
    await expect(runPaidPlanMonthlyAllowanceResetBatch(0, store))
      .rejects.toThrow(/between 1 and 25/i);
    expect(store.claimBatch).not.toHaveBeenCalled();

    await expect(runPaidPlanMonthlyAllowanceResetBatch(1, store))
      .rejects.toThrow(/exceeded its batch bound/i);
    expect(store.execute).not.toHaveBeenCalled();
  });
});
