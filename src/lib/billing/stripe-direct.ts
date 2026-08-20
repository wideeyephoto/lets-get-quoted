import 'server-only';

import { createHash } from 'node:crypto';
import type Stripe from 'stripe';

import { APP_ORIGIN } from '@/lib/app-origin';
import { getStripeClient } from '@/lib/stripe';

/**
 * Dark-launched Stripe Connect direct-charge rail.
 *
 * Nothing in the application imports this module yet. Keeping the Stripe calls
 * behind this narrow adapter lets us deploy and test the Merchant-account rail
 * before switching any live payment caller away from the existing flow.
 */

export const DIRECT_CHARGE_MODEL = 'merchant_direct_v1' as const;
export const DIRECT_CHARGE_CURRENCY = 'usd' as const;

export const DIRECT_CHARGE_METADATA_KEYS = {
  chargeModel: 'lgq_charge_model',
  merchantAccountId: 'lgq_merchant_account_id',
  operationId: 'lgq_operation_id',
} as const;

const RESERVED_METADATA_KEYS = new Set<string>(Object.values(DIRECT_CHARGE_METADATA_KEYS));
const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;
const STRIPE_RESOURCE_ID_PATTERNS = {
  checkoutSession: /^cs_[A-Za-z0-9_]+$/,
  paymentIntent: /^pi_[A-Za-z0-9_]+$/,
  charge: /^ch_[A-Za-z0-9_]+$/,
  refund: /^re_[A-Za-z0-9_]+$/,
  applicationFee: /^fee_[A-Za-z0-9_]+$/,
} as const;
const MAX_STRIPE_AMOUNT_CENTS = 99_999_999;
const CONFIGURED_APP_ORIGIN = new URL(APP_ORIGIN).origin;

export type DirectMutationOperation =
  | 'checkout_session.create'
  | 'checkout_session.expire'
  | 'payment_intent.create'
  | 'refund.create'
  | 'application_fee_refund.create';

export type DirectChargeMetadata = Readonly<Record<string, string>> &
  Readonly<{
    lgq_charge_model: typeof DIRECT_CHARGE_MODEL;
    lgq_merchant_account_id: string;
    lgq_operation_id: string;
  }>;

export type DirectReadRequestOptions = Readonly<{
  stripeAccount: string;
}>;

export type DirectMutationRequestOptions = Readonly<{
  stripeAccount: string;
  idempotencyKey: string;
}>;

export type PlatformMutationRequestOptions = Readonly<{
  idempotencyKey: string;
}>;

type DirectOperationContext = {
  /** Stripe Merchant connected-account ID. */
  merchantAccountId: string;
  /** Stable LGQ business-operation ID. Reuse it for retries; never use a random retry ID. */
  operationId: string;
  /** Optional non-reserved metadata copied into Stripe objects. */
  metadata?: Readonly<Record<string, string>>;
};

type DirectChargeAmounts = {
  /** Charge amount in the currency's smallest unit. */
  amountCents: number;
  /** Server-calculated LGQ fee. This adapter deliberately does not calculate pricing. */
  applicationFeeAmountCents: number;
};

export type DirectCheckoutSessionInput = DirectOperationContext &
  DirectChargeAmounts & {
    lineItemName: string;
    lineItemDescription?: string;
    successUrl: string;
    cancelUrl: string;
    clientReferenceId?: string;
    customerId?: string;
    customerEmail?: string;
    description?: string;
    receiptEmail?: string;
    setupFutureUsage?: 'on_session' | 'off_session';
  };

export type DirectCheckoutSessionExpireInput = DirectOperationContext & {
  checkoutSessionId: string;
};

export type DirectPaymentIntentInput = DirectOperationContext &
  DirectChargeAmounts & {
    customerId?: string;
    paymentMethodId?: string;
    confirm?: boolean;
    offSession?: boolean;
    automaticPaymentMethods?: boolean;
    description?: string;
    receiptEmail?: string;
    setupFutureUsage?: 'on_session' | 'off_session';
  };

