import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import type { PaymentFeeSnapshot } from '@/lib/billing/payment-fee';
import {
  buildDirectCheckoutSessionCall,
  createDirectCheckoutSession,
  DIRECT_CHARGE_CURRENCY,
  DIRECT_CHARGE_METADATA_KEYS,
  DIRECT_CHARGE_MODEL,
  retrieveDirectCheckoutSession,
  type DirectCheckoutSessionInput,
} from '@/lib/billing/stripe-direct';

/**
 * Dark-launched orchestration boundary for one-off direct Checkout Sessions.
 *
 * No route or active payment caller imports this module. The database owns the
 * claim/fingerprint/replay ledger; this process only contacts Stripe to create
 * after it receives a claim token and atomically moves that claim to `submitted`.
 */

const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_/;
const CHECKOUT_SESSION_STATUSES = new Set<NonNullable<Stripe.Checkout.Session['status']>>([
  'open',
  'complete',
  'expired',
]);
const CHECKOUT_PAYMENT_STATUSES = new Set<Stripe.Checkout.Session['payment_status']>([
  'paid',
  'unpaid',
  'no_payment_required',
]);

type CheckoutPresentationInput = Readonly<Omit<
  DirectCheckoutSessionInput,
  'merchantAccountId' | 'operationId' | 'amountCents' | 'applicationFeeAmountCents'
>>;

export type OneOffDirectCheckoutOperationInput = Readonly<{
  accountId: string;
  paymentId: string;
  merchantAccountId: string;
  livemode: boolean;
  /** Stable business identity. Reusing it with changed input is rejected by the database. */
  operationId: string;
  /** Exact persisted payment snapshot; amounts are never recalculated by this layer. */
  feeSnapshot: PaymentFeeSnapshot;
  checkout: CheckoutPresentationInput;
}>;

export type DirectCheckoutClaimStatus =
  | 'claimed'
  | 'replay'
  | 'in_progress'
  | 'submitted'
  | 'failed'
  | 'indeterminate';

export type DirectCheckoutClaim = Readonly<{
  status: DirectCheckoutClaimStatus;
  operationPk: string;
  claimToken: string | null;
  operationState: 'claimed' | 'submitted' | 'succeeded' | 'failed' | 'indeterminate';
  providerObjectId: string | null;
}>;

export type DirectCheckoutClaimInput = Readonly<{
  accountId: string;
  paymentId: string;
  merchantAccountId: string;
  livemode: boolean;
  operationId: string;
  stripeIdempotencyKey: string;
  requestFingerprint: string;
  feeSnapshot: PaymentFeeSnapshot;
}>;

export interface DirectCheckoutOperationStore {
  /**
   * Read-only succeeded replay path. Unlike the claim RPC, this deliberately
   * does not require the Merchant account to remain submit-ready: readiness is
   * a create-time gate, while an already-created Session remains provider
   * truth that must be inspected even after the Merchant is disabled.
   */
  findSucceededReplay(input: DirectCheckoutClaimInput): Promise<DirectCheckoutClaim | null>;
  claim(input: DirectCheckoutClaimInput): Promise<DirectCheckoutClaim>;
  beginSubmission(input: { operationPk: string; claimToken: string }): Promise<void>;
  complete(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string;
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
    throw new Error(`${label} returned no operation row.`);
  }
  return row as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
}

const CLAIM_STATUSES = new Set<DirectCheckoutClaimStatus>([
  'claimed',
  'replay',
  'in_progress',
  'submitted',
  'failed',
  'indeterminate',
]);

const OPERATION_STATES = new Set<DirectCheckoutClaim['operationState']>([
  'claimed',
  'submitted',
  'succeeded',
  'failed',
  'indeterminate',
]);

/** Service-role implementation. Direct table writes are revoked by the migration. */
export class SupabaseDirectCheckoutOperationStore implements DirectCheckoutOperationStore {
  constructor(private readonly admin = createAdminClient()) {}

