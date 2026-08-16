import 'server-only';

import { createAdminClient } from '@/lib/auth';

/**
 * DARK server-only worker foundation.
 *
 * A separately gated and CRON_SECRET-authenticated scheduler may request one
 * fixed bounded batch; the database still derives every plan, unit amount,
 * provider period, allowance window, retry time, and dead-letter decision.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 25;

export type AllowanceResetWorkerOutcomeStatus =
  | 'completed'
  | 'blocked_catchup'
  | 'not_due'
  | 'not_eligible'
  | 'failed_retryable'
  | 'failed_terminal';

export type AllowanceResetWorkerState =
  | 'ready'
  | 'leased'
  | 'retry_wait'
  | 'dead_letter';

export type AllowanceResetWorkClaim = Readonly<{
  claimToken: string;
  workspaceId: string;
  dueAt: string;
  attemptNumber: number;
  leaseExpiresAt: string;
}>;

export type AllowanceResetWorkOutcome = Readonly<{
  status: Exclude<AllowanceResetWorkerOutcomeStatus, 'failed_retryable' | 'failed_terminal'>;
  workerState: Exclude<AllowanceResetWorkerState, 'leased'>;
  attemptId: string;
  workspaceId: string;
  resetOperationId: string | null;
  billingSubscriptionId: string | null;
  allowanceWindowStart: string | null;
  allowanceWindowEnd: string | null;
  insertedLotCount: number;
  verifiedLotCount: number;
  nextAllowanceResetAt: string | null;
  reason: string | null;
  retryable: boolean;
  deadLettered: boolean;
  nextAttemptAt: string | null;
}>;

export type AllowanceResetFailureCode =
  | 'worker_database_serialization'
  | 'worker_database_deadlock'
  | 'worker_database_lock_timeout'
  | 'worker_database_timeout'
  | 'worker_transport_error'
  | 'worker_claim_lease_expired'
  | 'worker_rpc_contract_error'
  | 'worker_internal_error';

export type AllowanceResetFailureOutcome = Readonly<{
  status: 'failed_retryable' | 'failed_terminal' | 'already_finished';
  recordedOutcomeStatus: AllowanceResetWorkerOutcomeStatus;
  workerState: Exclude<AllowanceResetWorkerState, 'leased'>;
  attemptId: string;
  workspaceId: string;
  retryable: boolean;
  deadLettered: boolean;
  nextAttemptAt: string | null;
}>;

export interface PaidPlanMonthlyAllowanceResetWorkerStore {
  claimBatch(batchSize: number): Promise<readonly AllowanceResetWorkClaim[]>;
  execute(claim: AllowanceResetWorkClaim): Promise<AllowanceResetWorkOutcome>;
  fail(
    claim: AllowanceResetWorkClaim,
    errorCode: AllowanceResetFailureCode,
  ): Promise<AllowanceResetFailureOutcome>;
}

type RpcError = Readonly<{ code?: string }>;

class AllowanceResetWorkerRpcError extends Error {
  constructor(readonly rpcCode: string | null) {
    super('Paid-plan allowance reset worker RPC failed.');
    this.name = 'AllowanceResetWorkerRpcError';
  }
}

function rpcFailure(error: RpcError | null): AllowanceResetWorkerRpcError {
  const code = typeof error?.code === 'string' && error.code.trim()
    ? error.code.trim().toUpperCase()
    : null;
  return new AllowanceResetWorkerRpcError(code);
}

function rowRecord(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value) && value.length !== 1) {
    throw new Error(`${label} returned an invalid row count.`);
  }
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label} returned no row.`);
  }
  return row as Record<string, unknown>;
}

function requiredUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value.toLowerCase();
}

function nullableUuid(value: unknown, label: string): string | null {
  return value == null ? null : requiredUuid(value, label);
}

function requiredInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)
      || parsed < 0 || parsed > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid.`);
  return value;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} is invalid.`);
  }
  return new Date(value).toISOString();
}

function requiredTimestamp(value: unknown, label: string): string {
  const timestamp = nullableTimestamp(value, label);
  if (!timestamp) throw new Error(`${label} is invalid.`);
  return timestamp;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizedBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error(`Allowance reset worker batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  return value;
}

function parseClaims(value: unknown, batchSize: number): readonly AllowanceResetWorkClaim[] {
  if (!Array.isArray(value)) throw new Error('Allowance reset worker claim RPC returned invalid data.');
  if (value.length > batchSize) throw new Error('Allowance reset worker claim RPC exceeded its batch bound.');
  const claims = value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('Allowance reset worker claim RPC returned an invalid row.');
    }
    const row = candidate as Record<string, unknown>;
    const dueAt = requiredTimestamp(row.due_at, 'allowance reset due time');
    const leaseExpiresAt = requiredTimestamp(
      row.lease_expires_at,
      'allowance reset lease expiry',
    );
    if (leaseExpiresAt <= dueAt) {
      throw new Error('Allowance reset worker claim lease is inconsistent.');
    }
    const attemptNumber = requiredInteger(
      row.attempt_number,
      'allowance reset attempt number',
      8,
    );
    if (attemptNumber < 1) throw new Error('Allowance reset attempt number is invalid.');
    return Object.freeze({
      claimToken: requiredUuid(row.work_claim_token, 'allowance reset claim token'),
      workspaceId: requiredUuid(row.workspace_id, 'allowance reset workspace ID'),
      dueAt,
      attemptNumber,
      leaseExpiresAt,
    });
  });
  const uniqueTokens = new Set(claims.map((claim) => claim.claimToken));
  const uniqueWorkspaces = new Set(claims.map((claim) => claim.workspaceId));
  if (uniqueTokens.size !== claims.length || uniqueWorkspaces.size !== claims.length) {
    throw new Error('Allowance reset worker claim batch contains duplicate ownership.');
  }
  for (let index = 1; index < claims.length; index += 1) {
    const prior = claims[index - 1];
    const current = claims[index];
    if (current.dueAt < prior.dueAt
        || (current.dueAt === prior.dueAt && current.workspaceId < prior.workspaceId)) {
      throw new Error('Allowance reset worker claim batch is not deterministically ordered.');
    }
  }
  return Object.freeze(claims);
}

const EXECUTION_STATUSES = new Set([
  'completed', 'blocked_catchup', 'not_due', 'not_eligible',
]);
const TERMINAL_WORKER_STATES = new Set(['ready', 'retry_wait', 'dead_letter']);

function parseExecution(
  value: unknown,
  expectedWorkspaceId: string,
): AllowanceResetWorkOutcome {
  const row = rowRecord(value, 'Allowance reset worker execute RPC');
  const status = requiredString(row.outcome_status, 'allowance reset outcome status');
  const workerState = requiredString(row.worker_state, 'allowance reset worker state');
  if (!EXECUTION_STATUSES.has(status) || !TERMINAL_WORKER_STATES.has(workerState)) {
    throw new Error('Allowance reset worker execute result has an invalid state.');
  }
  const workspaceId = requiredUuid(row.workspace_id, 'allowance reset workspace ID');
  if (workspaceId !== expectedWorkspaceId) {
    throw new Error('Allowance reset worker execute RPC returned another workspace.');
  }
  const retryable = requiredBoolean(row.retryable, 'allowance reset retryable flag');
  const deadLettered = requiredBoolean(row.dead_lettered, 'allowance reset dead-letter flag');
  const nextAttemptAt = nullableTimestamp(row.next_attempt_at, 'allowance reset next attempt');
  if ((retryable && (workerState !== 'retry_wait' || deadLettered || !nextAttemptAt))
      || (deadLettered && (workerState !== 'dead_letter' || retryable || nextAttemptAt))
      || (!retryable && !deadLettered && (workerState !== 'ready' || nextAttemptAt))) {
    throw new Error('Allowance reset worker execute retry state is inconsistent.');
  }
  const insertedLotCount = requiredInteger(
    row.inserted_lot_count,
    'allowance reset inserted lot count',
    4,
  );
  const verifiedLotCount = requiredInteger(
    row.verified_lot_count,
    'allowance reset verified lot count',
    4,
  );
  if ((status === 'completed' && verifiedLotCount !== 4)
      || (status !== 'completed' && (insertedLotCount !== 0 || verifiedLotCount !== 0))) {
    throw new Error('Allowance reset worker execute lot counts are inconsistent.');
  }
  const resetOperationId = nullableUuid(row.reset_operation_id, 'allowance reset operation ID');
  const billingSubscriptionId = nullableUuid(
    row.billing_subscription_id,
    'allowance reset subscription ID',
  );
  const allowanceWindowStart = nullableTimestamp(
    row.allowance_window_start,
    'allowance reset window start',
  );
  const allowanceWindowEnd = nullableTimestamp(
    row.allowance_window_end,
    'allowance reset window end',
  );
  const nextAllowanceResetAt = nullableTimestamp(
    row.next_allowance_reset_at,
    'next allowance reset time',
  );
  const reason = row.reason_code == null
    ? null
    : requiredString(row.reason_code, 'allowance reset reason');
  if (status === 'completed' && (
    workerState !== 'ready' || retryable || deadLettered || reason !== null
    || !resetOperationId || !billingSubscriptionId
    || !allowanceWindowStart || !allowanceWindowEnd
    || nextAllowanceResetAt !== allowanceWindowEnd
  )) {
    throw new Error('Completed allowance reset worker outcome is inconsistent.');
  }
  if (status === 'blocked_catchup' && (
    workerState !== 'dead_letter' || retryable || !deadLettered
    || reason !== 'catchup_requires_reconciliation'
    || !resetOperationId || !billingSubscriptionId
    || !allowanceWindowStart || !allowanceWindowEnd
    || nextAllowanceResetAt !== allowanceWindowStart
  )) {
    throw new Error('Blocked allowance reset worker outcome is inconsistent.');
  }
  if ((status === 'not_due' || status === 'not_eligible')
      && (resetOperationId !== null || reason === null)) {
    throw new Error('No-op allowance reset worker outcome is inconsistent.');
  }
  return Object.freeze({
    status: status as AllowanceResetWorkOutcome['status'],
    workerState: workerState as AllowanceResetWorkOutcome['workerState'],
    attemptId: requiredUuid(row.attempt_id, 'allowance reset attempt ID'),
    workspaceId,
    resetOperationId,
    billingSubscriptionId,
    allowanceWindowStart,
    allowanceWindowEnd,
    insertedLotCount,
    verifiedLotCount,
    nextAllowanceResetAt,
    reason,
    retryable,
    deadLettered,
    nextAttemptAt,
  });
}

const FAILURE_STATUSES = new Set(['failed_retryable', 'failed_terminal', 'already_finished']);
const ALL_OUTCOME_STATUSES = new Set<AllowanceResetWorkerOutcomeStatus>([
  'completed', 'blocked_catchup', 'not_due', 'not_eligible',
  'failed_retryable', 'failed_terminal',
]);

function parseFailure(
  value: unknown,
  expectedWorkspaceId: string,
): AllowanceResetFailureOutcome {
  const row = rowRecord(value, 'Allowance reset worker failure RPC');
  const status = requiredString(row.failure_status, 'allowance reset failure status');
  const recorded = requiredString(
    row.recorded_outcome_status,
    'recorded allowance reset outcome',
  ) as AllowanceResetWorkerOutcomeStatus;
  const workerState = requiredString(row.worker_state, 'allowance reset worker state');
  if (!FAILURE_STATUSES.has(status) || !ALL_OUTCOME_STATUSES.has(recorded)
      || !TERMINAL_WORKER_STATES.has(workerState)) {
    throw new Error('Allowance reset worker failure result has an invalid state.');
  }
  const workspaceId = requiredUuid(row.workspace_id, 'allowance reset workspace ID');
  if (workspaceId !== expectedWorkspaceId) {
    throw new Error('Allowance reset worker failure RPC returned another workspace.');
  }
  const retryable = requiredBoolean(row.retryable, 'allowance reset retryable flag');
  const deadLettered = requiredBoolean(row.dead_lettered, 'allowance reset dead-letter flag');
  const nextAttemptAt = nullableTimestamp(row.next_attempt_at, 'allowance reset next attempt');
  if ((retryable && (workerState !== 'retry_wait' || deadLettered || !nextAttemptAt))
      || (deadLettered && (workerState !== 'dead_letter' || retryable || nextAttemptAt))
      || (!retryable && !deadLettered && (workerState !== 'ready' || nextAttemptAt))) {
    throw new Error('Allowance reset worker failure retry state is inconsistent.');
  }
  if ((status === 'failed_retryable'
        && (recorded !== 'failed_retryable' || !retryable || deadLettered))
      || (status === 'failed_terminal'
        && (recorded !== 'failed_terminal' || retryable || !deadLettered))) {
    throw new Error('Allowance reset worker failure outcome is inconsistent.');
  }
  return Object.freeze({
    status: status as AllowanceResetFailureOutcome['status'],
    recordedOutcomeStatus: recorded,
    workerState: workerState as AllowanceResetFailureOutcome['workerState'],
    attemptId: requiredUuid(row.attempt_id, 'allowance reset attempt ID'),
    workspaceId,
    retryable,
    deadLettered,
    nextAttemptAt,
  });
}

/** Service-role store; tables remain read-only even to service_role. */
export class SupabasePaidPlanMonthlyAllowanceResetWorkerStore
implements PaidPlanMonthlyAllowanceResetWorkerStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claimBatch(batchSize: number): Promise<readonly AllowanceResetWorkClaim[]> {
    const bounded = normalizedBatchSize(batchSize);
    const { data, error } = await this.admin.rpc(
      'claim_due_paid_plan_allowance_reset_work',
      { p_batch_size: bounded },
    );
    if (error) throw rpcFailure(error);
    return parseClaims(data, bounded);
  }

  async execute(claim: AllowanceResetWorkClaim): Promise<AllowanceResetWorkOutcome> {
    const { data, error } = await this.admin.rpc(
      'execute_claimed_paid_plan_allowance_reset_work',
      { p_claim_token: requiredUuid(claim.claimToken, 'allowance reset claim token') },
    );
    if (error) throw rpcFailure(error);
    return parseExecution(data, requiredUuid(claim.workspaceId, 'allowance reset workspace ID'));
  }

  async fail(
    claim: AllowanceResetWorkClaim,
    errorCode: AllowanceResetFailureCode,
  ): Promise<AllowanceResetFailureOutcome> {
    const { data, error } = await this.admin.rpc(
      'fail_claimed_paid_plan_allowance_reset_work',
      {
        p_claim_token: requiredUuid(claim.claimToken, 'allowance reset claim token'),
        p_error_code: errorCode,
      },
    );
    if (error) throw rpcFailure(error);
    return parseFailure(data, requiredUuid(claim.workspaceId, 'allowance reset workspace ID'));
  }
}

