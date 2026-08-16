import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';

/**
 * DARK service-role adapter for the legacy destination-charge Quick Stop
 * reconciliation RPCs. No active route imports this file.
 *
 * The database owns payment/request locking, exact refund snapshots, leases,
 * retries, and terminal outcomes. This adapter only validates the RPC contract;
 * it does not construct a Stripe client or contact any provider.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9_]+$/;
const REFUND_PATTERN = /^re_[A-Za-z0-9_]+$/;
const IDEMPOTENCY_PATTERN = /^quick_stop_late_refund_v1_[0-9a-f_]+$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{2,99}$/;
const MAX_BATCH_SIZE = 10;

export type LegacyQuickStopReconcileStatus =
  | 'not_quick_stop'
  | 'confirmed'
  | 'already_confirmed'
  | 'refund_queued'
  | 'refund_already_queued'
  | 'refund_reconciled'
  | 'already_refunded'
  | 'not_actionable';

export type LegacyQuickStopTaskState =
  | 'ready'
  | 'leased'
  | 'retry_wait'
  | 'completed'
  | 'dead_letter';

export type LegacyQuickStopReconcileResult = Readonly<{
  status: LegacyQuickStopReconcileStatus;
  requestId: string | null;
  taskId: string | null;
  taskState: LegacyQuickStopTaskState | null;
}>;

export type LegacyQuickStopLateRefundClaim = Readonly<{
  claimToken: string;
  taskId: string;
  accountId: string;
  requestId: string;
  paymentId: string;
  jobId: string;
  stripePaymentIntent: string;
  grossAmountCents: number;
  refundedAmountCents: number;
  refundAmountCents: number;
  currency: 'usd';
  reverseTransfer: true;
  refundApplicationFee: true;
  stripeIdempotencyKey: string;
  requestFingerprint: string;
  reasonCode: 'late_payment_after_expiry';
  attemptNumber: number;
  leaseExpiresAt: string;
}>;

export type LegacyQuickStopLateRefundCompletion = Readonly<{
  status: 'completed' | 'already_completed' | 'already_finished';
  taskState: 'completed' | 'dead_letter';
}>;

export type LegacyQuickStopLateRefundFailure = Readonly<{
  status: 'failed_retryable' | 'failed_terminal' | 'already_finished';
  taskState: 'retry_wait' | 'dead_letter' | 'completed';
  nextAttemptAt: string | null;
}>;

export interface LegacyQuickStopPaymentStore {
  reconcile(paymentId: string): Promise<LegacyQuickStopReconcileResult>;
  claimBatch(batchSize: number): Promise<readonly LegacyQuickStopLateRefundClaim[]>;
  complete(input: {
    claim: LegacyQuickStopLateRefundClaim;
    stripeRefundId: string;
  }): Promise<LegacyQuickStopLateRefundCompletion>;
  fail(input: {
    claim: LegacyQuickStopLateRefundClaim;
    errorCode: string;
    retryable: boolean;
  }): Promise<LegacyQuickStopLateRefundFailure>;
}

type RpcError = Readonly<{ code?: string; message?: string }>;

export class LegacyQuickStopPaymentRpcError extends Error {
  override readonly name = 'LegacyQuickStopPaymentRpcError';

  constructor(readonly rpcCode: string | null) {
    super('Legacy Quick Stop payment database operation failed.');
  }
}

export class LegacyQuickStopPaymentContractError extends Error {
  override readonly name = 'LegacyQuickStopPaymentContractError';

  constructor(readonly code: string) {
    super(code);
  }
}

function rpcFailure(error: RpcError | null): LegacyQuickStopPaymentRpcError {
  return new LegacyQuickStopPaymentRpcError(error?.code?.trim() || null);
}

function asSingleRow(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value) && value.length !== 1) {
    throw new LegacyQuickStopPaymentContractError(`${label}_invalid`);
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new LegacyQuickStopPaymentContractError(`${label}_invalid`);
  }
  return candidate as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    throw new LegacyQuickStopPaymentContractError(`${label}_invalid`);
  }
  return value;
}

function requiredUuid(value: unknown, label: string): string {
  return requiredString(value, label, UUID_PATTERN).toLowerCase();
}

function nullableUuid(value: unknown, label: string): string | null {
  return value == null ? null : requiredUuid(value, label);
}

function requiredInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (
    typeof parsed !== 'number'
    || !Number.isSafeInteger(parsed)
    || parsed < minimum
    || parsed > maximum
  ) {
    throw new LegacyQuickStopPaymentContractError(`${label}_invalid`);
  }
  return parsed;
}

function requiredTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) {
    throw new LegacyQuickStopPaymentContractError(`${label}_invalid`);
  }
  return new Date(milliseconds).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value == null ? null : requiredTimestamp(value, label);
}

function boundedBatchSize(batchSize: number): number {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`Quick Stop late-refund batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return batchSize;
}

function taskState(value: unknown, nullable = false): LegacyQuickStopTaskState | null {
  if (nullable && value == null) return null;
  const parsed = requiredString(value, 'task_state');
  if (!['ready', 'leased', 'retry_wait', 'completed', 'dead_letter'].includes(parsed)) {
    throw new LegacyQuickStopPaymentContractError('task_state_invalid');
  }
  return parsed as LegacyQuickStopTaskState;
}

function parseReconcile(value: unknown): LegacyQuickStopReconcileResult {
  const row = asSingleRow(value, 'reconcile_result');
  const status = requiredString(row.reconcile_status, 'reconcile_status');
  if (![
    'not_quick_stop', 'confirmed', 'already_confirmed', 'refund_queued',
    'refund_already_queued', 'refund_reconciled', 'already_refunded',
    'not_actionable',
  ].includes(status)) {
    throw new LegacyQuickStopPaymentContractError('reconcile_status_invalid');
  }
  const requestId = nullableUuid(row.quick_stop_request_id, 'request_id');
  const taskId = nullableUuid(row.late_refund_task_id, 'task_id');
  const parsedTaskState = taskState(row.late_refund_task_state, true);

  if (status === 'not_quick_stop' && (requestId || taskId || parsedTaskState)) {
    throw new LegacyQuickStopPaymentContractError('reconcile_scope_invalid');
  }
  if (status !== 'not_quick_stop' && !requestId) {
    throw new LegacyQuickStopPaymentContractError('reconcile_request_invalid');
  }
  if (
    (status === 'refund_queued' || status === 'refund_already_queued')
    && (!taskId || !parsedTaskState)
  ) {
    throw new LegacyQuickStopPaymentContractError('reconcile_task_invalid');
  }
  if (
    !['refund_queued', 'refund_already_queued'].includes(status)
    && taskId !== null
  ) {
    throw new LegacyQuickStopPaymentContractError('reconcile_unexpected_task');
  }

  return Object.freeze({
    status: status as LegacyQuickStopReconcileStatus,
    requestId,
    taskId,
    taskState: parsedTaskState,
  });
}

function parseClaims(value: unknown, batchSize: number): readonly LegacyQuickStopLateRefundClaim[] {
  if (!Array.isArray(value) || value.length > batchSize) {
    throw new LegacyQuickStopPaymentContractError('claim_batch_invalid');
  }
  const claims = value.map((candidate) => {
    const row = asSingleRow(candidate, 'claim_row');
    const grossAmountCents = requiredInteger(row.gross_amount_cents, 'gross_amount_cents', 1, Number.MAX_SAFE_INTEGER);
    const refundedAmountCents = requiredInteger(row.refunded_amount_cents, 'refunded_amount_cents', 0, grossAmountCents - 1);
    const refundAmountCents = requiredInteger(row.refund_amount_cents, 'refund_amount_cents', 1, grossAmountCents);
    if (grossAmountCents - refundedAmountCents !== refundAmountCents) {
      throw new LegacyQuickStopPaymentContractError('refund_amount_snapshot_invalid');
    }
    const currency = requiredString(row.currency, 'currency');
    const reasonCode = requiredString(row.reason_code, 'reason_code');
    if (currency !== 'usd' || reasonCode !== 'late_payment_after_expiry') {
      throw new LegacyQuickStopPaymentContractError('refund_scope_invalid');
    }
    if (row.reverse_transfer !== true || row.refund_application_fee !== true) {
      throw new LegacyQuickStopPaymentContractError('destination_refund_semantics_invalid');
    }
    return Object.freeze({
      claimToken: requiredUuid(row.work_claim_token, 'claim_token'),
      taskId: requiredUuid(row.task_id, 'task_id'),
      accountId: requiredUuid(row.account_id, 'account_id'),
      requestId: requiredUuid(row.request_id, 'request_id'),
      paymentId: requiredUuid(row.payment_id, 'payment_id'),
      jobId: requiredUuid(row.job_id, 'job_id'),
      stripePaymentIntent: requiredString(row.stripe_payment_intent, 'stripe_payment_intent', PAYMENT_INTENT_PATTERN),
      grossAmountCents,
      refundedAmountCents,
      refundAmountCents,
      currency,
      reverseTransfer: true,
      refundApplicationFee: true,
      stripeIdempotencyKey: requiredString(row.stripe_idempotency_key, 'stripe_idempotency_key', IDEMPOTENCY_PATTERN),
      requestFingerprint: requiredString(row.request_fingerprint, 'request_fingerprint', FINGERPRINT_PATTERN),
      reasonCode,
      attemptNumber: requiredInteger(row.attempt_number, 'attempt_number', 1, 8),
      leaseExpiresAt: requiredTimestamp(row.lease_expires_at, 'lease_expires_at'),
    } as LegacyQuickStopLateRefundClaim);
  });

  for (const key of [
    (claim: LegacyQuickStopLateRefundClaim) => claim.claimToken,
    (claim: LegacyQuickStopLateRefundClaim) => claim.taskId,
    (claim: LegacyQuickStopLateRefundClaim) => claim.paymentId,
    (claim: LegacyQuickStopLateRefundClaim) => claim.stripeIdempotencyKey,
  ]) {
    if (new Set(claims.map(key)).size !== claims.length) {
      throw new LegacyQuickStopPaymentContractError('claim_batch_duplicate');
    }
  }
  return Object.freeze(claims);
}

function parseCompletion(value: unknown): LegacyQuickStopLateRefundCompletion {
  const row = asSingleRow(value, 'completion_result');
  const status = requiredString(row.completion_status, 'completion_status');
  const state = requiredString(row.task_state, 'task_state');
  if (!['completed', 'already_completed', 'already_finished'].includes(status)) {
    throw new LegacyQuickStopPaymentContractError('completion_status_invalid');
  }
  if (!['completed', 'dead_letter'].includes(state)) {
    throw new LegacyQuickStopPaymentContractError('completion_task_state_invalid');
  }
  if (status !== 'already_finished' && state !== 'completed') {
    throw new LegacyQuickStopPaymentContractError('completion_state_conflict');
  }
  return Object.freeze({
    status: status as LegacyQuickStopLateRefundCompletion['status'],
    taskState: state as LegacyQuickStopLateRefundCompletion['taskState'],
  });
}

function parseFailure(value: unknown): LegacyQuickStopLateRefundFailure {
  const row = asSingleRow(value, 'failure_result');
  const status = requiredString(row.failure_status, 'failure_status');
  const state = requiredString(row.task_state, 'task_state');
  const nextAttemptAt = nullableTimestamp(row.next_attempt_at, 'next_attempt_at');
  if (!['failed_retryable', 'failed_terminal', 'already_finished'].includes(status)) {
    throw new LegacyQuickStopPaymentContractError('failure_status_invalid');
  }
  if (!['retry_wait', 'dead_letter', 'completed'].includes(state)) {
    throw new LegacyQuickStopPaymentContractError('failure_task_state_invalid');
  }
  if ((state === 'retry_wait') !== (nextAttemptAt !== null)) {
    throw new LegacyQuickStopPaymentContractError('failure_retry_time_invalid');
  }
  return Object.freeze({
    status: status as LegacyQuickStopLateRefundFailure['status'],
    taskState: state as LegacyQuickStopLateRefundFailure['taskState'],
    nextAttemptAt,
  });
}

export class SupabaseLegacyQuickStopPaymentStore implements LegacyQuickStopPaymentStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async reconcile(paymentId: string): Promise<LegacyQuickStopReconcileResult> {
    const { data, error } = await this.admin.rpc('reconcile_legacy_quick_stop_payment', {
      p_payment_id: requiredUuid(paymentId, 'payment_id'),
    });
    if (error) throw rpcFailure(error);
    return parseReconcile(data);
  }

  async claimBatch(batchSize: number): Promise<readonly LegacyQuickStopLateRefundClaim[]> {
    const bounded = boundedBatchSize(batchSize);
    const { data, error } = await this.admin.rpc('claim_legacy_quick_stop_late_refund_tasks', {
      p_batch_size: bounded,
    });
    if (error) throw rpcFailure(error);
    return parseClaims(data, bounded);
  }

  async complete(input: {
    claim: LegacyQuickStopLateRefundClaim;
    stripeRefundId: string;
  }): Promise<LegacyQuickStopLateRefundCompletion> {
    const { data, error } = await this.admin.rpc('complete_legacy_quick_stop_late_refund_task', {
      p_task_id: requiredUuid(input.claim.taskId, 'task_id'),
      p_claim_token: requiredUuid(input.claim.claimToken, 'claim_token'),
      p_stripe_refund_id: requiredString(input.stripeRefundId, 'stripe_refund_id', REFUND_PATTERN),
    });
    if (error) throw rpcFailure(error);
    return parseCompletion(data);
  }

  async fail(input: {
    claim: LegacyQuickStopLateRefundClaim;
    errorCode: string;
    retryable: boolean;
  }): Promise<LegacyQuickStopLateRefundFailure> {
    if (typeof input.retryable !== 'boolean') {
      throw new LegacyQuickStopPaymentContractError('retryable_invalid');
    }
    const { data, error } = await this.admin.rpc('fail_legacy_quick_stop_late_refund_task', {
      p_task_id: requiredUuid(input.claim.taskId, 'task_id'),
      p_claim_token: requiredUuid(input.claim.claimToken, 'claim_token'),
      p_error_code: requiredString(input.errorCode, 'error_code', ERROR_CODE_PATTERN),
      p_retryable: input.retryable,
    });
    if (error) throw rpcFailure(error);
    return parseFailure(data);
  }
}

export function reconcileLegacyQuickStopPayment(
  paymentId: string,
  store: LegacyQuickStopPaymentStore = new SupabaseLegacyQuickStopPaymentStore(),
): Promise<LegacyQuickStopReconcileResult> {
  return store.reconcile(requiredUuid(paymentId, 'payment_id'));
}
