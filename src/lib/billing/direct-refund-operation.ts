import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import {
  buildDirectApplicationFeeRefundCall,
  buildDirectRefundCall,
  buildDirectRequestFingerprint,
  createDirectApplicationFeeRefund,
  createDirectRefund,
  type DirectApplicationFeeRefundInput,
  type DirectRefundInput,
} from '@/lib/billing/stripe-direct';

/**
 * DARK direct-charge refund state machine.
 *
 * Active refund routes intentionally do not import this module. Money amounts
 * come only from an immutable database authorization produced by a future
 * server policy; this boundary accepts IDs, never caller-supplied cents.
 */

const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_\S{8,}$/;
const REFUND_ID_PATTERN = /^re_[A-Za-z0-9_]+$/;
const FEE_REFUND_ID_PATTERN = /^fr_[A-Za-z0-9_]+$/;
const REFUND_REASONS = new Set<Stripe.RefundCreateParams.Reason>([
  'duplicate',
  'fraudulent',
  'requested_by_customer',
]);

export type DirectRefundOperationInput = Readonly<{
  accountId: string;
  paymentId: string;
  merchantAccountId: string;
  livemode: boolean;
  authorizationId: string;
  /** Stable business identity. Cents are resolved from authorizationId by RPC. */
  operationId: string;
}>;

export type DirectRefundMode = 'full_combined' | 'split';

export type DirectRefundPlan = Readonly<{
  authorizationId: string;
  allocationPolicy: string;
  allocationVersion: string;
  allocationFingerprint: string;
  paymentIntentId: string;
  chargeId: string;
  applicationFeeId: string | null;
  reason: Stripe.RefundCreateParams.Reason;
  refundMode: DirectRefundMode;
  grossRefundCents: number;
  eligibleServiceRefundCents: number;
  cumulativeGrossBeforeCents: number;
  cumulativeGrossAfterCents: number;
  cumulativeEligibleBeforeCents: number;
  cumulativeEligibleAfterCents: number;
  applicationFeeTotalCents: number;
  applicationFeeRefundBeforeCents: number;
  applicationFeeRefundAfterCents: number;
  applicationFeeRefundCents: number;
}>;

export type DirectRefundClaimStatus =
  | 'claimed'
  | 'fee_ready'
  | 'replay'
  | 'in_progress'
  | 'submitted'
  | 'failed'
  | 'indeterminate';

export type ProviderResultSnapshot = Readonly<Record<string, unknown>>;

export type DirectRefundClaim = Readonly<{
  status: DirectRefundClaimStatus;
  operationPk: string;
  claimToken: string | null;
  operationState: 'claimed' | 'submitted' | 'succeeded' | 'failed' | 'indeterminate';
  phase: 'charge_ready' | 'charge_submitted' | 'fee_ready' | 'fee_submitted' | 'succeeded' | 'failed' | 'indeterminate';
  plan: DirectRefundPlan;
  refundId: string | null;
  refundResult: ProviderResultSnapshot | null;
  applicationFeeRefundId: string | null;
  applicationFeeRefundResult: ProviderResultSnapshot | null;
}>;

export type DirectRefundClaimInput = Readonly<{
  operation: DirectRefundOperationInput;
  plan: DirectRefundPlan;
  chargeOperationId: string;
  chargeIdempotencyKey: string;
  chargeRequestFingerprint: string;
  applicationFeeOperationId: string | null;
  applicationFeeIdempotencyKey: string | null;
  applicationFeeRequestFingerprint: string | null;
  operationFingerprint: string;
}>;

