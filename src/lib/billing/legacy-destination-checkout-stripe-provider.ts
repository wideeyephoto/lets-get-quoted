import 'server-only';

import type Stripe from 'stripe';

import { getStripeClient } from '@/lib/stripe';
import type {
  LegacyDestinationCheckoutProvider,
  LegacyDestinationCheckoutProviderContract,
  LegacyDestinationCheckoutProviderCreateResult,
} from '@/lib/billing/legacy-destination-checkout-operation';

/**
 * Concrete Stripe binding for the dark legacy destination-Checkout generation
 * ledger. It is deliberately the only place that turns an immutable SQL claim
 * into a provider request, and it never decides lineage: the orchestrator owns
 * every persistence and presentation decision.
 *
 * Nothing constructs this today. It exists so the provider contract is exact
 * before any caller is authorized.
 */

const SESSION_LIFETIME_SECONDS = 24 * 60 * 60;
/** Stripe rejects an expiry less than 30 minutes out. */
const MINIMUM_SESSION_LIFETIME_SECONDS = 31 * 60;

export class LegacyDestinationCheckoutProviderContractError extends Error {
  override readonly name = 'LegacyDestinationCheckoutProviderContractError';
  constructor() {
    // Fixed text. Provider and customer detail must never reach a durable code.
    super('Legacy destination Checkout provider contract is invalid.');
  }
}

/**
 * Only an explicit, definitive payment-method refusal may downgrade the primary
 * ACH-capable variant to the card-only fallback. Every other failure — network,
 * timeout, rate limit, idempotency conflict, unknown 5xx — must propagate so the
 * orchestrator records fixed-code indeterminate work instead of silently
 * retrying creation under a second provider identity.
 */
export function isDefinitivePaymentMethodRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    type?: unknown;
    code?: unknown;
    param?: unknown;
    statusCode?: unknown;
    message?: unknown;
  };
  if (candidate.type !== 'StripeInvalidRequestError') return false;
  if (candidate.statusCode !== 400) return false;

  const param = typeof candidate.param === 'string' ? candidate.param : '';
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';

  if (param.startsWith('payment_method_types')) return true;
  if (code === 'payment_method_not_available') return true;
  // Stripe reports an unactivated method as an invalid payment-method type on
  // the request parameter rather than through a dedicated error code.
  return /payment method type/i.test(message)
    && /invalid|not activated|not available|unsupported/i.test(message);
}

function assertContract(contract: LegacyDestinationCheckoutProviderContract): void {
  if (
    contract.mode !== 'payment'
    || contract.currency !== 'usd'
    || !Number.isSafeInteger(contract.grossAmountCents)
    || contract.grossAmountCents <= 0
    || !Number.isSafeInteger(contract.applicationFeeCents)
    || contract.applicationFeeCents < 0
    || contract.applicationFeeCents > contract.grossAmountCents
    || !Array.isArray(contract.paymentMethodTypes)
    || contract.paymentMethodTypes.length < 1
    || !contract.destinationAccountId
    || !contract.operationId
    || !contract.paymentId
  ) throw new LegacyDestinationCheckoutProviderContractError();
}

function returnUrls(paymentId: string): Readonly<{ successUrl: string; cancelUrl: string }> {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  return Object.freeze({
    successUrl: `${origin}/pay/${paymentId}?checkout=complete`,
    cancelUrl: `${origin}/pay/${paymentId}?checkout=cancelled`,
  });
}

export type LegacyDestinationCheckoutStripeProviderOptions = Readonly<{
  stripe?: Stripe;
  nowEpochSeconds?: () => number;
}>;

export class LegacyDestinationCheckoutStripeProvider
implements LegacyDestinationCheckoutProvider {
  private readonly stripe: Stripe;
  private readonly nowEpochSeconds: () => number;

  constructor(options: LegacyDestinationCheckoutStripeProviderOptions = {}) {
    this.stripe = options.stripe ?? getStripeClient();
    this.nowEpochSeconds = options.nowEpochSeconds
      ?? (() => Math.floor(Date.now() / 1_000));
  }

  async createSession(
    input: LegacyDestinationCheckoutProviderContract & { idempotencyKey: string },
  ): Promise<LegacyDestinationCheckoutProviderCreateResult> {
    assertContract(input);
    if (!input.idempotencyKey) throw new LegacyDestinationCheckoutProviderContractError();

    const now = this.nowEpochSeconds();
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new LegacyDestinationCheckoutProviderContractError();
    }
    const expiresAt = now + SESSION_LIFETIME_SECONDS;
    if (expiresAt < now + MINIMUM_SESSION_LIFETIME_SECONDS) {
      throw new LegacyDestinationCheckoutProviderContractError();
    }

    const { successUrl, cancelUrl } = returnUrls(input.paymentId);
    const metadata: Stripe.MetadataParam = { ...input.metadata };

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      // Pinned explicitly and never widened. This platform account has extra
      // methods enabled in the Dashboard, so an automatic set would make Stripe
      // return methods the immutable claim does not authorize — which the
      // orchestrator correctly treats as a mismatched Session and quarantines.
      // Do not introduce automatic_payment_methods here.
      payment_method_types: [
        ...input.paymentMethodTypes,
      ] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
      client_reference_id: input.paymentId,
      expires_at: expiresAt,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.grossAmountCents,
          product_data: { name: 'Payment' },
        },
      }],
      payment_intent_data: {
        application_fee_amount: input.applicationFeeCents,
        transfer_data: { destination: input.destinationAccountId },
        metadata,
      },
      // Presentment conversion would let a customer be charged an amount that is
      // not the frozen gross, so it stays off for this rail.
      adaptive_pricing: { enabled: false },
    };
    if (input.expectedCustomerId) params.customer = input.expectedCustomerId;

    try {
      const session = await this.stripe.checkout.sessions.create(params, {
        idempotencyKey: input.idempotencyKey,
      });
      return Object.freeze({ outcome: 'created' as const, session });
    } catch (error) {
      if (isDefinitivePaymentMethodRejection(error)) {
        return Object.freeze({ outcome: 'definitive_payment_method_rejection' as const });
      }
      // Ambiguous. The orchestrator must not create a second provider identity.
      throw error;
    }
  }

  async retrieveSession(input: {
    checkoutSessionId: string;
    allowedContracts: readonly LegacyDestinationCheckoutProviderContract[];
  }): Promise<Stripe.Checkout.Session> {
    if (!input.checkoutSessionId || input.allowedContracts.length < 1) {
      throw new LegacyDestinationCheckoutProviderContractError();
    }
    const session = await this.stripe.checkout.sessions.retrieve(input.checkoutSessionId);
    // Identity is re-verified in full by the orchestrator against every
    // immutable claim fact. This only refuses an outright wrong object before it
    // can be inspected as though it were ours.
    if (session?.id !== input.checkoutSessionId) {
      throw new LegacyDestinationCheckoutProviderContractError();
    }
    return session;
  }

  async expireSession(input: {
    checkoutSessionId: string;
    operationPk: string;
    operationId: string;
  }): Promise<void> {
    if (!input.checkoutSessionId || !input.operationPk || !input.operationId) {
      throw new LegacyDestinationCheckoutProviderContractError();
    }
    await this.stripe.checkout.sessions.expire(input.checkoutSessionId);
  }
}
