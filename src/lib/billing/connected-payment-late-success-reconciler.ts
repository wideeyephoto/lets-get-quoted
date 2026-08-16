import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import {
  DIRECT_CHARGE_CURRENCY,
  DIRECT_CHARGE_METADATA_KEYS,
  DIRECT_CHARGE_MODEL,
  expireDirectCheckoutSession,
  retrieveDirectCheckoutSession,
} from '@/lib/billing/stripe-direct';
import type { ConnectedPaymentProjection } from '@/lib/billing/connected-payment-event-projector';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const PAYMENT_INTENT_ID_PATTERN = /^pi_[A-Za-z0-9_]+$/;

export const LATE_SUCCESS_OBSERVATION_SCHEMA =
  'direct_checkout_late_success_successor_observation_v1' as const;

export type ConnectedPaymentLateSuccessPlan = Readonly<{
  projectionKind: 'late_predecessor';
  taskId: string;
  taskClaimToken: string;
  workspaceId: string;
  paymentId: string;
  merchantAccountId: string;
  livemode: boolean;
  paidOperationPk: string;
  paidOperationId: string;
  paidCheckoutSessionId: string;
  paidCheckoutGeneration: number;
  amountCents: number;
  applicationFeeCents: number;
  reconciliationStatus: 'pending' | 'reconciled';
}>;

export type ConnectedPaymentLateSuccessPrepareResult = Readonly<{
  action: 'retrieve_then_expire' | 'successor_neutralized' | 'manual_review';
  taskState: 'leased' | 'successor_neutralized' | 'manual_review';
  reasonCode: string;
  currentOperationPk: string;
  currentOperationId: string;
  currentCheckoutGeneration: number;
  currentCheckoutSessionId: string | null;
  currentCheckoutSessionExpiresAt: string | null;
  expireOperationId: string;
}>;

export type ConnectedPaymentLateSuccessObservation = Readonly<{
  schema: typeof LATE_SUCCESS_OBSERVATION_SCHEMA;
  source: 'retrieve' | 'post_expire_retrieve' | 'post_error_retrieve';
  checkout_session_id: string;
  session_status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_intent_id: string | null;
  observed_at: string;
}>;

export type ConnectedPaymentLateSuccessResult = Readonly<{
  status: 'manual_reconciliation';
  billingEventId: string;
  taskId: string;
  taskState: 'successor_neutralized' | 'manual_review';
  reasonCode: string;
}>;

export interface ConnectedPaymentLateSuccessStore {
  prepare(input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    projection: ConnectedPaymentProjection;
  }): Promise<ConnectedPaymentLateSuccessPrepareResult>;
  finalize(input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    outcome: 'successor_neutralized' | 'manual_review';
    reasonCode: string;
    observation: ConnectedPaymentLateSuccessObservation | null;
  }): Promise<ConnectedPaymentLateSuccessResult>;
  fail(input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void>;
}

type RpcError = Readonly<{ code?: string }>;

class ConnectedPaymentLateSuccessRpcError extends Error {
  constructor(readonly rpcCode: string | null) {
    super('Connected payment late-success RPC failed.');
    this.name = 'ConnectedPaymentLateSuccessRpcError';
  }
}

function rpcFailure(error: RpcError | null): ConnectedPaymentLateSuccessRpcError {
  const code = typeof error?.code === 'string' && error.code.trim()
    ? error.code.trim().toUpperCase()
    : null;
  return new ConnectedPaymentLateSuccessRpcError(code);
}