  async findSucceededReplay(input: DirectCheckoutClaimInput): Promise<DirectCheckoutClaim | null> {
    const operationResult = await this.admin
      .from('billing_payment_operations')
      .select('id, account_id, payment_id, operation_type, operation_id, charge_model, stripe_account_id, livemode, stripe_idempotency_key, request_fingerprint, state, provider_object_id, metadata')
      .eq('payment_id', input.paymentId)
      .eq('operation_type', 'checkout_session.create')
      .limit(2);
    if (operationResult.error) {
      throw rpcFailure('Unable to inspect a succeeded direct Checkout replay', operationResult.error);
    }
    if (!operationResult.data || operationResult.data.length === 0) return null;
    if (operationResult.data.length !== 1) {
      throw new Error('Direct Checkout replay lookup returned ambiguous operation rows.');
    }

    const operation = operationResult.data[0] as unknown as Record<string, unknown>;
    if (operation.state !== 'succeeded') return null;
    const operationMetadata = operation.metadata;
    const operationMetadataRecord = (
      operationMetadata
      && typeof operationMetadata === 'object'
      && !Array.isArray(operationMetadata)
    )
      ? operationMetadata as Record<string, unknown>
      : null;
    const recordedFeeSnapshot = operationMetadataRecord?.fee_snapshot;
    const providerObjectId = requireString(
      operation.provider_object_id,
      'Direct Checkout replay provider object ID',
    );
    if (
      operation.account_id !== input.accountId
      || operation.payment_id !== input.paymentId
      || operation.operation_type !== 'checkout_session.create'
      || operation.operation_id !== input.operationId
      || operation.charge_model !== 'direct'
      || operation.stripe_account_id !== input.merchantAccountId
      || operation.livemode !== input.livemode
      || operation.stripe_idempotency_key !== input.stripeIdempotencyKey
      || operation.request_fingerprint !== input.requestFingerprint
      || operationMetadataRecord?.schema !== 'one_off_direct_checkout_v1'
      || !recordedFeeSnapshot
      || typeof recordedFeeSnapshot !== 'object'
      || Array.isArray(recordedFeeSnapshot)
      || (recordedFeeSnapshot as Record<string, unknown>).plan_code !== input.feeSnapshot.planCode
      || (recordedFeeSnapshot as Record<string, unknown>).catalog_version !== input.feeSnapshot.catalogVersion
      || (recordedFeeSnapshot as Record<string, unknown>).fee_rate_bps !== input.feeSnapshot.feeRateBps
      || (recordedFeeSnapshot as Record<string, unknown>).fee_rate !== input.feeSnapshot.feeRate
      || (recordedFeeSnapshot as Record<string, unknown>).gross_amount_cents !== input.feeSnapshot.grossAmountCents
      || (recordedFeeSnapshot as Record<string, unknown>).eligible_service_subtotal_cents
        !== input.feeSnapshot.eligibleServiceSubtotalCents
      || (recordedFeeSnapshot as Record<string, unknown>).application_fee_cents
        !== input.feeSnapshot.applicationFeeCents
    ) {
      throw new Error('Succeeded direct Checkout replay does not match the immutable operation input.');
    }

    const paymentResult = await this.admin
      .from('payments')
      .select('id, account_id, amount, fee_basis_amount, platform_fee, fee_plan_code, fee_catalog_version, fee_rate_bps, fee_rate, charge_model, stripe_account_id, stripe_livemode, stripe_checkout_session')
      .eq('id', input.paymentId)
      .limit(2);
    if (paymentResult.error) {
      throw rpcFailure('Unable to inspect the direct Checkout replay payment', paymentResult.error);
    }
    if (!paymentResult.data || paymentResult.data.length !== 1) {
      throw new Error('Succeeded direct Checkout replay is not bound to exactly one payment.');
    }
    const payment = paymentResult.data[0] as Record<string, unknown>;
    if (
      payment.id !== input.paymentId
      || payment.account_id !== input.accountId
      || !decimalExactlyMatchesScaledInteger(
        payment.amount,
        input.feeSnapshot.grossAmountCents,
        2,
      )
      || !decimalExactlyMatchesScaledInteger(
        payment.fee_basis_amount,
        input.feeSnapshot.eligibleServiceSubtotalCents,
        2,
      )
      || !decimalExactlyMatchesScaledInteger(
        payment.platform_fee,
        input.feeSnapshot.applicationFeeCents,
        2,
      )
      || payment.fee_plan_code !== input.feeSnapshot.planCode
      || payment.fee_catalog_version !== input.feeSnapshot.catalogVersion
      || payment.fee_rate_bps !== input.feeSnapshot.feeRateBps
      || !decimalExactlyMatchesScaledInteger(
        payment.fee_rate,
        input.feeSnapshot.feeRateBps,
        4,
      )
      || payment.charge_model !== 'direct'
      || payment.stripe_account_id !== input.merchantAccountId
      || payment.stripe_livemode !== input.livemode
      || payment.stripe_checkout_session !== providerObjectId
    ) {
      throw new Error('Succeeded direct Checkout replay is not reconciled to its exact payment.');
    }

    return Object.freeze({
      status: 'replay',
      operationPk: requireString(operation.id, 'Direct Checkout replay operation primary key'),
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId,
    });
  }

