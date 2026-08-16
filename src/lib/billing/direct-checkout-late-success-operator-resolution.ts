import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';

/**
 * DARK service-role boundary for a future, separately authorized operator
 * workflow. This module has no route, Server Action, provider adapter, cron
 * caller, or activation path. The database remains the serialization and
 * immutable-evidence authority. Neither the service-role client nor an actor
 * UUID is operator authorization: a future caller must first enforce an MFA
 * step-up and the appropriate staff permission.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;

export const DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA =
  'direct_checkout_late_success_operator_resolution_v1' as const;

export const DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_ACTIONS = [
  'settle_paid_predecessor',
  'retain_hold',
] as const;

export type DirectCheckoutLateSuccessOperatorAction =
  (typeof DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_ACTIONS)[number];

export const DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_DECISIONS = [
  'accept_single_late_paid_predecessor',
  'retain_operator_hold',
  'reject_payment_scope_changed',
  'reject_hold_not_active',
  'reject_task_not_resolution_ready',
  'reject_task_already_resolved',
  'reject_additional_paid_truth',
  'reject_paid_evidence_not_reconciled',
  'reject_successor_not_neutralized',
] as const;

export type DirectCheckoutLateSuccessOperatorDecision =
  (typeof DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_DECISIONS)[number];

export const DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_REASON_CODES = [
  'single_late_paid_predecessor_resolution_ready',
  'operator_hold_requested',
  'payment_scope_changed',
  'hold_not_active',
  'task_not_resolution_ready',
  'task_already_resolved',
  'additional_paid_truth_present',
  'paid_evidence_not_reconciled',
  'successor_not_neutralized',
] as const;

export type DirectCheckoutLateSuccessOperatorReasonCode =
  (typeof DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_REASON_CODES)[number];

export const DIRECT_CHECKOUT_LATE_SUCCESS_MANUAL_DISPOSITIONS = [
  'operator_retained_for_manual_review',
  'additional_paid_truth_requires_review',
  'successor_not_safely_neutralized',
  'provider_evidence_requires_review',
] as const;

export type DirectCheckoutLateSuccessManualDisposition =
  (typeof DIRECT_CHECKOUT_LATE_SUCCESS_MANUAL_DISPOSITIONS)[number];

const PLAN_DECISION_CONTRACT = Object.freeze({
  accept_single_late_paid_predecessor: Object.freeze({
    actions: ['settle_paid_predecessor'] as const,
    eligible: true,
    reasonCode: 'single_late_paid_predecessor_resolution_ready',
  }),
  retain_operator_hold: Object.freeze({
    actions: ['retain_hold'] as const,
    eligible: true,
    reasonCode: 'operator_hold_requested',
  }),
  reject_payment_scope_changed: Object.freeze({
    actions: ['settle_paid_predecessor', 'retain_hold'] as const,
    eligible: false,
    reasonCode: 'payment_scope_changed',
  }),
  reject_hold_not_active: Object.freeze({
    actions: ['settle_paid_predecessor', 'retain_hold'] as const,
    eligible: false,
    reasonCode: 'hold_not_active',
  }),
  reject_task_not_resolution_ready: Object.freeze({
    actions: ['retain_hold'] as const,
    eligible: false,
    reasonCode: 'task_not_resolution_ready',
  }),
  reject_task_already_resolved: Object.freeze({
    actions: ['settle_paid_predecessor', 'retain_hold'] as const,
    eligible: false,
    reasonCode: 'task_already_resolved',
  }),
  reject_additional_paid_truth: Object.freeze({
    actions: ['settle_paid_predecessor'] as const,
    eligible: false,
    reasonCode: 'additional_paid_truth_present',
  }),
  reject_paid_evidence_not_reconciled: Object.freeze({
    actions: ['settle_paid_predecessor'] as const,
    eligible: false,
    reasonCode: 'paid_evidence_not_reconciled',
  }),
  reject_successor_not_neutralized: Object.freeze({
    actions: ['settle_paid_predecessor'] as const,
    eligible: false,
    reasonCode: 'successor_not_neutralized',
  }),
} satisfies Record<DirectCheckoutLateSuccessOperatorDecision, Readonly<{
  actions: readonly DirectCheckoutLateSuccessOperatorAction[];
  eligible: boolean;
  reasonCode: DirectCheckoutLateSuccessOperatorReasonCode;
}>>);

export type DirectCheckoutLateSuccessOperatorResolutionScope = Readonly<{
  accountId: string;
  paymentId: string;
  taskId: string;
}>;

export type DirectCheckoutLateSuccessOperatorResolutionPlan = Readonly<{
  schema: typeof DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA;
  action: DirectCheckoutLateSuccessOperatorAction;
  decisionCode: DirectCheckoutLateSuccessOperatorDecision;
  eligible: boolean;
  reasonCode: DirectCheckoutLateSuccessOperatorReasonCode;
  accountId: string;
  paymentId: string;
  taskId: string;
  paidOperationPk: string;
  currentOperationPk: string | null;
  currentCheckoutSessionId: string | null;
  taskSetSha256: string;
  evidenceSha256: string;
}>;

export type DirectCheckoutLateSuccessOperatorMutationInput = Readonly<{
  plan: DirectCheckoutLateSuccessOperatorResolutionPlan;
  operationId: string;
  requestSha256: string;
  /**
   * Authenticated auth.users UUID for audit attribution only. A future caller
   * must source it from an MFA- and staff-permission-gated context.
   */
  actorUserId: string;
}>;

