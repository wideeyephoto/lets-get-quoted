import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import {
  DIRECT_CHARGE_METADATA_KEYS,
  DIRECT_CHARGE_MODEL,
} from '@/lib/billing/stripe-direct';
import { getStripeClient } from '@/lib/stripe';

/**
 * DARK, observation-only projector for connected `checkout.session.expired`.
 *
 * The signed webhook inbox supplies only an event identity and Session ID. This
 * module retrieves that exact Session on event.account, validates the complete
 * unpaid/expired contract, and asks Postgres to persist immutable PII-free
 * evidence. It never creates a replacement Session and never changes payment
 * or invoice state.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const OPERATION_ID_PATTERN = /^[^\u0000-\u001F\u007F]{1,200}$/;
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_/;
const MAX_PROVIDER_ATTEMPTS = 8;

export const CONNECTED_CHECKOUT_EXPIRATION_SCHEMA =
  'stripe_connected_checkout_expiration_v1' as const;
export const CONNECTED_CHECKOUT_EXPIRATION_EVENT =
  'checkout.session.expired' as const;

export type ConnectedCheckoutExpirationClaimStatus =
  | 'claimed'
  | 'in_progress'
  | 'processed'
  | 'ignored'
  | 'failed_terminal';

export type ConnectedCheckoutExpirationClaim = Readonly<{
  status: ConnectedCheckoutExpirationClaimStatus;
  billingEventId: string;
  claimToken: string | null;
  attemptCount: number;
  providerEventId: string;
  eventType: typeof CONNECTED_CHECKOUT_EXPIRATION_EVENT;
  checkoutSessionId: string;
  workspaceId: string;
  merchantAccountId: string;
  livemode: boolean;
  providerCreatedAt: string;
}>;

export type ConnectedCheckoutExpirationProviderEvidence = Readonly<{
  providerEventId: string;
  eventType: typeof CONNECTED_CHECKOUT_EXPIRATION_EVENT;
  providerCreatedAt: string;
  workspaceId: string;
  paymentId: string;
  operationId: string;
  checkoutSessionId: string;
  merchantAccountId: string;
  livemode: boolean;
  currency: 'usd';
  amountCents: number;
  sessionExpiresAt: string;
  mode: 'payment';
  sessionStatus: 'expired';
  paymentStatus: 'unpaid';
  paymentMethodTypes: readonly ['card'];
  recoveredFrom: null;
  paymentIntentId: null;
}>;

export type ConnectedCheckoutExpirationBinding = Readonly<{
  status: 'ready';
  operationPk: string;
  workspaceId: string;
  paymentId: string;
  operationId: string;
  invoiceId: string;
  checkoutSessionId: string;
  merchantAccountId: string;
  livemode: boolean;
  amountCents: number;
  feeBasisAmountCents: number;
  applicationFeeCents: number;
  feePlanCode: 'flex' | 'solo' | 'growth' | 'scale' | 'enterprise';
  feeCatalogVersion: string;
  feeRateBps: number;
}>;

export type ConnectedCheckoutExpirationManualBinding = Readonly<{
  status: 'manual_reconciliation';
  errorCode: string;
}>;

export type ConnectedCheckoutExpirationProjection = Readonly<{
  schema: typeof CONNECTED_CHECKOUT_EXPIRATION_SCHEMA;
  provider_event_id: string;
  event_type: typeof CONNECTED_CHECKOUT_EXPIRATION_EVENT;
  provider_created_at: string;
  workspace_id: string;
  payment_id: string;
  operation_id: string;
  operation_pk: string;
  invoice_id: string;
  checkout_session_id: string;
  merchant_account_id: string;
  livemode: boolean;
  currency: 'usd';
  amount_cents: number;
  session_expires_at: string;
  mode: 'payment';
  session_status: 'expired';
  payment_status: 'unpaid';
  payment_method_types: readonly ['card'];
  recovered_from: null;
  payment_intent_id: null;
  fee_plan_code: ConnectedCheckoutExpirationBinding['feePlanCode'];
  fee_catalog_version: string;
  fee_rate_bps: number;
  fee_basis_amount_cents: number;
  application_fee_cents: number;
}>;

export type ConnectedCheckoutExpirationProjectResult = Readonly<{
  status: 'processed' | 'manual_reconciliation';
  errorCode: string | null;
  billingEventId: string;
  paymentId: string;
  workspaceId: string;
  applied: boolean;
}>;

export interface ConnectedCheckoutExpirationStore {
  claim(billingEventId: string): Promise<ConnectedCheckoutExpirationClaim>;
  resolveBinding(input: {
    billingEventId: string;
    claimToken: string;
    evidence: ConnectedCheckoutExpirationProviderEvidence;
  }): Promise<ConnectedCheckoutExpirationBinding | ConnectedCheckoutExpirationManualBinding>;
  project(input: {
    billingEventId: string;
    claimToken: string;
    projection: ConnectedCheckoutExpirationProjection;
  }): Promise<ConnectedCheckoutExpirationProjectResult>;
  fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: ConnectedCheckoutExpirationFailureCode;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void>;
}

export interface ConnectedCheckoutExpirationResolver {
  loadProviderEvidence(
    claim: ConnectedCheckoutExpirationClaim,
  ): Promise<ConnectedCheckoutExpirationProviderEvidence>;
  buildProjection(
    evidence: ConnectedCheckoutExpirationProviderEvidence,
    binding: ConnectedCheckoutExpirationBinding,
  ): ConnectedCheckoutExpirationProjection;
}

export type ConnectedCheckoutExpirationFailureCode =
  | 'expiration_provider_mode_mismatch'
  | 'expiration_provider_retrieve_failed'
  | 'expiration_provider_contract_mismatch'
  | 'expiration_metadata_mismatch'
  | 'expiration_internal_error'
  | 'expiration_retry_attempt_limit';

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(label: string, error: RpcError | null): Error {
  const code = error?.code?.trim() || 'unknown';
  return new Error(`${label} (${code}).`);
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
  const seconds = requiredInteger(value, label, 946_684_801);
  return new Date(seconds * 1_000).toISOString();
}

const CLAIM_STATUSES = new Set<ConnectedCheckoutExpirationClaimStatus>([
  'claimed',
  'in_progress',
  'processed',
  'ignored',
  'failed_terminal',
]);

function parseClaim(value: unknown): ConnectedCheckoutExpirationClaim {
  const row = rowRecord(value, 'Connected Checkout expiration claim RPC');
  const status = requiredString(
    row.claim_status,
    'claim status',
  ) as ConnectedCheckoutExpirationClaimStatus;
  if (!CLAIM_STATUSES.has(status)) {
    throw new Error('Connected Checkout expiration claim status is invalid.');
  }
  const eventType = requiredString(row.event_type, 'event type');
  if (eventType !== CONNECTED_CHECKOUT_EXPIRATION_EVENT) {
    throw new Error('Connected Checkout expiration claim returned another event type.');
  }
  const claimToken = row.claim_token == null
    ? null
    : requiredUuid(row.claim_token, 'claim token');
  const attemptCount = requiredInteger(row.attempt_count, 'attempt count');
  if (
    (status === 'claimed' && (
      claimToken === null
      || attemptCount < 1
      || attemptCount > MAX_PROVIDER_ATTEMPTS
    ))
    || (status !== 'claimed' && claimToken !== null)
  ) {
    throw new Error('Connected Checkout expiration claim ownership is invalid.');
  }
  return Object.freeze({
    status,
    billingEventId: requiredUuid(row.billing_event_id, 'billing event ID'),
    claimToken,
    attemptCount,
    providerEventId: requiredString(row.provider_event_id, 'provider event ID', EVENT_ID_PATTERN),
    eventType,
    checkoutSessionId: requiredString(
      row.checkout_session_id,
      'Checkout Session ID',
      CHECKOUT_SESSION_ID_PATTERN,
    ),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    merchantAccountId: requiredString(
      row.merchant_account_id,
      'Merchant account ID',
      ACCOUNT_ID_PATTERN,
    ),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    providerCreatedAt: requiredIsoTimestamp(row.provider_created_at, 'provider creation time'),
  });
}

const PLAN_CODES = new Set<ConnectedCheckoutExpirationBinding['feePlanCode']>([
  'flex', 'solo', 'growth', 'scale', 'enterprise',
]);

function parseBinding(
  value: unknown,
): ConnectedCheckoutExpirationBinding | ConnectedCheckoutExpirationManualBinding {
  const row = rowRecord(value, 'Connected Checkout expiration binding RPC');
  const status = requiredString(row.binding_status, 'binding status');
  if (status === 'manual_reconciliation') {
    return Object.freeze({
      status,
      errorCode: requiredString(
        row.error_code,
        'manual reconciliation code',
        /^expiration_[a-z0-9_]{3,63}$/,
      ),
    });
  }
  if (status !== 'ready' || row.error_code != null) {
    throw new Error('Connected Checkout expiration binding status is invalid.');
  }
  const feePlanCode = requiredString(
    row.fee_plan_code,
    'fee plan code',
  ) as ConnectedCheckoutExpirationBinding['feePlanCode'];
  if (!PLAN_CODES.has(feePlanCode)) {
    throw new Error('Connected Checkout expiration fee plan code is invalid.');
  }
  return Object.freeze({
    status,
    operationPk: requiredUuid(row.operation_pk, 'operation primary key'),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    paymentId: requiredUuid(row.payment_id, 'payment ID'),
    operationId: requiredString(row.operation_id, 'operation ID', OPERATION_ID_PATTERN),
    invoiceId: requiredUuid(row.invoice_id, 'invoice ID'),
    checkoutSessionId: requiredString(
      row.checkout_session_id,
      'Checkout Session ID',
      CHECKOUT_SESSION_ID_PATTERN,
    ),
    merchantAccountId: requiredString(
      row.merchant_account_id,
      'Merchant account ID',
      ACCOUNT_ID_PATTERN,
    ),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    amountCents: requiredInteger(row.amount_cents, 'amount cents', 1),
    feeBasisAmountCents: requiredInteger(row.fee_basis_amount_cents, 'fee basis cents'),
    applicationFeeCents: requiredInteger(row.application_fee_cents, 'application fee cents'),
    feePlanCode,
    feeCatalogVersion: requiredString(row.fee_catalog_version, 'fee catalog version'),
    feeRateBps: requiredInteger(row.fee_rate_bps, 'fee rate bps'),
  });
}

function parseProjectResult(value: unknown): ConnectedCheckoutExpirationProjectResult {
  const row = rowRecord(value, 'Connected Checkout expiration project RPC');
  const status = requiredString(row.processing_status, 'processing status');
  if (status !== 'processed' && status !== 'manual_reconciliation') {
    throw new Error('Connected Checkout expiration projection status is invalid.');
  }
  const errorCode = row.error_code == null
    ? null
    : requiredString(row.error_code, 'projection error code', /^expiration_[a-z0-9_]{3,63}$/);
  if ((status === 'processed') !== (errorCode === null)) {
    throw new Error('Connected Checkout expiration projection result is contradictory.');
  }
  const applied = requiredBoolean(row.projection_applied, 'projection applied');
  if ((status === 'processed') !== applied) {
    throw new Error('Connected Checkout expiration projection application flag is invalid.');
  }
  return Object.freeze({
    status,
    errorCode,
    billingEventId: requiredUuid(row.billing_event_id, 'billing event ID'),
    paymentId: requiredUuid(row.payment_id, 'payment ID'),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    applied,
  });
}

export class SupabaseConnectedCheckoutExpirationStore
implements ConnectedCheckoutExpirationStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claim(billingEventId: string): Promise<ConnectedCheckoutExpirationClaim> {
    const { data, error } = await this.admin.rpc(
      'claim_stripe_connected_checkout_expiration_event',
      { p_billing_event_id: requiredUuid(billingEventId, 'billing event ID') },
    );
    if (error) throw rpcFailure('Unable to claim connected Checkout expiration', error);
    return parseClaim(data);
  }

  async resolveBinding(input: {
    billingEventId: string;
    claimToken: string;
    evidence: ConnectedCheckoutExpirationProviderEvidence;
  }): Promise<ConnectedCheckoutExpirationBinding | ConnectedCheckoutExpirationManualBinding> {
    const { data, error } = await this.admin.rpc(
      'resolve_stripe_connected_checkout_expiration_binding',
      {
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_claim_token: requiredUuid(input.claimToken, 'claim token'),
        p_workspace_id: requiredUuid(input.evidence.workspaceId, 'workspace ID'),
        p_payment_id: requiredUuid(input.evidence.paymentId, 'payment ID'),
        p_operation_id: requiredString(
          input.evidence.operationId,
          'operation ID',
          OPERATION_ID_PATTERN,
        ),
        p_amount_cents: requiredInteger(input.evidence.amountCents, 'amount cents', 1),
      },
    );
    if (error) throw rpcFailure('Unable to bind connected Checkout expiration', error);
    return parseBinding(data);
  }

  async project(input: {
    billingEventId: string;
    claimToken: string;
    projection: ConnectedCheckoutExpirationProjection;
  }): Promise<ConnectedCheckoutExpirationProjectResult> {
    const { data, error } = await this.admin.rpc(
      'project_stripe_connected_checkout_expiration',
      {
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_claim_token: requiredUuid(input.claimToken, 'claim token'),
        p_projection: input.projection,
      },
    );
    if (error) throw rpcFailure('Unable to project connected Checkout expiration', error);
    return parseProjectResult(data);
  }

  async fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: ConnectedCheckoutExpirationFailureCode;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc(
      'fail_stripe_connected_checkout_expiration_event',
      {
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_claim_token: requiredUuid(input.claimToken, 'claim token'),
        p_error_code: input.errorCode,
        p_retryable: input.retryable,
        p_next_attempt_at: input.nextAttemptAt,
      },
    );
    if (error) throw rpcFailure('Unable to record connected Checkout expiration failure', error);
    if (data !== true) {
      throw new Error('Connected Checkout expiration failure RPC was not acknowledged.');
    }
  }
}

export class ConnectedCheckoutExpirationProviderError extends Error {
  override readonly name = 'ConnectedCheckoutExpirationProviderError';

  constructor(
    readonly code: ConnectedCheckoutExpirationFailureCode,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

type ProviderDependencies = Readonly<{
  assertMode(livemode: boolean): void;
  retrieveCheckoutSession(
    checkoutSessionId: string,
    merchantAccountId: string,
  ): Promise<Stripe.Checkout.Session>;
}>;

function assertConfiguredStripeMode(livemode: boolean): void {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(key);
  if (!match || (match[1] === 'live') !== livemode) {
    throw new ConnectedCheckoutExpirationProviderError(
      'expiration_provider_mode_mismatch',
      false,
    );
  }
}

function defaultProviderDependencies(): ProviderDependencies {
  return Object.freeze({
    assertMode: assertConfiguredStripeMode,
    retrieveCheckoutSession: (checkoutSessionId, merchantAccountId) => (
      getStripeClient().checkout.sessions.retrieve(
        checkoutSessionId,
        {},
        { stripeAccount: merchantAccountId },
      )
    ),
  });
}

function providerMismatch(): never {
  throw new ConnectedCheckoutExpirationProviderError(
    'expiration_provider_contract_mismatch',
    false,
  );
}

function metadataMismatch(): never {
  throw new ConnectedCheckoutExpirationProviderError(
    'expiration_metadata_mismatch',
    false,
  );
}

async function providerRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ConnectedCheckoutExpirationProviderError) throw error;
    throw new ConnectedCheckoutExpirationProviderError(
      'expiration_provider_retrieve_failed',
      true,
    );
  }
}

type DirectMetadata = Readonly<{
  workspaceId: string;
  paymentId: string;
  operationId: string;
}>;

function exactDirectMetadata(
  value: unknown,
  claim: ConnectedCheckoutExpirationClaim,
): DirectMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return metadataMismatch();
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
    return metadataMismatch();
  }
  return Object.freeze({ workspaceId, paymentId, operationId });
}

export function createConnectedCheckoutExpirationResolver(
  injected?: Partial<ProviderDependencies>,
): ConnectedCheckoutExpirationResolver {
  const dependencies = injected
    ? ({ ...defaultProviderDependencies(), ...injected } as ProviderDependencies)
    : defaultProviderDependencies();

  return Object.freeze({
    async loadProviderEvidence(
      claim: ConnectedCheckoutExpirationClaim,
    ): Promise<ConnectedCheckoutExpirationProviderEvidence> {
      dependencies.assertMode(claim.livemode);
      const session = await providerRead(() => dependencies.retrieveCheckoutSession(
        claim.checkoutSessionId,
        claim.merchantAccountId,
      ));
      const metadata = exactDirectMetadata(session.metadata, claim);

      let sessionExpiresAt: string;
      try {
        sessionExpiresAt = stripeTimestamp(session.expires_at, 'Session expiration time');
      } catch {
        return providerMismatch();
      }

      if (
        session.id !== claim.checkoutSessionId
        || session.object !== 'checkout.session'
        || session.livemode !== claim.livemode
        || session.mode !== 'payment'
        || session.status !== 'expired'
        || session.payment_status !== 'unpaid'
        || session.currency !== 'usd'
        || !Number.isSafeInteger(session.amount_total)
        || session.amount_total == null
        || session.amount_total <= 0
        || session.amount_total > 99_999_999
        || session.amount_subtotal !== session.amount_total
        || !Array.isArray(session.payment_method_types)
        || session.payment_method_types.length !== 1
        || session.payment_method_types[0] !== 'card'
        || session.recovered_from !== null
        || session.after_expiration?.recovery != null
        || session.payment_intent !== null
        || Date.parse(sessionExpiresAt) > Date.parse(claim.providerCreatedAt)
      ) {
        return providerMismatch();
      }

      return Object.freeze({
        providerEventId: claim.providerEventId,
        eventType: claim.eventType,
        providerCreatedAt: claim.providerCreatedAt,
        workspaceId: metadata.workspaceId,
        paymentId: metadata.paymentId,
        operationId: metadata.operationId,
        checkoutSessionId: claim.checkoutSessionId,
        merchantAccountId: claim.merchantAccountId,
        livemode: claim.livemode,
        currency: 'usd',
        amountCents: session.amount_total,
        sessionExpiresAt,
        mode: 'payment',
        sessionStatus: 'expired',
        paymentStatus: 'unpaid',
        paymentMethodTypes: Object.freeze(['card'] as const),
        recoveredFrom: null,
        paymentIntentId: null,
      });
    },

    buildProjection(
      evidence: ConnectedCheckoutExpirationProviderEvidence,
      binding: ConnectedCheckoutExpirationBinding,
    ): ConnectedCheckoutExpirationProjection {
      if (
        evidence.workspaceId !== binding.workspaceId
        || evidence.paymentId !== binding.paymentId
        || evidence.operationId !== binding.operationId
        || evidence.checkoutSessionId !== binding.checkoutSessionId
        || evidence.merchantAccountId !== binding.merchantAccountId
        || evidence.livemode !== binding.livemode
        || evidence.amountCents !== binding.amountCents
        || binding.feeBasisAmountCents < 0
        || binding.feeBasisAmountCents > binding.amountCents
        || binding.applicationFeeCents < 0
        || binding.applicationFeeCents > binding.feeBasisAmountCents
        || binding.feeRateBps < 0
        || binding.feeRateBps > 10_000
        || Math.round(binding.feeBasisAmountCents * binding.feeRateBps / 10_000)
          !== binding.applicationFeeCents
      ) {
        return providerMismatch();
      }

      return Object.freeze({
        schema: CONNECTED_CHECKOUT_EXPIRATION_SCHEMA,
        provider_event_id: evidence.providerEventId,
        event_type: evidence.eventType,
        provider_created_at: evidence.providerCreatedAt,
        workspace_id: evidence.workspaceId,
        payment_id: evidence.paymentId,
        operation_id: evidence.operationId,
        operation_pk: binding.operationPk,
        invoice_id: binding.invoiceId,
        checkout_session_id: evidence.checkoutSessionId,
        merchant_account_id: evidence.merchantAccountId,
        livemode: evidence.livemode,
        currency: evidence.currency,
        amount_cents: evidence.amountCents,
        session_expires_at: evidence.sessionExpiresAt,
        mode: evidence.mode,
        session_status: evidence.sessionStatus,
        payment_status: evidence.paymentStatus,
        payment_method_types: evidence.paymentMethodTypes,
        recovered_from: evidence.recoveredFrom,
        payment_intent_id: evidence.paymentIntentId,
        fee_plan_code: binding.feePlanCode,
        fee_catalog_version: binding.feeCatalogVersion,
        fee_rate_bps: binding.feeRateBps,
        fee_basis_amount_cents: binding.feeBasisAmountCents,
        application_fee_cents: binding.applicationFeeCents,
      });
    },
  });
}

export type ProjectConnectedCheckoutExpirationResult =
  | Readonly<{
    status: 'in_progress' | 'replay_processed' | 'replay_ignored' | 'failed_terminal';
    billingEventId: string;
    errorCode?: string;
  }>
  | ConnectedCheckoutExpirationProjectResult
  | Readonly<{
    status: 'failed_retryable' | 'failed_terminal';
    billingEventId: string;
    errorCode: ConnectedCheckoutExpirationFailureCode;
  }>;

export type ConnectedCheckoutExpirationDependencies = Readonly<{
  store: ConnectedCheckoutExpirationStore;
  resolver: ConnectedCheckoutExpirationResolver;
  now(): Date;
}>;

function defaultDependencies(): ConnectedCheckoutExpirationDependencies {
  return Object.freeze({
    store: new SupabaseConnectedCheckoutExpirationStore(),
    resolver: createConnectedCheckoutExpirationResolver(),
    now: () => new Date(),
  });
}

function retryAt(now: Date, attemptCount: number): string {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 6));
  const delayMinutes = Math.min(24 * 60, 2 ** exponent * 5);
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

function fixedFailure(error: unknown): {
  code: ConnectedCheckoutExpirationFailureCode;
  retryable: boolean;
} {
  if (error instanceof ConnectedCheckoutExpirationProviderError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: 'expiration_internal_error', retryable: true };
}

export async function projectConnectedCheckoutExpiration(
  billingEventId: string,
  injected?: ConnectedCheckoutExpirationDependencies,
): Promise<ProjectConnectedCheckoutExpirationResult> {
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
  if (!claim.claimToken) {
    throw new Error('Claimed connected Checkout expiration has no ownership token.');
  }

  try {
    const evidence = await dependencies.resolver.loadProviderEvidence(claim);
    const binding = await dependencies.store.resolveBinding({
      billingEventId: claim.billingEventId,
      claimToken: claim.claimToken,
      evidence,
    });
    if (binding.status === 'manual_reconciliation') {
      return {
        status: 'failed_terminal',
        billingEventId: claim.billingEventId,
        errorCode: binding.errorCode,
      };
    }
    const projection = dependencies.resolver.buildProjection(evidence, binding);
    return dependencies.store.project({
      billingEventId: claim.billingEventId,
      claimToken: claim.claimToken,
      projection,
    });
  } catch (error) {
    const failure = fixedFailure(error);
    const retryable = failure.retryable && claim.attemptCount < MAX_PROVIDER_ATTEMPTS;
    const errorCode = retryable
      ? failure.code
      : failure.retryable
        ? 'expiration_retry_attempt_limit'
        : failure.code;
    await dependencies.store.fail({
      billingEventId: claim.billingEventId,
      claimToken: claim.claimToken,
      errorCode,
      retryable,
      nextAttemptAt: retryable ? retryAt(dependencies.now(), claim.attemptCount) : null,
    });
    return {
      status: retryable ? 'failed_retryable' : 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode,
    };
  }
}
