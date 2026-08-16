import 'server-only';

import type Stripe from 'stripe';

import { createAdminClient } from '@/lib/auth';
import type { BillingCycle } from '@/lib/billing/catalog';
import {
  assertConfiguredStripeBillingMode,
  assertSubscriptionCheckoutSession,
  buildBasePlanSubscriptionCheckoutCall,
  buildBasePlanSubscriptionCheckoutIdempotencyKey,
  createPlatformSubscriptionCheckoutSession,
  retrievePlatformSubscriptionCheckoutSession,
  SUBSCRIPTION_CHECKOUT_EXPIRY_TRANSPORT_SECONDS,
  SUBSCRIPTION_CHECKOUT_TTL_SECONDS,
  type PaidBillingPlanId,
  type PlatformSubscriptionCheckoutCall,
  type VerifiedSubscriptionPrice,
} from '@/lib/billing/stripe-billing-subscription-checkout';
import { loadVerifiedStripePlanPrices } from '@/lib/billing/stripe-plan-prices';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import { TERMS_VERSION } from '@/lib/terms';

/**
 * Crash-safe, dark orchestration for the platform's base-plan subscription.
 *
 * There is intentionally no route or active caller. A database claim and a
 * `submitted` transition both commit before Stripe create. Submitted and
 * indeterminate rows are reconciliation-only and are never auto-retried.
 */

export type BasePlanSubscriptionCheckoutInput = Readonly<{
  workspaceId: string;
  operationId: string;
  planCode: PaidBillingPlanId;
  billingInterval: BillingCycle;
  livemode: boolean;
  successUrl: string;
  cancelUrl: string;
  /** ID returned only after the current owner accepts the canonical artifact. */
  recurringConsentAcceptanceId: string;
}>;

export type SubscriptionCheckoutOperationState =
  | 'claimed'
  | 'submitted'
  | 'checkout_created'
  | 'indeterminate'
  | 'activated'
  | 'expired'
  | 'canceled';

export type SubscriptionCheckoutClaimStatus =
  | 'claimed'
  | 'replay'
  | 'in_progress'
  | 'submitted'
  | 'indeterminate'
  | 'activated'
  | 'expired'
  | 'canceled'
  | 'pending_conflict';

export type SubscriptionCheckoutClaim = Readonly<{
  status: SubscriptionCheckoutClaimStatus;
  operationPk: string;
  claimToken: string | null;
  operationState: SubscriptionCheckoutOperationState;
  providerObjectId: string | null;
  providerCustomerId: string | null;
  checkoutExpiresAt: number | null;
}>;

export type SubscriptionCheckoutClaimInput = Readonly<{
  workspaceId: string;
  operationId: string;
  planCode: PaidBillingPlanId;
  billingInterval: BillingCycle;
  catalogVersion: string;
  livemode: boolean;
  priceId: string;
  productId: string;
  currency: 'usd';
  unitAmountCents: number;
  termsVersion: string;
  recurringConsentVersion: string;
  recurringConsentTextSha256: string;
  recurringConsentAcceptanceId: string;
  stripeIdempotencyKey: string;
}>;

export interface SubscriptionCheckoutOperationStore {
  claim(input: SubscriptionCheckoutClaimInput): Promise<SubscriptionCheckoutClaim>;
  beginSubmission(input: {
    operationPk: string;
    claimToken: string;
    checkoutExpiresAt: number;
    requestFingerprint: string;
  }): Promise<void>;
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

const CLAIM_STATUSES = new Set<SubscriptionCheckoutClaimStatus>([
  'claimed',
  'replay',
  'in_progress',
  'submitted',
  'indeterminate',
  'activated',
  'expired',
  'canceled',
  'pending_conflict',
]);

const OPERATION_STATES = new Set<SubscriptionCheckoutOperationState>([
  'claimed',
  'submitted',
  'checkout_created',
  'indeterminate',
  'activated',
  'expired',
  'canceled',
]);

function optionalProviderId(value: unknown, label: string, pattern: RegExp): string | null {
  if (value == null) return null;
  const id = requireString(value, label);
  if (!pattern.test(id)) throw new Error(`${label} is invalid.`);
  return id;
}

function optionalEpochSeconds(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Subscription Checkout expiry is invalid.');
  }
  return parsed;
}

