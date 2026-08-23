import 'server-only';

import { createAdminClient } from '@/lib/auth';
import type { BillingCycle } from '@/lib/billing/catalog';
import type { PaidBillingPlanId } from '@/lib/billing/stripe-billing-subscription-checkout';
import type { PlatformSubscriptionEventType } from '@/lib/billing/stripe-event-inbox';
import {
  createStripeBillingSubscriptionProjectionResolver,
  ForeignSubscriptionRailError,
  StripeSubscriptionProjectionProviderError,
} from '@/lib/billing/stripe-billing-subscription-events';

/**
 * Dark, crash-safe projector for redacted platform Stripe Billing inbox rows.
 *
 * Nothing in src/app imports this module. A future signed webhook worker may
 * call it only after the separately shipped inbox has durably stored the event.
 * Provider objects are re-retrieved from the platform Stripe account; raw
 * webhook/provider payloads and customer PII are never written by this layer.
 *
 * ACTIVATION BLOCKER: the future scheduler must define a bounded retry budget
 * and an operator-visible dead-letter/requeue policy before invoking this dark
 * projector. Provider and unknown transient failures are intentionally not
 * auto-terminal while no worker exists.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_]{8,}$/;
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9]{8,}$/;
const INVOICE_ID_PATTERN = /^in_[A-Za-z0-9]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]{8,}$/;
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,}$/;
const PRODUCT_ID_PATTERN = /^prod_[A-Za-z0-9]{8,}$/;

export type StripeSubscriptionProjectorClaimStatus =
  | 'claimed'
  | 'in_progress'
  | 'processed'
  | 'ignored'
  | 'failed_terminal';

export type StripeSubscriptionProjectorClaim = Readonly<{
  status: StripeSubscriptionProjectorClaimStatus;
  billingEventId: string;
  claimToken: string | null;
  attemptCount: number;
  providerEventId: string;
  eventType: PlatformSubscriptionEventType;
  providerObjectId: string;
  providerObjectType: 'subscription' | 'invoice';
  livemode: boolean;
  providerCreatedAt: string;
}>;

export type StripeSubscriptionProviderContext = Readonly<{
  providerEventId: string;
  eventType: PlatformSubscriptionEventType;
  providerObjectId: string;
  providerObjectType: 'subscription' | 'invoice';
  livemode: boolean;
  providerCreatedAt: string;
  workspaceId: string;
  operationId: string;
  purpose: 'base_plan_subscription';
  planCode: PaidBillingPlanId;
  billingInterval: BillingCycle;
  catalogVersion: string;
  termsVersion: string;
  recurringConsentVersion: string;
  recurringConsentTextSha256: string;
  recurringConsentAcceptanceId: string;
  customerId: string;
  subscriptionId: string;
  subscriptionItemId: string;
  priceId: string;
  productId: string;
  subscriptionStatus:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
  currency: 'usd';
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  invoiceId: string | null;
  invoiceStatus: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | null;
}>;

/**
 * Which ledger the operation came from, and therefore which rules apply to it.
 *
 * `base_plan_plan_change` operations live in
 * `billing_subscription_plan_change_operations`, have no Checkout Session and no
 * Checkout expiry, and carry their own state vocabulary. Everything downstream
 * that would otherwise reach for a Session has to branch on this rather than
 * infer it from a null, because a null Session is also what an unrecovered
 * `indeterminate` checkout looks like -- and those two need opposite handling.
 */
export type StripeSubscriptionOperationPurpose =
  | 'base_plan_subscription'
  | 'base_plan_plan_change';

export type StripeSubscriptionProjectionBinding = Readonly<{
  operationPk: string;
  /**
   * The two ledgers do NOT share a state vocabulary. 'activated' and
   * 'indeterminate' are the only tokens both use, and 'indeterminate' means a
   * lost Checkout response on one and a lost subscriptions.update response on
   * the other. Always read it together with `operationPurpose`.
   */
  operationState:
    | 'checkout_created' | 'indeterminate' | 'activated' | 'expired' | 'canceled'
    | 'submitted' | 'provider_accepted' | 'abandoned';
  operationPurpose: StripeSubscriptionOperationPurpose;
  workspaceId: string;
  operationId: string;
  checkoutSessionId: string | null;
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
  /** Null for a plan change: a `subscriptions.update` has no Session to expire. */
  checkoutExpiresAt: string | null;
}>;

