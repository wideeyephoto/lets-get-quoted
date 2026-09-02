import 'server-only';

import { createHash } from 'node:crypto';
import type Stripe from 'stripe';

import { APP_ORIGIN } from '@/lib/app-origin';
import {
  BILLING_PLANS,
  PRICING_CATALOG_VERSION,
  basePriceCents,
  type BillingCycle,
  type BillingPlanId,
} from '@/lib/billing/catalog';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import { getStripeClient } from '@/lib/stripe';
import { TERMS_VERSION } from '@/lib/terms';

/**
 * Dark platform-account adapter for a first paid LGQ base subscription.
 *
 * This file has no active caller. It accepts no Price ID, amount, metadata, or
 * connected-account context from a future route. Those values come from the
 * canonical catalog plus the separately verified Stripe Price snapshot.
 */

export const BASE_PLAN_SUBSCRIPTION_PURPOSE = 'base_plan_subscription' as const;
export const SUBSCRIPTION_CHECKOUT_CURRENCY = 'usd' as const;
export const SUBSCRIPTION_CHECKOUT_TTL_SECONDS = 30 * 60;
// Stripe validates `expires_at` at provider receipt, after the durable begin
// RPC. A tiny transport allowance keeps a nominal 30-minute Session from
// arriving below Stripe's hard 30-minute minimum.
export const SUBSCRIPTION_CHECKOUT_EXPIRY_TRANSPORT_SECONDS = 10;

export const SUBSCRIPTION_CHECKOUT_METADATA_KEYS = Object.freeze({
  purpose: 'lgq_billing_purpose',
  workspaceId: 'lgq_workspace_id',
  planCode: 'lgq_plan_code',
  billingInterval: 'lgq_billing_interval',
  catalogVersion: 'lgq_catalog_version',
  operationId: 'lgq_operation_id',
  termsVersion: 'lgq_terms_version',
  recurringConsentVersion: 'lgq_recurring_consent_version',
  recurringConsentTextSha256: 'lgq_recurring_consent_text_sha256',
  recurringConsentAcceptanceId: 'lgq_recurring_consent_acceptance_id',
} as const);

export type PaidBillingPlanId = Exclude<BillingPlanId, 'flex'>;

/** Narrow structural seam over the dark Price resolver's immutable output. */
export type VerifiedSubscriptionPrice = Readonly<{
  bindingKey: `${PaidBillingPlanId}_${BillingCycle}`;
  priceId: string;
  productId: string;
  planCode: PaidBillingPlanId;
  billingInterval: BillingCycle;
  catalogVersion: typeof PRICING_CATALOG_VERSION;
  livemode: boolean;
  currency: typeof SUBSCRIPTION_CHECKOUT_CURRENCY;
  unitAmountCents: number;
  recurringInterval: 'month' | 'year';
  recurringIntervalCount: 1;
}>;

export type BasePlanSubscriptionMetadata = Readonly<{
  lgq_billing_purpose: typeof BASE_PLAN_SUBSCRIPTION_PURPOSE;
  lgq_workspace_id: string;
  lgq_plan_code: PaidBillingPlanId;
  lgq_billing_interval: BillingCycle;
  lgq_catalog_version: typeof PRICING_CATALOG_VERSION;
  lgq_operation_id: string;
  lgq_terms_version: typeof TERMS_VERSION;
  lgq_recurring_consent_version: typeof BASE_PLAN_RECURRING_CONSENT_VERSION;
  lgq_recurring_consent_text_sha256: typeof BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256;
  lgq_recurring_consent_acceptance_id: string;
}>;

export type SubscriptionCheckoutDiscount = Readonly<{
  coupon?: string;
  promotion_code?: string;
}>;