/** Service-role implementation. The migration revokes every direct table write. */
export class SupabaseSubscriptionCheckoutOperationStore implements SubscriptionCheckoutOperationStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claim(input: SubscriptionCheckoutClaimInput): Promise<SubscriptionCheckoutClaim> {
    const { data, error } = await this.admin.rpc('claim_stripe_billing_subscription_checkout', {
      p_account_id: input.workspaceId,
      p_operation_id: input.operationId,
      p_plan_code: input.planCode,
      p_billing_interval: input.billingInterval,
      p_catalog_version: input.catalogVersion,
      p_livemode: input.livemode,
      p_stripe_price_id: input.priceId,
      p_stripe_product_id: input.productId,
      p_currency: input.currency,
      p_unit_amount_cents: input.unitAmountCents,
      p_terms_version: input.termsVersion,
      p_recurring_consent_version: input.recurringConsentVersion,
      p_recurring_consent_text_sha256: input.recurringConsentTextSha256,
      p_recurring_consent_acceptance_id: input.recurringConsentAcceptanceId,
      p_stripe_idempotency_key: input.stripeIdempotencyKey,
    });
    if (error) throw rpcFailure('Unable to claim subscription Checkout operation', error);

    const row = requireRecord(data, 'Subscription Checkout claim');
    const status = requireString(row.claim_status, 'Subscription Checkout claim status');
    const operationState = requireString(row.operation_state, 'Subscription Checkout operation state');
    if (!CLAIM_STATUSES.has(status as SubscriptionCheckoutClaimStatus)) {
      throw new Error(`Subscription Checkout claim returned unsupported status: ${status}.`);
    }
    if (!OPERATION_STATES.has(operationState as SubscriptionCheckoutOperationState)) {
      throw new Error(`Subscription Checkout claim returned unsupported operation state: ${operationState}.`);
    }

    const claimToken = row.claim_token == null
      ? null
      : requireString(row.claim_token, 'Subscription Checkout claim token');
    const providerObjectId = optionalProviderId(
      row.provider_object_id,
      'Subscription Checkout provider object ID',
      /^cs_(?:test|live)_[A-Za-z0-9_]+$/,
    );
    const providerCustomerId = optionalProviderId(
      row.provider_customer_id,
      'Subscription Checkout provider Customer ID',
      /^cus_[A-Za-z0-9]{8,}$/,
    );
    const checkoutExpiresAt = optionalEpochSeconds(row.checkout_expires_at_epoch);

    if (status === 'claimed' && !claimToken) {
      throw new Error('Subscription Checkout database claim did not return its owner token.');
    }
    if (status === 'replay' && !providerObjectId) {
      throw new Error('Subscription Checkout replay did not return its provider object ID.');
    }