type DirectRefundTarget =
  | Readonly<{ chargeId: string; paymentIntentId?: never }>
  | Readonly<{ chargeId?: never; paymentIntentId: string }>;

export type DirectRefundInput = DirectOperationContext & DirectRefundTarget & {
  /** Omit for a full refund. */
  amountCents?: number;
  /** Required so every caller consciously chooses whether LGQ returns its fee. */
  refundApplicationFee: boolean;
  reason?: Stripe.RefundCreateParams.Reason;
};

export type DirectApplicationFeeRefundInput = DirectOperationContext & {
  applicationFeeId: string;
  /** Exact LGQ fee cents to return for this refund operation. */
  amountCents: number;
};

export type DirectCheckoutSessionCall = Readonly<{
  params: Readonly<Stripe.Checkout.SessionCreateParams>;
  options: DirectMutationRequestOptions;
  requestFingerprint: string;
}>;

export type DirectCheckoutSessionExpireCall = Readonly<{
  checkoutSessionId: string;
  params: Readonly<Stripe.Checkout.SessionExpireParams>;
  options: DirectMutationRequestOptions;
  requestFingerprint: string;
}>;

export type DirectPaymentIntentCall = Readonly<{
  params: Readonly<Stripe.PaymentIntentCreateParams>;
  options: DirectMutationRequestOptions;
  requestFingerprint: string;
}>;

export type DirectRefundCall = Readonly<{
  params: Readonly<Stripe.RefundCreateParams>;
  options: DirectMutationRequestOptions;
  requestFingerprint: string;
}>;

export type DirectApplicationFeeRefundCall = Readonly<{
  applicationFeeId: string;
  params: Readonly<Stripe.ApplicationFeeCreateRefundParams>;
  /** Application Fees live on the platform, so this must not include stripeAccount. */
  options: PlatformMutationRequestOptions;
  requestFingerprint: string;
}>;

function assertNonEmptyString(value: string, label: string, maxLength = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  if (/\p{Cc}/u.test(normalized)) throw new Error(`${label} contains control characters.`);
  return normalized;
}

export function validateMerchantAccountId(merchantAccountId: string): string {
  const normalized = merchantAccountId.trim();
  if (!STRIPE_ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new Error('merchantAccountId must be a valid Stripe acct_ ID.');
  }
  return normalized;
}

function validateStripeResourceId(value: string, kind: keyof typeof STRIPE_RESOURCE_ID_PATTERNS): string {
  const normalized = value.trim();
  if (!STRIPE_RESOURCE_ID_PATTERNS[kind].test(normalized)) {
    throw new Error(`${kind} must be a valid Stripe ID.`);
  }
  return normalized;
}

function validateChargeAmountCents(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_STRIPE_AMOUNT_CENTS) {
    throw new Error(`amountCents must be a positive integer no greater than ${MAX_STRIPE_AMOUNT_CENTS}.`);
  }
  return amountCents;
}

function validateRefundAmountCents(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_STRIPE_AMOUNT_CENTS) {
    throw new Error(`refund amountCents must be a positive integer no greater than ${MAX_STRIPE_AMOUNT_CENTS}.`);
  }
  return amountCents;
}

function validateApplicationFeeAmountCents(applicationFeeAmountCents: number, amountCents: number): number {
  if (!Number.isSafeInteger(applicationFeeAmountCents) || applicationFeeAmountCents < 0) {
    throw new Error('applicationFeeAmountCents must be a non-negative integer.');
  }
  if (applicationFeeAmountCents > amountCents) {
    throw new Error('applicationFeeAmountCents cannot exceed amountCents.');
  }
  return applicationFeeAmountCents;
}