export type SubscriptionCheckoutBuildInput = Readonly<{
  workspaceId: string;
  /** Stable business identity. It must be reused for a retry of the same intent. */
  operationId: string;
  planCode: PaidBillingPlanId;
  billingInterval: BillingCycle;
  livemode: boolean;
  successUrl: string;
  cancelUrl: string;
  verifiedPrice: VerifiedSubscriptionPrice;
  /** Database-resolved platform Customer for this workspace/mode, if known. */
  providerCustomerId: string | null;
  /** Server-calculated epoch seconds, persisted before Stripe create. */
  checkoutExpiresAt: number;
  /** Authenticated owner acceptance recorded before this operation is claimed. */
  recurringConsentAcceptanceId: string;
  /** Optional pre-applied discounts (e.g. Friends & Family coupon). */
  discounts?: ReadonlyArray<SubscriptionCheckoutDiscount>;
  /** Optional self-serve promotion code entry on the Stripe Checkout page. */
  allowPromotionCodes?: boolean;
}>;

export type PlatformSubscriptionCheckoutRequestOptions = Readonly<{
  /** Deliberately the only request option: no stripeAccount header is allowed. */
  idempotencyKey: string;
}>;

export type PlatformSubscriptionCheckoutCall = Readonly<{
  params: Readonly<Stripe.Checkout.SessionCreateParams>;
  options: PlatformSubscriptionCheckoutRequestOptions;
  requestFingerprint: string;
  contract: Readonly<{
    workspaceId: string;
    operationId: string;
    purpose: typeof BASE_PLAN_SUBSCRIPTION_PURPOSE;
    planCode: PaidBillingPlanId;
    billingInterval: BillingCycle;
    catalogVersion: typeof PRICING_CATALOG_VERSION;
    livemode: boolean;
    priceId: string;
    productId: string;
    currency: typeof SUBSCRIPTION_CHECKOUT_CURRENCY;
    unitAmountCents: number;
    providerCustomerId: string | null;
    checkoutExpiresAt: number;
    termsVersion: typeof TERMS_VERSION;
    recurringConsentVersion: typeof BASE_PLAN_RECURRING_CONSENT_VERSION;
    recurringConsentTextSha256: typeof BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256;
    recurringConsentAcceptanceId: string;
    discounts?: ReadonlyArray<SubscriptionCheckoutDiscount> | null;
    allowPromotionCodes?: boolean | null;
  }>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,}$/;
const PRODUCT_ID_PATTERN = /^prod_[A-Za-z0-9]{8,}$/;
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]{8,}$/;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:test|live)_[A-Za-z0-9_]+$/;
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_\S{8,}$/;
const CONFIGURED_APP_ORIGIN = new URL(APP_ORIGIN).origin;

function requireWorkspaceId(value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error('workspaceId must be a UUID.');
  return normalized.toLowerCase();
}

function requireOperationId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /\p{Cc}/u.test(normalized)) {
    throw new Error('operationId must contain 1-200 non-control characters.');
  }
  return normalized;
}

function requireReturnUrl(value: string, label: 'successUrl' | 'cancelUrl'): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_048 || /\p{Cc}/u.test(normalized)) {
    throw new Error(`${label} must be a valid configured-origin URL.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid configured-origin URL.`);
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.origin !== CONFIGURED_APP_ORIGIN
    || parsed.username
    || parsed.password
  ) {
    throw new Error(`${label} must be a valid configured-origin URL.`);
  }
  return normalized;
}

function requirePaidPlan(value: PaidBillingPlanId): PaidBillingPlanId {
  if (value !== 'solo' && value !== 'growth' && value !== 'scale') {
    throw new Error('Subscription Checkout only supports Solo, Growth, or Scale.');
  }
  return value;
}

function requireBillingInterval(value: BillingCycle): BillingCycle {
  if (value !== 'monthly' && value !== 'annual') {
    throw new Error('Subscription Checkout billing interval must be monthly or annual.');
  }
  return value;
}

function requireProviderCustomerId(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!CUSTOMER_ID_PATTERN.test(normalized) || normalized.length > 255) {
    throw new Error('Database-resolved platform Customer ID is invalid.');
  }
  return normalized;
}