  async claim(input: DirectCheckoutClaimInput): Promise<DirectCheckoutClaim> {
    const { data, error } = await this.admin.rpc('claim_one_off_direct_checkout_operation', {
      p_account_id: input.accountId,
      p_payment_id: input.paymentId,
      p_stripe_account_id: input.merchantAccountId,
      p_livemode: input.livemode,
      p_operation_id: input.operationId,
      p_stripe_idempotency_key: input.stripeIdempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_gross_amount_cents: input.feeSnapshot.grossAmountCents,
      p_fee_basis_amount_cents: input.feeSnapshot.eligibleServiceSubtotalCents,
      p_application_fee_cents: input.feeSnapshot.applicationFeeCents,
      p_fee_plan_code: input.feeSnapshot.planCode,
      p_fee_catalog_version: input.feeSnapshot.catalogVersion,
      p_fee_rate_bps: input.feeSnapshot.feeRateBps,
      p_fee_rate: input.feeSnapshot.feeRate,
    });
    if (error) throw rpcFailure('Unable to claim direct Checkout operation', error);

    const row = requireRecord(data, 'Direct Checkout claim');
    const status = requireString(row.claim_status, 'Direct Checkout claim status');
    const operationState = requireString(row.operation_state, 'Direct Checkout operation state');
    if (!CLAIM_STATUSES.has(status as DirectCheckoutClaimStatus)) {
      throw new Error(`Direct Checkout claim returned unsupported status: ${status}.`);
    }
    if (!OPERATION_STATES.has(operationState as DirectCheckoutClaim['operationState'])) {
      throw new Error(`Direct Checkout claim returned unsupported operation state: ${operationState}.`);
    }

    const claimToken = row.claim_token == null ? null : requireString(row.claim_token, 'Direct Checkout claim token');
    const providerObjectId = row.provider_object_id == null
      ? null
      : requireString(row.provider_object_id, 'Direct Checkout provider object ID');

    if (status === 'claimed' && !claimToken) {
      throw new Error('Direct Checkout database claim did not return its owner token.');
    }
    if (status === 'replay' && !providerObjectId) {
      throw new Error('Direct Checkout replay did not return its provider object ID.');
    }

    return Object.freeze({
      status: status as DirectCheckoutClaimStatus,
      operationPk: requireString(row.operation_pk, 'Direct Checkout operation primary key'),
      claimToken,
      operationState: operationState as DirectCheckoutClaim['operationState'],
      providerObjectId,
    });
  }

  async beginSubmission(input: { operationPk: string; claimToken: string }): Promise<void> {
    const { data, error } = await this.admin.rpc('begin_one_off_direct_checkout_submission', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
    });
    if (error) throw rpcFailure('Unable to begin direct Checkout submission', error);
    if (data !== true) throw new Error('Direct Checkout begin RPC did not confirm the transition.');
  }

  async complete(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('complete_one_off_direct_checkout_operation', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_checkout_session_id: input.checkoutSessionId,
    });
    if (error) throw rpcFailure('Unable to complete direct Checkout operation', error);
    if (data !== true) throw new Error('Direct Checkout completion RPC did not confirm the transition.');
  }

  async markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    error: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('mark_one_off_direct_checkout_indeterminate', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_last_error: input.error,
    });
    if (error) throw rpcFailure('Unable to mark direct Checkout operation indeterminate', error);
    if (data !== true) throw new Error('Direct Checkout indeterminate RPC did not confirm the transition.');
  }
}

