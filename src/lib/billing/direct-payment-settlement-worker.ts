import 'server-only';

import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { normalizeUsPhone } from '@/lib/phone';
import { sendProviderMessage } from '@/lib/sms-provider';
import { paymentText } from '@/lib/sms-templates';

/**
 * DARK server-only fulfillment worker for a successfully projected one-off
 * Merchant direct payment.
 *
 * Only the exact-1-gated billing cron boundary imports this module. With that
 * gate off, it has no execution path. The database owns leases and terminal
 * outcomes. This worker owns only two effects, in order: one idempotent
 * payment-paid feed entry and one currently-consented payment receipt text. It
 * never changes ordinary job status and never calls Quick Stop, payment-plan,
 * recurring, or refund logic.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^\+[0-9]{10,15}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{2,99}$/;
const MAX_BATCH_SIZE = 25;

export type DirectPaymentSettlementFeedStatus = 'pending' | 'recorded';
export type DirectPaymentSettlementSmsStatus =
  | 'pending'
  | 'sent'
  | 'skipped_no_consent'
  | 'skipped_opted_out'
  | 'indeterminate';

export type DirectPaymentSettlementClaim = Readonly<{
  claimToken: string;
  taskId: string;
  paymentId: string;
  workspaceId: string;
  jobId: string;
  invoiceId: string;
  billingEventId: string;
  settledAt: string;
  feedStatus: DirectPaymentSettlementFeedStatus;
  smsStatus: 'pending';
  attemptNumber: number;
  leaseExpiresAt: string;
}>;

export type DirectPaymentSettlementSmsEnvelope = Readonly<{
  phoneNumber: string | null;
  body: string | null;
}>;

export type DirectPaymentSettlementSmsStage = Readonly<{
  status:
    | 'dispatch'
    | 'already_sent'
    | 'skipped_no_consent'
    | 'skipped_opted_out'
    | 'indeterminate';
  smsEventId: string | null;
  phoneNumber: string | null;
}>;

export type DirectPaymentSettlementFailure = Readonly<{
  status: 'failed_retryable' | 'failed_terminal' | 'sms_indeterminate' | 'already_finished';
  taskState: 'retry_wait' | 'dead_letter' | 'completed';
  nextAttemptAt: string | null;
}>;

export interface DirectPaymentSettlementStore {
  claimBatch(batchSize: number): Promise<readonly DirectPaymentSettlementClaim[]>;
  recordFeed(claim: DirectPaymentSettlementClaim): Promise<void>;
  stageSms(
    claim: DirectPaymentSettlementClaim,
    envelope: DirectPaymentSettlementSmsEnvelope,
  ): Promise<DirectPaymentSettlementSmsStage>;
  completeSms(input: {
    claim: DirectPaymentSettlementClaim;
    smsEventId: string;
    providerId: string;
  }): Promise<void>;
  fail(input: {
    claim: DirectPaymentSettlementClaim;
    errorCode: string;
    retryable: boolean;
  }): Promise<DirectPaymentSettlementFailure>;
}

export interface DirectPaymentSettlementMessenger {
  resolveEnvelope(claim: DirectPaymentSettlementClaim): Promise<DirectPaymentSettlementSmsEnvelope>;
  send(phoneNumber: string, body: string): Promise<string>;
}

type RpcError = Readonly<{ code?: string; message?: string }>;

export class DirectPaymentSettlementRpcError extends Error {
  override readonly name = 'DirectPaymentSettlementRpcError';

  constructor(readonly rpcCode: string | null) {
    super('Direct payment settlement database operation failed.');
  }
}

export class DirectPaymentSettlementWorkerError extends Error {
  override readonly name = 'DirectPaymentSettlementWorkerError';

  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

function rpcFailure(error: RpcError | null): DirectPaymentSettlementRpcError {
  return new DirectPaymentSettlementRpcError(error?.code?.trim() || null);
}

function rowRecord(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value) && value.length !== 1) {
    throw new DirectPaymentSettlementWorkerError(`${label}_invalid`, false);
  }
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new DirectPaymentSettlementWorkerError(`${label}_invalid`, false);
  }
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    throw new DirectPaymentSettlementWorkerError(`${label}_invalid`, false);
  }
  return value;
}

function requiredUuid(value: unknown, label: string): string {
  return requiredString(value, label, UUID_PATTERN).toLowerCase();
}

function nullableUuid(value: unknown, label: string): string | null {
  return value == null ? null : requiredUuid(value, label);
}

function requiredTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new DirectPaymentSettlementWorkerError(`${label}_invalid`, false);
  }
  return new Date(text).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value == null ? null : requiredTimestamp(value, label);
}

function requiredInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (
    typeof parsed !== 'number'
    || !Number.isSafeInteger(parsed)
    || parsed < minimum
    || parsed > maximum
  ) {
    throw new DirectPaymentSettlementWorkerError(`${label}_invalid`, false);
  }
  return parsed;
}

function normalizedBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error(`Direct payment settlement batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return value;
}

function parseClaims(value: unknown, batchSize: number): readonly DirectPaymentSettlementClaim[] {
  if (!Array.isArray(value) || value.length > batchSize) {
    throw new DirectPaymentSettlementWorkerError('claim_batch_invalid', false);
  }
  const claims = value.map((candidate) => {
    const row = rowRecord(candidate, 'claim_row');
    const feedStatus = requiredString(row.feed_status, 'feed_status');
    const smsStatus = requiredString(row.sms_status, 'sms_status');
    if ((feedStatus !== 'pending' && feedStatus !== 'recorded') || smsStatus !== 'pending') {
      throw new DirectPaymentSettlementWorkerError('claim_outcome_state_invalid', false);
    }
    return Object.freeze({
      claimToken: requiredUuid(row.work_claim_token, 'claim_token'),
      taskId: requiredUuid(row.task_id, 'task_id'),
      paymentId: requiredUuid(row.payment_id, 'payment_id'),
      workspaceId: requiredUuid(row.workspace_id, 'workspace_id'),
      jobId: requiredUuid(row.job_id, 'job_id'),
      invoiceId: requiredUuid(row.invoice_id, 'invoice_id'),
      billingEventId: requiredUuid(row.billing_event_id, 'billing_event_id'),
      settledAt: requiredTimestamp(row.settled_at, 'settled_at'),
      feedStatus,
      smsStatus,
      attemptNumber: requiredInteger(row.attempt_number, 'attempt_number', 1, 8),
      leaseExpiresAt: requiredTimestamp(row.lease_expires_at, 'lease_expires_at'),
    } as DirectPaymentSettlementClaim);
  });
  const taskIds = new Set(claims.map((claim) => claim.taskId));
  const paymentIds = new Set(claims.map((claim) => claim.paymentId));
  const claimTokens = new Set(claims.map((claim) => claim.claimToken));
  if (
    taskIds.size !== claims.length
    || paymentIds.size !== claims.length
    || claimTokens.size !== claims.length
  ) {
    throw new DirectPaymentSettlementWorkerError('claim_batch_duplicate', false);
  }
  return Object.freeze(claims);
}

function parseSmsStage(value: unknown): DirectPaymentSettlementSmsStage {
  const row = rowRecord(value, 'sms_stage');
  const status = requiredString(row.dispatch_status, 'dispatch_status');
  if (![
    'dispatch', 'already_sent', 'skipped_no_consent',
    'skipped_opted_out', 'indeterminate',
  ].includes(status)) {
    throw new DirectPaymentSettlementWorkerError('sms_stage_status_invalid', false);
  }
  const smsEventId = nullableUuid(row.sms_event_id, 'sms_event_id');
  const phoneNumber = row.phone_number == null
    ? null
    : requiredString(row.phone_number, 'phone_number', PHONE_PATTERN);
  if (
    (status === 'dispatch' && (!smsEventId || !phoneNumber))
    || ((status === 'already_sent' || status === 'indeterminate') && !smsEventId)
    || (status !== 'dispatch' && phoneNumber !== null)
    || ((status === 'skipped_no_consent' || status === 'skipped_opted_out') && smsEventId !== null)
  ) {
    throw new DirectPaymentSettlementWorkerError('sms_stage_shape_invalid', false);
  }
  return Object.freeze({
    status: status as DirectPaymentSettlementSmsStage['status'],
    smsEventId,
    phoneNumber,
  });
}

function parseFailure(value: unknown): DirectPaymentSettlementFailure {
  const row = rowRecord(value, 'failure');
  const status = requiredString(row.failure_status, 'failure_status');
  const taskState = requiredString(row.task_state, 'task_state');
  const nextAttemptAt = nullableTimestamp(row.next_attempt_at, 'next_attempt_at');
  if (!['failed_retryable', 'failed_terminal', 'sms_indeterminate', 'already_finished'].includes(status)) {
    throw new DirectPaymentSettlementWorkerError('failure_status_invalid', false);
  }
  if (!['retry_wait', 'dead_letter', 'completed'].includes(taskState)) {
    throw new DirectPaymentSettlementWorkerError('failure_task_state_invalid', false);
  }
  if (
    (status === 'failed_retryable' && (taskState !== 'retry_wait' || !nextAttemptAt))
    || ((status === 'failed_terminal' || status === 'sms_indeterminate')
      && (taskState !== 'dead_letter' || nextAttemptAt !== null))
    || (status === 'already_finished'
      && (!['completed', 'dead_letter'].includes(taskState) || nextAttemptAt !== null))
  ) {
    throw new DirectPaymentSettlementWorkerError('failure_shape_invalid', false);
  }
  return Object.freeze({
    status: status as DirectPaymentSettlementFailure['status'],
    taskState: taskState as DirectPaymentSettlementFailure['taskState'],
    nextAttemptAt,
  });
}

/** Service-role RPC adapter; the settlement tables have no direct grants. */
export class SupabaseDirectPaymentSettlementStore implements DirectPaymentSettlementStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claimBatch(batchSize: number): Promise<readonly DirectPaymentSettlementClaim[]> {
    const bounded = normalizedBatchSize(batchSize);
    const { data, error } = await this.admin.rpc(
      'claim_direct_payment_settlement_tasks',
      { p_batch_size: bounded },
    );
    if (error) throw rpcFailure(error);
    return parseClaims(data, bounded);
  }

  async recordFeed(claim: DirectPaymentSettlementClaim): Promise<void> {
    const { data, error } = await this.admin.rpc(
      'record_direct_payment_settlement_feed',
      {
        p_task_id: requiredUuid(claim.taskId, 'task_id'),
        p_claim_token: requiredUuid(claim.claimToken, 'claim_token'),
      },
    );
    if (error) throw rpcFailure(error);
    if (data !== 'recorded') {
      throw new DirectPaymentSettlementWorkerError('feed_result_invalid', false);
    }
  }

  async stageSms(
    claim: DirectPaymentSettlementClaim,
    envelope: DirectPaymentSettlementSmsEnvelope,
  ): Promise<DirectPaymentSettlementSmsStage> {
    const { data, error } = await this.admin.rpc(
      'stage_direct_payment_settlement_sms',
      {
        p_task_id: requiredUuid(claim.taskId, 'task_id'),
        p_claim_token: requiredUuid(claim.claimToken, 'claim_token'),
        p_normalized_phone: envelope.phoneNumber,
        p_body: envelope.body,
      },
    );
    if (error) throw rpcFailure(error);
    return parseSmsStage(data);
  }

  async completeSms(input: {
    claim: DirectPaymentSettlementClaim;
    smsEventId: string;
    providerId: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc(
      'complete_direct_payment_settlement_sms',
      {
        p_task_id: requiredUuid(input.claim.taskId, 'task_id'),
        p_claim_token: requiredUuid(input.claim.claimToken, 'claim_token'),
        p_sms_event_id: requiredUuid(input.smsEventId, 'sms_event_id'),
        p_provider_id: requiredString(input.providerId, 'provider_id'),
      },
    );
    if (error) throw rpcFailure(error);
    if (data !== true) {
      throw new DirectPaymentSettlementWorkerError('sms_completion_invalid', false);
    }
  }

  async fail(input: {
    claim: DirectPaymentSettlementClaim;
    errorCode: string;
    retryable: boolean;
  }): Promise<DirectPaymentSettlementFailure> {
    const { data, error } = await this.admin.rpc(
      'fail_direct_payment_settlement_task',
      {
        p_task_id: requiredUuid(input.claim.taskId, 'task_id'),
        p_claim_token: requiredUuid(input.claim.claimToken, 'claim_token'),
        p_error_code: requiredString(input.errorCode, 'error_code', ERROR_CODE_PATTERN),
        p_retryable: input.retryable,
      },
    );
    if (error) throw rpcFailure(error);
    return parseFailure(data);
  }
}

