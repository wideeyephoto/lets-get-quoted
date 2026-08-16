import 'server-only';

import {
  StripeEventInboxValidationError,
  StripeEventInboxVerificationError,
  ingestStripeEventInboxDelivery,
  type StripeEventInboxDelivery,
  type StripeEventInboxResult,
} from '@/lib/billing/stripe-event-inbox';

/**
 * Dark launch switch for the future Merchant direct-charge Connect endpoint.
 *
 * Activation requires both:
 *   LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED=1
 *   STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET=whsec_...
 *
 * The signing secret must belong only to the Stripe endpoint configured for
 * events on connected accounts. It must never be shared with either the
 * legacy payment endpoint or the platform Stripe Billing endpoint.
 */
export const STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG =
  'LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED' as const;
export const STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET =
  'STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET' as const;

type ConnectedPaymentWebhookEnvironment = Readonly<Record<string, string | undefined>>;
type ConnectedPaymentInboxIngest = (
  delivery: StripeEventInboxDelivery,
) => Promise<StripeEventInboxResult>;

export type StripeConnectedPaymentWebhookDependencies = Readonly<{
  env?: ConnectedPaymentWebhookEnvironment;
  ingest?: ConnectedPaymentInboxIngest;
}>;

export function stripeConnectedPaymentWebhookEnabled(
  env: ConnectedPaymentWebhookEnvironment = process.env,
): boolean {
  return env[STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG] === '1';
}

function json(body: Readonly<Record<string, boolean | string>>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function usesAnotherEndpointSecret(
  env: ConnectedPaymentWebhookEnvironment,
  connectedPaymentSecret: string,
): boolean {
  const legacySecret = env.STRIPE_WEBHOOK_SECRET;
  const billingSecret = env.STRIPE_BILLING_WEBHOOK_SECRET;

  return (
    Boolean(legacySecret && connectedPaymentSecret === legacySecret)
    || Boolean(billingSecret && connectedPaymentSecret === billingSecret)
  );
}

/**
 * Narrow receipt boundary for Stripe events on connected accounts.
 *
 * The endpoint declares `connected_payment` itself; no request field or Stripe
 * metadata can choose the charge model. The inbox then requires event.account
 * and atomically binds that Merchant account plus the event's livemode to one
 * workspace before persisting the minimized receipt. A future projector must
 * still retrieve and correlate the connected-account object before changing
 * payment state.
 */
export async function handleStripeConnectedPaymentWebhook(
  request: Request,
  dependencies: StripeConnectedPaymentWebhookDependencies = {},
): Promise<Response> {
  const env = dependencies.env ?? process.env;

  // This must remain the first effectful branch. While dark, do not consume the
  // body, initialize Stripe/Supabase, verify, or disclose endpoint setup.
  if (!stripeConnectedPaymentWebhookEnabled(env)) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const webhookSecret = env[STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET];
  if (!webhookSecret || usesAnotherEndpointSecret(env, webhookSecret)) {
    // Retryable configuration failure, checked before customer data is read.
    return json({ received: false, error: 'Webhook unavailable.' }, 503);
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return json({ received: false, error: 'Invalid signature.' }, 400);
  }

  let rawBody: string;
  try {
    // Stripe signature verification requires the byte-for-byte request body.
    rawBody = await request.text();
  } catch {
    return json({ received: false, error: 'Invalid request body.' }, 400);
  }

  try {
    const result = await (dependencies.ingest ?? ingestStripeEventInboxDelivery)({
      rawBody,
      signature,
      webhookSecret,
      // Server-owned purpose binding: this endpoint cannot ingest platform
      // subscriptions, top-ups, legacy destination charges, or caller scopes.
      expectedScope: 'connected_payment',
    });

    // Stripe delivery is at-least-once. Both first receipt and exact durable
    // replay are successful; conflicting event IDs fail inside the inbox RPC.
    return json({ received: true, duplicate: !result.inserted }, 200);
  } catch (error) {
    if (
      error instanceof StripeEventInboxVerificationError
      || error instanceof StripeEventInboxValidationError
    ) {
      // Fixed response only. stripe-node verification errors can retain the
      // full raw payload, so never log or return the caught error here.
      return json({ received: false, error: 'Invalid webhook.' }, 400);
    }

    // No durable receipt means no acknowledgement. Ask Stripe to retry without
    // exposing database details or the customer event at the public boundary.
    return json({ received: false, error: 'Webhook temporarily unavailable.' }, 500);
  }
}