export type StripeSubscriptionProjection = Readonly<{
  schema: 'stripe_subscription_projection_v1';
  provider_event_id: string;
  event_type: PlatformSubscriptionEventType;
  event_created_at: string;
  event_object_id: string;
  workspace_id: string;
  operation_id: string;
  /**
   * Null for a plan change. The SQL contract still requires the KEY -- its
   * exact-schema check uses `?&`, which a JSON null satisfies -- so this may be
   * null but must never be omitted.
   */
  checkout_session_id: string | null;
  customer_id: string;
  subscription_id: string;
  subscription_item_id: string;
  price_id: string;
  product_id: string;
  plan_code: PaidBillingPlanId;
  billing_interval: BillingCycle;
  catalog_version: string;
  currency: 'usd';
  unit_amount_cents: number;
  platform_fee_bps: number;
  subscription_status: StripeSubscriptionProviderContext['subscriptionStatus'];
  period_start: string;
  period_end: string;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  canceled_at: string | null;
  ended_at: string | null;
  invoice_id: string | null;
  invoice_status: StripeSubscriptionProviderContext['invoiceStatus'];
  payment_evidence_kind: 'none' | 'checkout_session_paid' | 'invoice_paid';
  allowance_start: string;
  allowance_end: string;
  feature_limits: Readonly<Record<string, number>>;
  feature_flags: Readonly<Record<string, boolean>>;
  terms_version: string;
  recurring_consent_version: string;
  recurring_consent_text_sha256: string;
  recurring_consent_acceptance_id: string;
}>;

export interface StripeBillingSubscriptionProjectionResolver {
  loadProviderContext(claim: StripeSubscriptionProjectorClaim): Promise<StripeSubscriptionProviderContext>;
  buildProjection(
    context: StripeSubscriptionProviderContext,
    binding: StripeSubscriptionProjectionBinding,
  ): Promise<StripeSubscriptionProjection>;
}

export type StripeSubscriptionProjectResult = Readonly<{
  status: 'processed' | 'ignored';
  billingSubscriptionId: string;
  workspaceId: string;
  applied: boolean;
  allowancesGranted: boolean;
}>;

export interface StripeBillingSubscriptionProjectionStore {
  claim(billingEventId: string): Promise<StripeSubscriptionProjectorClaim>;
  resolveBinding(input: {
    billingEventId: string;
    claimToken: string;
    context: StripeSubscriptionProviderContext;
  }): Promise<StripeSubscriptionProjectionBinding>;
  project(input: {
    billingEventId: string;
    claimToken: string;
    projection: StripeSubscriptionProjection;
  }): Promise<StripeSubscriptionProjectResult>;
  fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void>;
  /** Record a claimed event as belonging to another rail. Never a failure. */
  ignoreForeignRail(input: {
    billingEventId: string;
    claimToken: string;
  }): Promise<void>;
}

type RpcError = Readonly<{ message?: string; code?: string }>;

