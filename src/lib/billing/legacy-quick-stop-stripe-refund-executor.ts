import 'server-only';

import type Stripe from 'stripe';

import type { LegacyQuickStopLateRefundClaim } from '@/lib/billing/legacy-quick-stop-payment-store';
import {
  LegacyQuickStopLateRefundWorkerError,
  type LegacyQuickStopLateRefundExecutor,
} from '@/lib/billing/legacy-quick-stop-late-refund-worker';
import { getStripeClient } from '@/lib/stripe';

/**
 * Platform-context Stripe executor for the legacy destination-charge Quick Stop
 * refund queue. This adapter is DARK: only the exact-1-gated cron constructs it.
 *
 * Legacy destination charges were created by the LGQ platform, so the refund
 * must also be created in the platform context. A connected-account request
 * option here would target the future direct-charge rail and is intentionally
 * absent from both this contract and the Stripe call.
 */

export const LEGACY_QUICK_STOP_LATE_REFUND_OPERATION =
  'quick_stop_late_refund_v1' as const;

export const LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS = Object.freeze({
  operation: 'lgq_operation',
  taskId: 'lgq_task_id',
  paymentId: 'lgq_payment_id',
  requestId: 'lgq_quick_stop_request_id',
  requestFingerprint: 'lgq_request_fingerprint',
  reasonCode: 'lgq_reason_code',
} as const);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9_]+$/;
const REFUND_PATTERN = /^re_[A-Za-z0-9_]+$/;
const IDEMPOTENCY_PATTERN = /^quick_stop_late_refund_v1_[0-9a-f_]+$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const MAX_STRIPE_AMOUNT_CENTS = 99_999_999;
const ACCEPTED_REFUND_STATUSES = new Set<string>(['pending', 'succeeded']);
const TERMINAL_REFUND_STATUSES = new Set<string>(['canceled', 'failed', 'requires_action']);

export type LegacyQuickStopStripeRefundMetadata = Readonly<{
  lgq_operation: typeof LEGACY_QUICK_STOP_LATE_REFUND_OPERATION;
  lgq_task_id: string;
  lgq_payment_id: string;
  lgq_quick_stop_request_id: string;
  lgq_request_fingerprint: string;
  lgq_reason_code: 'late_payment_after_expiry';
}>;

export type LegacyQuickStopStripeRefundCall = Readonly<{
  params: Readonly<Stripe.RefundCreateParams>;
  options: Readonly<{ idempotencyKey: string }>;
}>;

export interface LegacyQuickStopPlatformStripeClient {
  refunds: {
    create(
      params: Stripe.RefundCreateParams,
      options: Stripe.RequestOptions,
    ): Promise<Stripe.Refund>;
  };
}

function contractError(): never {
  throw new LegacyQuickStopLateRefundWorkerError('provider_scope_invalid', false);
}

function validUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function validPositiveCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_STRIPE_AMOUNT_CENTS;
}

function expectedStripeIdempotencyKey(
  paymentId: string,
  refundedAmountCents: number,
  refundAmountCents: number,
): string {
  return `${LEGACY_QUICK_STOP_LATE_REFUND_OPERATION}_${paymentId.replace(/-/g, '_')}_${refundedAmountCents}_${refundAmountCents}`;
}

export function buildLegacyQuickStopStripeRefundCall(
  claim: LegacyQuickStopLateRefundClaim,
): LegacyQuickStopStripeRefundCall {
  if (
    !validUuid(claim.taskId)
    || !validUuid(claim.paymentId)
    || !validUuid(claim.requestId)
    || !PAYMENT_INTENT_PATTERN.test(claim.stripePaymentIntent)
    || !validPositiveCents(claim.grossAmountCents)
    || !Number.isSafeInteger(claim.refundedAmountCents)
    || claim.refundedAmountCents < 0
    || !validPositiveCents(claim.refundAmountCents)
    || claim.refundedAmountCents >= claim.grossAmountCents
    || claim.grossAmountCents - claim.refundedAmountCents !== claim.refundAmountCents
    || claim.currency !== 'usd'
    || claim.reverseTransfer !== true
    || claim.refundApplicationFee !== true
    || !IDEMPOTENCY_PATTERN.test(claim.stripeIdempotencyKey)
    || !FINGERPRINT_PATTERN.test(claim.requestFingerprint)
    || claim.reasonCode !== 'late_payment_after_expiry'
  ) {
    contractError();
  }

  // Do not trust a syntactically valid persisted key on its own. Recompute the
  // migration's canonical key from the immutable refund snapshot so a corrupt
  // or mismatched claim cannot turn a replay into a fresh Stripe mutation.
  if (
    claim.stripeIdempotencyKey !== expectedStripeIdempotencyKey(
      claim.paymentId,
      claim.refundedAmountCents,
      claim.refundAmountCents,
    )
  ) {
    contractError();
  }

  const metadata: LegacyQuickStopStripeRefundMetadata = Object.freeze({
    [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.operation]:
      LEGACY_QUICK_STOP_LATE_REFUND_OPERATION,
    [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.taskId]: claim.taskId,
    [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.paymentId]: claim.paymentId,
    [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.requestId]: claim.requestId,
    [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.requestFingerprint]:
      claim.requestFingerprint,
    [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.reasonCode]: claim.reasonCode,
  });

  return Object.freeze({
    params: Object.freeze({
      payment_intent: claim.stripePaymentIntent,
      amount: claim.refundAmountCents,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata,
    }),
    // No stripeAccount is allowed here. The persisted key survives crashes and
    // lease expiry, so retrying this immutable request cannot create a second
    // Stripe refund.
    options: Object.freeze({ idempotencyKey: claim.stripeIdempotencyKey }),
  });
}

function providerPaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null,
): string | null {
  if (typeof paymentIntent === 'string') return paymentIntent;
  if (paymentIntent && typeof paymentIntent.id === 'string') return paymentIntent.id;
  return null;
}

function providerError(error: unknown): LegacyQuickStopLateRefundWorkerError {
  if (error instanceof LegacyQuickStopLateRefundWorkerError) return error;

  const candidate = error && typeof error === 'object'
    ? error as { statusCode?: unknown; type?: unknown }
    : null;
  const statusCode = candidate?.statusCode;
  if (typeof statusCode === 'number' && Number.isInteger(statusCode)) {
    if (statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500) {
      return new LegacyQuickStopLateRefundWorkerError('provider_unavailable', true);
    }
    if (statusCode >= 400 && statusCode < 500) {
      return new LegacyQuickStopLateRefundWorkerError('provider_request_rejected', false);
    }
  }

  if (
    candidate?.type === 'StripeConnectionError'
    || candidate?.type === 'StripeAPIError'
  ) {
    return new LegacyQuickStopLateRefundWorkerError('provider_unavailable', true);
  }

  // A transport may have reached Stripe even when no HTTP response reached us.
  // The durable idempotency key makes the next attempt safe.
  return new LegacyQuickStopLateRefundWorkerError('provider_result_unknown', true);
}

function validateProviderRefund(
  refund: Stripe.Refund,
  claim: LegacyQuickStopLateRefundClaim,
  expectedMetadata: LegacyQuickStopStripeRefundMetadata,
): string {
  const metadata = refund?.metadata;
  const expectedMetadataEntries = Object.entries(expectedMetadata);
  const metadataMatches = metadata !== null
    && typeof metadata === 'object'
    && Object.keys(metadata).length === expectedMetadataEntries.length
    && expectedMetadataEntries.every(([key, value]) => metadata[key] === value);

  if (
    !refund
    || refund.object !== 'refund'
    || typeof refund.id !== 'string'
    || !REFUND_PATTERN.test(refund.id)
    || refund.amount !== claim.refundAmountCents
    || refund.currency !== claim.currency
    || providerPaymentIntentId(refund.payment_intent) !== claim.stripePaymentIntent
    || !metadataMatches
  ) {
    throw new LegacyQuickStopLateRefundWorkerError('provider_response_invalid', true);
  }

  if (typeof refund.status === 'string' && ACCEPTED_REFUND_STATUSES.has(refund.status)) {
    return refund.id;
  }
  if (typeof refund.status === 'string' && TERMINAL_REFUND_STATUSES.has(refund.status)) {
    throw new LegacyQuickStopLateRefundWorkerError('provider_refund_not_accepted', false);
  }

  // Unknown/missing status is contradictory evidence after a mutation. Reuse
  // the exact idempotency key rather than either assuming a refund or issuing a
  // replacement request.
  throw new LegacyQuickStopLateRefundWorkerError('provider_response_invalid', true);
}

export class StripeLegacyQuickStopLateRefundExecutor
implements LegacyQuickStopLateRefundExecutor {
  constructor(
    private readonly stripe: LegacyQuickStopPlatformStripeClient =
      getStripeClient() as LegacyQuickStopPlatformStripeClient,
  ) {}

  async refund(
    claim: LegacyQuickStopLateRefundClaim,
  ): Promise<Readonly<{ stripeRefundId: string }>> {
    const call = buildLegacyQuickStopStripeRefundCall(claim);
    let refund: Stripe.Refund;
    try {
      refund = await this.stripe.refunds.create(call.params, call.options);
    } catch (error) {
      throw providerError(error);
    }

    const metadata = call.params.metadata as LegacyQuickStopStripeRefundMetadata;
    return Object.freeze({
      stripeRefundId: validateProviderRefund(refund, claim, metadata),
    });
  }
}