export type DirectCheckoutLateSuccessOperatorResolutionResult = Readonly<{
  schema: typeof DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA;
  resolutionId: string;
  applied: boolean;
  resultCode:
    | 'settled'
    | 'already_settled'
    | 'hold_retained'
    | 'already_retained';
  paymentId: string;
  taskId: string;
  paidOperationPk: string;
}>;

export interface DirectCheckoutLateSuccessOperatorResolutionStore {
  plan(
    scope: DirectCheckoutLateSuccessOperatorResolutionScope,
    action: DirectCheckoutLateSuccessOperatorAction,
  ): Promise<DirectCheckoutLateSuccessOperatorResolutionPlan>;
  settle(
    input: DirectCheckoutLateSuccessOperatorMutationInput,
  ): Promise<DirectCheckoutLateSuccessOperatorResolutionResult>;
  retainHold(
    input: DirectCheckoutLateSuccessOperatorMutationInput & {
      disposition: DirectCheckoutLateSuccessManualDisposition;
    },
  ): Promise<DirectCheckoutLateSuccessOperatorResolutionResult>;
}

type RpcError = Readonly<{ code?: string | null }>;

export class DirectCheckoutLateSuccessOperatorResolutionRpcError extends Error {
  override readonly name = 'DirectCheckoutLateSuccessOperatorResolutionRpcError';

  constructor(readonly rpcCode: string | null) {
    super('Direct Checkout late-success operator-resolution database operation failed.');
  }
}