    return Object.freeze({
      status: status as SubscriptionCheckoutClaimStatus,
      operationPk: requireString(row.operation_pk, 'Subscription Checkout operation primary key'),
      claimToken,
      operationState: operationState as SubscriptionCheckoutOperationState,
      providerObjectId,
      providerCustomerId,
      checkoutExpiresAt,
    });
  }

  async beginSubmission(input: {
    operationPk: string;
    claimToken: string;
    checkoutExpiresAt: number;
    requestFingerprint: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc(
      'begin_stripe_billing_subscription_checkout_submission',
      {
        p_operation_pk: input.operationPk,
        p_claim_token: input.claimToken,
        p_checkout_expires_at: new Date(input.checkoutExpiresAt * 1_000).toISOString(),
        p_request_fingerprint: input.requestFingerprint,
      },
    );
    if (error) throw rpcFailure('Unable to begin subscription Checkout submission', error);
    if (data !== true) throw new Error('Subscription Checkout begin RPC did not confirm the transition.');
  }

  async complete(input: {
    operationPk: string;
    claimToken: string;
    checkoutSessionId: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('complete_stripe_billing_subscription_checkout', {
      p_operation_pk: input.operationPk,
      p_claim_token: input.claimToken,
      p_checkout_session_id: input.checkoutSessionId,
    });
    if (error) throw rpcFailure('Unable to complete subscription Checkout operation', error);
    if (data !== true) throw new Error('Subscription Checkout completion RPC did not confirm the transition.');
  }

  async markIndeterminate(input: {
    operationPk: string;
    claimToken: string;
    error: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc(
      'mark_stripe_billing_subscription_checkout_indeterminate',
      {
        p_operation_pk: input.operationPk,
        p_claim_token: input.claimToken,
        p_last_error: input.error,
      },
    );
    if (error) throw rpcFailure('Unable to mark subscription Checkout indeterminate', error);
    if (data !== true) throw new Error('Subscription Checkout indeterminate RPC did not confirm the transition.');
  }
}

export type SubscriptionCheckoutDependencies = Readonly<{
  store: SubscriptionCheckoutOperationStore;
  resolveVerifiedPrice(input: {
    planCode: PaidBillingPlanId;
    billingInterval: BillingCycle;
    livemode: boolean;
  }): Promise<VerifiedSubscriptionPrice>;
  createSession(call: PlatformSubscriptionCheckoutCall): Promise<Stripe.Checkout.Session>;
  retrieveSession(checkoutSessionId: string): Promise<Stripe.Checkout.Session>;
  nowEpochSeconds(): number;
}>;

export type BasePlanSubscriptionCheckoutResult = Readonly<{
  outcome: 'created' | 'replayed';
  operationPk: string;
  session: Stripe.Checkout.Session;
}>;

export class SubscriptionCheckoutUnavailableError extends Error {
  override readonly name = 'SubscriptionCheckoutUnavailableError';

  constructor(readonly operationState: string, readonly claimStatus: string) {
    super(`Subscription Checkout is ${operationState}; no new Stripe request was sent.`);
  }
}

export class SubscriptionCheckoutIndeterminateError extends Error {
  override readonly name = 'SubscriptionCheckoutIndeterminateError';

  constructor(
    readonly providerError: unknown,
    readonly persistenceError?: unknown,
  ) {
    super('Subscription Checkout submission outcome is unknown; no automatic retry is allowed.');
  }
}

export class SubscriptionCheckoutPersistenceError extends Error {
  override readonly name = 'SubscriptionCheckoutPersistenceError';

  constructor(readonly persistenceError: unknown) {
    super('Stripe returned a Checkout Session, but durable completion was not confirmed; do not create again.');
  }
}

function errorForAudit(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2_000);
  if (typeof error === 'string') return error.slice(0, 2_000);
  return 'Stripe subscription Checkout failed with a non-Error value; outcome is unknown.';
}

async function resolveDefaultVerifiedPrice(input: {
  planCode: PaidBillingPlanId;
  billingInterval: BillingCycle;
  livemode: boolean;
}): Promise<VerifiedSubscriptionPrice> {
  const bindings = await loadVerifiedStripePlanPrices();
  const key = `${input.planCode}_${input.billingInterval}` as const;
  const price = bindings[key];
  if (price.livemode !== input.livemode) {
    throw new Error('Verified Stripe Price mode does not match the requested billing mode.');
  }
  return price;
}

function defaultDependencies(): SubscriptionCheckoutDependencies {
  return Object.freeze({
    store: new SupabaseSubscriptionCheckoutOperationStore(),
    resolveVerifiedPrice: resolveDefaultVerifiedPrice,
    createSession: createPlatformSubscriptionCheckoutSession,
    retrieveSession: retrievePlatformSubscriptionCheckoutSession,
    nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
  });
}

export async function orchestrateBasePlanSubscriptionCheckout(
  input: BasePlanSubscriptionCheckoutInput,
  dependencies: SubscriptionCheckoutDependencies = defaultDependencies(),
): Promise<BasePlanSubscriptionCheckoutResult> {
  // The process credential, explicit deployment switch, caller intent, Price,
  // durable claim, and provider response must all agree on test/live mode.
  assertConfiguredStripeBillingMode(input.livemode);

  const verifiedPrice = await dependencies.resolveVerifiedPrice({
    planCode: input.planCode,
    billingInterval: input.billingInterval,
    livemode: input.livemode,
  });

  const validationEpochSeconds = dependencies.nowEpochSeconds();
  if (!Number.isSafeInteger(validationEpochSeconds) || validationEpochSeconds <= 0) {
    throw new Error('Subscription Checkout clock returned invalid epoch seconds.');
  }
  const validationExpiresAt = validationEpochSeconds
    + SUBSCRIPTION_CHECKOUT_TTL_SECONDS
    + SUBSCRIPTION_CHECKOUT_EXPIRY_TRANSPORT_SECONDS;

  // Pure construction validates the complete Price/catalog/mode contract
  // before the durable claim. The database-selected Customer is added after
  // claim and the final fingerprint is persisted by the begin RPC.
  const provisionalCall = buildBasePlanSubscriptionCheckoutCall({
    ...input,
    verifiedPrice,
    providerCustomerId: null,
    checkoutExpiresAt: validationExpiresAt,
    recurringConsentAcceptanceId: input.recurringConsentAcceptanceId,
  });
  const stripeIdempotencyKey = buildBasePlanSubscriptionCheckoutIdempotencyKey({
    workspaceId: provisionalCall.contract.workspaceId,
    operationId: provisionalCall.contract.operationId,
    livemode: provisionalCall.contract.livemode,
  });
  const claim = await dependencies.store.claim({
    workspaceId: provisionalCall.contract.workspaceId,
    operationId: provisionalCall.contract.operationId,
    planCode: provisionalCall.contract.planCode,
    billingInterval: provisionalCall.contract.billingInterval,
    catalogVersion: provisionalCall.contract.catalogVersion,
    livemode: provisionalCall.contract.livemode,
    priceId: provisionalCall.contract.priceId,
    productId: provisionalCall.contract.productId,
    currency: provisionalCall.contract.currency,
    unitAmountCents: provisionalCall.contract.unitAmountCents,
    termsVersion: TERMS_VERSION,
    recurringConsentVersion: BASE_PLAN_RECURRING_CONSENT_VERSION,
    recurringConsentTextSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    recurringConsentAcceptanceId: provisionalCall.contract.recurringConsentAcceptanceId,
    stripeIdempotencyKey,
  });

  if (claim.status !== 'replay' && (claim.status !== 'claimed' || !claim.claimToken)) {
    throw new SubscriptionCheckoutUnavailableError(claim.operationState, claim.status);
  }

  const claimToken = claim.status === 'claimed' ? claim.claimToken : null;
  if (claim.status === 'claimed' && !claimToken) {
    throw new Error('Claimed subscription Checkout is missing its owner token.');
  }

  // Price resolution and the durable claim can take arbitrarily long. Anchor
  // the provider expiry again only after this process owns the claimed row so
  // that work cannot consume Stripe's hard 30-minute minimum window.
  const ownedClaimEpochSeconds = claim.status === 'claimed'
    ? dependencies.nowEpochSeconds()
    : null;
  if (
    ownedClaimEpochSeconds !== null
    && (!Number.isSafeInteger(ownedClaimEpochSeconds) || ownedClaimEpochSeconds <= 0)
  ) {
    throw new Error('Subscription Checkout clock returned invalid epoch seconds.');
  }
  const checkoutExpiresAt = claim.status === 'replay'
    ? claim.checkoutExpiresAt
    : ownedClaimEpochSeconds!
      + SUBSCRIPTION_CHECKOUT_TTL_SECONDS
      + SUBSCRIPTION_CHECKOUT_EXPIRY_TRANSPORT_SECONDS;
  if (!checkoutExpiresAt) {
    throw new Error('Recorded subscription Checkout is missing its expiration binding.');
  }
  const call = buildBasePlanSubscriptionCheckoutCall({
    ...input,
    verifiedPrice,
    providerCustomerId: claim.providerCustomerId,
    checkoutExpiresAt,
    recurringConsentAcceptanceId: provisionalCall.contract.recurringConsentAcceptanceId,
  });
  if (call.options.idempotencyKey !== stripeIdempotencyKey) {
    throw new Error('Subscription Checkout idempotency identity changed after database claim.');
  }

  if (claim.status === 'replay') {
    const session = await dependencies.retrieveSession(claim.providerObjectId!);
    assertSubscriptionCheckoutSession(session, call);
    return Object.freeze({ outcome: 'replayed', operationPk: claim.operationPk, session });
  }

  // Recheck immediately before the durable submitted boundary. If this RPC's
  // response is lost, the row stays submitted and no later call creates again.
  assertConfiguredStripeBillingMode(call.contract.livemode);
  await dependencies.store.beginSubmission({
    operationPk: claim.operationPk,
    claimToken: claimToken!,
    checkoutExpiresAt,
    requestFingerprint: call.requestFingerprint,
  });

  let session: Stripe.Checkout.Session;
  try {
    session = await dependencies.createSession(call);
    assertSubscriptionCheckoutSession(session, call);
  } catch (providerError) {
    let persistenceError: unknown;
    try {
      await dependencies.store.markIndeterminate({
        operationPk: claim.operationPk,
        claimToken: claimToken!,
        error: errorForAudit(providerError),
      });
    } catch (markError) {
      persistenceError = markError;
    }
    throw new SubscriptionCheckoutIndeterminateError(providerError, persistenceError);
  }

  try {
    await dependencies.store.complete({
      operationPk: claim.operationPk,
      claimToken: claimToken!,
      checkoutSessionId: session.id,
    });
  } catch (persistenceError) {
    throw new SubscriptionCheckoutPersistenceError(persistenceError);
  }

  return Object.freeze({ outcome: 'created', operationPk: claim.operationPk, session });
}