function requireCheckoutExpiresAt(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('checkoutExpiresAt must be positive epoch seconds.');
  }
  return value;
}

function requireRecurringConsentAcceptanceId(value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('Recurring-subscription consent acceptance ID must be a UUID.');
  }
  return normalized.toLowerCase();
}

function validateVerifiedPrice(
  input: SubscriptionCheckoutBuildInput,
  planCode: PaidBillingPlanId,
  billingInterval: BillingCycle,
): VerifiedSubscriptionPrice {
  const price = input.verifiedPrice;
  const expectedBindingKey = `${planCode}_${billingInterval}` as const;
  const expectedInterval = billingInterval === 'monthly' ? 'month' : 'year';
  const expectedAmount = basePriceCents(BILLING_PLANS[planCode], billingInterval);

  if (
    !price
    || price.bindingKey !== expectedBindingKey
    || !PRICE_ID_PATTERN.test(price.priceId)
    || !PRODUCT_ID_PATTERN.test(price.productId)
    || price.planCode !== planCode
    || price.billingInterval !== billingInterval
    || price.catalogVersion !== PRICING_CATALOG_VERSION
    || typeof price.livemode !== 'boolean'
    || price.livemode !== input.livemode
    || price.currency !== SUBSCRIPTION_CHECKOUT_CURRENCY
    || price.unitAmountCents !== expectedAmount
    || price.recurringInterval !== expectedInterval
    || price.recurringIntervalCount !== 1
  ) {
    throw new Error('Verified Stripe Price does not match the requested canonical subscription.');
  }

  // Copy every primitive out of the resolver-owned object. A mutable test seam
  // cannot change a Price after it passes the contract and before Stripe create.
  return Object.freeze({
    bindingKey: price.bindingKey,
    priceId: price.priceId,
    productId: price.productId,
    planCode: price.planCode,
    billingInterval: price.billingInterval,
    catalogVersion: price.catalogVersion,
    livemode: price.livemode,
    currency: price.currency,
    unitAmountCents: price.unitAmountCents,
    recurringInterval: price.recurringInterval,
    recurringIntervalCount: price.recurringIntervalCount,
  });
}

function canonicalizeForFingerprint(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Subscription fingerprint values must be finite.');
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((child) => child === undefined ? null : canonicalizeForFingerprint(child));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = canonicalizeForFingerprint(child);
    }
    return output;
  }
  throw new Error('Subscription fingerprint values must be JSON-compatible.');
}

function sha256Fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeForFingerprint(value)))
    .digest('hex');
}

export function buildBasePlanSubscriptionCheckoutIdempotencyKey(input: {
  workspaceId: string;
  operationId: string;
  livemode: boolean;
}): string {
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const operationId = requireOperationId(input.operationId);
  if (typeof input.livemode !== 'boolean') throw new Error('Stripe Billing livemode must be explicit.');
  const digest = createHash('sha256')
    .update([
      BASE_PLAN_SUBSCRIPTION_PURPOSE,
      workspaceId,
      operationId,
      input.livemode ? 'live' : 'test',
    ].join('\0'))
    .digest('hex');
  return `lgq:billing:v1:subscription_checkout.create:${digest}`;
}

