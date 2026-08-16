import 'server-only';

import {
  LegacyQuickStopPaymentContractError,
  LegacyQuickStopPaymentRpcError,
  SupabaseLegacyQuickStopPaymentStore,
  type LegacyQuickStopLateRefundClaim,
  type LegacyQuickStopLateRefundFailure,
  type LegacyQuickStopPaymentStore,
} from '@/lib/billing/legacy-quick-stop-payment-store';

/**
 * DARK orchestration for the durable legacy Quick Stop late-refund queue.
 *
 * There is intentionally no default executor and no Stripe import. A future
 * activation slice must inject an adapter that submits exactly the immutable
 * PaymentIntent, cents, currency, destination reversal flags, fingerprint, and
 * idempotency key in `claim`. This file cannot perform provider egress on its
 * own.
 */

const REFUND_PATTERN = /^re_[A-Za-z0-9_]+$/;
const MAX_BATCH_SIZE = 10;

export interface LegacyQuickStopLateRefundExecutor {
  refund(claim: LegacyQuickStopLateRefundClaim): Promise<Readonly<{ stripeRefundId: string }>>;
}

export class LegacyQuickStopLateRefundWorkerError extends Error {
  override readonly name = 'LegacyQuickStopLateRefundWorkerError';

  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

export type LegacyQuickStopLateRefundWorkOutcome = Readonly<{
  taskId: string;
  status:
    | 'completed'
    | 'already_completed'
    | 'failed_retryable'
    | 'failed_terminal'
    | 'already_finished';
}>;

export type RunLegacyQuickStopLateRefundBatchResult = Readonly<{
  claimedCount: number;
  outcomes: readonly LegacyQuickStopLateRefundWorkOutcome[];
}>;

function boundedBatchSize(batchSize: number): number {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`Quick Stop late-refund batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return batchSize;
}

export function classifyLegacyQuickStopLateRefundFailure(
  error: unknown,
): Readonly<{ code: string; retryable: boolean }> {
  if (error instanceof LegacyQuickStopLateRefundWorkerError) {
    return Object.freeze({ code: error.code, retryable: error.retryable });
  }
  if (error instanceof LegacyQuickStopPaymentContractError) {
    return Object.freeze({ code: 'worker_contract_error', retryable: false });
  }
  if (error instanceof LegacyQuickStopPaymentRpcError) {
    const code = error.rpcCode;
    // 55000 is also the completion RPC's deliberate "Stripe succeeded but the
    // signed refund projection has not arrived yet" state. Retrying with the
    // persisted key is mandatory; treating normal webhook lag as terminal would
    // strand a refunded customer behind a dead-letter task.
    if (
      code === null
      || code.startsWith('08')
      || ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '40001', '40P01', '55000', '55P03', '57014']
        .includes(code)
    ) {
      return Object.freeze({ code: 'worker_transport_error', retryable: true });
    }
    if (['22000', '22023', '23505', '23514', '42501'].includes(code)) {
      return Object.freeze({ code: 'worker_contract_error', retryable: false });
    }
    return Object.freeze({ code: 'worker_database_error', retryable: true });
  }
  if (
    error instanceof TypeError
    || (typeof DOMException !== 'undefined'
      && error instanceof DOMException
      && error.name === 'AbortError')
  ) {
    // Stripe refunds are retry-safe only because the exact immutable key and
    // request snapshot are persisted before this worker can receive a claim.
    return Object.freeze({ code: 'provider_result_unknown', retryable: true });
  }
  return Object.freeze({ code: 'worker_internal_error', retryable: true });
}

function outcomeFromFailure(
  claim: LegacyQuickStopLateRefundClaim,
  failure: LegacyQuickStopLateRefundFailure,
): LegacyQuickStopLateRefundWorkOutcome {
  return Object.freeze({
    taskId: claim.taskId,
    status: failure.status,
  });
}

async function failClaim(
  store: LegacyQuickStopPaymentStore,
  claim: LegacyQuickStopLateRefundClaim,
  error: unknown,
): Promise<LegacyQuickStopLateRefundWorkOutcome> {
  const classified = classifyLegacyQuickStopLateRefundFailure(error);
  return outcomeFromFailure(claim, await store.fail({
    claim,
    errorCode: classified.code,
    retryable: classified.retryable,
  }));
}

/**
 * Claims and processes a bounded batch sequentially. Sequential execution keeps
 * the future provider boundary obvious and ensures each failure is durably
 * classified before another refund can begin.
 */
export async function runLegacyQuickStopLateRefundBatch(
  executor: LegacyQuickStopLateRefundExecutor,
  batchSize = 10,
  store: LegacyQuickStopPaymentStore = new SupabaseLegacyQuickStopPaymentStore(),
): Promise<RunLegacyQuickStopLateRefundBatchResult> {
  const bounded = boundedBatchSize(batchSize);
  const outcomes: LegacyQuickStopLateRefundWorkOutcome[] = [];
  let claimedCount = 0;

  for (let index = 0; index < bounded; index += 1) {
    const claims = await store.claimBatch(1);
    if (claims.length > 1) {
      throw new LegacyQuickStopLateRefundWorkerError('claim_batch_bound_exceeded', false);
    }
    const claim = claims[0];
    if (!claim) break;
    claimedCount += 1;

    let result: Readonly<{ stripeRefundId: string }>;
    try {
      result = await executor.refund(claim);
      if (
        !result
        || typeof result.stripeRefundId !== 'string'
        || !REFUND_PATTERN.test(result.stripeRefundId)
      ) {
        throw new LegacyQuickStopLateRefundWorkerError('provider_refund_id_invalid', true);
      }
    } catch (error) {
      outcomes.push(await failClaim(store, claim, error));
      continue;
    }

    try {
      const completion = await store.complete({
        claim,
        stripeRefundId: result.stripeRefundId,
      });
      outcomes.push(Object.freeze({
        taskId: claim.taskId,
        status: completion.status,
      }));
    } catch (error) {
      // Provider success plus a lost local completion is retried with the same
      // immutable Stripe key. No future adapter may generate a replacement key.
      outcomes.push(await failClaim(store, claim, error));
    }
  }

  return Object.freeze({ claimedCount, outcomes: Object.freeze(outcomes) });
}
