import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('Quick Stop worker tests inject database dependencies');
  },
}));

import {
  LegacyQuickStopPaymentContractError,
  LegacyQuickStopPaymentRpcError,
  SupabaseLegacyQuickStopPaymentStore,
  reconcileLegacyQuickStopPayment,
  type LegacyQuickStopLateRefundClaim,
  type LegacyQuickStopLateRefundFailure,
  type LegacyQuickStopPaymentStore,
} from '@/lib/billing/legacy-quick-stop-payment-store';
import {
  LegacyQuickStopLateRefundWorkerError,
  classifyLegacyQuickStopLateRefundFailure,
  runLegacyQuickStopLateRefundBatch,
  type LegacyQuickStopLateRefundExecutor,
} from '@/lib/billing/legacy-quick-stop-late-refund-worker';

const CLAIM: LegacyQuickStopLateRefundClaim = Object.freeze({
  claimToken: '10000000-0000-4000-8000-000000000001',
  taskId: '20000000-0000-4000-8000-000000000002',
  accountId: '30000000-0000-4000-8000-000000000003',
  requestId: '40000000-0000-4000-8000-000000000004',
  paymentId: '50000000-0000-4000-8000-000000000005',
  jobId: '60000000-0000-4000-8000-000000000006',
  stripePaymentIntent: 'pi_quick_stop_123',
  grossAmountCents: 25000,
  refundedAmountCents: 0,
  refundAmountCents: 25000,
  currency: 'usd',
  reverseTransfer: true,
  refundApplicationFee: true,
  stripeIdempotencyKey: 'quick_stop_late_refund_v1_50000000_0000_4000_8000_000000000005_0_25000',
  requestFingerprint: 'a'.repeat(64),
  reasonCode: 'late_payment_after_expiry',
  attemptNumber: 1,
  leaseExpiresAt: '2026-08-16T09:35:00.000Z',
});

function failure(status: LegacyQuickStopLateRefundFailure['status']): LegacyQuickStopLateRefundFailure {
  if (status === 'failed_retryable') {
    return Object.freeze({
      status,
      taskState: 'retry_wait',
      nextAttemptAt: '2026-08-16T09:40:00.000Z',
    });
  }
  if (status === 'already_finished') {
    return Object.freeze({ status, taskState: 'completed', nextAttemptAt: null });
  }
  return Object.freeze({ status, taskState: 'dead_letter', nextAttemptAt: null });
}

function harness(overrides: Partial<LegacyQuickStopPaymentStore> = {}) {
  const store: LegacyQuickStopPaymentStore = {
    reconcile: vi.fn(async () => ({
      status: 'refund_queued' as const,
      requestId: CLAIM.requestId,
      taskId: CLAIM.taskId,
      taskState: 'ready' as const,
    })),
    claimBatch: vi.fn()
      .mockResolvedValueOnce([CLAIM])
      .mockResolvedValueOnce([]),
    complete: vi.fn(async () => ({ status: 'completed' as const, taskState: 'completed' as const })),
    fail: vi.fn(async () => failure('failed_retryable')),
    ...overrides,
  };
  const executor: LegacyQuickStopLateRefundExecutor = {
    refund: vi.fn(async () => ({ stripeRefundId: 're_quick_stop_123' })),
  };
  return { store, executor };
}