export function classifyAllowanceResetWorkerFailure(error: unknown): AllowanceResetFailureCode {
  if (error instanceof AllowanceResetWorkerRpcError) {
    // postgrest-js converts fetch/network rejection into an error object with
    // an empty code unless throwOnError is enabled. It is still bounded by the
    // database's eight-attempt ceiling, never an unbounded optimistic retry.
    if (error.rpcCode === null) return 'worker_transport_error';
    if (['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(error.rpcCode)
        || error.rpcCode.startsWith('08')) {
      return 'worker_transport_error';
    }
    if (error.rpcCode === '40001') return 'worker_database_serialization';
    if (error.rpcCode === '40P01') return 'worker_database_deadlock';
    if (error.rpcCode === '55P03') return 'worker_database_lock_timeout';
    if (error.rpcCode === '57014') return 'worker_database_timeout';
    if (error.rpcCode === 'P0004') return 'worker_claim_lease_expired';
    if (error.rpcCode === '22000' || error.rpcCode === '22023' || error.rpcCode === '55000') {
      return 'worker_rpc_contract_error';
    }
    return 'worker_internal_error';
  }
  if (typeof DOMException !== 'undefined'
      && error instanceof DOMException
      && error.name === 'AbortError') {
    return 'worker_transport_error';
  }
  if (error instanceof TypeError) return 'worker_transport_error';
  return 'worker_internal_error';
}

export type RunPaidPlanMonthlyAllowanceResetBatchResult = Readonly<{
  claimedCount: number;
  outcomes: readonly (AllowanceResetWorkOutcome | AllowanceResetFailureOutcome)[];
}>;

/**
 * Claim one bounded batch and process it strictly one workspace at a time.
 * Scheduling and authentication live at the route boundary; there is still no
 * timer or parallel fanout in this worker.
 */
export async function runPaidPlanMonthlyAllowanceResetBatch(
  batchSize = 10,
  store: PaidPlanMonthlyAllowanceResetWorkerStore =
    new SupabasePaidPlanMonthlyAllowanceResetWorkerStore(),
): Promise<RunPaidPlanMonthlyAllowanceResetBatchResult> {
  const bounded = normalizedBatchSize(batchSize);
  const outcomes: (AllowanceResetWorkOutcome | AllowanceResetFailureOutcome)[] = [];
  let claimedCount = 0;
  // Claim only the workspace we are about to execute. This keeps a failed
  // finalizer from stranding every later item behind already-running leases.
  for (let index = 0; index < bounded; index += 1) {
    const claims = await store.claimBatch(1);
    if (claims.length > 1) {
      throw new Error('Allowance reset worker store exceeded its batch bound.');
    }
    const claim = claims[0];
    if (!claim) break;
    claimedCount += 1;
    try {
      outcomes.push(await store.execute(claim));
    } catch (error) {
      outcomes.push(await store.fail(claim, classifyAllowanceResetWorkerFailure(error)));
    }
  }
  return Object.freeze({
    claimedCount,
    outcomes: Object.freeze(outcomes),
  });
}