export type DirectCheckoutOperationDependencies = Readonly<{
  store: DirectCheckoutOperationStore;
  createSession(input: DirectCheckoutSessionInput): Promise<Stripe.Checkout.Session>;
  retrieveSession(input: {
    merchantAccountId: string;
    checkoutSessionId: string;
  }): Promise<Stripe.Checkout.Session>;
  nowEpochSeconds(): number;
}>;

type DirectCheckoutProviderLifecycle = Readonly<{
  providerStatus: NonNullable<Stripe.Checkout.Session['status']>;
  providerPaymentStatus: Stripe.Checkout.Session['payment_status'];
  expiresAt: number;
}>;

export type DirectCheckoutPresentation =
  | Readonly<DirectCheckoutProviderLifecycle & {
      state: 'reusable_open';
      checkoutUrl: string;
    }>
  | Readonly<DirectCheckoutProviderLifecycle & {
      state: 'payment_confirming';
    }>
  | Readonly<DirectCheckoutProviderLifecycle & {
      state: 'expired_unpaid';
    }>
  | Readonly<DirectCheckoutProviderLifecycle & {
      state: 'manual_reconciliation';
      reason:
        | 'open_session_reports_payment'
        | 'complete_session_reports_unpaid'
        | 'expired_session_reports_payment'
        | 'positive_payment_reports_no_payment_required';
    }>;

export type OneOffDirectCheckoutOperationResult = Readonly<{
  outcome: 'created' | 'replayed';
  operationPk: string;
  sessionId: string;
  presentation: DirectCheckoutPresentation;
}>;

export class DirectCheckoutSessionVerificationError extends Error {
  override readonly name = 'DirectCheckoutSessionVerificationError';

  constructor(detail: string) {
    super(`Stripe Checkout Session requires manual reconciliation: ${detail}`);
  }
}

export class DirectCheckoutOperationUnavailableError extends Error {
  override readonly name = 'DirectCheckoutOperationUnavailableError';

  constructor(readonly operationState: string) {
    super(`Direct Checkout operation is ${operationState}; no new Stripe request was sent.`);
  }
}

export class DirectCheckoutOperationIndeterminateError extends Error {
  override readonly name = 'DirectCheckoutOperationIndeterminateError';

  constructor(
    message: string,
    readonly providerError: unknown,
    readonly persistenceError?: unknown,
  ) {
    super(message);
  }
}

export class DirectCheckoutOperationPersistenceError extends Error {
  override readonly name = 'DirectCheckoutOperationPersistenceError';

  constructor(readonly persistenceError: unknown) {
    super('Stripe returned a Checkout Session, but its durable completion was not confirmed; do not create again.');
  }
}

function errorForAudit(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2000);
  if (typeof error === 'string') return error.slice(0, 2000);
  return 'Stripe submission failed with a non-Error value; outcome is unknown.';
}

function requireConfiguredStripeMode(livemode: boolean): void {
  if (typeof livemode !== 'boolean') throw new Error('Direct Checkout livemode must be explicit.');
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(key);
  if (!match) {
    throw new Error('STRIPE_SECRET_KEY is missing or does not declare test/live mode.');
  }
  const configuredLivemode = match[1] === 'live';
  if (configuredLivemode !== livemode) {
    throw new Error('Direct Checkout livemode does not match the configured Stripe secret key.');
  }
}

