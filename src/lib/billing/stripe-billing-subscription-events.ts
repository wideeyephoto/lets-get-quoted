import 'server-only';

import type Stripe from 'stripe';

import {
  PRICING_CATALOG_VERSION,
} from '@/lib/billing/catalog';
import {
  planCreditGrants,
  workspaceEntitlementCatalogSnapshot,
} from '@/lib/billing/entitlement-catalog';
import {
  assertConfiguredStripeBillingMode,
  BASE_PLAN_SUBSCRIPTION_PURPOSE,
  SUBSCRIPTION_CHECKOUT_METADATA_KEYS,
  type BasePlanSubscriptionMetadata,
} from '@/lib/billing/stripe-billing-subscription-checkout';
import {
  loadVerifiedStripePlanPrices,
  StripePlanPriceBindingError,
  type VerifiedStripePlanPrices,
} from '@/lib/billing/stripe-plan-prices';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import type {
  StripeBillingSubscriptionProjectionResolver,
  StripeSubscriptionProjection,
  StripeSubscriptionProjectionBinding,
  StripeSubscriptionProjectorClaim,
  StripeSubscriptionProviderContext,
} from '@/lib/billing/subscription-event-projector';
import { getStripeClient } from '@/lib/stripe';
import { TERMS_VERSION } from '@/lib/terms';

