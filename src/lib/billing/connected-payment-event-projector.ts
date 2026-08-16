import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import {
  ConnectedPaymentLateSuccessProviderError,
  SupabaseConnectedPaymentLateSuccessStore,
  reconcileConnectedPaymentLateSuccess,
  type ConnectedPaymentLateSuccessDependencies,
  type ConnectedPaymentLateSuccessPlan,
  type ConnectedPaymentLateSuccessResult,
} from '@/lib/billing/connected-payment-late-success-reconciler';
import { DIRECT_CHARGE_MODEL, DIRECT_CHARGE_METADATA_KEYS } from '@/lib/billing/stripe-direct';
import { getStripeClient } from '@/lib/stripe';

/**
 * Dark, success-only projector for connected-account direct Checkout payments.
 *
 * Nothing under src/app imports this module. It deliberately supports only a
 * paid, card-only `checkout.session.completed` event produced by the dark
 * one-off direct Checkout orchestrator. Refunds, disputes, expirations, and
 * failures stay unclaimed until their business transitions are specified.
 * If the exact Charge-scoped Application Fee or Balance Transaction evidence
 * is unavailable, payment truth is still projected but reconciliation remains
 * pending for a separately designed platform Application Fee reconciler.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const PAYMENT_INTENT_ID_PATTERN = /^pi_[A-Za-z0-9_]+$/;
const CHARGE_ID_PATTERN = /^ch_[A-Za-z0-9_]+$/;
const APPLICATION_FEE_ID_PATTERN = /^fee_[A-Za-z0-9_]+$/;
const BALANCE_TRANSACTION_ID_PATTERN = /^txn_[A-Za-z0-9_]+$/;
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_/;
const OPERATION_ID_PATTERN = /^[^\u0000-\u001F\u007F]{1,200}$/;
const EXPIRATION_CONFLICT_RPC_CODE = 'P0001';
const EXPIRATION_CONFLICT_RPC_MESSAGE = 'stripe_connected_checkout_expiration_conflict';

export const CONNECTED_PAYMENT_PROJECTION_SCHEMA = 'stripe_connected_payment_projection_v1' as const;
export const CONNECTED_PAYMENT_SUCCESS_EVENT = 'checkout.session.completed' as const;

export type ConnectedPaymentProjectorClaimStatus =
  | 'claimed'
  | 'in_progress'
  | 'processed'
  | 'ignored'
  | 'failed_terminal';

export type ConnectedPaymentProjectorClaim = Readonly<{
  status: ConnectedPaymentProjectorClaimStatus;
  billingEventId: string;
  claimToken: string | null;
  attemptCount: number;
  providerEventId: string;
  eventType: typeof CONNECTED_PAYMENT_SUCCESS_EVENT;
  checkoutSessionId: string;
  workspaceId: string;
  merchantAccountId: string;
  livemode: boolean;
  providerCreatedAt: string;
}>;

type DirectPaymentMetadata = Readonly<{
  workspaceId: string;
  paymentId: string;
  operationId: string;
}>;

export type ConnectedPaymentProviderEvidence = Readonly<{
  providerEventId: string;
  eventType: typeof CONNECTED_PAYMENT_SUCCESS_EVENT;
  providerCreatedAt: string;
  workspaceId: string;
  merchantAccountId: string;
  livemode: boolean;
  paymentId: string;
  operationId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  chargeId: string;
  applicationFeeId: string | null;
  balanceTransactionId: string | null;
  amountCents: number;
  paymentIntentApplicationFeeCents: number;
  chargeApplicationFeeCents: number;
  paidAt: string;
  balanceTransactionVerified: boolean;
  balanceApplicationFeeCents: number | null;
}>;

export type ConnectedPaymentProjectionBinding = Readonly<{
  operationPk: string;
  workspaceId: string;
  paymentId: string;
  operationId: string;
  checkoutSessionId: string;
  merchantAccountId: string;
  livemode: boolean;
  amountCents: number;
  applicationFeeCents: number;
  currentPaymentStatus: 'processing' | 'paid';
  reconciliationStatus: 'pending' | 'reconciled';
}>;

export type ConnectedPaymentProjection = Readonly<{
  schema: typeof CONNECTED_PAYMENT_PROJECTION_SCHEMA;
  provider_event_id: string;
  event_type: typeof CONNECTED_PAYMENT_SUCCESS_EVENT;
  event_created_at: string;
  workspace_id: string;
  payment_id: string;
  operation_id: string;
  checkout_session_id: string;
  payment_intent_id: string;
  charge_id: string;
  application_fee_id: string | null;
  balance_transaction_id: string | null;
  merchant_account_id: string;
  livemode: boolean;
  currency: 'usd';
  amount_cents: number;
  application_fee_cents: number;
  paid_at: string;
  reconciliation_status: 'pending' | 'reconciled';
}>;

export type ConnectedPaymentProjectResult = Readonly<{
  status: 'processed';
  paymentId: string;
  workspaceId: string;
  applied: boolean;
  reconciliationStatus: 'pending' | 'reconciled';
}>;

export type ConnectedPaymentProjectionPlan =
  | Readonly<{ projectionKind: 'current' }>
  | ConnectedPaymentLateSuccessPlan;

export interface ConnectedPaymentProjectionStore {
  claim(billingEventId: string): Promise<ConnectedPaymentProjectorClaim>;
  plan(input: {
    billingEventId: string;
    claimToken: string;
  }): Promise<ConnectedPaymentProjectionPlan>;
  resolveBinding(input: {
    billingEventId: string;
    claimToken: string;
    evidence: ConnectedPaymentProviderEvidence;
  }): Promise<ConnectedPaymentProjectionBinding>;
  project(input: {
    billingEventId: string;
    claimToken: string;
    projection: ConnectedPaymentProjection;
  }): Promise<ConnectedPaymentProjectResult>;
  fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void>;
}

export interface ConnectedPaymentProjectionResolver {
  loadProviderEvidence(claim: ConnectedPaymentProjectorClaim): Promise<ConnectedPaymentProviderEvidence>;
  buildProjection(
    evidence: ConnectedPaymentProviderEvidence,
    binding: ConnectedPaymentProjectionBinding,
  ): ConnectedPaymentProjection;
}

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(label: string, error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`${label}: ${detail}`);
}

class ConnectedPaymentProjectionPersistenceError extends Error {
  override readonly name = 'ConnectedPaymentProjectionPersistenceError';

  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
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

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid.`);
  return value;
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function requiredIsoTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || timestamp <= Date.UTC(2000, 0, 1)) {
    throw new Error(`${label} is invalid.`);
  }
  return new Date(timestamp).toISOString();
}

function stripeTimestamp(value: unknown, label: string): string {
  const seconds = requiredInteger(value, label, 946684801);
  return new Date(seconds * 1_000).toISOString();
}

function nullableObjectId(value: unknown, pattern: RegExp, label: string): string | null {
  if (value == null) return null;
  const id = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? (value as { id?: unknown }).id
      : null;
  return requiredString(id, label, pattern);
}

function providerObjectId(value: unknown, pattern: RegExp, label: string): string | null {
  try {
    return nullableObjectId(value, pattern, label);
  } catch {
    return providerMismatch();
  }
}

function exactMetadata(value: unknown, claim: Pick<ConnectedPaymentProjectorClaim, 'workspaceId' | 'merchantAccountId'>): DirectPaymentMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConnectedPaymentProjectionProviderError('provider_metadata_mismatch', false);
  }
  const metadata = value as Record<string, unknown>;
  const workspaceId = typeof metadata.lgq_workspace_id === 'string'
    ? metadata.lgq_workspace_id.toLowerCase()
    : '';
  const paymentId = typeof metadata.lgq_payment_id === 'string'
    ? metadata.lgq_payment_id.toLowerCase()
    : '';
  const operationId = metadata[DIRECT_CHARGE_METADATA_KEYS.operationId];
  if (
    metadata[DIRECT_CHARGE_METADATA_KEYS.chargeModel] !== DIRECT_CHARGE_MODEL
    || metadata[DIRECT_CHARGE_METADATA_KEYS.merchantAccountId] !== claim.merchantAccountId
    || workspaceId !== claim.workspaceId
    || !UUID_PATTERN.test(paymentId)
    || typeof operationId !== 'string'
    || !OPERATION_ID_PATTERN.test(operationId)
  ) {
    throw new ConnectedPaymentProjectionProviderError('provider_metadata_mismatch', false);
  }
  return Object.freeze({ workspaceId, paymentId, operationId });
}

function metadataMatches(value: unknown, expected: DirectPaymentMetadata, merchantAccountId: string): boolean {
  try {
    const actual = exactMetadata(value, {
      workspaceId: expected.workspaceId,
      merchantAccountId,
    });
    return actual.paymentId === expected.paymentId && actual.operationId === expected.operationId;
  } catch {
    return false;
  }
}

const CLAIM_STATUSES = new Set<ConnectedPaymentProjectorClaimStatus>([
  'claimed',
  'in_progress',
  'processed',
  'ignored',
  'failed_terminal',
]);

function parseClaim(value: unknown): ConnectedPaymentProjectorClaim {
  const row = rowRecord(value, 'Connected payment event claim RPC');
  const status = requiredString(row.claim_status, 'claim status') as ConnectedPaymentProjectorClaimStatus;
  if (!CLAIM_STATUSES.has(status)) throw new Error('Connected payment event claim status is invalid.');
  const eventType = requiredString(row.event_type, 'event type');
  if (eventType !== CONNECTED_PAYMENT_SUCCESS_EVENT) {
    throw new Error('Connected payment event type is outside the success-only projector.');
  }
  const claimToken = row.claim_token == null ? null : requiredUuid(row.claim_token, 'claim token');
  if ((status === 'claimed') !== (claimToken !== null)) {
    throw new Error('Connected payment event claim ownership is invalid.');
  }
  return Object.freeze({
    status,
    billingEventId: requiredUuid(row.billing_event_id, 'billing event ID'),
    claimToken,
    attemptCount: requiredInteger(row.attempt_count, 'attempt count'),
    providerEventId: requiredString(row.provider_event_id, 'provider event ID', EVENT_ID_PATTERN),
    eventType,
    checkoutSessionId: requiredString(
      row.checkout_session_id,
      'Checkout Session ID',
      CHECKOUT_SESSION_ID_PATTERN,
    ),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    merchantAccountId: requiredString(row.merchant_account_id, 'Merchant account ID', ACCOUNT_ID_PATTERN),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    providerCreatedAt: requiredIsoTimestamp(row.provider_created_at, 'provider creation time'),
  });
}

function parseBinding(value: unknown): ConnectedPaymentProjectionBinding {
  const row = rowRecord(value, 'Connected payment projection binding RPC');
  const currentPaymentStatus = requiredString(row.payment_status, 'payment status');
  if (currentPaymentStatus !== 'processing' && currentPaymentStatus !== 'paid') {
    throw new Error('Connected payment binding returned an unsupported payment status.');
  }
  const reconciliationStatus = requiredString(row.reconciliation_status, 'reconciliation status');
  if (reconciliationStatus !== 'pending' && reconciliationStatus !== 'reconciled') {
    throw new Error('Connected payment binding returned an unsupported reconciliation status.');
  }
  return Object.freeze({
    operationPk: requiredUuid(row.operation_pk, 'operation primary key'),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    paymentId: requiredUuid(row.payment_id, 'payment ID'),
    operationId: requiredString(row.operation_id, 'operation ID', OPERATION_ID_PATTERN),
    checkoutSessionId: requiredString(row.checkout_session_id, 'Checkout Session ID', CHECKOUT_SESSION_ID_PATTERN),
    merchantAccountId: requiredString(row.merchant_account_id, 'Merchant account ID', ACCOUNT_ID_PATTERN),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    amountCents: requiredInteger(row.amount_cents, 'payment amount', 1),
    applicationFeeCents: requiredInteger(row.application_fee_cents, 'application fee amount'),
    currentPaymentStatus,
    reconciliationStatus,
  });
}

function parseProjectResult(value: unknown): ConnectedPaymentProjectResult {
  const row = rowRecord(value, 'Connected payment projection RPC');
  if (requiredString(row.processing_status, 'processing status') !== 'processed') {
    throw new Error('Connected payment projection did not return processed status.');
  }
  const reconciliationStatus = requiredString(row.reconciliation_status, 'reconciliation status');
  if (reconciliationStatus !== 'pending' && reconciliationStatus !== 'reconciled') {
    throw new Error('Connected payment projection returned an invalid reconciliation status.');
  }
  return Object.freeze({
    status: 'processed',
    paymentId: requiredUuid(row.payment_id, 'payment ID'),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    applied: requiredBoolean(row.projection_applied, 'projection applied'),
    reconciliationStatus,
  });
}

function parseProjectionPlan(value: unknown): ConnectedPaymentProjectionPlan {
  const row = rowRecord(value, 'Connected payment projection plan RPC');
  const projectionKind = requiredString(row.projection_kind, 'projection kind');
  if (projectionKind === 'current') return Object.freeze({ projectionKind });
  if (projectionKind !== 'late_predecessor') {
    throw new Error('Connected payment projection plan kind is invalid.');
  }
  const reconciliationStatus = requiredString(
    row.reconciliation_status,
    'reconciliation status',
  );
  if (reconciliationStatus !== 'pending' && reconciliationStatus !== 'reconciled') {
    throw new Error('Connected payment late-success reconciliation status is invalid.');
  }
  return Object.freeze({
    projectionKind,
    taskId: requiredUuid(row.task_id, 'late-success task ID'),
    taskClaimToken: requiredUuid(row.task_claim_token, 'late-success task claim token'),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    paymentId: requiredUuid(row.payment_id, 'payment ID'),
    merchantAccountId: requiredString(
      row.merchant_account_id,
      'Merchant account ID',
      ACCOUNT_ID_PATTERN,
    ),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    paidOperationPk: requiredUuid(row.paid_operation_pk, 'late-success paid operation PK'),
    paidOperationId: requiredString(
      row.paid_operation_id,
      'late-success paid operation ID',
      OPERATION_ID_PATTERN,
    ),
    paidCheckoutSessionId: requiredString(
      row.paid_checkout_session_id,
      'late-success paid Checkout Session ID',
      CHECKOUT_SESSION_ID_PATTERN,
    ),
    paidCheckoutGeneration: requiredInteger(
      row.paid_checkout_generation,
      'late-success paid Checkout generation',
      1,
    ),
    amountCents: requiredInteger(row.amount_cents, 'payment amount', 1),
    applicationFeeCents: requiredInteger(row.application_fee_cents, 'application fee amount'),
    reconciliationStatus,
  });
}

export class SupabaseConnectedPaymentProjectionStore implements ConnectedPaymentProjectionStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claim(billingEventId: string): Promise<ConnectedPaymentProjectorClaim> {
    const { data, error } = await this.admin.rpc('claim_stripe_connected_payment_event', {
      p_billing_event_id: requiredUuid(billingEventId, 'billing event ID'),
    });
    if (error) throw rpcFailure('Unable to claim connected payment event', error);
    return parseClaim(data);
  }

  async plan(input: {
    billingEventId: string;
    claimToken: string;
  }): Promise<ConnectedPaymentProjectionPlan> {
    const { data, error } = await this.admin.rpc(
      'plan_stripe_connected_payment_projection',
      {
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_claim_token: requiredUuid(input.claimToken, 'claim token'),
      },
    );
    if (error) throw rpcFailure('Unable to plan connected payment projection', error);
    return parseProjectionPlan(data);
  }

  async resolveBinding(input: {
    billingEventId: string;
    claimToken: string;
    evidence: ConnectedPaymentProviderEvidence;
  }): Promise<ConnectedPaymentProjectionBinding> {
    const { data, error } = await this.admin.rpc('resolve_stripe_connected_payment_projection_binding', {
      p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
      p_claim_token: requiredUuid(input.claimToken, 'claim token'),
      p_workspace_id: requiredUuid(input.evidence.workspaceId, 'workspace ID'),
      p_payment_id: requiredUuid(input.evidence.paymentId, 'payment ID'),
      p_operation_id: requiredString(input.evidence.operationId, 'operation ID', OPERATION_ID_PATTERN),
    });
    if (error) throw rpcFailure('Unable to bind connected payment event', error);
    return parseBinding(data);
  }

  async project(input: {
    billingEventId: string;
    claimToken: string;
    projection: ConnectedPaymentProjection;
  }): Promise<ConnectedPaymentProjectResult> {
    const { data, error } = await this.admin.rpc('project_stripe_connected_payment_event', {
      p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
      p_claim_token: requiredUuid(input.claimToken, 'claim token'),
      p_projection: input.projection,
    });
    if (error) {
      if (
        error.code?.trim() === EXPIRATION_CONFLICT_RPC_CODE
        && error.message?.trim() === EXPIRATION_CONFLICT_RPC_MESSAGE
      ) {
        throw new ConnectedPaymentProjectionPersistenceError(
          'expiration_evidence_conflict',
          false,
        );
      }
      throw rpcFailure('Unable to project connected payment event', error);
    }
    return parseProjectResult(data);
  }

  async fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('fail_stripe_connected_payment_event', {
      p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
      p_claim_token: requiredUuid(input.claimToken, 'claim token'),
      p_error_code: requiredString(input.errorCode, 'projection error code', /^[a-z][a-z0-9_]{2,63}$/),
      p_retryable: input.retryable,
      p_next_attempt_at: input.nextAttemptAt,
    });
    if (error) throw rpcFailure('Unable to record connected payment projection failure', error);
    if (data !== true) throw new Error('Connected payment projection failure RPC was not acknowledged.');
  }
}

export class ConnectedPaymentProjectionProviderError extends Error {
  override readonly name = 'ConnectedPaymentProjectionProviderError';

  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

type ProviderDependencies = Readonly<{
  assertMode(livemode: boolean): void;
  retrieveCheckoutSession(id: string, merchantAccountId: string): Promise<Stripe.Checkout.Session>;
  retrievePaymentIntent(id: string, merchantAccountId: string): Promise<Stripe.PaymentIntent>;
  retrieveCharge(id: string, merchantAccountId: string): Promise<Stripe.Charge>;
  retrieveBalanceTransaction(id: string, merchantAccountId: string): Promise<Stripe.BalanceTransaction>;
}>;

function assertConfiguredStripeMode(livemode: boolean): void {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(key);
  if (!match || (match[1] === 'live') !== livemode) {
    throw new ConnectedPaymentProjectionProviderError('provider_mode_mismatch', false);
  }
}

function defaultProviderDependencies(): ProviderDependencies {
  return Object.freeze({
    assertMode: assertConfiguredStripeMode,
    retrieveCheckoutSession: (id, merchantAccountId) => getStripeClient().checkout.sessions.retrieve(
      id,
      {},
      { stripeAccount: merchantAccountId },
    ),
    retrievePaymentIntent: (id, merchantAccountId) => getStripeClient().paymentIntents.retrieve(
      id,
      {},
      { stripeAccount: merchantAccountId },
    ),
    retrieveCharge: (id, merchantAccountId) => getStripeClient().charges.retrieve(
      id,
      {},
      { stripeAccount: merchantAccountId },
    ),
    retrieveBalanceTransaction: (id, merchantAccountId) => getStripeClient().balanceTransactions.retrieve(
      id,
      {},
      { stripeAccount: merchantAccountId },
    ),
  });
}

async function providerRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ConnectedPaymentProjectionProviderError) throw error;
    throw new ConnectedPaymentProjectionProviderError('provider_object_retrieve_failed', true);
  }
}

function providerMismatch(): never {
  throw new ConnectedPaymentProjectionProviderError('provider_object_contract_mismatch', false);
}

export function createConnectedPaymentProjectionResolver(
  injected?: Partial<ProviderDependencies>,
): ConnectedPaymentProjectionResolver {
  const dependencies = injected
    ? ({ ...defaultProviderDependencies(), ...injected } as ProviderDependencies)
    : defaultProviderDependencies();

  return Object.freeze({
    async loadProviderEvidence(
      claim: ConnectedPaymentProjectorClaim,
    ): Promise<ConnectedPaymentProviderEvidence> {
      dependencies.assertMode(claim.livemode);

      const session = await providerRead(() => dependencies.retrieveCheckoutSession(
        claim.checkoutSessionId,
        claim.merchantAccountId,
      ));
      const metadata = exactMetadata(session.metadata, claim);
      const paymentIntentId = providerObjectId(
        session.payment_intent,
        PAYMENT_INTENT_ID_PATTERN,
        'PaymentIntent ID',
      );
      if (
        session.id !== claim.checkoutSessionId
        || session.object !== 'checkout.session'
        || session.livemode !== claim.livemode
        || session.mode !== 'payment'
        || session.status !== 'complete'
        || session.payment_status !== 'paid'
        || !Array.isArray(session.payment_method_types)
        || session.payment_method_types.length !== 1
        || session.payment_method_types[0] !== 'card'
        || session.currency !== 'usd'
        || !Number.isSafeInteger(session.amount_total)
        || session.amount_total == null
        || session.amount_total <= 0
        || session.amount_subtotal !== session.amount_total
        || !paymentIntentId
      ) providerMismatch();

      const paymentIntent = await providerRead(() => dependencies.retrievePaymentIntent(
        paymentIntentId,
        claim.merchantAccountId,
      ));
      const chargeId = providerObjectId(paymentIntent.latest_charge, CHARGE_ID_PATTERN, 'Charge ID');
      if (
        paymentIntent.id !== paymentIntentId
        || paymentIntent.object !== 'payment_intent'
        || paymentIntent.livemode !== claim.livemode
        || paymentIntent.status !== 'succeeded'
        || paymentIntent.currency !== 'usd'
        || paymentIntent.amount !== session.amount_total
        || paymentIntent.amount_received !== session.amount_total
        || !metadataMatches(paymentIntent.metadata, metadata, claim.merchantAccountId)
        || !chargeId
      ) providerMismatch();

      const charge = await providerRead(() => dependencies.retrieveCharge(
        chargeId,
        claim.merchantAccountId,
      ));
      const chargePaymentIntentId = providerObjectId(
        charge.payment_intent,
        PAYMENT_INTENT_ID_PATTERN,
        'Charge PaymentIntent ID',
      );
      const applicationFeeId = providerObjectId(
        charge.application_fee,
        APPLICATION_FEE_ID_PATTERN,
        'Application Fee ID',
      );
      const balanceTransactionId = providerObjectId(
        charge.balance_transaction,
        BALANCE_TRANSACTION_ID_PATTERN,
        'Balance Transaction ID',
      );
      if (
        charge.id !== chargeId
        || charge.object !== 'charge'
        || charge.livemode !== claim.livemode
        || charge.status !== 'succeeded'
        || !charge.paid
        || !charge.captured
        || charge.disputed
        || charge.refunded
        || charge.amount_refunded !== 0
        || charge.currency !== 'usd'
        || charge.amount !== session.amount_total
        || charge.amount_captured !== session.amount_total
        || chargePaymentIntentId !== paymentIntentId
        || !metadataMatches(charge.metadata, metadata, claim.merchantAccountId)
      ) providerMismatch();

      let balanceTransactionVerified = false;
      let balanceApplicationFeeCents: number | null = null;
      if (balanceTransactionId) {
        try {
          const balance = await providerRead(() => dependencies.retrieveBalanceTransaction(
            balanceTransactionId,
            claim.merchantAccountId,
          ));
          const balanceSourceId = providerObjectId(balance.source, CHARGE_ID_PATTERN, 'Balance source ID');
          const feeDetails = balance.fee_details;
          const feeDetailShapeValid = Array.isArray(feeDetails)
            && feeDetails.every((detail) => (
              Number.isSafeInteger(detail.amount)
              && detail.amount >= 0
              && detail.currency === 'usd'
              && typeof detail.type === 'string'
              && detail.type.length > 0
            ));
          const feeDetailTotal = feeDetailShapeValid
            ? feeDetails.reduce((total, detail) => total + detail.amount, 0)
            : -1;
          const applicationFeeDetails = feeDetailShapeValid
            ? feeDetails.filter((detail) => detail.type === 'application_fee')
            : [];
          if (
            balance.id !== balanceTransactionId
            || balance.object !== 'balance_transaction'
            || balance.type !== 'charge'
            || (balance.status !== 'pending' && balance.status !== 'available')
            || balance.currency !== 'usd'
            || balance.amount !== session.amount_total
            || balanceSourceId !== chargeId
            || !Number.isSafeInteger(balance.fee)
            || balance.fee < 0
            || balance.fee > balance.amount
            || !Number.isSafeInteger(balance.net)
            || balance.net !== balance.amount - balance.fee
            || !feeDetailShapeValid
            || !Number.isSafeInteger(feeDetailTotal)
            || feeDetailTotal !== balance.fee
            || applicationFeeDetails.length > 1
          ) providerMismatch();
          balanceTransactionVerified = true;
          balanceApplicationFeeCents = applicationFeeDetails.length === 1
            ? applicationFeeDetails[0].amount
            : null;
        } catch (error) {
          // Session + PaymentIntent + Charge still prove the homeowner paid.
          // A transient inability to retrieve the connected-account balance
          // transaction must not hide that payment; it only withholds the
          // stronger reconciliation claim for a later reconciler.
          if (!(error instanceof ConnectedPaymentProjectionProviderError)
              || !error.retryable
              || error.code !== 'provider_object_retrieve_failed') {
            throw error;
          }
        }
      }

      let paidAt: string;
      try {
        paidAt = stripeTimestamp(charge.created, 'Charge creation time');
      } catch {
        return providerMismatch();
      }
      if (Date.parse(paidAt) > Date.parse(claim.providerCreatedAt)) providerMismatch();

      return Object.freeze({
        providerEventId: claim.providerEventId,
        eventType: claim.eventType,
        providerCreatedAt: claim.providerCreatedAt,
        workspaceId: metadata.workspaceId,
        merchantAccountId: claim.merchantAccountId,
        livemode: claim.livemode,
        paymentId: metadata.paymentId,
        operationId: metadata.operationId,
        checkoutSessionId: claim.checkoutSessionId,
        paymentIntentId,
        chargeId,
        applicationFeeId,
        balanceTransactionId,
        amountCents: session.amount_total,
        paymentIntentApplicationFeeCents: paymentIntent.application_fee_amount ?? 0,
        chargeApplicationFeeCents: charge.application_fee_amount ?? 0,
        paidAt,
        balanceTransactionVerified,
        balanceApplicationFeeCents,
      });
    },

    buildProjection(
      evidence: ConnectedPaymentProviderEvidence,
      binding: ConnectedPaymentProjectionBinding,
    ): ConnectedPaymentProjection {
      if (
        evidence.workspaceId !== binding.workspaceId
        || evidence.paymentId !== binding.paymentId
        || evidence.operationId !== binding.operationId
        || evidence.checkoutSessionId !== binding.checkoutSessionId
        || evidence.merchantAccountId !== binding.merchantAccountId
        || evidence.livemode !== binding.livemode
        || evidence.amountCents !== binding.amountCents
        || evidence.paymentIntentApplicationFeeCents !== binding.applicationFeeCents
        || evidence.chargeApplicationFeeCents !== binding.applicationFeeCents
        || (
          binding.applicationFeeCents === 0
          && evidence.applicationFeeId !== null
        )
        || (
          evidence.balanceTransactionVerified
          && evidence.balanceApplicationFeeCents !== (
            binding.applicationFeeCents === 0 ? null : binding.applicationFeeCents
          )
        )
      ) providerMismatch();

      const applicationFeeVerified = binding.applicationFeeCents === 0
        ? evidence.applicationFeeId === null
        : evidence.applicationFeeId !== null;
      const reconciliationStatus = applicationFeeVerified && evidence.balanceTransactionVerified
        ? 'reconciled'
        : 'pending';

      return Object.freeze({
        schema: CONNECTED_PAYMENT_PROJECTION_SCHEMA,
        provider_event_id: evidence.providerEventId,
        event_type: evidence.eventType,
        event_created_at: evidence.providerCreatedAt,
        workspace_id: evidence.workspaceId,
        payment_id: evidence.paymentId,
        operation_id: evidence.operationId,
        checkout_session_id: evidence.checkoutSessionId,
        payment_intent_id: evidence.paymentIntentId,
        charge_id: evidence.chargeId,
        application_fee_id: evidence.applicationFeeId,
        balance_transaction_id: evidence.balanceTransactionId,
        merchant_account_id: evidence.merchantAccountId,
        livemode: evidence.livemode,
        currency: 'usd',
        amount_cents: evidence.amountCents,
        application_fee_cents: binding.applicationFeeCents,
        paid_at: evidence.paidAt,
        reconciliation_status: reconciliationStatus,
      });
    },
  });
}

export type ProjectConnectedPaymentEventResult =
  | Readonly<{
    status: 'in_progress' | 'replay_processed' | 'replay_ignored' | 'failed_terminal';
    billingEventId: string;
  }>
  | (ConnectedPaymentProjectResult & Readonly<{ billingEventId: string }>)
  | Readonly<{
    status: 'failed_retryable' | 'failed_terminal';
    billingEventId: string;
    errorCode: string;
  }>
  | ConnectedPaymentLateSuccessResult;

export interface ConnectedPaymentLateSuccessHandler {
  reconcile(input: {
    billingEventId: string;
    eventClaimToken: string;
    plan: ConnectedPaymentLateSuccessPlan;
    projection: ConnectedPaymentProjection;
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

export type ConnectedPaymentProjectorDependencies = Readonly<{
  store: ConnectedPaymentProjectionStore;
  resolver: ConnectedPaymentProjectionResolver;
  lateSuccess: ConnectedPaymentLateSuccessHandler;
  now(): Date;
}>;

function defaultDependencies(): ConnectedPaymentProjectorDependencies {
  const lateSuccessStore = new SupabaseConnectedPaymentLateSuccessStore();
  return Object.freeze({
    store: new SupabaseConnectedPaymentProjectionStore(),
    resolver: createConnectedPaymentProjectionResolver(),
    lateSuccess: {
      reconcile: (input) => reconcileConnectedPaymentLateSuccess(input, {
        store: lateSuccessStore,
      } as Partial<ConnectedPaymentLateSuccessDependencies>),
      fail: (input) => lateSuccessStore.fail({
        billingEventId: input.billingEventId,
        eventClaimToken: input.eventClaimToken,
        plan: input.plan,
        errorCode: input.errorCode,
        retryable: input.retryable,
        nextAttemptAt: input.nextAttemptAt,
      }),
    },
    now: () => new Date(),
  });
}

function retryAt(now: Date, attemptCount: number): string {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 6));
  const delayMinutes = Math.min(24 * 60, 2 ** exponent * 5);
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

function fixedFailure(error: unknown): { code: string; retryable: boolean } {
  if (
    error instanceof ConnectedPaymentProjectionProviderError
    || error instanceof ConnectedPaymentLateSuccessProviderError
    || error instanceof ConnectedPaymentProjectionPersistenceError
  ) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: 'projection_internal_error', retryable: true };
}

export async function projectConnectedPaymentEvent(
  billingEventId: string,
  injected?: ConnectedPaymentProjectorDependencies,
): Promise<ProjectConnectedPaymentEventResult> {
  const dependencies = injected ?? defaultDependencies();
  const claim = await dependencies.store.claim(billingEventId);

  if (claim.status === 'processed') {
    return { status: 'replay_processed', billingEventId: claim.billingEventId };
  }
  if (claim.status === 'ignored') {
    return { status: 'replay_ignored', billingEventId: claim.billingEventId };
  }
  if (claim.status === 'in_progress') {
    return { status: 'in_progress', billingEventId: claim.billingEventId };
  }
  if (claim.status === 'failed_terminal') {
    return { status: 'failed_terminal', billingEventId: claim.billingEventId };
  }
  if (!claim.claimToken) throw new Error('Claimed connected payment event has no ownership token.');

  let plan: ConnectedPaymentProjectionPlan | null = null;
  try {
    plan = await dependencies.store.plan({
      billingEventId: claim.billingEventId,
      claimToken: claim.claimToken,
    });
  } catch (error) {
    const failure = fixedFailure(error);
    const nextAttemptAt = failure.retryable ? retryAt(dependencies.now(), claim.attemptCount) : null;
    await dependencies.store.fail({
      billingEventId: claim.billingEventId,
      claimToken: claim.claimToken,
      errorCode: failure.code,
      retryable: failure.retryable,
      nextAttemptAt,
    });
    return {
      status: failure.retryable ? 'failed_retryable' : 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: failure.code,
    };
  }

  if (claim.attemptCount > 8) {
    if (plan.projectionKind === 'late_predecessor') {
      await dependencies.lateSuccess.fail({
        billingEventId: claim.billingEventId,
        eventClaimToken: claim.claimToken,
        plan,
        errorCode: 'projection_retry_attempt_limit',
        retryable: false,
        nextAttemptAt: null,
      });
    } else {
      await dependencies.store.fail({
        billingEventId: claim.billingEventId,
        claimToken: claim.claimToken,
        errorCode: 'projection_retry_attempt_limit',
        retryable: false,
        nextAttemptAt: null,
      });
    }
    return {
      status: 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: 'projection_retry_attempt_limit',
    };
  }

  try {
    const evidence = await dependencies.resolver.loadProviderEvidence(claim);
    if (plan.projectionKind === 'late_predecessor') {
      const projection = dependencies.resolver.buildProjection(evidence, {
        operationPk: plan.paidOperationPk,
        workspaceId: plan.workspaceId,
        paymentId: plan.paymentId,
        operationId: plan.paidOperationId,
        checkoutSessionId: plan.paidCheckoutSessionId,
        merchantAccountId: plan.merchantAccountId,
        livemode: plan.livemode,
        amountCents: plan.amountCents,
        applicationFeeCents: plan.applicationFeeCents,
        currentPaymentStatus: 'processing',
        reconciliationStatus: plan.reconciliationStatus,
      });
      return await dependencies.lateSuccess.reconcile({
        billingEventId: claim.billingEventId,
        eventClaimToken: claim.claimToken,
        plan,
        projection,
      });
    }
    const binding = await dependencies.store.resolveBinding({
      billingEventId: claim.billingEventId,
      claimToken: claim.claimToken,
      evidence,
    });
    const projection = dependencies.resolver.buildProjection(evidence, binding);
    const result = await dependencies.store.project({
      billingEventId: claim.billingEventId,
      claimToken: claim.claimToken,
      projection,
    });
    return { ...result, billingEventId: claim.billingEventId };
  } catch (error) {
    const failure = fixedFailure(error);
    const nextAttemptAt = failure.retryable ? retryAt(dependencies.now(), claim.attemptCount) : null;
    if (plan.projectionKind === 'late_predecessor') {
      await dependencies.lateSuccess.fail({
        billingEventId: claim.billingEventId,
        eventClaimToken: claim.claimToken,
        plan,
        errorCode: failure.code,
        retryable: failure.retryable,
        nextAttemptAt,
      });
    } else {
      await dependencies.store.fail({
        billingEventId: claim.billingEventId,
        claimToken: claim.claimToken,
        errorCode: failure.code,
        retryable: failure.retryable,
        nextAttemptAt,
      });
    }
    return {
      status: failure.retryable ? 'failed_retryable' : 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: failure.code,
    };
  }
}