function decimalExactlyMatchesScaledInteger(
  value: unknown,
  expectedScaledInteger: number,
  fractionalDigits: number,
): boolean {
  if (
    !Number.isSafeInteger(expectedScaledInteger)
    || expectedScaledInteger < 0
    || !Number.isSafeInteger(fractionalDigits)
    || fractionalDigits < 0
  ) return false;

  if (typeof value !== 'number' && typeof value !== 'string') return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  const serialized = String(value);
  if (serialized.trim() !== serialized) return false;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(serialized);
  if (!match) return false;

  const fractional = match[2] ?? '';
  const retainedFractional = fractional.slice(0, fractionalDigits).padEnd(fractionalDigits, '0');
  if (/[^0]/.test(fractional.slice(fractionalDigits))) return false;

  try {
    const scale = 10n ** BigInt(fractionalDigits);
    const scaled = BigInt(match[1]) * scale + BigInt(retainedFractional || '0');
    return scaled === BigInt(expectedScaledInteger);
  } catch {
    return false;
  }
}

function metadataExactlyMatches(
  actual: Stripe.Metadata | null,
  expected: Stripe.MetadataParam | undefined,
): boolean {
  if (!actual || !expected) return false;
  const actualEntries = Object.entries(actual).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

function validateCheckoutUrl(value: string | null): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string'
    || !value
    || value.trim() !== value
    || value.length > 4_096
    || /\p{Cc}/u.test(value)
  ) {
    throw new DirectCheckoutSessionVerificationError('the hosted Checkout URL is invalid.');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DirectCheckoutSessionVerificationError('the hosted Checkout URL is invalid.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.origin !== 'https://checkout.stripe.com'
    || parsed.username
    || parsed.password
    || parsed.pathname === '/'
  ) {
    throw new DirectCheckoutSessionVerificationError('the hosted Checkout URL is not trusted.');
  }
  return parsed.toString();
}

function requireValidationClock(nowEpochSeconds: number): number {
  if (!Number.isSafeInteger(nowEpochSeconds) || nowEpochSeconds <= 0) {
    throw new Error('Direct Checkout validation clock returned invalid epoch seconds.');
  }
  return nowEpochSeconds;
}

function assertExpectedSessionId(input: {
  checkoutSessionId: string;
  livemode: boolean;
}): void {
  const expectedPrefix = input.livemode ? 'cs_live_' : 'cs_test_';
  if (
    !CHECKOUT_SESSION_ID_PATTERN.test(input.checkoutSessionId)
    || !input.checkoutSessionId.startsWith(expectedPrefix)
  ) {
    throw new DirectCheckoutSessionVerificationError(
      'the stored Checkout Session ID does not match the payment mode.',
    );
  }
}