function rpcFailure(label: string, error: RpcError | null): Error {
  const detail = error?.message?.trim() || error?.code?.trim() || 'unknown database error';
  return new Error(`${label}: ${detail}`);
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

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} is invalid.`);
  return value;
}

function requiredIsoTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || timestamp <= Date.UTC(2000, 0, 1)) {
    throw new Error(`${label} is invalid.`);
  }
  return new Date(timestamp).toISOString();
}

const CLAIM_STATUSES = new Set<StripeSubscriptionProjectorClaimStatus>([
  'claimed',
  'in_progress',
  'processed',
  'ignored',
  'failed_terminal',
]);

const PLATFORM_EVENT_TYPES = new Set<PlatformSubscriptionEventType>([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',
  'invoice.created',
  'invoice.updated',
  'invoice.finalized',
  'invoice.finalization_failed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.marked_uncollectible',
  'invoice.voided',
]);

/**
 * One accept-list per ledger, mirroring what the SQL binding will bind. Merging
 * them into one set would let a checkout operation present a plan-change state
 * and the reverse, which is precisely the confusion the two tables exist to
 * prevent.
 */
const OPERATION_STATES: Readonly<Record<
  StripeSubscriptionOperationPurpose,
  ReadonlySet<StripeSubscriptionProjectionBinding['operationState']>
>> = Object.freeze({
  base_plan_subscription: new Set([
    'checkout_created',
    'indeterminate',
    'activated',
    'expired',
    'canceled',
  ] as const),
  base_plan_plan_change: new Set([
    'submitted',
    'provider_accepted',
    'activated',
    'indeterminate',
    'abandoned',
  ] as const),
});

const OPERATION_PURPOSES = new Set<StripeSubscriptionOperationPurpose>([
  'base_plan_subscription',
  'base_plan_plan_change',
]);

function parseClaim(value: unknown): StripeSubscriptionProjectorClaim {
  const row = rowRecord(value, 'Stripe subscription event claim RPC');
  const status = requiredString(row.claim_status, 'claim status') as StripeSubscriptionProjectorClaimStatus;
  if (!CLAIM_STATUSES.has(status)) throw new Error('Stripe subscription event claim status is invalid.');
  const eventType = requiredString(row.event_type, 'event type') as PlatformSubscriptionEventType;
  if (!PLATFORM_EVENT_TYPES.has(eventType)) throw new Error('Stripe subscription event type is invalid.');
  const providerObjectType = requiredString(row.provider_object_type, 'provider object type');
  if (providerObjectType !== 'subscription' && providerObjectType !== 'invoice') {
    throw new Error('Stripe subscription provider object type is invalid.');
  }
  const providerObjectId = requiredString(
    row.provider_object_id,
    'provider object ID',
    providerObjectType === 'subscription' ? SUBSCRIPTION_ID_PATTERN : INVOICE_ID_PATTERN,
  );
  const claimToken = row.claim_token == null ? null : requiredUuid(row.claim_token, 'claim token');
  if ((status === 'claimed') !== (claimToken !== null)) {
    throw new Error('Stripe subscription event claim ownership is invalid.');
  }
  return Object.freeze({
    status,
    billingEventId: requiredUuid(row.billing_event_id, 'billing event ID'),
    claimToken,
    attemptCount: requiredInteger(row.attempt_count, 'attempt count'),
    providerEventId: requiredString(row.provider_event_id, 'provider event ID', EVENT_ID_PATTERN),
    eventType,
    providerObjectId,
    providerObjectType,
    livemode: requiredBoolean(row.livemode, 'livemode'),
    providerCreatedAt: requiredIsoTimestamp(row.provider_created_at, 'provider creation time'),
  });
}

function parseBinding(value: unknown): StripeSubscriptionProjectionBinding {
  const row = rowRecord(value, 'Stripe subscription projection binding RPC');
  const operationPurpose = requiredString(
    row.operation_purpose,
    'operation purpose',
  ) as StripeSubscriptionOperationPurpose;
  if (!OPERATION_PURPOSES.has(operationPurpose)) {
    throw new Error('Stripe subscription operation purpose is invalid.');
  }
  const operationState = requiredString(
    row.operation_state,
    'operation state',
  ) as StripeSubscriptionProjectionBinding['operationState'];
  if (!OPERATION_STATES[operationPurpose].has(operationState)) {
    throw new Error('Stripe subscription Checkout operation state is invalid.');
  }
  const planCode = requiredString(row.plan_code, 'plan code') as PaidBillingPlanId;
  if (planCode !== 'solo' && planCode !== 'growth' && planCode !== 'scale') {
    throw new Error('Stripe subscription plan code is invalid.');
  }
  const billingInterval = requiredString(row.billing_interval, 'billing interval') as BillingCycle;
  if (billingInterval !== 'monthly' && billingInterval !== 'annual') {
    throw new Error('Stripe subscription billing interval is invalid.');
  }
  const sessionId = row.checkout_session_id == null
    ? null
    : requiredString(row.checkout_session_id, 'Checkout Session ID', CHECKOUT_SESSION_ID_PATTERN);
  const expiresAt = row.checkout_expires_at == null
    ? null
    : requiredIsoTimestamp(row.checkout_expires_at, 'Checkout expiry');
  // Mirrors the SQL binding's two refusals rather than trusting them. A plan
  // change that arrived carrying a Session would send the Session-shaped path
  // down a rail that has no Session to verify against, and a checkout with no
  // expiry cannot be matched against its own Session at all.
  if (operationPurpose === 'base_plan_plan_change' && (sessionId !== null || expiresAt !== null)) {
    throw new Error('Stripe subscription plan-change operation cannot carry a Checkout Session.');
  }
  if (operationPurpose === 'base_plan_subscription' && expiresAt === null) {
    throw new Error('Stripe subscription Checkout operation is missing its Checkout expiry.');
  }
  return Object.freeze({
    operationPk: requiredUuid(row.operation_pk, 'operation primary key'),
    operationState,
    operationPurpose,
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    operationId: requiredString(row.operation_id, 'operation ID'),
    checkoutSessionId: sessionId,
    planCode,
    billingInterval,
    catalogVersion: requiredString(row.catalog_version, 'catalog version'),
    livemode: requiredBoolean(row.livemode, 'livemode'),
    priceId: requiredString(row.price_id, 'Price ID', PRICE_ID_PATTERN),
    productId: requiredString(row.product_id, 'Product ID', PRODUCT_ID_PATTERN),
    currency: requiredString(row.currency, 'currency') as 'usd',
    unitAmountCents: requiredInteger(row.unit_amount_cents, 'unit amount', 1),
    termsVersion: requiredString(row.terms_version, 'Terms version'),
    recurringConsentVersion: requiredString(
      row.recurring_consent_version,
      'recurring consent version',
    ),
    recurringConsentTextSha256: requiredString(
      row.recurring_consent_text_sha256,
      'recurring consent text digest',
      /^[0-9a-f]{64}$/,
    ),
    recurringConsentAcceptanceId: requiredUuid(
      row.recurring_consent_acceptance_id,
      'recurring consent acceptance ID',
    ),
    checkoutExpiresAt: expiresAt,
  });
}

function parseProjectResult(value: unknown): StripeSubscriptionProjectResult {
  const row = rowRecord(value, 'Stripe subscription projection RPC');
  const status = requiredString(row.processing_status, 'processing status');
  if (status !== 'processed' && status !== 'ignored') {
    throw new Error('Stripe subscription projection status is invalid.');
  }
  return Object.freeze({
    status,
    billingSubscriptionId: requiredUuid(row.billing_subscription_id, 'billing subscription ID'),
    workspaceId: requiredUuid(row.workspace_id, 'workspace ID'),
    applied: requiredBoolean(row.projection_applied, 'projection applied'),
    allowancesGranted: requiredBoolean(row.allowances_granted, 'allowances granted'),
  });
}

/** Service-role store. Every mutation is constrained by a security-definer RPC. */
export class SupabaseStripeBillingSubscriptionProjectionStore
implements StripeBillingSubscriptionProjectionStore {
  constructor(private readonly admin = createAdminClient()) {}

  async claim(billingEventId: string): Promise<StripeSubscriptionProjectorClaim> {
    const eventId = requiredUuid(billingEventId, 'billing event ID');
    const { data, error } = await this.admin.rpc('claim_stripe_billing_subscription_event', {
      p_billing_event_id: eventId,
    });
    if (error) throw rpcFailure('Unable to claim Stripe subscription event', error);
    return parseClaim(data);
  }

  async resolveBinding(input: {
    billingEventId: string;
    claimToken: string;
    context: StripeSubscriptionProviderContext;
  }): Promise<StripeSubscriptionProjectionBinding> {
    const { data, error } = await this.admin.rpc(
      'resolve_stripe_billing_subscription_projection_binding',
      {
        p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
        p_claim_token: requiredUuid(input.claimToken, 'claim token'),
        p_account_id: requiredUuid(input.context.workspaceId, 'workspace ID'),
        p_operation_id: input.context.operationId,
        p_provider_customer_id: requiredString(
          input.context.customerId,
          'Customer ID',
          CUSTOMER_ID_PATTERN,
        ),
        p_provider_subscription_id: requiredString(
          input.context.subscriptionId,
          'Subscription ID',
          SUBSCRIPTION_ID_PATTERN,
        ),
        p_provider_price_id: requiredString(input.context.priceId, 'Price ID', PRICE_ID_PATTERN),
      },
    );
    if (error) throw rpcFailure('Unable to bind Stripe subscription event', error);
    return parseBinding(data);
  }

  async project(input: {
    billingEventId: string;
    claimToken: string;
    projection: StripeSubscriptionProjection;
  }): Promise<StripeSubscriptionProjectResult> {
    const { data, error } = await this.admin.rpc('project_stripe_billing_subscription_event', {
      p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
      p_claim_token: requiredUuid(input.claimToken, 'claim token'),
      p_projection: input.projection,
    });
    if (error) throw rpcFailure('Unable to project Stripe subscription event', error);
    return parseProjectResult(data);
  }

  async fail(input: {
    billingEventId: string;
    claimToken: string;
    errorCode: string;
    retryable: boolean;
    nextAttemptAt: string | null;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('fail_stripe_billing_subscription_event', {
      p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
      p_claim_token: requiredUuid(input.claimToken, 'claim token'),
      p_error_code: requiredString(input.errorCode, 'projection error code'),
      p_retryable: input.retryable,
      p_next_attempt_at: input.nextAttemptAt,
    });
    if (error) throw rpcFailure('Unable to record Stripe subscription projection failure', error);
    if (data !== true) throw new Error('Stripe subscription projection failure RPC was not acknowledged.');
  }

  async ignoreForeignRail(input: {
    billingEventId: string;
    claimToken: string;
  }): Promise<void> {
    const { data, error } = await this.admin.rpc('ignore_foreign_stripe_billing_subscription_event', {
      p_billing_event_id: requiredUuid(input.billingEventId, 'billing event ID'),
      p_claim_token: requiredUuid(input.claimToken, 'claim token'),
    });
    if (error) throw rpcFailure('Unable to record a foreign Stripe subscription event', error);
    if (data !== 'subscription_not_our_rail') {
      throw new Error('Foreign Stripe subscription ignore RPC was not acknowledged.');
    }
  }
}

export type ProjectStripeBillingSubscriptionEventResult =
  | Readonly<{
    status: 'in_progress' | 'replay_processed' | 'replay_ignored' | 'failed_terminal'
      // Another rail owns this subscription. Terminal, and not a failure.
      | 'ignored_foreign_rail';
    billingEventId: string;
  }>
  | (StripeSubscriptionProjectResult & Readonly<{ billingEventId: string }> )
  | Readonly<{
    status: 'failed_retryable' | 'failed_terminal';
    billingEventId: string;
    errorCode: string;
  }>;

export type StripeBillingSubscriptionProjectorDependencies = Readonly<{
  store: StripeBillingSubscriptionProjectionStore;
  resolver: StripeBillingSubscriptionProjectionResolver;
  now(): Date;
}>;

function defaultDependencies(): StripeBillingSubscriptionProjectorDependencies {
  return Object.freeze({
    store: new SupabaseStripeBillingSubscriptionProjectionStore(),
    resolver: createStripeBillingSubscriptionProjectionResolver(),
    now: () => new Date(),
  });
}

function retryAt(now: Date, attemptCount: number): string {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 6));
  const delayMinutes = Math.min(60 * 24, 2 ** exponent * 5);
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

function fixedFailure(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof StripeSubscriptionProjectionProviderError) {
    return { code: error.code, retryable: error.retryable };
  }
  // Never persist exception messages: provider errors can contain request
  // bodies, Customer fields, or identifiers that are outside this ledger's
  // retention contract. Unknown failures are retried for operator inspection.
  return { code: 'projection_internal_error', retryable: true };
}

/**
 * Reconcile one already-signed, already-redacted inbox row. Replays stop before
 * provider egress; crashes after claim are reclaimed only after the DB lease.
 */
export async function projectStripeBillingSubscriptionEvent(
  billingEventId: string,
  injectedDependencies?: StripeBillingSubscriptionProjectorDependencies,
): Promise<ProjectStripeBillingSubscriptionEventResult> {
  const dependencies = injectedDependencies ?? defaultDependencies();
  const claim = await dependencies.store.claim(billingEventId);

  if (claim.status !== 'claimed') {
    const status = claim.status === 'processed'
      ? 'replay_processed'
      : claim.status === 'ignored'
        ? 'replay_ignored'
        : claim.status;
    return Object.freeze({ status, billingEventId: claim.billingEventId });
  }

  const claimToken = claim.claimToken;
  if (!claimToken) throw new Error('Claimed Stripe subscription event is missing ownership.');

  try {
    const context = await dependencies.resolver.loadProviderContext(claim);
    const binding = await dependencies.store.resolveBinding({
      billingEventId: claim.billingEventId,
      claimToken,
      context,
    });
    const projection = await dependencies.resolver.buildProjection(context, binding);
    const result = await dependencies.store.project({
      billingEventId: claim.billingEventId,
      claimToken,
      projection,
    });
    return Object.freeze({ ...result, billingEventId: claim.billingEventId });
  } catch (error) {
    // Another rail's subscription. Not a failure and not a retry: recorded as
    // ignored so the event is accounted for, and left for the purchased-capacity
    // lifecycle sweep, which reads Stripe directly rather than these events.
    if (error instanceof ForeignSubscriptionRailError) {
      await dependencies.store.ignoreForeignRail({
        billingEventId: claim.billingEventId,
        claimToken,
      });
      return Object.freeze({
        status: 'ignored_foreign_rail' as const,
        billingEventId: claim.billingEventId,
      });
    }
    const failure = fixedFailure(error);
    const now = dependencies.now();
    const nextAttemptAt = failure.retryable ? retryAt(now, claim.attemptCount) : null;
    await dependencies.store.fail({
      billingEventId: claim.billingEventId,
      claimToken,
      errorCode: failure.code,
      retryable: failure.retryable,
      nextAttemptAt,
    });
    return Object.freeze({
      status: failure.retryable ? 'failed_retryable' : 'failed_terminal',
      billingEventId: claim.billingEventId,
      errorCode: failure.code,
    });
  }
}