type SmsPaymentRow = Readonly<{
  id: string;
  account_id: string;
  job_id: string;
  invoice_id: string | null;
  amount: number | string;
  label: string | null;
  homeowner_phone: string | null;
  sms_consent: boolean;
  status: string;
  paid_at: string | null;
  charge_model: string;
}>;

export class SupabaseDirectPaymentSettlementMessenger
implements DirectPaymentSettlementMessenger {
  constructor(private readonly admin = createAdminClient()) {}

  async resolveEnvelope(
    claim: DirectPaymentSettlementClaim,
  ): Promise<DirectPaymentSettlementSmsEnvelope> {
    const { data, error } = await this.admin
      .from('payments')
      .select(
        'id, account_id, job_id, invoice_id, amount, label, homeowner_phone, '
        + 'sms_consent, status, paid_at, charge_model',
      )
      .eq('id', claim.paymentId)
      .eq('account_id', claim.workspaceId)
      .maybeSingle();
    if (error) {
      throw new DirectPaymentSettlementWorkerError('sms_payment_read_failed', true);
    }
    if (!data) {
      throw new DirectPaymentSettlementWorkerError('sms_payment_missing', false);
    }
    const payment = data as unknown as SmsPaymentRow;
    const paidAtMilliseconds = payment.paid_at == null ? Number.NaN : Date.parse(payment.paid_at);
    if (
      payment.id !== claim.paymentId
      || payment.account_id !== claim.workspaceId
      || payment.job_id !== claim.jobId
      || payment.invoice_id !== claim.invoiceId
      || payment.status !== 'paid'
      || payment.charge_model !== 'direct'
      || payment.paid_at == null
      || !Number.isFinite(paidAtMilliseconds)
      || new Date(paidAtMilliseconds).toISOString() !== claim.settledAt
    ) {
      throw new DirectPaymentSettlementWorkerError('sms_payment_scope_changed', false);
    }

    if (!payment.sms_consent || !payment.homeowner_phone) {
      return Object.freeze({ phoneNumber: null, body: null });
    }
    const phoneNumber = normalizeUsPhone(payment.homeowner_phone);
    const amount = Number(payment.amount);
    if (!phoneNumber || !PHONE_PATTERN.test(phoneNumber)) {
      throw new DirectPaymentSettlementWorkerError('sms_phone_invalid', false);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DirectPaymentSettlementWorkerError('sms_amount_invalid', false);
    }
    const contractor = await loadBusinessName(this.admin, claim.workspaceId);
    const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
    const body = paymentText({
      contractor,
      label: payment.label,
      amount,
      link: `${origin}/pay/${claim.paymentId}`,
      eventType: 'payment_paid',
    });
    return Object.freeze({ phoneNumber, body });
  }

  send(phoneNumber: string, body: string): Promise<string> {
    return sendProviderMessage(
      requiredString(phoneNumber, 'phone_number', PHONE_PATTERN),
      requiredString(body, 'sms_body'),
    );
  }
}