function rpcFailure(error: RpcError | null): DirectCheckoutLateSuccessOperatorResolutionRpcError {
  const code = typeof error?.code === 'string' && error.code.trim()
    ? error.code.trim().toUpperCase()
    : null;
  return new DirectCheckoutLateSuccessOperatorResolutionRpcError(code);
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

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  const patternMatch = typeof value === 'string' && pattern ? pattern.exec(value) : null;
  if (
    typeof value !== 'string'
    || !value.trim()
    || (pattern && patternMatch?.[0] !== value)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredUuid(value: unknown, label: string): string {
  return requiredString(value, label, UUID_PATTERN).toLowerCase();
}

function optionalUuid(value: unknown, label: string): string | null {
  return value == null ? null : requiredUuid(value, label);
}

function optionalCheckoutSessionId(value: unknown, label: string): string | null {
  if (value == null) return null;
  const sessionId = requiredString(value, label);
  const match = CHECKOUT_SESSION_ID_PATTERN.exec(sessionId);
  if (sessionId.length > 255 || match?.[0] !== sessionId) {
    throw new Error(`${label} is invalid.`);
  }
  return sessionId;
}

function requiredSha256(value: unknown, label: string): string {
  return requiredString(value, label, SHA256_PATTERN);
}

function requiredOperationId(value: unknown, label: string): string {
  const operationId = requiredString(value, label);
  if (
    operationId.length > 200
    || operationId !== operationId.trim()
    || [...operationId].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return operationId;
}

function requiredAction(value: unknown, label: string): DirectCheckoutLateSuccessOperatorAction {
  const action = requiredString(value, label);
  if (!(DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${label} is invalid.`);
  }
  return action as DirectCheckoutLateSuccessOperatorAction;
}

function requiredDecision(value: unknown): DirectCheckoutLateSuccessOperatorDecision {
  const decision = requiredString(value, 'operator-resolution decision code');
  if (!(DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_DECISIONS as readonly string[]).includes(decision)) {
    throw new Error('Operator-resolution decision code is invalid.');
  }
  return decision as DirectCheckoutLateSuccessOperatorDecision;
}

function requiredReasonCode(value: unknown): DirectCheckoutLateSuccessOperatorReasonCode {
  const reason = requiredString(value, 'operator-resolution reason code');
  if (!(DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_REASON_CODES as readonly string[]).includes(reason)) {
    throw new Error('Operator-resolution reason code is invalid.');
  }
  return reason as DirectCheckoutLateSuccessOperatorReasonCode;
}

function requiredDisposition(value: unknown): DirectCheckoutLateSuccessManualDisposition {
  const disposition = requiredString(value, 'late-success manual disposition');
  if (!(DIRECT_CHECKOUT_LATE_SUCCESS_MANUAL_DISPOSITIONS as readonly string[]).includes(disposition)) {
    throw new Error('Late-success manual disposition is invalid.');
  }
  return disposition as DirectCheckoutLateSuccessManualDisposition;
}

function normalizeScope(
  scope: DirectCheckoutLateSuccessOperatorResolutionScope,
): DirectCheckoutLateSuccessOperatorResolutionScope {
  return Object.freeze({
    accountId: requiredUuid(scope.accountId, 'operator-resolution account ID'),
    paymentId: requiredUuid(scope.paymentId, 'operator-resolution payment ID'),
    taskId: requiredUuid(scope.taskId, 'operator-resolution task ID'),
  });
}

function parsePlan(
  value: unknown,
  expectedScope: DirectCheckoutLateSuccessOperatorResolutionScope,
  expectedAction: DirectCheckoutLateSuccessOperatorAction,
): DirectCheckoutLateSuccessOperatorResolutionPlan {
  const row = rowRecord(value, 'Direct Checkout late-success operator-resolution plan RPC');
  if (row.resolution_schema !== DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA) {
    throw new Error('Operator-resolution plan schema is invalid.');
  }
  const decisionCode = requiredDecision(row.decision_code);
  const eligible = row.eligible;
  if (typeof eligible !== 'boolean') {
    throw new Error('Operator-resolution eligibility is invalid.');
  }
  const reasonCode = requiredReasonCode(row.reason_code);
  const decisionContract = PLAN_DECISION_CONTRACT[decisionCode];
  if (
    decisionContract.eligible !== eligible
    || decisionContract.reasonCode !== reasonCode
    || !(decisionContract.actions as readonly string[]).includes(expectedAction)
  ) {
    throw new Error('Operator-resolution decision contract is invalid.');
  }

  const accountId = requiredUuid(row.account_id, 'operator-resolution plan account ID');
  const paymentId = requiredUuid(row.payment_id, 'operator-resolution plan payment ID');
  const taskId = requiredUuid(row.task_id, 'operator-resolution plan task ID');
  if (
    accountId !== expectedScope.accountId
    || paymentId !== expectedScope.paymentId
    || taskId !== expectedScope.taskId
  ) {
    throw new Error('Operator-resolution plan scope changed.');
  }

  const currentOperationPk = optionalUuid(
    row.current_operation_pk,
    'operator-resolution current operation PK',
  );
  const currentCheckoutSessionId = optionalCheckoutSessionId(
    row.current_checkout_session_id,
    'operator-resolution current Checkout Session ID',
  );
  if (
    (eligible && currentOperationPk === null)
    || (currentCheckoutSessionId !== null && currentOperationPk === null)
  ) {
    throw new Error('Operator-resolution current Checkout identity is invalid.');
  }

  return Object.freeze({
    schema: DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
    action: expectedAction,
    decisionCode,
    eligible,
    reasonCode,
    accountId,
    paymentId,
    taskId,
    paidOperationPk: requiredUuid(
      row.paid_operation_pk,
      'operator-resolution paid operation PK',
    ),
    currentOperationPk,
    currentCheckoutSessionId,
    taskSetSha256: requiredSha256(
      row.task_set_sha256,
      'operator-resolution task-set fingerprint',
    ),
    evidenceSha256: requiredSha256(
      row.evidence_sha256,
      'operator-resolution evidence fingerprint',
    ),
  });
}

function validateMutationPlan(
  value: DirectCheckoutLateSuccessOperatorResolutionPlan,
): DirectCheckoutLateSuccessOperatorResolutionPlan {
  if (value.schema !== DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA) {
    throw new Error('Operator-resolution mutation plan schema is invalid.');
  }
  const action = requiredAction(value.action, 'operator-resolution mutation action');
  const decisionCode = requiredDecision(value.decisionCode);
  const reasonCode = requiredReasonCode(value.reasonCode);
  if (typeof value.eligible !== 'boolean') {
    throw new Error('Operator-resolution mutation eligibility is invalid.');
  }
  const decisionContract = PLAN_DECISION_CONTRACT[decisionCode];
  if (
    decisionContract.eligible !== value.eligible
    || decisionContract.reasonCode !== reasonCode
    || !(decisionContract.actions as readonly string[]).includes(action)
  ) {
    throw new Error('Operator-resolution mutation decision contract is invalid.');
  }
  const currentOperationPk = optionalUuid(
    value.currentOperationPk,
    'operator-resolution mutation current operation PK',
  );
  const currentCheckoutSessionId = optionalCheckoutSessionId(
    value.currentCheckoutSessionId,
    'operator-resolution mutation current Checkout Session ID',
  );
  if (
    (value.eligible && currentOperationPk === null)
    || (currentCheckoutSessionId !== null && currentOperationPk === null)
  ) {
    throw new Error('Operator-resolution mutation current Checkout identity is invalid.');
  }
  return Object.freeze({
    schema: DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
    action,
    decisionCode,
    eligible: value.eligible,
    reasonCode,
    accountId: requiredUuid(value.accountId, 'operator-resolution mutation account ID'),
    paymentId: requiredUuid(value.paymentId, 'operator-resolution mutation payment ID'),
    taskId: requiredUuid(value.taskId, 'operator-resolution mutation task ID'),
    paidOperationPk: requiredUuid(
      value.paidOperationPk,
      'operator-resolution mutation paid operation PK',
    ),
    currentOperationPk,
    currentCheckoutSessionId,
    taskSetSha256: requiredSha256(
      value.taskSetSha256,
      'operator-resolution mutation task-set fingerprint',
    ),
    evidenceSha256: requiredSha256(
      value.evidenceSha256,
      'operator-resolution mutation evidence fingerprint',
    ),
  });
}

type MutationKind = 'settle' | 'retain_hold';

const RESULT_CONTRACT = Object.freeze({
  settled: Object.freeze({ kind: 'settle', applied: true }),
  already_settled: Object.freeze({ kind: 'settle', applied: false }),
  hold_retained: Object.freeze({ kind: 'retain_hold', applied: true }),
  already_retained: Object.freeze({ kind: 'retain_hold', applied: false }),
} satisfies Record<DirectCheckoutLateSuccessOperatorResolutionResult['resultCode'], Readonly<{
  kind: MutationKind;
  applied: boolean;
}>>);

function parseMutationResult(
  value: unknown,
  plan: DirectCheckoutLateSuccessOperatorResolutionPlan,
  expectedKind: MutationKind,
): DirectCheckoutLateSuccessOperatorResolutionResult {
  const row = rowRecord(value, 'Direct Checkout late-success operator-resolution mutation RPC');
  if (row.resolution_schema !== DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA) {
    throw new Error('Operator-resolution result schema is invalid.');
  }
  const resultCode = requiredString(row.result_code, 'operator-resolution result code');
  if (!Object.prototype.hasOwnProperty.call(RESULT_CONTRACT, resultCode)) {
    throw new Error('Operator-resolution result code is invalid.');
  }
  const typedResultCode = resultCode as DirectCheckoutLateSuccessOperatorResolutionResult['resultCode'];
  const applied = row.applied;
  const contract = RESULT_CONTRACT[typedResultCode];
  if (typeof applied !== 'boolean' || contract.kind !== expectedKind || contract.applied !== applied) {
    throw new Error('Operator-resolution result contract is invalid.');
  }

  const paymentId = requiredUuid(row.payment_id, 'operator-resolution result payment ID');
  const taskId = requiredUuid(row.task_id, 'operator-resolution result task ID');
  const paidOperationPk = requiredUuid(
    row.paid_operation_pk,
    'operator-resolution result paid operation PK',
  );
  if (
    paymentId !== plan.paymentId
    || taskId !== plan.taskId
    || paidOperationPk !== plan.paidOperationPk
  ) {
    throw new Error('Operator-resolution result identity changed.');
  }

  return Object.freeze({
    schema: DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
    resolutionId: requiredUuid(row.resolution_id, 'operator-resolution result ID'),
    applied,
    resultCode: typedResultCode,
    paymentId,
    taskId,
    paidOperationPk,
  });
}

function mutationParameters(input: DirectCheckoutLateSuccessOperatorMutationInput) {
  return {
    p_account_id: requiredUuid(input.plan.accountId, 'operator-resolution account ID'),
    p_payment_id: requiredUuid(input.plan.paymentId, 'operator-resolution payment ID'),
    p_task_id: requiredUuid(input.plan.taskId, 'operator-resolution task ID'),
    p_operation_id: requiredOperationId(input.operationId, 'operator-resolution operation ID'),
    p_request_sha256: requiredSha256(
      input.requestSha256,
      'operator-resolution request fingerprint',
    ),
    p_task_set_sha256: requiredSha256(
      input.plan.taskSetSha256,
      'operator-resolution expected task-set fingerprint',
    ),
    p_evidence_sha256: requiredSha256(
      input.plan.evidenceSha256,
      'operator-resolution expected evidence fingerprint',
    ),
    p_actor_user_id: requiredUuid(input.actorUserId, 'operator-resolution actor user ID'),
  };
}

/**
 * Service-role RPC adapter. Resolution tables remain inaccessible directly,
 * but this adapter is not an operator-authorization boundary.
 */
export class SupabaseDirectCheckoutLateSuccessOperatorResolutionStore
implements DirectCheckoutLateSuccessOperatorResolutionStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async plan(
    scope: DirectCheckoutLateSuccessOperatorResolutionScope,
    action: DirectCheckoutLateSuccessOperatorAction,
  ): Promise<DirectCheckoutLateSuccessOperatorResolutionPlan> {
    const normalizedScope = normalizeScope(scope);
    const normalizedAction = requiredAction(action, 'operator-resolution action');
    const { data, error } = await this.admin.rpc(
      'plan_direct_checkout_late_success_operator_resolution',
      {
        p_account_id: normalizedScope.accountId,
        p_payment_id: normalizedScope.paymentId,
        p_task_id: normalizedScope.taskId,
        p_action: normalizedAction,
      },
    );
    if (error) throw rpcFailure(error);
    return parsePlan(data, normalizedScope, normalizedAction);
  }

  async settle(
    input: DirectCheckoutLateSuccessOperatorMutationInput,
  ): Promise<DirectCheckoutLateSuccessOperatorResolutionResult> {
    const validatedPlan = validateMutationPlan(input.plan);
    if (
      validatedPlan.action !== 'settle_paid_predecessor'
      || validatedPlan.decisionCode !== 'accept_single_late_paid_predecessor'
      || validatedPlan.eligible !== true
    ) {
      throw new Error('Operator-resolution plan does not permit settlement.');
    }
    const validatedInput = { ...input, plan: validatedPlan };
    const { data, error } = await this.admin.rpc(
      'settle_direct_checkout_late_success_task',
      mutationParameters(validatedInput),
    );
    if (error) throw rpcFailure(error);
    return parseMutationResult(data, validatedPlan, 'settle');
  }

  async retainHold(
    input: DirectCheckoutLateSuccessOperatorMutationInput & {
      disposition: DirectCheckoutLateSuccessManualDisposition;
    },
  ): Promise<DirectCheckoutLateSuccessOperatorResolutionResult> {
    const validatedPlan = validateMutationPlan(input.plan);
    if (
      validatedPlan.action !== 'retain_hold'
      || validatedPlan.decisionCode !== 'retain_operator_hold'
      || validatedPlan.eligible !== true
    ) {
      throw new Error('Operator-resolution plan does not permit a manual disposition.');
    }
    const validatedInput = { ...input, plan: validatedPlan };
    const { data, error } = await this.admin.rpc(
      'record_direct_checkout_late_success_manual_disposition',
      {
        ...mutationParameters(validatedInput),
        p_disposition_reason: requiredDisposition(input.disposition),
      },
    );
    if (error) throw rpcFailure(error);
    return parseMutationResult(data, validatedPlan, 'retain_hold');
  }
}
