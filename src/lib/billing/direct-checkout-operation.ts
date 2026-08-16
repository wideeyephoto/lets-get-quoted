import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import type { PaymentFeeSnapshot } from '@/lib/billing/payment-fee';
import {
  buildDirectCheckoutSessionCall,
  createDirectCheckoutSession,
  retrieveDirectCheckoutSession,
  type DirectCheckoutSessionInput,
} from '@/lib/billing/stripe-direct';

/**
 * Dark-launched orchestration boundary for one-off direct Checkout Sessions.
 *
 * No route or active payment caller imports this module. The database owns the
 * claim/fingerprint/replay decision; this process only contacts Stripe after it
 * receives a claim token and atomically moves that claim to `submitted`.
 */

const CHECKOUT_SESSION_ID_PATTERN = /^cs_[A-Za-z0-9_]+$/;
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_/;

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
}>;

export type OneOffDirectCheckoutOperationResult = Readonly<{
  outcome: 'created' | 'replayed';
  operationPk: string;
  session: Stripe.Checkout.Session;
}>;

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

function defaultDependencies(): DirectCheckoutOperationDependencies {
  return {
    store: new SupabaseDirectCheckoutOperationStore(),
    createSession: createDirectCheckoutSession,
    retrieveSession: retrieveDirectCheckoutSession,
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
  const claim = await dependencies.store.claim({
    accountId: input.accountId,
    paymentId: input.paymentId,
    merchantAccountId: input.merchantAccountId,
    livemode: input.livemode,
    operationId: input.operationId,
    stripeIdempotencyKey: call.options.idempotencyKey,
    requestFingerprint: call.requestFingerprint,
    feeSnapshot,
  });

  if (claim.status === 'replay') {
    const session = await dependencies.retrieveSession({
      merchantAccountId: input.merchantAccountId,
      checkoutSessionId: claim.providerObjectId!,
    });
    return Object.freeze({ outcome: 'replayed', operationPk: claim.operationPk, session });
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
  try {
    session = await dependencies.createSession(directInput);
    if (!CHECKOUT_SESSION_ID_PATTERN.test(session.id)) {
      throw new Error('Stripe returned an invalid Checkout Session ID.');
    }
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

  return Object.freeze({ outcome: 'created', operationPk: claim.operationPk, session });
}