describe('dark legacy Quick Stop late-refund worker', () => {
  it('submits exactly the immutable claim and completes with provider evidence', async () => {
    const test = harness();
    await expect(runLegacyQuickStopLateRefundBatch(test.executor, 1, test.store))
      .resolves.toEqual({
        claimedCount: 1,
        outcomes: [{ taskId: CLAIM.taskId, status: 'completed' }],
      });
    expect(test.executor.refund).toHaveBeenCalledTimes(1);
    expect(test.executor.refund).toHaveBeenCalledWith(CLAIM);
    expect(test.executor.refund).toHaveBeenCalledWith(expect.objectContaining({
      reverseTransfer: true,
      refundApplicationFee: true,
    }));
    expect(test.store.complete).toHaveBeenCalledWith({
      claim: CLAIM,
      stripeRefundId: 're_quick_stop_123',
    });
    expect(test.store.fail).not.toHaveBeenCalled();
  });

  it('uses a retryable fixed code for ambiguous provider results', async () => {
    const test = harness();
    test.executor.refund = vi.fn(async () => {
      throw new TypeError('network error with customer@example.com');
    });

    await expect(runLegacyQuickStopLateRefundBatch(test.executor, 1, test.store))
      .resolves.toMatchObject({ outcomes: [{ status: 'failed_retryable' }] });
    expect(test.store.fail).toHaveBeenCalledWith({
      claim: CLAIM,
      errorCode: 'provider_result_unknown',
      retryable: true,
    });
    expect(JSON.stringify(vi.mocked(test.store.fail).mock.calls)).not.toContain('customer@example.com');
  });

  it('retries local completion loss with the same persisted provider snapshot', async () => {
    const test = harness({
      complete: vi.fn(async () => {
        throw new LegacyQuickStopPaymentRpcError('PGRST000');
      }),
    });

    await expect(runLegacyQuickStopLateRefundBatch(test.executor, 1, test.store))
      .resolves.toMatchObject({ outcomes: [{ status: 'failed_retryable' }] });
    expect(test.executor.refund).toHaveBeenCalledWith(expect.objectContaining({
      stripeIdempotencyKey: CLAIM.stripeIdempotencyKey,
      requestFingerprint: CLAIM.requestFingerprint,
      refundAmountCents: CLAIM.refundAmountCents,
    }));
    expect(test.store.fail).toHaveBeenCalledWith({
      claim: CLAIM,
      errorCode: 'worker_transport_error',
      retryable: true,
    });
  });

  it('dead-letters fixed contract failures before another task is attempted', async () => {
    const test = harness({
      fail: vi.fn(async () => failure('failed_terminal')),
    });
    test.executor.refund = vi.fn(async () => {
      throw new LegacyQuickStopLateRefundWorkerError('provider_scope_invalid', false);
    });

    await expect(runLegacyQuickStopLateRefundBatch(test.executor, 1, test.store))
      .resolves.toMatchObject({ outcomes: [{ status: 'failed_terminal' }] });
    expect(test.store.fail).toHaveBeenCalledWith({
      claim: CLAIM,
      errorCode: 'provider_scope_invalid',
      retryable: false,
    });
  });

  it('treats malformed provider success as retryable under the same Stripe key', async () => {
    const test = harness();
    test.executor.refund = vi.fn(async () => ({ stripeRefundId: 'not-a-refund' }));
    await runLegacyQuickStopLateRefundBatch(test.executor, 1, test.store);
    expect(test.store.complete).not.toHaveBeenCalled();
    expect(test.store.fail).toHaveBeenCalledWith({
      claim: CLAIM,
      errorCode: 'provider_refund_id_invalid',
      retryable: true,
    });
  });

  it('claims sequentially and enforces the same fixed batch bound as SQL', async () => {
    const test = harness();
    await runLegacyQuickStopLateRefundBatch(test.executor, 1, test.store);
    expect(test.store.claimBatch).toHaveBeenCalledTimes(1);
    expect(test.store.claimBatch).toHaveBeenCalledWith(1);
    await expect(runLegacyQuickStopLateRefundBatch(test.executor, 11, test.store))
      .rejects.toThrow(/between 1 and 10/i);
  });

  it('classifies only fixed PII-free failure codes', () => {
    expect(classifyLegacyQuickStopLateRefundFailure(new LegacyQuickStopPaymentRpcError('40P01')))
      .toEqual({ code: 'worker_transport_error', retryable: true });
    expect(classifyLegacyQuickStopLateRefundFailure(new LegacyQuickStopPaymentRpcError('55000')))
      .toEqual({ code: 'worker_transport_error', retryable: true });
    expect(classifyLegacyQuickStopLateRefundFailure(new LegacyQuickStopPaymentRpcError('22000')))
      .toEqual({ code: 'worker_contract_error', retryable: false });
    expect(classifyLegacyQuickStopLateRefundFailure(new LegacyQuickStopPaymentContractError('secret@example.com')))
      .toEqual({ code: 'worker_contract_error', retryable: false });
    expect(classifyLegacyQuickStopLateRefundFailure(new Error('secret@example.com')))
      .toEqual({ code: 'worker_internal_error', retryable: true });
  });

  it('validates reconciliation and claim RPC result shapes', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'reconcile_legacy_quick_stop_payment') {
        return {
          error: null,
          data: [{
            reconcile_status: 'refund_queued',
            quick_stop_request_id: CLAIM.requestId,
            late_refund_task_id: CLAIM.taskId,
            late_refund_task_state: 'ready',
          }],
        };
      }
      if (name === 'claim_legacy_quick_stop_late_refund_tasks') {
        return {
          error: null,
          data: [{
            work_claim_token: CLAIM.claimToken,
            task_id: CLAIM.taskId,
            account_id: CLAIM.accountId,
            request_id: CLAIM.requestId,
            payment_id: CLAIM.paymentId,
            job_id: CLAIM.jobId,
            stripe_payment_intent: CLAIM.stripePaymentIntent,
            gross_amount_cents: String(CLAIM.grossAmountCents),
            refunded_amount_cents: String(CLAIM.refundedAmountCents),
            refund_amount_cents: String(CLAIM.refundAmountCents),
            currency: CLAIM.currency,
            reverse_transfer: true,
            refund_application_fee: true,
            stripe_idempotency_key: CLAIM.stripeIdempotencyKey,
            request_fingerprint: CLAIM.requestFingerprint,
            reason_code: CLAIM.reasonCode,
            attempt_number: CLAIM.attemptNumber,
            lease_expires_at: CLAIM.leaseExpiresAt,
          }],
        };
      }
      return { error: { code: '22000' }, data: null };
    });
    const store = new SupabaseLegacyQuickStopPaymentStore({ rpc } as never);

    await expect(reconcileLegacyQuickStopPayment(CLAIM.paymentId, store)).resolves.toEqual({
      status: 'refund_queued',
      requestId: CLAIM.requestId,
      taskId: CLAIM.taskId,
      taskState: 'ready',
    });
    await expect(store.claimBatch(1)).resolves.toEqual([CLAIM]);
    expect(rpc).toHaveBeenCalledWith('reconcile_legacy_quick_stop_payment', {
      p_payment_id: CLAIM.paymentId,
    });
    expect(rpc).toHaveBeenCalledWith('claim_legacy_quick_stop_late_refund_tasks', {
      p_batch_size: 1,
    });
  });

  it('rejects ambiguous RPC rows and never imports an active provider adapter', async () => {
    const rpc = vi.fn(async () => ({
      error: null,
      data: [
        { reconcile_status: 'not_quick_stop', quick_stop_request_id: null, late_refund_task_id: null, late_refund_task_state: null },
        { reconcile_status: 'not_quick_stop', quick_stop_request_id: null, late_refund_task_id: null, late_refund_task_state: null },
      ],
    }));
    const store = new SupabaseLegacyQuickStopPaymentStore({ rpc } as never);
    await expect(store.reconcile(CLAIM.paymentId)).rejects.toThrow(/reconcile_result_invalid/);

    const storeSource = readFileSync(join(
      process.cwd(), 'src', 'lib', 'billing', 'legacy-quick-stop-payment-store.ts',
    ), 'utf8');
    const workerSource = readFileSync(join(
      process.cwd(), 'src', 'lib', 'billing', 'legacy-quick-stop-late-refund-worker.ts',
    ), 'utf8');
    expect(storeSource.startsWith("import 'server-only';")).toBe(true);
    expect(workerSource.startsWith("import 'server-only';")).toBe(true);
    const imports = `${storeSource}\n${workerSource}`
      .split('\n')
      .filter((line) => line.startsWith('import '))
      .join('\n');
    for (const forbidden of [
      '@/lib/stripe', '@/lib/payments', '@/lib/sms', '@/lib/email',
      '@/lib/quick-stop-payments', 'stripe', 'resend',
    ]) {
      expect(imports).not.toContain(forbidden);
    }
  });
});