function verifyDirectCheckoutSession(input: {
  session: Stripe.Checkout.Session;
  expectedSessionId?: string;
  livemode: boolean;
  merchantAccountId: string;
  operationId: string;
  paymentId: string;
  workspaceId: string;
  grossAmountCents: number;
  expectedMetadata: Stripe.MetadataParam | undefined;
  nowEpochSeconds: number;
}): DirectCheckoutPresentation {
  const { session } = input;
  const expectedPrefix = input.livemode ? 'cs_live_' : 'cs_test_';
  const status = session?.status;
  const paymentStatus = session?.payment_status;

  if (
    !session
    || session.object !== 'checkout.session'
    || !CHECKOUT_SESSION_ID_PATTERN.test(session.id)
    || !session.id.startsWith(expectedPrefix)
    || (input.expectedSessionId !== undefined && session.id !== input.expectedSessionId)
    || session.livemode !== input.livemode
    || session.mode !== 'payment'
    || session.currency !== DIRECT_CHARGE_CURRENCY
    || session.amount_subtotal !== input.grossAmountCents
    || session.amount_total !== input.grossAmountCents
    || session.recovered_from !== null
    || !Array.isArray(session.payment_method_types)
    || session.payment_method_types.length !== 1
    || session.payment_method_types[0] !== 'card'
    || status === null
    || !CHECKOUT_SESSION_STATUSES.has(status)
    || !CHECKOUT_PAYMENT_STATUSES.has(paymentStatus)
    || !Number.isSafeInteger(session.expires_at)
    || session.expires_at <= 0
    || !metadataExactlyMatches(session.metadata, input.expectedMetadata)
    || session.metadata?.[DIRECT_CHARGE_METADATA_KEYS.chargeModel] !== DIRECT_CHARGE_MODEL
    || session.metadata?.[DIRECT_CHARGE_METADATA_KEYS.merchantAccountId] !== input.merchantAccountId
    || session.metadata?.[DIRECT_CHARGE_METADATA_KEYS.operationId] !== input.operationId
    || session.metadata?.lgq_payment_id !== input.paymentId
    || session.metadata?.lgq_workspace_id !== input.workspaceId
  ) {
    throw new DirectCheckoutSessionVerificationError(
      'the provider object does not exactly match the claimed direct-payment contract.',
    );
  }

  const checkoutUrl = validateCheckoutUrl(session.url);
  const lifecycle = Object.freeze({
    providerStatus: status,
    providerPaymentStatus: paymentStatus,
    expiresAt: session.expires_at,
  });

  if (status === 'open' && paymentStatus === 'unpaid') {
    if (session.expires_at <= input.nowEpochSeconds) {
      return Object.freeze({ ...lifecycle, state: 'expired_unpaid' });
    }
    if (!checkoutUrl) {
      throw new DirectCheckoutSessionVerificationError(
        'an open unpaid Session is missing its hosted Checkout URL.',
      );
    }
    return Object.freeze({ ...lifecycle, state: 'reusable_open', checkoutUrl });
  }

  if (status === 'complete' && paymentStatus === 'paid') {
    return Object.freeze({ ...lifecycle, state: 'payment_confirming' });
  }

  if (status === 'expired' && paymentStatus === 'unpaid') {
    return Object.freeze({ ...lifecycle, state: 'expired_unpaid' });
  }

  if (paymentStatus === 'no_payment_required') {
    return Object.freeze({
      ...lifecycle,
      state: 'manual_reconciliation',
      reason: 'positive_payment_reports_no_payment_required',
    });
  }

  return Object.freeze({
    ...lifecycle,
    state: 'manual_reconciliation',
    reason: status === 'open'
      ? 'open_session_reports_payment'
      : status === 'complete'
        ? 'complete_session_reports_unpaid'
        : 'expired_session_reports_payment',
  });
}

function buildOperationResult(input: {
  outcome: OneOffDirectCheckoutOperationResult['outcome'];
  operationPk: string;
  session: Stripe.Checkout.Session;
  presentation: DirectCheckoutPresentation;
}): OneOffDirectCheckoutOperationResult {
  return Object.freeze({
    outcome: input.outcome,
    operationPk: input.operationPk,
    sessionId: input.session.id,
    presentation: input.presentation,
  });
}

function defaultDependencies(): DirectCheckoutOperationDependencies {
  return {
    store: new SupabaseDirectCheckoutOperationStore(),
    createSession: createDirectCheckoutSession,
    retrieveSession: retrieveDirectCheckoutSession,
    nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
  };
}