export function assertConfiguredStripeBillingMode(livemode: boolean): void {
  if (typeof livemode !== 'boolean') throw new Error('Stripe Billing livemode must be explicit.');

  const configuredMode = process.env.LGQ_STRIPE_BILLING_LIVEMODE;
  if (configuredMode !== '0' && configuredMode !== '1') {
    throw new Error('LGQ_STRIPE_BILLING_LIVEMODE must be exactly 0 or 1.');
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(secretKey);
  if (!match) throw new Error('STRIPE_SECRET_KEY does not declare a valid test/live mode.');

  const environmentLivemode = configuredMode === '1';
  const credentialLivemode = match[1] === 'live';
  if (environmentLivemode !== credentialLivemode || livemode !== credentialLivemode) {
    throw new Error('Stripe Billing mode, credential mode, and requested mode must match.');
  }
}

export function buildBasePlanSubscriptionCheckoutCall(
  input: SubscriptionCheckoutBuildInput,
): PlatformSubscriptionCheckoutCall {
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const operationId = requireOperationId(input.operationId);
  const planCode = requirePaidPlan(input.planCode);
  const billingInterval = requireBillingInterval(input.billingInterval);
  const verifiedPrice = validateVerifiedPrice(input, planCode, billingInterval);
  const providerCustomerId = requireProviderCustomerId(input.providerCustomerId);
  const checkoutExpiresAt = requireCheckoutExpiresAt(input.checkoutExpiresAt);
  const recurringConsentAcceptanceId = requireRecurringConsentAcceptanceId(
    input.recurringConsentAcceptanceId,
  );

  const metadata = Object.freeze({
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.purpose]: BASE_PLAN_SUBSCRIPTION_PURPOSE,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.workspaceId]: workspaceId,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.planCode]: planCode,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.billingInterval]: billingInterval,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.catalogVersion]: PRICING_CATALOG_VERSION,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.operationId]: operationId,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.termsVersion]: TERMS_VERSION,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.recurringConsentVersion]: BASE_PLAN_RECURRING_CONSENT_VERSION,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.recurringConsentTextSha256]: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.recurringConsentAcceptanceId]: recurringConsentAcceptanceId,
  }) as BasePlanSubscriptionMetadata;

  const lineItem = Object.freeze({ price: verifiedPrice.priceId, quantity: 1 as const });
  // Stripe's SDK models this as a mutable array even though this adapter never
  // mutates it. Freeze at runtime, then expose the SDK-compatible view.
  const lineItems = Object.freeze([lineItem]) as unknown as NonNullable<
    Stripe.Checkout.SessionCreateParams['line_items']
  >;
  const adaptivePricing = Object.freeze({ enabled: false as const });
  const automaticTax = Object.freeze({ enabled: false as const });
  const paymentMethodTypes = Object.freeze(['card' as const]) as unknown as NonNullable<
    Stripe.Checkout.SessionCreateParams['payment_method_types']
  >;
  const subscriptionData = Object.freeze({ metadata });
  const params: Readonly<Stripe.Checkout.SessionCreateParams> = Object.freeze({
    mode: 'subscription' as const,
    ui_mode: 'hosted_page' as const,
    submit_type: 'subscribe' as const,
    // Defense in depth: the Price resolver rejects currency_options, while the
    // Session also pins USD and disables dashboard-controlled Adaptive Pricing.
    currency: SUBSCRIPTION_CHECKOUT_CURRENCY,
    adaptive_pricing: adaptivePricing,
    automatic_tax: automaticTax,
    payment_method_types: paymentMethodTypes,
    expires_at: checkoutExpiresAt,
    line_items: lineItems,
    client_reference_id: workspaceId,
    success_url: requireReturnUrl(input.successUrl, 'successUrl'),
    cancel_url: requireReturnUrl(input.cancelUrl, 'cancelUrl'),
    metadata,
    subscription_data: subscriptionData,
    ...(providerCustomerId ? { customer: providerCustomerId } : {}),
    ...(input.discounts && input.discounts.length > 0
      ? { discounts: input.discounts.map((d) => ({ ...d })) }
      : {}),
    ...(typeof input.allowPromotionCodes === 'boolean'
      ? { allow_promotion_codes: input.allowPromotionCodes }
      : {}),
  });

  const contract = Object.freeze({
    workspaceId,
    operationId,
    purpose: BASE_PLAN_SUBSCRIPTION_PURPOSE,
    planCode,
    billingInterval,
    catalogVersion: PRICING_CATALOG_VERSION,
    livemode: verifiedPrice.livemode,
    priceId: verifiedPrice.priceId,
    productId: verifiedPrice.productId,
    currency: SUBSCRIPTION_CHECKOUT_CURRENCY,
    unitAmountCents: verifiedPrice.unitAmountCents,
    providerCustomerId,
    checkoutExpiresAt,
    termsVersion: TERMS_VERSION,
    recurringConsentVersion: BASE_PLAN_RECURRING_CONSENT_VERSION,
    recurringConsentTextSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    recurringConsentAcceptanceId,
    ...(input.discounts ? { discounts: Object.freeze(input.discounts.map((d) => Object.freeze({ ...d }))) } : {}),
    ...(typeof input.allowPromotionCodes === 'boolean' ? { allowPromotionCodes: input.allowPromotionCodes } : {}),
  });
  const options = Object.freeze({
    idempotencyKey: buildBasePlanSubscriptionCheckoutIdempotencyKey({
      workspaceId,
      operationId,
      livemode: verifiedPrice.livemode,
    }),
  });

  return Object.freeze({
    params,
    options,
    contract,
    requestFingerprint: sha256Fingerprint({
      operation: 'subscription_checkout.create',
      params,
      contract,
    }),
  });
}