function validateUrl(value: string, label: string): string {
  const normalized = assertNonEmptyString(value, label, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} must be an absolute http(s) URL.`);
  }
  if (parsed.origin !== CONFIGURED_APP_ORIGIN) {
    throw new Error(`${label} must use the configured LGQ app origin.`);
  }
  return normalized;
}

function validateCustomMetadata(metadata: Readonly<Record<string, string>> | undefined): Record<string, string> {
  if (!metadata) return {};
  const entries = Object.entries(metadata);
  // Stripe currently accepts 50 keys. Reserve room for the three adapter-owned
  // values and future versioning fields rather than operating at the hard edge.
  if (entries.length > 40) throw new Error('Direct-charge metadata may contain at most 40 custom keys.');

  const copy: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of entries) {
    if (RESERVED_METADATA_KEYS.has(key)) {
      throw new Error(`${key} is reserved by the direct-charge adapter.`);
    }
    if (!key || key.length > 40 || key.includes('[') || key.includes(']')) {
      throw new Error(`Invalid Stripe metadata key: ${key || '(empty)'}.`);
    }
    if (typeof value !== 'string' || value.length > 500) {
      throw new Error(`Stripe metadata value for ${key} must be a string of at most 500 characters.`);
    }
    copy[key] = value;
  }
  return copy;
}

export function buildDirectChargeMetadata(context: DirectOperationContext): DirectChargeMetadata {
  const merchantAccountId = validateMerchantAccountId(context.merchantAccountId);
  const operationId = assertNonEmptyString(context.operationId, 'operationId', 200);
  const customMetadata = validateCustomMetadata(context.metadata);

  // Reserved fields are written last and the result is frozen. A caller cannot
  // spoof the charge model or merchant by passing custom metadata, nor mutate the
  // adapter-owned object after it has been built.
  return Object.freeze({
    ...customMetadata,
    [DIRECT_CHARGE_METADATA_KEYS.chargeModel]: DIRECT_CHARGE_MODEL,
    [DIRECT_CHARGE_METADATA_KEYS.merchantAccountId]: merchantAccountId,
    [DIRECT_CHARGE_METADATA_KEYS.operationId]: operationId,
  }) as DirectChargeMetadata;
}

export function buildDirectIdempotencyKey(input: {
  merchantAccountId: string;
  operation: DirectMutationOperation;
  operationId: string;
}): string {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const operationId = assertNonEmptyString(input.operationId, 'operationId', 200);
  const digest = createHash('sha256')
    .update(`${DIRECT_CHARGE_MODEL}\0${merchantAccountId}\0${input.operation}\0${operationId}`)
    .digest('hex');
  return `lgq:direct:v1:${input.operation}:${digest}`;
}

function canonicalizeForFingerprint(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Direct-charge fingerprint values must be finite.');
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => item === undefined ? null : canonicalizeForFingerprint(item));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = canonicalizeForFingerprint(child);
    }
    return output;
  }
  throw new Error('Direct-charge fingerprint values must be JSON-compatible.');
}

/**
 * Stable request identity persisted beside the durable operation claim. A
 * retry may reuse its operation ID only when this exact fingerprint matches.
 */
export function buildDirectRequestFingerprint(value: unknown): string {
  const canonical = JSON.stringify(canonicalizeForFingerprint(value));
  return createHash('sha256').update(canonical).digest('hex');
}

export function buildDirectReadRequestOptions(merchantAccountId: string): DirectReadRequestOptions {
  return Object.freeze({ stripeAccount: validateMerchantAccountId(merchantAccountId) });
}

export function buildDirectMutationRequestOptions(input: {
  merchantAccountId: string;
  operation: DirectMutationOperation;
  operationId: string;
}): DirectMutationRequestOptions {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  return Object.freeze({
    stripeAccount: merchantAccountId,
    idempotencyKey: buildDirectIdempotencyKey({ ...input, merchantAccountId }),
  });
}

export function buildPlatformMutationRequestOptions(input: {
  merchantAccountId: string;
  operation: DirectMutationOperation;
  operationId: string;
}): PlatformMutationRequestOptions {
  return Object.freeze({ idempotencyKey: buildDirectIdempotencyKey(input) });
}

function applicationFeeParams(applicationFeeAmountCents: number): Pick<Stripe.PaymentIntentCreateParams, 'application_fee_amount'> {
  // Stripe treats an omitted fee as zero. Omitting a literal zero avoids asking
  // the API to create a zero-value Application Fee while preserving the exact
  // server decision; nonzero amounts pass through unchanged.
  return applicationFeeAmountCents === 0
    ? {}
    : { application_fee_amount: applicationFeeAmountCents };
}

export function buildDirectCheckoutSessionCall(input: DirectCheckoutSessionInput): DirectCheckoutSessionCall {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const amountCents = validateChargeAmountCents(input.amountCents);
  const applicationFeeAmountCents = validateApplicationFeeAmountCents(
    input.applicationFeeAmountCents,
    amountCents,
  );
  if (input.customerId && input.customerEmail) {
    throw new Error('Provide customerId or customerEmail, not both.');
  }

  const metadata = buildDirectChargeMetadata({ ...input, merchantAccountId });
  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = Object.freeze({
    ...applicationFeeParams(applicationFeeAmountCents),
    metadata,
    ...(input.description ? { description: assertNonEmptyString(input.description, 'description') } : {}),
    ...(input.receiptEmail ? { receipt_email: assertNonEmptyString(input.receiptEmail, 'receiptEmail', 320) } : {}),
    ...(input.setupFutureUsage ? { setup_future_usage: input.setupFutureUsage } : {}),
  });

  const params: Stripe.Checkout.SessionCreateParams = Object.freeze({
    mode: 'payment',
    payment_method_types: ['card' as const],
    line_items: [
      {
        price_data: {
          currency: DIRECT_CHARGE_CURRENCY,
          product_data: {
            name: assertNonEmptyString(input.lineItemName, 'lineItemName'),
            ...(input.lineItemDescription
              ? { description: assertNonEmptyString(input.lineItemDescription, 'lineItemDescription') }
              : {}),
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: validateUrl(input.successUrl, 'successUrl'),
    cancel_url: validateUrl(input.cancelUrl, 'cancelUrl'),
    metadata,
    payment_intent_data: paymentIntentData,
    ...(input.clientReferenceId
      ? { client_reference_id: assertNonEmptyString(input.clientReferenceId, 'clientReferenceId', 200) }
      : {}),
    ...(input.customerId ? { customer: assertNonEmptyString(input.customerId, 'customerId', 255) } : {}),
    ...(input.setupFutureUsage && !input.customerId ? { customer_creation: 'always' as const } : {}),
    ...(input.customerEmail
      ? {
          customer_email: assertNonEmptyString(input.customerEmail, 'customerEmail', 320),
        }
      : {}),
  });

  const operation = 'checkout_session.create' as const;
  const options = buildDirectMutationRequestOptions({ merchantAccountId, operation, operationId: input.operationId });
  return Object.freeze({
    params,
    options,
    requestFingerprint: buildDirectRequestFingerprint({ operation, merchantAccountId, params }),
  });
}

export function buildDirectCheckoutSessionExpireCall(
  input: DirectCheckoutSessionExpireInput,
): DirectCheckoutSessionExpireCall {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const checkoutSessionId = validateStripeResourceId(
    input.checkoutSessionId,
    'checkoutSession',
  );
  const operation = 'checkout_session.expire' as const;
  const params = Object.freeze({}) satisfies Readonly<Stripe.Checkout.SessionExpireParams>;
  const options = buildDirectMutationRequestOptions({
    merchantAccountId,
    operation,
    operationId: input.operationId,
  });
  return Object.freeze({
    checkoutSessionId,
    params,
    options,
    requestFingerprint: buildDirectRequestFingerprint({
      operation,
      merchantAccountId,
      checkoutSessionId,
      params,
    }),
  });
}

export function buildDirectPaymentIntentCall(input: DirectPaymentIntentInput): DirectPaymentIntentCall {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const amountCents = validateChargeAmountCents(input.amountCents);
  const applicationFeeAmountCents = validateApplicationFeeAmountCents(
    input.applicationFeeAmountCents,
    amountCents,
  );
  if (input.offSession && !input.confirm) {
    throw new Error('offSession PaymentIntents must be confirmed in the same operation.');
  }
  if (input.offSession && !input.paymentMethodId) {
    throw new Error('offSession PaymentIntents require a paymentMethodId.');
  }

  const metadata = buildDirectChargeMetadata({ ...input, merchantAccountId });
  const params: Stripe.PaymentIntentCreateParams = Object.freeze({
    amount: amountCents,
    currency: DIRECT_CHARGE_CURRENCY,
    ...applicationFeeParams(applicationFeeAmountCents),
    metadata,
    ...(input.customerId ? { customer: assertNonEmptyString(input.customerId, 'customerId', 255) } : {}),
    ...(input.paymentMethodId
      ? { payment_method: assertNonEmptyString(input.paymentMethodId, 'paymentMethodId', 255) }
      : input.automaticPaymentMethods === false
        ? {}
        : { automatic_payment_methods: { enabled: true } }),
    ...(input.confirm !== undefined ? { confirm: input.confirm } : {}),
    ...(input.offSession !== undefined ? { off_session: input.offSession } : {}),
    ...(input.description ? { description: assertNonEmptyString(input.description, 'description') } : {}),
    ...(input.receiptEmail ? { receipt_email: assertNonEmptyString(input.receiptEmail, 'receiptEmail', 320) } : {}),
    ...(input.setupFutureUsage ? { setup_future_usage: input.setupFutureUsage } : {}),
  });

  const operation = 'payment_intent.create' as const;
  const options = buildDirectMutationRequestOptions({ merchantAccountId, operation, operationId: input.operationId });
  return Object.freeze({
    params,
    options,
    requestFingerprint: buildDirectRequestFingerprint({ operation, merchantAccountId, params }),
  });
}

export function buildDirectRefundCall(input: DirectRefundInput): DirectRefundCall {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const hasChargeId = typeof input.chargeId === 'string';
  const hasPaymentIntentId = typeof input.paymentIntentId === 'string';
  if (hasChargeId === hasPaymentIntentId) {
    throw new Error('Direct refunds require exactly one Charge or PaymentIntent target.');
  }
  if (input.amountCents !== undefined && input.refundApplicationFee) {
    throw new Error(
      'Partial direct refunds must set refundApplicationFee to false and refund the exact application fee separately.',
    );
  }
  const metadata = buildDirectChargeMetadata({ ...input, merchantAccountId });
  const params: Stripe.RefundCreateParams = Object.freeze({
    ...(hasChargeId
      ? { charge: validateStripeResourceId(input.chargeId, 'charge') }
      : { payment_intent: validateStripeResourceId(input.paymentIntentId, 'paymentIntent') }),
    ...(input.amountCents !== undefined ? { amount: validateRefundAmountCents(input.amountCents) } : {}),
    refund_application_fee: input.refundApplicationFee,
    metadata,
    ...(input.reason ? { reason: input.reason } : {}),
  });

  const operation = 'refund.create' as const;
  const options = buildDirectMutationRequestOptions({ merchantAccountId, operation, operationId: input.operationId });
  return Object.freeze({
    params,
    options,
    requestFingerprint: buildDirectRequestFingerprint({ operation, merchantAccountId, params }),
  });
}

export function buildDirectApplicationFeeRefundCall(
  input: DirectApplicationFeeRefundInput,
): DirectApplicationFeeRefundCall {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const applicationFeeId = validateStripeResourceId(input.applicationFeeId, 'applicationFee');
  const metadata = buildDirectChargeMetadata({ ...input, merchantAccountId });

  const operation = 'application_fee_refund.create' as const;
  const options = buildPlatformMutationRequestOptions({ merchantAccountId, operation, operationId: input.operationId });
  const params = Object.freeze({
    amount: validateRefundAmountCents(input.amountCents),
    metadata,
  });
  return Object.freeze({
    applicationFeeId,
    params,
    options,
    requestFingerprint: buildDirectRequestFingerprint({ operation, merchantAccountId, applicationFeeId, params }),
  });
}

export async function createDirectCheckoutSession(input: DirectCheckoutSessionInput) {
  const call = buildDirectCheckoutSessionCall(input);
  return getStripeClient().checkout.sessions.create(call.params, call.options);
}

export async function expireDirectCheckoutSession(input: DirectCheckoutSessionExpireInput) {
  const call = buildDirectCheckoutSessionExpireCall(input);
  return getStripeClient().checkout.sessions.expire(
    call.checkoutSessionId,
    call.params,
    call.options,
  );
}

export async function retrieveDirectCheckoutSession(input: {
  merchantAccountId: string;
  checkoutSessionId: string;
  params?: Stripe.Checkout.SessionRetrieveParams;
}) {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const checkoutSessionId = validateStripeResourceId(input.checkoutSessionId, 'checkoutSession');
  return getStripeClient().checkout.sessions.retrieve(
    checkoutSessionId,
    input.params ?? {},
    buildDirectReadRequestOptions(merchantAccountId),
  );
}

export async function createDirectPaymentIntent(input: DirectPaymentIntentInput) {
  const call = buildDirectPaymentIntentCall(input);
  return getStripeClient().paymentIntents.create(call.params, call.options);
}

export async function retrieveDirectPaymentIntent(input: {
  merchantAccountId: string;
  paymentIntentId: string;
  params?: Stripe.PaymentIntentRetrieveParams;
}) {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const paymentIntentId = validateStripeResourceId(input.paymentIntentId, 'paymentIntent');
  return getStripeClient().paymentIntents.retrieve(
    paymentIntentId,
    input.params ?? {},
    buildDirectReadRequestOptions(merchantAccountId),
  );
}

export async function createDirectRefund(input: DirectRefundInput) {
  const call = buildDirectRefundCall(input);
  return getStripeClient().refunds.create(call.params, call.options);
}

export async function createDirectApplicationFeeRefund(input: DirectApplicationFeeRefundInput) {
  const call = buildDirectApplicationFeeRefundCall(input);
  return getStripeClient().applicationFees.createRefund(
    call.applicationFeeId,
    call.params,
    call.options,
  );
}

/**
 * The charge as Stripe currently holds it.
 *
 * Read on the CONNECTED account, like every other direct read here: the charge
 * belongs to the merchant, not to the platform, and reading it without the
 * account header would look for it on the platform and find nothing.
 *
 * `amount_refunded` is cumulative across every refund, which is exactly what the
 * reconciler compares against `payments.refunded_amount`.
 */
export async function retrieveDirectCharge(input: {
  merchantAccountId: string;
  chargeId: string;
  params?: Stripe.ChargeRetrieveParams;
}) {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const chargeId = validateStripeResourceId(input.chargeId, 'charge');
  return getStripeClient().charges.retrieve(
    chargeId,
    input.params ?? {},
    buildDirectReadRequestOptions(merchantAccountId),
  );
}

/**
 * The Application Fee as Stripe currently holds it.
 *
 * NOT read on the connected account, and that is the one difference worth
 * knowing here. An Application Fee is the PLATFORM's object -- it is the money
 * that came to LGQ -- so it is retrieved without the account header, which is
 * the same asymmetry `createDirectApplicationFeeRefund` already relies on.
 */
export async function retrieveApplicationFee(input: {
  applicationFeeId: string;
  params?: Stripe.ApplicationFeeRetrieveParams;
}) {
  const applicationFeeId = validateStripeResourceId(input.applicationFeeId, 'applicationFee');
  return getStripeClient().applicationFees.retrieve(applicationFeeId, input.params ?? {});
}

export async function retrieveDirectRefund(input: {
  merchantAccountId: string;
  refundId: string;
  params?: Stripe.RefundRetrieveParams;
}) {
  const merchantAccountId = validateMerchantAccountId(input.merchantAccountId);
  const refundId = validateStripeResourceId(input.refundId, 'refund');
  return getStripeClient().refunds.retrieve(
    refundId,
    input.params ?? {},
    buildDirectReadRequestOptions(merchantAccountId),
  );
}