export function classifyDirectPaymentSettlementFailure(
  error: unknown,
): Readonly<{ code: string; retryable: boolean }> {
  if (error instanceof DirectPaymentSettlementWorkerError) {
    return Object.freeze({ code: error.code, retryable: error.retryable });
  }
  if (error instanceof DirectPaymentSettlementRpcError) {
    const code = error.rpcCode;
    if (
      code === null
      || code.startsWith('08')
      || ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '40001', '40P01', '55P03', '57014']
        .includes(code)
    ) {
      return Object.freeze({ code: 'worker_transport_error', retryable: true });
    }
    if (['22000', '22023', '42501', '55000'].includes(code)) {
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
    return Object.freeze({ code: 'worker_transport_error', retryable: true });
  }
  return Object.freeze({ code: 'worker_internal_error', retryable: true });
}

export type DirectPaymentSettlementWorkOutcome = Readonly<{
  taskId: string;
  status:
    | 'completed'
    | 'failed_retryable'
    | 'failed_terminal'
    | 'sms_indeterminate'
    | 'already_finished';
  feedStatus: DirectPaymentSettlementFeedStatus;
  smsStatus: DirectPaymentSettlementSmsStatus;
}>;

export type RunDirectPaymentSettlementBatchResult = Readonly<{
  claimedCount: number;
  outcomes: readonly DirectPaymentSettlementWorkOutcome[];
}>;