function rowRecord(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label} returned no row.`);
  }
  return row as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredUuid(value: unknown, label: string): string {
  return requiredString(value, label, UUID_PATTERN).toLowerCase();
}

function requiredOperationId(value: unknown, label: string): string {
  const operationId = requiredString(value, label);
  if (
    operationId.length > 200
    || [...operationId].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return operationId;
}

function optionalString(value: unknown, label: string, pattern?: RegExp): string | null {
  return value == null ? null : requiredString(value, label, pattern);
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function requiredTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || parsed <= Date.UTC(2000, 0, 1)) {
    throw new Error(`${label} is invalid.`);
  }
  return new Date(parsed).toISOString();
}

function parsePrepareResult(
  value: unknown,
  plan: ConnectedPaymentLateSuccessPlan,
): ConnectedPaymentLateSuccessPrepareResult {
  const row = rowRecord(value, 'Connected payment late-success prepare RPC');
  const action = requiredString(row.resolution_action, 'late-success resolution action');
  const taskState = requiredString(row.task_state, 'late-success task state');
  if (
    !['retrieve_then_expire', 'successor_neutralized', 'manual_review'].includes(action)
    || !['leased', 'successor_neutralized', 'manual_review'].includes(taskState)
    || (action === 'retrieve_then_expire') !== (taskState === 'leased')
  ) {
    throw new Error('Connected payment late-success prepare outcome is invalid.');
  }
  const currentCheckoutSessionId = optionalString(
    row.current_checkout_session_id,
    'late-success current Checkout Session ID',
    CHECKOUT_SESSION_ID_PATTERN,
  );
  const currentCheckoutSessionExpiresAt = row.current_checkout_session_expires_at == null
    ? null
    : requiredTimestamp(
      row.current_checkout_session_expires_at,
      'late-success current Checkout Session expiry',
    );
  if (
    action === 'retrieve_then_expire'
    && (!currentCheckoutSessionId || !currentCheckoutSessionExpiresAt)
  ) {
    throw new Error('Connected payment late-success provider action is missing its Session.');
  }
  const currentOperationPk = requiredUuid(
    row.current_operation_pk,
    'late-success current operation PK',
  );
  const currentCheckoutGeneration = requiredInteger(
    row.current_checkout_generation,
    'late-success current generation',
    1,
  );
  const currentOperationId = requiredOperationId(
    row.current_operation_id,
    'late-success current operation ID',
  );
  const expectedOperationId =
    `payment:${plan.paymentId}:checkout:${currentCheckoutGeneration}`;
  const expectedExpireOperationId =
    `payment:${plan.paymentId}:late-success:${plan.paidCheckoutGeneration}`
    + `:successor:${currentCheckoutGeneration}:expire`;
  const expireOperationId = requiredOperationId(
    row.expire_operation_id,
    'late-success expiration operation ID',
  );
  if (
    currentCheckoutGeneration > 5
    || currentOperationId !== expectedOperationId
    || expireOperationId !== expectedExpireOperationId
    || (
      action !== 'manual_review'
      && (
        currentCheckoutGeneration <= plan.paidCheckoutGeneration
        || currentOperationPk === plan.paidOperationPk
        || currentCheckoutSessionId === plan.paidCheckoutSessionId
      )
    )
  ) {
    throw new Error('Connected payment late-success successor identity is invalid.');
  }
  return Object.freeze({
    action: action as ConnectedPaymentLateSuccessPrepareResult['action'],
    taskState: taskState as ConnectedPaymentLateSuccessPrepareResult['taskState'],
    reasonCode: requiredString(row.reason_code, 'late-success reason code', /^[a-z][a-z0-9_]{2,63}$/),
    currentOperationPk,
    currentOperationId,
    currentCheckoutGeneration,
    currentCheckoutSessionId,
    currentCheckoutSessionExpiresAt,
    expireOperationId,
  });
}

function parseFinalResult(
  value: unknown,
  billingEventId: string,
  taskId: string,
  expectedOutcome: 'successor_neutralized' | 'manual_review',
  expectedReasonCode: string,
): ConnectedPaymentLateSuccessResult {
  const row = rowRecord(value, 'Connected payment late-success finalize RPC');
  const taskState = requiredString(row.task_state, 'late-success final task state');
  if (
    (taskState !== 'successor_neutralized' && taskState !== 'manual_review')
    || taskState !== expectedOutcome
  ) {
    throw new Error('Connected payment late-success finalize state is invalid.');
  }
  if (requiredString(row.processing_status, 'late-success event status') !== 'processed') {
    throw new Error('Connected payment late-success event was not terminalized.');
  }
  if (
    requiredUuid(row.billing_event_id, 'late-success billing event ID') !== billingEventId
    || requiredUuid(row.task_id, 'late-success task ID') !== taskId
  ) {
    throw new Error('Connected payment late-success finalize identity changed.');
  }
  const reasonCode = requiredString(
    row.reason_code,
    'late-success final reason code',
    /^[a-z][a-z0-9_]{2,63}$/,
  );
  const projectionResult = requiredString(
    row.projection_result,
    'late-success projection result',
  );
  const expectedProjectionResult = reasonCode === 'successor_additional_paid_truth'
    || reasonCode === 'additional_paid_truth_operator_required'
    ? 'direct_payment_additional_paid_truth_manual_review'
    : expectedOutcome === 'successor_neutralized'
      ? 'direct_payment_late_success_resolution_pending'
      : 'direct_payment_late_success_manual_review';
  if (
    reasonCode !== expectedReasonCode
    || row.projection_applied !== false
    || projectionResult !== expectedProjectionResult
  ) {
    throw new Error('Connected payment late-success final disposition changed.');
  }
  return Object.freeze({
    status: 'manual_reconciliation',
    billingEventId,
    taskId,
    taskState,
    reasonCode,
  });
}

export class SupabaseConnectedPaymentLateSuccessStore
implements ConnectedPaymentLateSuccessStore {
  constructor(private readonly admin = createAdminClient()) {}

  async prepare(input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    projection: ConnectedPaymentProjection;
  }): Promise<ConnectedPaymentLateSuccessPrepareResult> {
    const { data, error } = await this.admin.rpc(
      'prepare_stripe_connected_checkout_late_success_resolution',
      {
        p_task_id: requiredUuid(input.plan.taskId, 'late-success task ID'),
        p_task_claim_token: requiredUuid(input.plan.taskClaimToken, 'late-success task claim token'),
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_event_claim_token: requiredUuid(input.eventClaimToken, 'event claim token'),
        p_paid_projection: input.projection,
      },
    );
    if (error) throw rpcFailure(error);
    return parsePrepareResult(data, input.plan);
  }

  async finalize(input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    outcome: 'successor_neutralized' | 'manual_review';
    reasonCode: string;
    observation: ConnectedPaymentLateSuccessObservation | null;
  }): Promise<ConnectedPaymentLateSuccessResult> {
    const { data, error } = await this.admin.rpc(
      'finalize_stripe_connected_checkout_late_success_resolution',
      {
        p_task_id: requiredUuid(input.plan.taskId, 'late-success task ID'),
        p_task_claim_token: requiredUuid(input.plan.taskClaimToken, 'late-success task claim token'),
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_event_claim_token: requiredUuid(input.eventClaimToken, 'event claim token'),
        p_outcome: input.outcome,
        p_reason_code: requiredString(input.reasonCode, 'late-success reason code', /^[a-z][a-z0-9_]{2,63}$/),
        p_successor_observation: input.observation,
      },
    );
    if (error) throw rpcFailure(error);
    return parseFinalResult(
      data,
      input.billingEventId,
      input.plan.taskId,
      input.outcome,
      input.reasonCode,
    );
  }

  async fail(input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc(
      'fail_stripe_connected_checkout_late_success_resolution',
      {
        p_task_id: requiredUuid(input.plan.taskId, 'late-success task ID'),
        p_task_claim_token: requiredUuid(input.plan.taskClaimToken, 'late-success task claim token'),
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_event_claim_token: requiredUuid(input.eventClaimToken, 'event claim token'),
        p_error_code: requiredString(input.errorCode, 'late-success error code', /^[a-z][a-z0-9_]{2,63}$/),
        p_retryable: input.retryable,
        p_next_attempt_at: input.nextAttemptAt,
      },
    );
    if (error) throw rpcFailure(error);
    if (data !== true) throw new Error('Connected payment late-success failure was not acknowledged.');
  }
}

export class ConnectedPaymentLateSuccessProviderError extends Error {
  override readonly name = 'ConnectedPaymentLateSuccessProviderError';

  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

type ProviderDependencies = Readonly<{
  retrieve(input: {
    merchantAccountId: string;
    checkoutSessionId: string;
  }): Promise<Stripe.Checkout.Session>;
  expire(input: {
    merchantAccountId: string;
    checkoutSessionId: string;
    operationId: string;
  }): Promise<Stripe.Checkout.Session>;
  now(): Date;
}>;

function defaultProviderDependencies(): ProviderDependencies {
  return Object.freeze({
    retrieve: retrieveDirectCheckoutSession,
    expire: expireDirectCheckoutSession,
    now: () => new Date(),
  });
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (session.payment_intent == null) return null;
  const id = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent.id;
  return PAYMENT_INTENT_ID_PATTERN.test(id) ? id : null;
}

function exactSuccessorSession(
  session: Stripe.Checkout.Session,
  plan: ConnectedPaymentLateSuccessPlan,
  prepared: ConnectedPaymentLateSuccessPrepareResult,
): boolean {
  const metadata = session.metadata ?? {};
  return Boolean(
    prepared.currentCheckoutSessionId
    && prepared.currentCheckoutSessionExpiresAt
    && session.id === prepared.currentCheckoutSessionId
    && session.object === 'checkout.session'
    && session.livemode === plan.livemode
    && session.mode === 'payment'
    && session.currency === DIRECT_CHARGE_CURRENCY
    && session.amount_total === plan.amountCents
    && session.amount_subtotal === plan.amountCents
    && Array.isArray(session.payment_method_types)
    && session.payment_method_types.length === 1
    && session.payment_method_types[0] === 'card'
    && Number.isSafeInteger(session.expires_at)
    && new Date(session.expires_at * 1_000).toISOString()
      === prepared.currentCheckoutSessionExpiresAt
    && session.recovered_from == null
    && session.after_expiration?.recovery == null
    && metadata[DIRECT_CHARGE_METADATA_KEYS.chargeModel] === DIRECT_CHARGE_MODEL
    && metadata[DIRECT_CHARGE_METADATA_KEYS.merchantAccountId] === plan.merchantAccountId
    && metadata[DIRECT_CHARGE_METADATA_KEYS.operationId] === prepared.currentOperationId
    && metadata.lgq_workspace_id?.toLowerCase() === plan.workspaceId
    && metadata.lgq_payment_id?.toLowerCase() === plan.paymentId
    && metadata.lgq_checkout_generation === String(prepared.currentCheckoutGeneration)
    && (
      session.payment_intent == null
      || paymentIntentId(session) !== null
    )
  );
}

function observation(
  session: Stripe.Checkout.Session,
  source: ConnectedPaymentLateSuccessObservation['source'],
  now: Date,
): ConnectedPaymentLateSuccessObservation {
  if (
    !session.status
    || !['open', 'complete', 'expired'].includes(session.status)
    || !['paid', 'unpaid', 'no_payment_required'].includes(session.payment_status)
  ) {
    throw new Error('Late-success successor status is invalid.');
  }
  return Object.freeze({
    schema: LATE_SUCCESS_OBSERVATION_SCHEMA,
    source,
    checkout_session_id: session.id,
    session_status: session.status,
    payment_status: session.payment_status,
    payment_intent_id: paymentIntentId(session),
    observed_at: now.toISOString(),
  });
}

function providerOutcome(session: Stripe.Checkout.Session): Readonly<{
  outcome: 'successor_neutralized' | 'manual_review';
  reasonCode: string;
}> {
  if (session.status === 'expired' && session.payment_status === 'unpaid') {
    return { outcome: 'successor_neutralized', reasonCode: 'successor_expired_unpaid' };
  }
  if (session.status === 'complete' && session.payment_status === 'paid') {
    return { outcome: 'manual_review', reasonCode: 'successor_additional_paid_truth' };
  }
  return { outcome: 'manual_review', reasonCode: 'successor_unexpireable_state' };
}

export type ConnectedPaymentLateSuccessDependencies = Readonly<{
  store: ConnectedPaymentLateSuccessStore;
  provider: ProviderDependencies;
}>;

export async function reconcileConnectedPaymentLateSuccess(
  input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    projection: ConnectedPaymentProjection;
  },
  injected?: Partial<ConnectedPaymentLateSuccessDependencies>,
): Promise<ConnectedPaymentLateSuccessResult> {
  const dependencies = {
    store: injected?.store ?? new SupabaseConnectedPaymentLateSuccessStore(),
    provider: injected?.provider ?? defaultProviderDependencies(),
  };
  const prepared = await dependencies.store.prepare(input);

  if (prepared.action !== 'retrieve_then_expire') {
    const outcome = prepared.action === 'successor_neutralized'
      ? 'successor_neutralized' as const
      : 'manual_review' as const;
    return dependencies.store.finalize({
      billingEventId: input.billingEventId,
      eventClaimToken: input.eventClaimToken,
      plan: input.plan,
      outcome,
      reasonCode: prepared.reasonCode,
      observation: null,
    });
  }

  let first: Stripe.Checkout.Session;
  try {
    first = await dependencies.provider.retrieve({
      merchantAccountId: input.plan.merchantAccountId,
      checkoutSessionId: prepared.currentCheckoutSessionId!,
    });
  } catch {
    throw new ConnectedPaymentLateSuccessProviderError(
      'late_success_successor_retrieve_failed',
      true,
    );
  }
  if (!exactSuccessorSession(first, input.plan, prepared)) {
    return dependencies.store.finalize({
      billingEventId: input.billingEventId,
      eventClaimToken: input.eventClaimToken,
      plan: input.plan,
      outcome: 'manual_review',
      reasonCode: 'successor_contract_mismatch',
      observation: null,
    });
  }

  if (!(first.status === 'open' && first.payment_status === 'unpaid')) {
    const classified = providerOutcome(first);
    return dependencies.store.finalize({
      billingEventId: input.billingEventId,
      eventClaimToken: input.eventClaimToken,
      plan: input.plan,
      ...classified,
      observation: observation(first, 'retrieve', dependencies.provider.now()),
    });
  }

  let source: ConnectedPaymentLateSuccessObservation['source'] = 'post_expire_retrieve';
  try {
    await dependencies.provider.expire({
      merchantAccountId: input.plan.merchantAccountId,
      checkoutSessionId: prepared.currentCheckoutSessionId!,
      operationId: prepared.expireOperationId,
    });
  } catch {
    source = 'post_error_retrieve';
  }

  let after: Stripe.Checkout.Session;
  try {
    after = await dependencies.provider.retrieve({
      merchantAccountId: input.plan.merchantAccountId,
      checkoutSessionId: prepared.currentCheckoutSessionId!,
    });
  } catch {
    throw new ConnectedPaymentLateSuccessProviderError(
      'late_success_successor_expire_indeterminate',
      true,
    );
  }
  if (!exactSuccessorSession(after, input.plan, prepared)) {
    return dependencies.store.finalize({
      billingEventId: input.billingEventId,
      eventClaimToken: input.eventClaimToken,
      plan: input.plan,
      outcome: 'manual_review',
      reasonCode: 'successor_contract_mismatch',
      observation: null,
    });
  }
  if (after.status === 'open' && after.payment_status === 'unpaid') {
    throw new ConnectedPaymentLateSuccessProviderError(
      'late_success_successor_expire_indeterminate',
      true,
    );
  }
  const classified = providerOutcome(after);
  return dependencies.store.finalize({
    billingEventId: input.billingEventId,
    eventClaimToken: input.eventClaimToken,
    plan: input.plan,
    ...classified,
    observation: observation(after, source, dependencies.provider.now()),
  });
}