/**
 * Platform-only Stripe object retrieval and fail-closed normalization for the
 * dark subscription event projector. All public errors have fixed messages and
 * codes; provider objects (including Customer PII) never cross the projection
 * boundary or enter database arguments.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9]{8,}$/;
const INVOICE_ID_PATTERN = /^in_[A-Za-z0-9]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]{8,}$/;
const SUBSCRIPTION_ITEM_ID_PATTERN = /^si_[A-Za-z0-9]{8,}$/;
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,}$/;
const PRODUCT_ID_PATTERN = /^prod_[A-Za-z0-9]{8,}$/;
const OPERATION_ID_PATTERN = /^[^\p{Cc}]{1,200}$/u;

export type StripeSubscriptionProjectionProviderErrorCode =
  | 'billing_mode_configuration_invalid'
  | 'provider_object_retrieve_failed'
  | 'provider_object_contract_mismatch'
  | 'provider_price_retrieve_failed'
  | 'provider_price_contract_mismatch'
  | 'checkout_session_retrieve_failed'
  | 'checkout_session_contract_mismatch'
  | 'checkout_session_ambiguous';

export class StripeSubscriptionProjectionProviderError extends Error {
  override readonly name = 'StripeSubscriptionProjectionProviderError';

  constructor(
    readonly code: StripeSubscriptionProjectionProviderErrorCode,
    readonly retryable: boolean,
  ) {
    super('Stripe Billing subscription projection verification failed.');
  }
}

function fail(
  code: StripeSubscriptionProjectionProviderErrorCode,
  retryable = false,
): never {
  throw new StripeSubscriptionProjectionProviderError(code, retryable);
}

type StripeProviderDependencies = Readonly<{
  retrieveSubscription(subscriptionId: string): Promise<unknown>;
  retrieveInvoice(invoiceId: string): Promise<unknown>;
  retrieveCheckoutSession(sessionId: string): Promise<unknown>;
  listCheckoutSessions(subscriptionId: string): Promise<unknown>;
  loadVerifiedPrices(): Promise<VerifiedStripePlanPrices>;
}>;

export type CreateStripeSubscriptionProjectionResolverOptions = Readonly<{
  dependencies?: StripeProviderDependencies;
  assertMode?: (livemode: boolean) => void;
}>;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, pattern?: RegExp): string | null {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) return null;
  return value;
}

function providerId(value: unknown, pattern: RegExp): string | null {
  if (typeof value === 'string') return stringValue(value, pattern);
  return stringValue(record(value)?.id, pattern);
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function epochIso(value: unknown): string | null {
  const epochSeconds = positiveSafeInteger(value);
  if (epochSeconds === null || epochSeconds <= 946_684_800) return null;
  return new Date(epochSeconds * 1_000).toISOString();
}

function optionalEpochIso(value: unknown): string | null | undefined {
  if (value === null) return null;
  return epochIso(value) ?? undefined;
}

type ParsedSubscriptionMetadata = BasePlanSubscriptionMetadata & Readonly<{
  workspaceId: string;
  operationId: string;
}>;

function exactMetadata(value: unknown): ParsedSubscriptionMetadata | null {
  const metadata = record(value);
  if (!metadata) return null;
  const expectedKeys = Object.values(SUBSCRIPTION_CHECKOUT_METADATA_KEYS).sort();
  if (JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify(expectedKeys)) return null;

  const workspaceId = stringValue(metadata.lgq_workspace_id, UUID_PATTERN)?.toLowerCase();
  const operationId = stringValue(metadata.lgq_operation_id, OPERATION_ID_PATTERN);
  const planCode = stringValue(metadata.lgq_plan_code);
  const billingInterval = stringValue(metadata.lgq_billing_interval);
  const recurringConsentVersion = stringValue(
    metadata.lgq_recurring_consent_version,
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/,
  );
  const recurringConsentTextSha256 = stringValue(
    metadata.lgq_recurring_consent_text_sha256,
    /^[0-9a-f]{64}$/,
  );
  const recurringConsentAcceptanceId = stringValue(
    metadata.lgq_recurring_consent_acceptance_id,
    UUID_PATTERN,
  )?.toLowerCase();
  if (
    !workspaceId
    || !operationId
    || (planCode !== 'solo' && planCode !== 'growth' && planCode !== 'scale')
    || (billingInterval !== 'monthly' && billingInterval !== 'annual')
    || metadata.lgq_billing_purpose !== BASE_PLAN_SUBSCRIPTION_PURPOSE
    || metadata.lgq_catalog_version !== PRICING_CATALOG_VERSION
    || metadata.lgq_terms_version !== TERMS_VERSION
    || recurringConsentVersion !== BASE_PLAN_RECURRING_CONSENT_VERSION
    || recurringConsentTextSha256 !== BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256
    || !recurringConsentAcceptanceId
  ) {
    return null;
  }
  return Object.freeze({
    lgq_billing_purpose: BASE_PLAN_SUBSCRIPTION_PURPOSE,
    lgq_workspace_id: workspaceId,
    lgq_plan_code: planCode,
    lgq_billing_interval: billingInterval,
    lgq_catalog_version: PRICING_CATALOG_VERSION,
    lgq_operation_id: operationId,
    lgq_terms_version: TERMS_VERSION,
    lgq_recurring_consent_version: BASE_PLAN_RECURRING_CONSENT_VERSION,
    lgq_recurring_consent_text_sha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    lgq_recurring_consent_acceptance_id: recurringConsentAcceptanceId,
    workspaceId,
    operationId,
  });
}

const SUBSCRIPTION_STATUSES = new Set<StripeSubscriptionProviderContext['subscriptionStatus']>([
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);

const INVOICE_STATUSES = new Set<NonNullable<StripeSubscriptionProviderContext['invoiceStatus']>>([
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void',
]);

type InvoiceContext = Readonly<{
  id: string;
  status: NonNullable<StripeSubscriptionProviderContext['invoiceStatus']>;
  subscriptionId: string;
  customerId: string;
}>;

function normalizeInvoice(
  rawInvoice: unknown,
  claim: StripeSubscriptionProjectorClaim,
): InvoiceContext {
  const invoice = record(rawInvoice);
  const parent = record(invoice?.parent);
  const subscriptionDetails = record(parent?.subscription_details);
  const id = stringValue(invoice?.id, INVOICE_ID_PATTERN);
  const subscriptionId = providerId(subscriptionDetails?.subscription, SUBSCRIPTION_ID_PATTERN);
  const customerId = providerId(invoice?.customer, CUSTOMER_ID_PATTERN);
  const status = stringValue(invoice?.status) as InvoiceContext['status'] | null;
  if (
    !invoice
    || invoice.object !== 'invoice'
    || id !== claim.providerObjectId
    || invoice.livemode !== claim.livemode
    || invoice.currency !== 'usd'
    || parent?.type !== 'subscription_details'
    || !subscriptionId
    || !customerId
    || !status
    || !INVOICE_STATUSES.has(status)
  ) {
    return fail('provider_object_contract_mismatch');
  }
  return Object.freeze({ id, status, subscriptionId, customerId });
}

function normalizeSubscription(
  rawSubscription: unknown,
  claim: StripeSubscriptionProjectorClaim,
  invoiceContext: InvoiceContext | null,
): StripeSubscriptionProviderContext {
  const subscription = record(rawSubscription);
  const subscriptionId = stringValue(subscription?.id, SUBSCRIPTION_ID_PATTERN);
  const customerId = providerId(subscription?.customer, CUSTOMER_ID_PATTERN);
  const status = stringValue(subscription?.status) as StripeSubscriptionProviderContext['subscriptionStatus'] | null;
  const metadata = exactMetadata(subscription?.metadata);
  const items = record(subscription?.items);
  const itemData = Array.isArray(items?.data) ? items.data : null;
  const item = itemData?.length === 1 ? record(itemData[0]) : null;
  const price = record(item?.price);
  const subscriptionItemId = stringValue(item?.id, SUBSCRIPTION_ITEM_ID_PATTERN);
  const priceId = stringValue(price?.id, PRICE_ID_PATTERN);
  const productId = providerId(price?.product, PRODUCT_ID_PATTERN);
  const periodStart = epochIso(item?.current_period_start);
  const periodEnd = epochIso(item?.current_period_end);
  const cancelAt = optionalEpochIso(subscription?.cancel_at);
  const canceledAt = optionalEpochIso(subscription?.canceled_at);
  const endedAt = optionalEpochIso(subscription?.ended_at);
  const automaticTax = record(subscription?.automatic_tax);

  if (
    !subscription
    || subscription.object !== 'subscription'
    || !subscriptionId
    || (claim.providerObjectType === 'subscription' && subscriptionId !== claim.providerObjectId)
    || subscription.livemode !== claim.livemode
    || !customerId
    || !status
    || !SUBSCRIPTION_STATUSES.has(status)
    || subscription.currency !== 'usd'
    || subscription.collection_method !== 'charge_automatically'
    || subscription.application != null
    || subscription.application_fee_percent != null
    || subscription.on_behalf_of != null
    || subscription.transfer_data != null
    || automaticTax?.enabled !== false
    || !metadata
    || !items
    || items.has_more !== false
    || !item
    || item.quantity !== 1
    || !subscriptionItemId
    || !priceId
    || !productId
    || !periodStart
    || !periodEnd
    || Date.parse(periodEnd) <= Date.parse(periodStart)
    || cancelAt === undefined
    || canceledAt === undefined
    || endedAt === undefined
    || typeof subscription.cancel_at_period_end !== 'boolean'
    || (
      invoiceContext !== null
      && (
        invoiceContext.subscriptionId !== subscriptionId
        || invoiceContext.customerId !== customerId
      )
    )
  ) {
    return fail('provider_object_contract_mismatch');
  }

  return Object.freeze({
    providerEventId: claim.providerEventId,
    eventType: claim.eventType,
    providerObjectId: claim.providerObjectId,
    providerObjectType: claim.providerObjectType,
    livemode: claim.livemode,
    providerCreatedAt: claim.providerCreatedAt,
    workspaceId: metadata.workspaceId,
    operationId: metadata.operationId,
    purpose: metadata.lgq_billing_purpose,
    planCode: metadata.lgq_plan_code,
    billingInterval: metadata.lgq_billing_interval,
    catalogVersion: metadata.lgq_catalog_version,
    termsVersion: metadata.lgq_terms_version,
    recurringConsentVersion: metadata.lgq_recurring_consent_version,
    recurringConsentTextSha256: metadata.lgq_recurring_consent_text_sha256,
    recurringConsentAcceptanceId: metadata.lgq_recurring_consent_acceptance_id,
    customerId,
    subscriptionId,
    subscriptionItemId,
    priceId,
    productId,
    subscriptionStatus: status,
    currency: 'usd',
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt,
    canceledAt,
    endedAt,
    invoiceId: invoiceContext?.id ?? null,
    invoiceStatus: invoiceContext?.status ?? null,
  });
}

function expectedMetadata(
  context: StripeSubscriptionProviderContext,
): BasePlanSubscriptionMetadata {
  return {
    lgq_billing_purpose: BASE_PLAN_SUBSCRIPTION_PURPOSE,
    lgq_workspace_id: context.workspaceId,
    lgq_plan_code: context.planCode,
    lgq_billing_interval: context.billingInterval,
    lgq_catalog_version: PRICING_CATALOG_VERSION,
    lgq_operation_id: context.operationId,
    lgq_terms_version: TERMS_VERSION,
    lgq_recurring_consent_version: BASE_PLAN_RECURRING_CONSENT_VERSION,
    lgq_recurring_consent_text_sha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    lgq_recurring_consent_acceptance_id: context.recurringConsentAcceptanceId,
  };
}

function metadataMatches(value: unknown, expected: BasePlanSubscriptionMetadata): boolean {
  const metadata = record(value);
  if (!metadata) return false;
  const actualEntries = Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

function sessionMatches(
  rawSession: unknown,
  context: StripeSubscriptionProviderContext,
  binding: StripeSubscriptionProjectionBinding,
): rawSession is Stripe.Checkout.Session {
  const session = record(rawSession);
  const expectedPrefix = binding.livemode ? 'cs_live_' : 'cs_test_';
  const expiresAt = positiveSafeInteger(session?.expires_at);
  return Boolean(
    session
    && session.object === 'checkout.session'
    && stringValue(session.id, CHECKOUT_SESSION_ID_PATTERN)?.startsWith(expectedPrefix)
    && session.livemode === binding.livemode
    && session.mode === 'subscription'
    && session.status === 'complete'
    && (session.payment_status === 'paid' || session.payment_status === 'unpaid')
    && session.currency === 'usd'
    && session.client_reference_id === binding.workspaceId
    && session.amount_subtotal === binding.unitAmountCents
    && session.amount_total === binding.unitAmountCents
    && expiresAt !== null
    && new Date(expiresAt * 1_000).toISOString() === binding.checkoutExpiresAt
    && record(session.automatic_tax)?.enabled === false
    && providerId(session.customer, CUSTOMER_ID_PATTERN) === context.customerId
    && providerId(session.subscription, SUBSCRIPTION_ID_PATTERN) === context.subscriptionId
    && metadataMatches(session.metadata, expectedMetadata(context))
  );
}

function bindingMatchesContext(
  context: StripeSubscriptionProviderContext,
  binding: StripeSubscriptionProjectionBinding,
): boolean {
  return (
    binding.workspaceId === context.workspaceId
    && binding.operationId === context.operationId
    && binding.planCode === context.planCode
    && binding.billingInterval === context.billingInterval
    && binding.catalogVersion === context.catalogVersion
    && binding.livemode === context.livemode
    && binding.priceId === context.priceId
    && binding.productId === context.productId
    && binding.currency === context.currency
    && binding.termsVersion === context.termsVersion
    && binding.recurringConsentVersion === context.recurringConsentVersion
    && binding.recurringConsentTextSha256 === context.recurringConsentTextSha256
    && binding.recurringConsentAcceptanceId === context.recurringConsentAcceptanceId
  );
}

function addUtcMonthClamped(value: Date): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month + 1,
    Math.min(day, lastDay),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds(),
  ));
}

function allowanceWindow(
  context: StripeSubscriptionProviderContext,
): { allowanceStart: string; allowanceEnd: string } {
  const start = new Date(context.periodStart);
  const providerEnd = new Date(context.periodEnd);
  const monthlyEnd = addUtcMonthClamped(start);
  const end = new Date(Math.min(providerEnd.getTime(), monthlyEnd.getTime()));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return fail('provider_object_contract_mismatch');
  }
  return { allowanceStart: start.toISOString(), allowanceEnd: end.toISOString() };
}

function paymentEvidence(
  context: StripeSubscriptionProviderContext,
  session: Stripe.Checkout.Session,
): StripeSubscriptionProjection['payment_evidence_kind'] {
  if (
    context.providerObjectType === 'invoice'
    && context.invoiceStatus === 'paid'
    && (context.eventType === 'invoice.paid' || context.eventType === 'invoice.payment_succeeded')
  ) {
    return 'invoice_paid';
  }
  if (context.providerObjectType === 'subscription' && session.payment_status === 'paid') {
    return 'checkout_session_paid';
  }
  return 'none';
}

function defaultProviderDependencies(): StripeProviderDependencies {
  const stripe = getStripeClient();
  return Object.freeze({
    retrieveSubscription: (subscriptionId: string) => stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ['items.data.price.product'] },
    ),
    retrieveInvoice: (invoiceId: string) => stripe.invoices.retrieve(invoiceId, {
      expand: ['parent.subscription_details.subscription'],
    }),
    retrieveCheckoutSession: (sessionId: string) => stripe.checkout.sessions.retrieve(sessionId),
    listCheckoutSessions: (subscriptionId: string) => stripe.checkout.sessions.list({
      subscription: subscriptionId,
      limit: 100,
    }),
    loadVerifiedPrices: () => loadVerifiedStripePlanPrices(),
  });
}

async function retrieveProviderContext(
  claim: StripeSubscriptionProjectorClaim,
  dependencies: StripeProviderDependencies,
  assertMode: (livemode: boolean) => void,
): Promise<StripeSubscriptionProviderContext> {
  try {
    assertMode(claim.livemode);
  } catch {
    return fail('billing_mode_configuration_invalid');
  }

  let invoiceContext: InvoiceContext | null = null;
  let subscriptionId = claim.providerObjectId;
  if (claim.providerObjectType === 'invoice') {
    let rawInvoice: unknown;
    try {
      rawInvoice = await dependencies.retrieveInvoice(claim.providerObjectId);
    } catch {
      return fail('provider_object_retrieve_failed', true);
    }
    invoiceContext = normalizeInvoice(rawInvoice, claim);
    subscriptionId = invoiceContext.subscriptionId;
  }

  let rawSubscription: unknown;
  try {
    rawSubscription = await dependencies.retrieveSubscription(subscriptionId);
  } catch {
    return fail('provider_object_retrieve_failed', true);
  }
  const context = normalizeSubscription(rawSubscription, claim, invoiceContext);

  try {
    assertMode(context.livemode);
  } catch {
    return fail('billing_mode_configuration_invalid');
  }
  return context;
}

async function loadExactSession(
  context: StripeSubscriptionProviderContext,
  binding: StripeSubscriptionProjectionBinding,
  dependencies: StripeProviderDependencies,
): Promise<Stripe.Checkout.Session> {
  if (binding.checkoutSessionId) {
    let session: unknown;
    try {
      session = await dependencies.retrieveCheckoutSession(binding.checkoutSessionId);
    } catch {
      return fail('checkout_session_retrieve_failed', true);
    }
    if (!sessionMatches(session, context, binding)) {
      return fail('checkout_session_contract_mismatch');
    }
    return session;
  }

  // A create request that reached Stripe but lost its response is stored as
  // indeterminate. Recover only through the provider's subscription filter and
  // accept exactly one full contract match; never guess from Customer or time.
  let rawList: unknown;
  try {
    rawList = await dependencies.listCheckoutSessions(context.subscriptionId);
  } catch {
    return fail('checkout_session_retrieve_failed', true);
  }
  const list = record(rawList);
  const data = Array.isArray(list?.data) ? list.data : null;
  if (!data || list?.has_more !== false) return fail('checkout_session_ambiguous');
  const matches = data.filter((session) => sessionMatches(session, context, binding));
  if (matches.length !== 1) return fail('checkout_session_ambiguous');
  const recoveredId = stringValue(record(matches[0])?.id, CHECKOUT_SESSION_ID_PATTERN);
  if (!recoveredId) return fail('checkout_session_ambiguous');
  let recovered: unknown;
  try {
    recovered = await dependencies.retrieveCheckoutSession(recoveredId);
  } catch {
    return fail('checkout_session_retrieve_failed', true);
  }
  if (!sessionMatches(recovered, context, binding)) {
    return fail('checkout_session_contract_mismatch');
  }
  return recovered;
}

async function loadVerifiedPrice(
  context: StripeSubscriptionProviderContext,
  binding: StripeSubscriptionProjectionBinding,
  dependencies: StripeProviderDependencies,
): Promise<void> {
  let prices: VerifiedStripePlanPrices;
  try {
    prices = await dependencies.loadVerifiedPrices();
  } catch (error) {
    if (error instanceof StripePlanPriceBindingError && error.code === 'price_retrieve_failed') {
      return fail('provider_price_retrieve_failed', true);
    }
    return fail('provider_price_contract_mismatch');
  }
  const key = `${binding.planCode}_${binding.billingInterval}` as const;
  const price = prices[key];
  if (
    !price
    || price.priceId !== binding.priceId
    || price.productId !== binding.productId
    || price.priceId !== context.priceId
    || price.productId !== context.productId
    || price.planCode !== binding.planCode
    || price.billingInterval !== binding.billingInterval
    || price.catalogVersion !== binding.catalogVersion
    || price.livemode !== binding.livemode
    || price.currency !== binding.currency
    || price.unitAmountCents !== binding.unitAmountCents
  ) {
    return fail('provider_price_contract_mismatch');
  }
}

async function buildVerifiedProjection(
  context: StripeSubscriptionProviderContext,
  binding: StripeSubscriptionProjectionBinding,
  dependencies: StripeProviderDependencies,
  assertMode: (livemode: boolean) => void,
): Promise<StripeSubscriptionProjection> {
  try {
    assertMode(binding.livemode);
  } catch {
    return fail('billing_mode_configuration_invalid');
  }
  if (!bindingMatchesContext(context, binding)) {
    return fail('provider_object_contract_mismatch');
  }
  await loadVerifiedPrice(context, binding, dependencies);
  const session = await loadExactSession(context, binding, dependencies);
  const entitlement = workspaceEntitlementCatalogSnapshot(
    binding.planCode,
    binding.billingInterval,
  );
  const grants = planCreditGrants(binding.planCode);
  if (grants.length !== 4 || grants.some((grant) => grant.cadence !== 'monthly' || grant.units <= 0)) {
    return fail('provider_object_contract_mismatch');
  }
  const { allowanceStart, allowanceEnd } = allowanceWindow(context);

  return Object.freeze({
    schema: 'stripe_subscription_projection_v1',
    provider_event_id: context.providerEventId,
    event_type: context.eventType,
    event_created_at: context.providerCreatedAt,
    event_object_id: context.providerObjectId,
    workspace_id: binding.workspaceId,
    operation_id: binding.operationId,
    checkout_session_id: session.id,
    customer_id: context.customerId,
    subscription_id: context.subscriptionId,
    subscription_item_id: context.subscriptionItemId,
    price_id: context.priceId,
    product_id: context.productId,
    plan_code: binding.planCode,
    billing_interval: binding.billingInterval,
    catalog_version: binding.catalogVersion,
    currency: 'usd',
    unit_amount_cents: binding.unitAmountCents,
    platform_fee_bps: entitlement.platformFeeBps,
    subscription_status: context.subscriptionStatus,
    period_start: context.periodStart,
    period_end: context.periodEnd,
    cancel_at_period_end: context.cancelAtPeriodEnd,
    cancel_at: context.cancelAt,
    canceled_at: context.canceledAt,
    ended_at: context.endedAt,
    invoice_id: context.invoiceId,
    invoice_status: context.invoiceStatus,
    payment_evidence_kind: paymentEvidence(context, session),
    allowance_start: allowanceStart,
    allowance_end: allowanceEnd,
    feature_limits: entitlement.featureLimits,
    feature_flags: entitlement.featureFlags,
    terms_version: binding.termsVersion,
    recurring_consent_version: binding.recurringConsentVersion,
    recurring_consent_text_sha256: binding.recurringConsentTextSha256,
    recurring_consent_acceptance_id: binding.recurringConsentAcceptanceId,
  });
}

export function createStripeBillingSubscriptionProjectionResolver(
  options: CreateStripeSubscriptionProjectionResolverOptions = {},
): StripeBillingSubscriptionProjectionResolver {
  const dependencies = options.dependencies ?? defaultProviderDependencies();
  const assertMode = options.assertMode ?? assertConfiguredStripeBillingMode;
  return Object.freeze({
    loadProviderContext: (claim: StripeSubscriptionProjectorClaim) => (
      retrieveProviderContext(claim, dependencies, assertMode)
    ),
    buildProjection: (
      context: StripeSubscriptionProviderContext,
      binding: StripeSubscriptionProjectionBinding,
    ) => (
      buildVerifiedProjection(context, binding, dependencies, assertMode)
    ),
  });
}