export interface DirectRefundOperationStore {
  loadPlan(input: DirectRefundOperationInput): Promise<DirectRefundPlan>;
  claim(input: DirectRefundClaimInput): Promise<DirectRefundClaim>;
  beginChargeSubmission(input: { operationPk: string; claimToken: string }): Promise<void>;
  recordChargeResult(input: {
    operationPk: string;
    claimToken: string;
    refundId: string;
    result: ProviderResultSnapshot;
  }): Promise<Readonly<{
    nextAction: 'complete' | 'fee_ready' | 'reconcile' | 'failed';
    claimToken: string | null;
  }>>;
  beginApplicationFeeSubmission(input: { operationPk: string; claimToken: string }): Promise<void>;
  completeApplicationFeeRefund(input: {
    operationPk: string;
    claimToken: string;
    feeRefundId: string;
    result: ProviderResultSnapshot;
  }): Promise<void>;
  markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    error: string;
  }): Promise<void>;
}

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(label: string, error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`${label}: ${detail}`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label} returned no row.`);
  }
  return row as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  return value == null ? null : requireString(value, label);
}

function requireInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is not a safe integer.`);
  return parsed;
}

function optionalProviderResult(value: unknown, label: string): ProviderResultSnapshot | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is not an object.`);
  return Object.freeze({ ...(value as Record<string, unknown>) });
}

function parsePlan(row: Record<string, unknown>, label: string): DirectRefundPlan {
  const reason = requireString(row.refund_reason, `${label} reason`);
  if (!REFUND_REASONS.has(reason as Stripe.RefundCreateParams.Reason)) {
    throw new Error(`${label} returned an unsupported Stripe refund reason.`);
  }
  const refundMode = requireString(row.refund_mode, `${label} mode`);
  if (refundMode !== 'full_combined' && refundMode !== 'split') {
    throw new Error(`${label} returned an unsupported refund mode.`);
  }

  return Object.freeze({
    authorizationId: requireString(row.authorization_id, `${label} authorization ID`),
    allocationPolicy: requireString(row.allocation_policy, `${label} allocation policy`),
    allocationVersion: requireString(row.allocation_version, `${label} allocation version`),
    allocationFingerprint: requireString(row.allocation_fingerprint, `${label} allocation fingerprint`),
    paymentIntentId: requireString(row.stripe_payment_intent_id, `${label} PaymentIntent ID`),
    chargeId: requireString(row.stripe_charge_id, `${label} charge ID`),
    applicationFeeId: optionalString(row.stripe_application_fee_id, `${label} Application Fee ID`),
    reason: reason as Stripe.RefundCreateParams.Reason,
    refundMode,
    grossRefundCents: requireInteger(row.gross_refund_cents, `${label} gross refund cents`),
    eligibleServiceRefundCents: requireInteger(
      row.eligible_service_refund_cents,
      `${label} eligible-service refund cents`,
    ),
    cumulativeGrossBeforeCents: requireInteger(
      row.cumulative_gross_before_cents,
      `${label} cumulative gross before cents`,
    ),
    cumulativeGrossAfterCents: requireInteger(
      row.cumulative_gross_after_cents,
      `${label} cumulative gross after cents`,
    ),
    cumulativeEligibleBeforeCents: requireInteger(
      row.cumulative_eligible_before_cents,
      `${label} cumulative eligible before cents`,
    ),
    cumulativeEligibleAfterCents: requireInteger(
      row.cumulative_eligible_after_cents,
      `${label} cumulative eligible after cents`,
    ),
    applicationFeeTotalCents: requireInteger(
      row.application_fee_total_cents,
      `${label} Application Fee total cents`,
    ),
    applicationFeeRefundBeforeCents: requireInteger(
      row.application_fee_refund_before_cents,
      `${label} Application Fee refund before cents`,
    ),
    applicationFeeRefundAfterCents: requireInteger(
      row.application_fee_refund_after_cents,
      `${label} Application Fee refund after cents`,
    ),
    applicationFeeRefundCents: requireInteger(
      row.application_fee_refund_cents,
      `${label} Application Fee refund cents`,
    ),
  });
}

const CLAIM_STATUSES = new Set<DirectRefundClaimStatus>([
  'claimed',
  'fee_ready',
  'replay',
  'in_progress',
  'submitted',
  'failed',
  'indeterminate',
]);
const OPERATION_STATES = new Set<DirectRefundClaim['operationState']>([
  'claimed',
  'submitted',
  'succeeded',
  'failed',
  'indeterminate',
]);
const PHASES = new Set<DirectRefundClaim['phase']>([
  'charge_ready',
  'charge_submitted',
  'fee_ready',
  'fee_submitted',
  'succeeded',
  'failed',
  'indeterminate',
]);

function parseClaim(value: unknown): DirectRefundClaim {
  const row = requireRecord(value, 'Direct refund claim');
  const status = requireString(row.claim_status, 'Direct refund claim status');
  const operationState = requireString(row.operation_state, 'Direct refund operation state');
  const phase = requireString(row.operation_phase, 'Direct refund operation phase');
  if (!CLAIM_STATUSES.has(status as DirectRefundClaimStatus)) {
    throw new Error(`Direct refund claim returned unsupported status: ${status}.`);
  }
  if (!OPERATION_STATES.has(operationState as DirectRefundClaim['operationState'])) {
    throw new Error(`Direct refund claim returned unsupported state: ${operationState}.`);
  }
  if (!PHASES.has(phase as DirectRefundClaim['phase'])) {
    throw new Error(`Direct refund claim returned unsupported phase: ${phase}.`);
  }

  const claimToken = optionalString(row.claim_token, 'Direct refund claim token');
  if ((status === 'claimed' || status === 'fee_ready') && !claimToken) {
    throw new Error('Direct refund database claim did not return its owner token.');
  }

  return Object.freeze({
    status: status as DirectRefundClaimStatus,
    operationPk: requireString(row.operation_pk, 'Direct refund operation primary key'),
    claimToken,
    operationState: operationState as DirectRefundClaim['operationState'],
    phase: phase as DirectRefundClaim['phase'],
    plan: parsePlan(row, 'Direct refund claim'),
    refundId: optionalString(row.stripe_refund_id, 'Direct refund provider ID'),
    refundResult: optionalProviderResult(row.stripe_refund_result, 'Direct refund provider result'),
    applicationFeeRefundId: optionalString(
      row.stripe_application_fee_refund_id,
      'Direct Application Fee Refund provider ID',
    ),
    applicationFeeRefundResult: optionalProviderResult(
      row.stripe_application_fee_refund_result,
      'Direct Application Fee Refund provider result',
    ),
  });
}

function planRpcParameters(input: DirectRefundOperationInput) {
  return {
    p_account_id: input.accountId,
    p_payment_id: input.paymentId,
    p_stripe_account_id: input.merchantAccountId,
    p_livemode: input.livemode,
    p_authorization_id: input.authorizationId,
    p_operation_id: input.operationId,
  };
}

/** Service-role implementation. Direct table mutation is revoked by migration. */
export class SupabaseDirectRefundOperationStore implements DirectRefundOperationStore {
  constructor(private readonly admin = createAdminClient()) {}

  async loadPlan(input: DirectRefundOperationInput): Promise<DirectRefundPlan> {
    const { data, error } = await this.admin.rpc('plan_direct_charge_refund_operation', planRpcParameters(input));
    if (error) throw rpcFailure('Unable to load direct refund authorization', error);
    return parsePlan(requireRecord(data, 'Direct refund plan'), 'Direct refund plan');
  }

  async claim(input: DirectRefundClaimInput): Promise<DirectRefundClaim> {
    const plan = input.plan;
    const { data, error } = await this.admin.rpc('claim_direct_charge_refund_operation', {
      ...planRpcParameters(input.operation),
      p_expected_allocation_fingerprint: plan.allocationFingerprint,
      p_expected_gross_refund_cents: plan.grossRefundCents,
      p_expected_eligible_service_refund_cents: plan.eligibleServiceRefundCents,
      p_expected_cumulative_gross_before_cents: plan.cumulativeGrossBeforeCents,
      p_expected_cumulative_eligible_before_cents: plan.cumulativeEligibleBeforeCents,
      p_charge_operation_id: input.chargeOperationId,
      p_charge_idempotency_key: input.chargeIdempotencyKey,
      p_charge_request_fingerprint: input.chargeRequestFingerprint,
      p_application_fee_operation_id: input.applicationFeeOperationId,
      p_application_fee_idempotency_key: input.applicationFeeIdempotencyKey,
      p_application_fee_request_fingerprint: input.applicationFeeRequestFingerprint,
      p_operation_fingerprint: input.operationFingerprint,
    });
    if (error) throw rpcFailure('Unable to claim direct refund operation', error);
    return parseClaim(data);
  }

  async beginChargeSubmission(input: { operationPk: string; claimToken: string }): Promise<void> {
    const { data, error } = await this.admin.rpc('begin_direct_charge_refund_submission', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
    });
    if (error) throw rpcFailure('Unable to begin direct charge refund submission', error);
    if (data !== true) throw new Error('Direct charge refund begin RPC did not confirm the transition.');
  }

  async recordChargeResult(input: {
    operationPk: string;
    claimToken: string;
    refundId: string;
    result: ProviderResultSnapshot;
  }): Promise<Readonly<{
    nextAction: 'complete' | 'fee_ready' | 'reconcile' | 'failed';
    claimToken: string | null;
  }>> {
    const { data, error } = await this.admin.rpc('record_direct_charge_refund_result', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_stripe_refund_id: input.refundId,
      p_stripe_refund_result: input.result,
    });
    if (error) throw rpcFailure('Unable to record direct charge refund result', error);
    const row = requireRecord(data, 'Direct charge refund result');
    const nextAction = requireString(row.next_action, 'Direct charge refund next action');
    if (!['complete', 'fee_ready', 'reconcile', 'failed'].includes(nextAction)) {
      throw new Error(`Direct charge refund returned unsupported next action: ${nextAction}.`);
    }
    const claimToken = optionalString(row.claim_token, 'Direct Application Fee Refund claim token');
    if (nextAction === 'fee_ready' && !claimToken) {
      throw new Error('Direct Application Fee Refund step did not return its owner token.');
    }
    return Object.freeze({
      nextAction: nextAction as 'complete' | 'fee_ready' | 'reconcile' | 'failed',
      claimToken,
    });
  }

  async beginApplicationFeeSubmission(input: { operationPk: string; claimToken: string }): Promise<void> {
    const { data, error } = await this.admin.rpc('begin_direct_application_fee_refund_submission', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
    });
    if (error) throw rpcFailure('Unable to begin direct Application Fee Refund submission', error);
    if (data !== true) throw new Error('Direct Application Fee Refund begin RPC did not confirm the transition.');
  }

  async completeApplicationFeeRefund(input: {
    operationPk: string;
    claimToken: string;
    feeRefundId: string;
    result: ProviderResultSnapshot;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('complete_direct_application_fee_refund_operation', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_stripe_application_fee_refund_id: input.feeRefundId,
      p_stripe_application_fee_refund_result: input.result,
    });
    if (error) throw rpcFailure('Unable to complete direct Application Fee Refund operation', error);
    if (data !== true) throw new Error('Direct Application Fee Refund completion RPC did not confirm the transition.');
  }

  async markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    error: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('mark_direct_charge_refund_indeterminate', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_last_error: input.error,
    });
    if (error) throw rpcFailure('Unable to mark direct refund operation indeterminate', error);
    if (data !== true) throw new Error('Direct refund indeterminate RPC did not confirm the transition.');
  }
}

export type DirectRefundOperationDependencies = Readonly<{
  store: DirectRefundOperationStore;
  createRefund(input: DirectRefundInput): Promise<Stripe.Refund>;
  createApplicationFeeRefund(input: DirectApplicationFeeRefundInput): Promise<Stripe.FeeRefund>;
}>;

export type DirectRefundOperationResult = Readonly<{
  outcome: 'created' | 'replayed' | 'fee_resumed';
  operationPk: string;
  refundId: string;
  refundResult: ProviderResultSnapshot;
  applicationFeeRefundId: string | null;
  applicationFeeRefundResult: ProviderResultSnapshot | null;
}>;

export class DirectRefundOperationUnavailableError extends Error {
  override readonly name = 'DirectRefundOperationUnavailableError';

  constructor(readonly operationState: string, readonly phase?: string) {
    super(`Direct refund operation is ${operationState}${phase ? ` (${phase})` : ''}; no new Stripe request was sent.`);
  }
}

export class DirectRefundOperationIndeterminateError extends Error {
  override readonly name = 'DirectRefundOperationIndeterminateError';

  constructor(
    message: string,
    readonly providerError: unknown,
    readonly persistenceError?: unknown,
  ) {
    super(message);
  }
}

export class DirectRefundOperationPersistenceError extends Error {
  override readonly name = 'DirectRefundOperationPersistenceError';

  constructor(readonly persistenceError: unknown) {
    super('A Stripe refund mutation returned, but durable persistence was not confirmed; do not submit it again.');
  }
}

export class DirectRefundProviderTerminalError extends Error {
  override readonly name = 'DirectRefundProviderTerminalError';

  constructor(readonly refundId: string, readonly result: ProviderResultSnapshot) {
    super(`Stripe refund ${refundId} returned a terminal failed/canceled result; the authorization was not reapplied.`);
  }
}

function errorForAudit(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2000);
  if (typeof error === 'string') return error.slice(0, 2000);
  return 'Stripe refund submission failed with a non-Error value; outcome is unknown.';
}

function requireConfiguredStripeMode(livemode: boolean): void {
  if (typeof livemode !== 'boolean') throw new Error('Direct refund livemode must be explicit.');
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(key);
  if (!match) throw new Error('STRIPE_SECRET_KEY is missing or does not declare test/live mode.');
  if ((match[1] === 'live') !== livemode) {
    throw new Error('Direct refund livemode does not match the configured Stripe secret key.');
  }
}

function validateOperationIdentity(operationId: string): string {
  const normalized = operationId.trim();
  if (!normalized || normalized.length > 160 || /\p{Cc}/u.test(normalized)) {
    throw new Error('Direct refund operationId must contain 1-160 non-control characters.');
  }
  return normalized;
}

function validateAuthorizedPlan(input: DirectRefundOperationInput, plan: DirectRefundPlan): void {
  const cents = [
    plan.grossRefundCents,
    plan.eligibleServiceRefundCents,
    plan.cumulativeGrossBeforeCents,
    plan.cumulativeGrossAfterCents,
    plan.cumulativeEligibleBeforeCents,
    plan.cumulativeEligibleAfterCents,
    plan.applicationFeeTotalCents,
    plan.applicationFeeRefundBeforeCents,
    plan.applicationFeeRefundAfterCents,
    plan.applicationFeeRefundCents,
  ];
  if (plan.authorizationId !== input.authorizationId || !/^[0-9a-f]{64}$/.test(plan.allocationFingerprint)) {
    throw new Error('Direct refund plan does not match its requested authorization identity.');
  }
  if (cents.some((value) => !Number.isSafeInteger(value) || value < 0)
      || plan.grossRefundCents <= 0
      || plan.eligibleServiceRefundCents > plan.grossRefundCents
      || plan.cumulativeGrossAfterCents !== plan.cumulativeGrossBeforeCents + plan.grossRefundCents
      || plan.cumulativeEligibleAfterCents
        !== plan.cumulativeEligibleBeforeCents + plan.eligibleServiceRefundCents
      || plan.applicationFeeRefundAfterCents
        !== plan.applicationFeeRefundBeforeCents + plan.applicationFeeRefundCents
      || plan.applicationFeeRefundAfterCents > plan.applicationFeeTotalCents) {
    throw new Error('Direct refund plan returned inconsistent cumulative cents.');
  }
  if ((plan.refundMode === 'full_combined' && (!plan.applicationFeeId || plan.applicationFeeRefundCents <= 0))
      || (plan.refundMode === 'split' && plan.applicationFeeRefundCents > 0 && !plan.applicationFeeId)) {
    throw new Error('Direct refund plan is missing required Application Fee provenance.');
  }
}

function providerSnapshot(value: unknown, label: string): ProviderResultSnapshot {
  const serialized = JSON.stringify(value);
  if (!serialized) throw new Error(`${label} was not JSON-serializable.`);
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} did not serialize to an object.`);
  }
  return Object.freeze(parsed as Record<string, unknown>);
}