function failureOutcome(
  claim: DirectPaymentSettlementClaim,
  failure: DirectPaymentSettlementFailure,
  feedStatus: DirectPaymentSettlementFeedStatus = claim.feedStatus,
): DirectPaymentSettlementWorkOutcome {
  return Object.freeze({
    taskId: claim.taskId,
    status: failure.status,
    feedStatus,
    smsStatus: failure.status === 'sms_indeterminate' ? 'indeterminate' : 'pending',
  });
}

async function failClaim(
  store: DirectPaymentSettlementStore,
  claim: DirectPaymentSettlementClaim,
  error: unknown,
  feedStatus: DirectPaymentSettlementFeedStatus = claim.feedStatus,
): Promise<DirectPaymentSettlementWorkOutcome> {
  const failure = classifyDirectPaymentSettlementFailure(error);
  return failureOutcome(claim, await store.fail({
    claim,
    errorCode: failure.code,
    retryable: failure.retryable,
  }), feedStatus);
}

/**
 * Processes a bounded batch strictly one task at a time. Feed completion is
 * durable before SMS staging. Once SMS is staged, every provider or completion
 * uncertainty is terminal/indeterminate; this function never retries egress.
 */
export async function runDirectPaymentSettlementBatch(
  batchSize = 10,
  store: DirectPaymentSettlementStore = new SupabaseDirectPaymentSettlementStore(),
  messenger: DirectPaymentSettlementMessenger = new SupabaseDirectPaymentSettlementMessenger(),
): Promise<RunDirectPaymentSettlementBatchResult> {
  const bounded = normalizedBatchSize(batchSize);
  const outcomes: DirectPaymentSettlementWorkOutcome[] = [];
  let claimedCount = 0;

  for (let index = 0; index < bounded; index += 1) {
    const claims = await store.claimBatch(1);
    if (claims.length > 1) {
      throw new DirectPaymentSettlementWorkerError('claim_batch_bound_exceeded', false);
    }
    const claim = claims[0];
    if (!claim) break;
    claimedCount += 1;
    let feedStatus = claim.feedStatus;

    try {
      await store.recordFeed(claim);
      feedStatus = 'recorded';
      const envelope = await messenger.resolveEnvelope(claim);
      const stage = await store.stageSms(claim, envelope);

      if (stage.status === 'skipped_no_consent' || stage.status === 'skipped_opted_out') {
        outcomes.push(Object.freeze({
          taskId: claim.taskId,
          status: 'completed',
          feedStatus: 'recorded',
          smsStatus: stage.status,
        }));
        continue;
      }
      if (stage.status === 'already_sent') {
        outcomes.push(Object.freeze({
          taskId: claim.taskId,
          status: 'completed',
          feedStatus: 'recorded',
          smsStatus: 'sent',
        }));
        continue;
      }
      if (stage.status === 'indeterminate') {
        outcomes.push(Object.freeze({
          taskId: claim.taskId,
          status: 'sms_indeterminate',
          feedStatus: 'recorded',
          smsStatus: 'indeterminate',
        }));
        continue;
      }
      if (!stage.smsEventId || !stage.phoneNumber || !envelope.body) {
        throw new DirectPaymentSettlementWorkerError('sms_dispatch_shape_invalid', false);
      }

      let providerId: string;
      try {
        providerId = await messenger.send(stage.phoneNumber, envelope.body);
      } catch {
        // Egress was entered. Even a provider error may arrive after acceptance;
        // never turn this into a retryable send.
        outcomes.push(failureOutcome(claim, await store.fail({
          claim,
          errorCode: 'sms_provider_result_unknown',
          retryable: false,
        }), 'recorded'));
        continue;
      }

      try {
        await store.completeSms({ claim, smsEventId: stage.smsEventId, providerId });
        outcomes.push(Object.freeze({
          taskId: claim.taskId,
          status: 'completed',
          feedStatus: 'recorded',
          smsStatus: 'sent',
        }));
      } catch {
        // The provider returned an ID, so retrying the send is forbidden. The
        // failure RPC either observes an already-completed transaction or marks
        // the staged event indeterminate. If this finalizer is unavailable too,
        // the expired lease performs that same indeterminate transition.
        outcomes.push(failureOutcome(claim, await store.fail({
          claim,
          errorCode: 'sms_completion_result_unknown',
          retryable: false,
        }), 'recorded'));
      }
    } catch (error) {
      outcomes.push(await failClaim(store, claim, error, feedStatus));
    }
  }

  return Object.freeze({ claimedCount, outcomes: Object.freeze(outcomes) });
}