export async function orchestrateOneOffDirectCheckout(
  input: OneOffDirectCheckoutOperationInput,
  dependencies: DirectCheckoutOperationDependencies = defaultDependencies(),
): Promise<OneOffDirectCheckoutOperationResult> {
  // Account readiness is mode-scoped in the database; pin the process key to
  // that same mode before claiming work so a configuration mistake can never
  // turn a test-mode payment into a live Stripe request (or vice versa).
  requireConfiguredStripeMode(input.livemode);

  // Copy/freeze every caller-owned value that crosses an await. A mutable fee
  // object cannot pass one fingerprint and then supply different cents to Stripe.
  const feeSnapshot = Object.freeze({ ...input.feeSnapshot });
  const metadata = Object.freeze({
    ...(input.checkout.metadata ?? {}),
    lgq_workspace_id: input.accountId,
    lgq_payment_id: input.paymentId,
  });
  const directInput = Object.freeze({
    ...input.checkout,
    metadata,
    merchantAccountId: input.merchantAccountId,
    operationId: input.operationId,
    amountCents: feeSnapshot.grossAmountCents,
    applicationFeeAmountCents: feeSnapshot.applicationFeeCents,
  }) satisfies DirectCheckoutSessionInput;

  // Pure construction validates the direct-only Stripe shape before taking a
  // durable claim. There is no destination-charge adapter or fallback here.
  const call = buildDirectCheckoutSessionCall(directInput);
  const claimInput = Object.freeze({
    accountId: input.accountId,
    paymentId: input.paymentId,
    merchantAccountId: input.merchantAccountId,
    livemode: input.livemode,
    operationId: input.operationId,
    stripeIdempotencyKey: call.options.idempotencyKey,
    requestFingerprint: call.requestFingerprint,
    feeSnapshot,
  });
  let claim = await dependencies.store.findSucceededReplay(claimInput);
  if (!claim) {
    try {
      claim = await dependencies.store.claim(claimInput);
    } catch (claimError) {
      // A concurrent owner can complete between the read-only replay check and
      // the claim RPC. Prefer that exact, now-durable replay over surfacing a
      // stale readiness/claim error; this branch still never creates anew.
      const concurrentReplay = await dependencies.store.findSucceededReplay(claimInput);
      if (!concurrentReplay) throw claimError;
      claim = concurrentReplay;
    }
  }

  if (claim.status === 'replay') {
    assertExpectedSessionId({
      checkoutSessionId: claim.providerObjectId!,
      livemode: input.livemode,
    });
    const session = await dependencies.retrieveSession({
      merchantAccountId: input.merchantAccountId,
      checkoutSessionId: claim.providerObjectId!,
    });
    const presentation = verifyDirectCheckoutSession({
      session,
      expectedSessionId: claim.providerObjectId!,
      livemode: input.livemode,
      merchantAccountId: input.merchantAccountId,
      operationId: input.operationId,
      paymentId: input.paymentId,
      workspaceId: input.accountId,
      grossAmountCents: feeSnapshot.grossAmountCents,
      expectedMetadata: call.params.metadata,
      nowEpochSeconds: requireValidationClock(dependencies.nowEpochSeconds()),
    });
    return buildOperationResult({
      outcome: 'replayed',
      operationPk: claim.operationPk,
      session,
      presentation,
    });
  }

  if (claim.status !== 'claimed' || !claim.claimToken) {
    throw new DirectCheckoutOperationUnavailableError(claim.operationState);
  }

  // If this RPC response is lost after commit, the row remains submitted and a
  // replay is blocked. That is intentionally safer than guessing the call was
  // never made and creating a second Checkout Session.
  await dependencies.store.beginSubmission({
    operationPk: claim.operationPk,
    claimToken: claim.claimToken,
  });

  let session: Stripe.Checkout.Session;
  let presentation: DirectCheckoutPresentation;
  try {
    session = await dependencies.createSession(directInput);
    presentation = verifyDirectCheckoutSession({
      session,
      livemode: input.livemode,
      merchantAccountId: input.merchantAccountId,
      operationId: input.operationId,
      paymentId: input.paymentId,
      workspaceId: input.accountId,
      grossAmountCents: feeSnapshot.grossAmountCents,
      expectedMetadata: call.params.metadata,
      nowEpochSeconds: requireValidationClock(dependencies.nowEpochSeconds()),
    });
  } catch (providerError) {
    let persistenceError: unknown;
    try {
      await dependencies.store.markIndeterminate({
        operationPk: claim.operationPk,
        claimToken: claim.claimToken,
        error: errorForAudit(providerError),
      });
    } catch (markError) {
      persistenceError = markError;
    }
    throw new DirectCheckoutOperationIndeterminateError(
      'Direct Checkout submission outcome is unknown; no automatic retry is allowed.',
      providerError,
      persistenceError,
    );
  }

  try {
    await dependencies.store.complete({
      operationPk: claim.operationPk,
      claimToken: claim.claimToken,
      checkoutSessionId: session.id,
    });
  } catch (persistenceError) {
    // The completion transaction may have committed even if its HTTP response
    // was lost. Leave submitted/succeeded resolution to the next database claim;
    // never issue another Stripe create from this ambiguous branch.
    throw new DirectCheckoutOperationPersistenceError(persistenceError);
  }

  return buildOperationResult({
    outcome: 'created',
    operationPk: claim.operationPk,
    session,
    presentation,
  });
}