function requireProviderId(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) throw new Error(`Stripe returned an invalid ${label}.`);
  return value;
}

function defaultDependencies(): DirectRefundOperationDependencies {
  return {
    store: new SupabaseDirectRefundOperationStore(),
    createRefund: createDirectRefund,
    createApplicationFeeRefund: createDirectApplicationFeeRefund,
  };
}

function planIdentity(plan: DirectRefundPlan): string {
  return buildDirectRequestFingerprint(plan);
}

async function markProviderError(
  store: DirectRefundOperationStore,
  operationPk: string,
  claimToken: string,
  providerError: unknown,
): Promise<never> {
  let persistenceError: unknown;
  try {
    await store.markIndeterminate({
      operationPk,
      claimToken,
      error: errorForAudit(providerError),
    });
  } catch (markError) {
    persistenceError = markError;
  }
  throw new DirectRefundOperationIndeterminateError(
    'Direct refund submission outcome is unknown; no automatic retry is allowed.',
    providerError,
    persistenceError,
  );
}

export async function orchestrateDirectChargeRefund(
  input: DirectRefundOperationInput,
  dependencies: DirectRefundOperationDependencies = defaultDependencies(),
): Promise<DirectRefundOperationResult> {
  requireConfiguredStripeMode(input.livemode);
  const operationId = validateOperationIdentity(input.operationId);
  const immutableInput = Object.freeze({ ...input, operationId });
  const plan = await dependencies.store.loadPlan(immutableInput);
  validateAuthorizedPlan(immutableInput, plan);

  const chargeOperationId = `${operationId}:charge`;
  const metadata = Object.freeze({
    lgq_payment_id: input.paymentId,
    lgq_refund_authorization_id: input.authorizationId,
    lgq_refund_allocation_policy: plan.allocationPolicy,
    lgq_refund_allocation_version: plan.allocationVersion,
  });
  const chargeInput = Object.freeze({
    merchantAccountId: input.merchantAccountId,
    operationId: chargeOperationId,
    chargeId: plan.chargeId,
    ...(plan.refundMode === 'full_combined' ? {} : { amountCents: plan.grossRefundCents }),
    refundApplicationFee: plan.refundMode === 'full_combined',
    reason: plan.reason,
    metadata,
  }) satisfies DirectRefundInput;
  const chargeCall = buildDirectRefundCall(chargeInput);

  const needsSeparateFeeRefund = plan.refundMode === 'split' && plan.applicationFeeRefundCents > 0;
  const applicationFeeOperationId = needsSeparateFeeRefund ? `${operationId}:application-fee` : null;
  const applicationFeeInput = needsSeparateFeeRefund
    ? Object.freeze({
        merchantAccountId: input.merchantAccountId,
        operationId: applicationFeeOperationId!,
        applicationFeeId: plan.applicationFeeId!,
        amountCents: plan.applicationFeeRefundCents,
        metadata,
      }) satisfies DirectApplicationFeeRefundInput
    : null;
  const feeCall = applicationFeeInput ? buildDirectApplicationFeeRefundCall(applicationFeeInput) : null;
  const operationFingerprint = buildDirectRequestFingerprint({
    schema: 'direct_charge_refund_v1',
    authorizationId: plan.authorizationId,
    allocationFingerprint: plan.allocationFingerprint,
    chargeRequestFingerprint: chargeCall.requestFingerprint,
    applicationFeeRequestFingerprint: feeCall?.requestFingerprint ?? null,
  });

  const claim = await dependencies.store.claim({
    operation: immutableInput,
    plan,
    chargeOperationId,
    chargeIdempotencyKey: chargeCall.options.idempotencyKey,
    chargeRequestFingerprint: chargeCall.requestFingerprint,
    applicationFeeOperationId,
    applicationFeeIdempotencyKey: feeCall?.options.idempotencyKey ?? null,
    applicationFeeRequestFingerprint: feeCall?.requestFingerprint ?? null,
    operationFingerprint,
  });
  if (planIdentity(claim.plan) !== planIdentity(plan)) {
    throw new Error('Direct refund claim changed the authorized immutable plan.');
  }

  if (claim.status === 'replay') {
    if (!claim.refundId || !claim.refundResult) {
      throw new Error('Succeeded direct refund replay is missing its provider result.');
    }
    return Object.freeze({
      outcome: 'replayed',
      operationPk: claim.operationPk,
      refundId: claim.refundId,
      refundResult: claim.refundResult,
      applicationFeeRefundId: claim.applicationFeeRefundId,
      applicationFeeRefundResult: claim.applicationFeeRefundResult,
    });
  }

  let refundId = claim.refundId;
  let refundResult = claim.refundResult;
  let feeClaimToken: string | null = null;
  let outcome: DirectRefundOperationResult['outcome'] = 'created';

  if (claim.status === 'claimed' && claim.claimToken) {
    await dependencies.store.beginChargeSubmission({
      operationPk: claim.operationPk,
      claimToken: claim.claimToken,
    });

    let refund: Stripe.Refund;
    try {
      refund = await dependencies.createRefund(chargeInput);
    } catch (providerError) {
      return markProviderError(dependencies.store, claim.operationPk, claim.claimToken, providerError);
    }
    refundId = requireProviderId(refund.id, REFUND_ID_PATTERN, 'Refund ID');
    refundResult = providerSnapshot(refund, 'Stripe Refund');

    let recorded: Awaited<ReturnType<DirectRefundOperationStore['recordChargeResult']>>;
    try {
      recorded = await dependencies.store.recordChargeResult({
        operationPk: claim.operationPk,
        claimToken: claim.claimToken,
        refundId,
        result: refundResult,
      });
    } catch (persistenceError) {
      throw new DirectRefundOperationPersistenceError(persistenceError);
    }
    if (recorded.nextAction === 'reconcile') {
      throw new DirectRefundOperationIndeterminateError(
        'Stripe created a non-final refund; reconciliation is required and no automatic duplicate is allowed.',
        refundResult,
      );
    }
    if (recorded.nextAction === 'failed') {
      throw new DirectRefundProviderTerminalError(refundId, refundResult);
    }
    if (recorded.nextAction === 'complete') {
      return Object.freeze({
        outcome,
        operationPk: claim.operationPk,
        refundId,
        refundResult,
        applicationFeeRefundId: null,
        applicationFeeRefundResult: null,
      });
    }
    feeClaimToken = recorded.claimToken;
  } else if (claim.status === 'fee_ready' && claim.claimToken && claim.refundId && claim.refundResult) {
    outcome = 'fee_resumed';
    feeClaimToken = claim.claimToken;
  } else {
    throw new DirectRefundOperationUnavailableError(claim.operationState, claim.phase);
  }

  if (!applicationFeeInput || !feeCall || !feeClaimToken || !refundId || !refundResult) {
    throw new Error('Direct refund fee phase is missing durable charge or Application Fee provenance.');
  }

  await dependencies.store.beginApplicationFeeSubmission({
    operationPk: claim.operationPk,
    claimToken: feeClaimToken,
  });

  let feeRefund: Stripe.FeeRefund;
  try {
    feeRefund = await dependencies.createApplicationFeeRefund(applicationFeeInput);
  } catch (providerError) {
    return markProviderError(dependencies.store, claim.operationPk, feeClaimToken, providerError);
  }
  const applicationFeeRefundId = requireProviderId(
    feeRefund.id,
    FEE_REFUND_ID_PATTERN,
    'Application Fee Refund ID',
  );
  const applicationFeeRefundResult = providerSnapshot(feeRefund, 'Stripe Application Fee Refund');

  try {
    await dependencies.store.completeApplicationFeeRefund({
      operationPk: claim.operationPk,
      claimToken: feeClaimToken,
      feeRefundId: applicationFeeRefundId,
      result: applicationFeeRefundResult,
    });
  } catch (persistenceError) {
    throw new DirectRefundOperationPersistenceError(persistenceError);
  }

  return Object.freeze({
    outcome,
    operationPk: claim.operationPk,
    refundId,
    refundResult,
    applicationFeeRefundId,
    applicationFeeRefundResult,
  });
}