function metadataExactlyMatches(
  value: Stripe.Metadata | Stripe.MetadataParam | null,
  expected: BasePlanSubscriptionMetadata,
): boolean {
  if (!value) return false;
  const actualEntries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

function providerCustomerMatches(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  expected: string | null,
): boolean {
  if (expected === null) return true;
  return typeof value === 'string' ? value === expected : value?.id === expected;
}

function assertPlatformSubscriptionCheckoutCreateCall(
  call: PlatformSubscriptionCheckoutCall,
): void {
  assertConfiguredStripeBillingMode(call.contract.livemode);

  const expectedMetadata: BasePlanSubscriptionMetadata = {
    lgq_billing_purpose: call.contract.purpose,
    lgq_workspace_id: call.contract.workspaceId,
    lgq_plan_code: call.contract.planCode,
    lgq_billing_interval: call.contract.billingInterval,
    lgq_catalog_version: call.contract.catalogVersion,
    lgq_operation_id: call.contract.operationId,
    lgq_terms_version: call.contract.termsVersion,
    lgq_recurring_consent_version: call.contract.recurringConsentVersion,
    lgq_recurring_consent_text_sha256: call.contract.recurringConsentTextSha256,
    lgq_recurring_consent_acceptance_id: call.contract.recurringConsentAcceptanceId,
  };
  const lineItems = call.params.line_items;
  const subscriptionData = call.params.subscription_data;
  const optionKeys = Object.keys(call.options);
  const expectedIdempotencyKey = buildBasePlanSubscriptionCheckoutIdempotencyKey({
    workspaceId: call.contract.workspaceId,
    operationId: call.contract.operationId,
    livemode: call.contract.livemode,
  });
  const expectedFingerprint = sha256Fingerprint({
    operation: 'subscription_checkout.create',
    params: call.params,
    contract: call.contract,
  });

  if (
    call.contract.purpose !== BASE_PLAN_SUBSCRIPTION_PURPOSE
    || call.contract.currency !== SUBSCRIPTION_CHECKOUT_CURRENCY
    || call.params.mode !== 'subscription'
    || call.params.ui_mode !== 'hosted_page'
    || call.params.submit_type !== 'subscribe'
    || call.params.currency !== SUBSCRIPTION_CHECKOUT_CURRENCY
    || call.params.adaptive_pricing?.enabled !== false
    || call.params.automatic_tax?.enabled !== false
    || call.params.expires_at !== call.contract.checkoutExpiresAt
    || call.params.client_reference_id !== call.contract.workspaceId
    || call.params.payment_method_types?.length !== 1
    || call.params.payment_method_types[0] !== 'card'
    || lineItems?.length !== 1
    || lineItems[0]?.price !== call.contract.priceId
    || lineItems[0]?.quantity !== 1
    || !providerCustomerMatches(
      (call.params.customer ?? null) as string | Stripe.Customer | Stripe.DeletedCustomer | null,
      call.contract.providerCustomerId,
    )
    || !metadataExactlyMatches(call.params.metadata ?? null, expectedMetadata)
    || !metadataExactlyMatches(subscriptionData?.metadata ?? null, expectedMetadata)
    || optionKeys.length !== 1
    || optionKeys[0] !== 'idempotencyKey'
    || call.options.idempotencyKey !== expectedIdempotencyKey
    || call.requestFingerprint !== expectedFingerprint
    || (call.contract.discounts
      ? JSON.stringify(call.params.discounts) !== JSON.stringify(call.contract.discounts)
      : 'discounts' in call.params)
    || (call.contract.allowPromotionCodes !== null && call.contract.allowPromotionCodes !== undefined
      ? call.params.allow_promotion_codes !== call.contract.allowPromotionCodes
      : 'allow_promotion_codes' in call.params)
    || 'payment_intent_data' in call.params
    || 'application_fee_percent' in (subscriptionData ?? {})
    || 'on_behalf_of' in (subscriptionData ?? {})
    || 'transfer_data' in (subscriptionData ?? {})
  ) {
    throw new Error('Platform subscription Checkout create call is not the exact durable contract.');
  }

  requireReturnUrl(call.params.success_url ?? '', 'successUrl');
  requireReturnUrl(call.params.cancel_url ?? '', 'cancelUrl');
}

export function assertSubscriptionCheckoutSession(
  session: Stripe.Checkout.Session,
  call: PlatformSubscriptionCheckoutCall,
): void {
  const expectedPrefix = call.contract.livemode ? 'cs_live_' : 'cs_test_';
  const rawDiscount = session.total_details?.amount_discount;
  const discountCents = typeof rawDiscount === 'number' && Number.isSafeInteger(rawDiscount) && rawDiscount >= 0
    ? rawDiscount
    : 0;
  const expectedTotal = call.contract.unitAmountCents - discountCents;

  if (
    !session
    || session.object !== 'checkout.session'
    || !CHECKOUT_SESSION_ID_PATTERN.test(session.id)
    || !session.id.startsWith(expectedPrefix)
    || session.livemode !== call.contract.livemode
    || session.mode !== 'subscription'
    || session.currency !== SUBSCRIPTION_CHECKOUT_CURRENCY
    || session.client_reference_id !== call.contract.workspaceId
    || session.amount_subtotal !== call.contract.unitAmountCents
    || session.amount_total !== expectedTotal
    || session.amount_total < 0
    || session.expires_at !== call.contract.checkoutExpiresAt
    || session.automatic_tax?.enabled !== false
    || !providerCustomerMatches(session.customer, call.contract.providerCustomerId)
    || !metadataExactlyMatches(session.metadata, call.params.metadata as BasePlanSubscriptionMetadata)
  ) {
    throw new Error('Stripe returned a Checkout Session outside the claimed subscription contract.');
  }
}

export async function createPlatformSubscriptionCheckoutSession(
  call: PlatformSubscriptionCheckoutCall,
): Promise<Stripe.Checkout.Session> {
  // No Stripe-Account request option: LGQ is merchant of record for its SaaS
  // subscription. No application fee, transfer_data, or on_behalf_of exists.
  assertPlatformSubscriptionCheckoutCreateCall(call);
  return getStripeClient().checkout.sessions.create(call.params, call.options);
}

export async function retrievePlatformSubscriptionCheckoutSession(
  checkoutSessionId: string,
): Promise<Stripe.Checkout.Session> {
  if (!CHECKOUT_SESSION_ID_PATTERN.test(checkoutSessionId)) {
    throw new Error('Stored subscription Checkout Session ID is invalid.');
  }
  return getStripeClient().checkout.sessions.retrieve(checkoutSessionId);
}
