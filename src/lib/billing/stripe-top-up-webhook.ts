import 'server-only';

import {
  StripeEventInboxValidationError,
  StripeEventInboxVerificationError,
  ingestStripeEventInboxDelivery,
  type StripeEventInboxDelivery,
  type StripeEventInboxResult,
} from '@/lib/billing/stripe-event-inbox';

/**
 * Dark launch switch for the platform top-up purchase endpoint.
 *
 * Activation requires both:
 *   LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED=1
 *   STRIPE_TOP_UP_WEBHOOK_SECRET=whsec_...
 *
 * WHY THIS IS A THIRD ENDPOINT, NOT FOUR MORE EVENTS ON THE BILLING ONE.
 * A top-up is bought with a Checkout Session on the PLATFORM account, so it
 * arrives as checkout.session.* — a type the platform Billing scope does not
 * accept at all. Adding those types to the Billing destination would make every
 * delivery fail classification and be retried, because that scope admits only
 * customer.subscription.* and invoice.*.
 *
 * WHAT A SEPARATE ENDPOINT STILL DOES NOT SOLVE, AND WHY THAT IS FINE.
 * Base-plan signup ALSO creates a Checkout Session on the platform account, and
 * a Stripe destination filters by event type rather than by which Session it is.
 * So this endpoint receives subscription checkout completions too. They are
 * recorded honestly — the scope names the endpoint that delivered them — and the
 * projector terminates them as top_up_not_a_purchase, because a top-up Session
 * carries lgq_purpose=top_up and a subscription Session carries
 * lgq_billing_purpose instead. That is the one thing distinguishing them, and it
 * is metadata we wrote, not a guess about amounts or line items.
 *
 * The signing secret must belong only to this endpoint. It must never be shared
 * with the legacy payment, platform Billing, or Connect endpoints.
 */
export const STRIPE_TOP_UP_WEBHOOK_FLAG = 'LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED' as const;
export const STRIPE_TOP_UP_WEBHOOK_SECRET = 'STRIPE_TOP_UP_WEBHOOK_SECRET' as const;

type TopUpWebhookEnvironment = Readonly<Record<string, string | undefined>>;
type TopUpInboxIngest = (delivery: StripeEventInboxDelivery) => Promise<StripeEventInboxResult>;

export type StripeTopUpWebhookDependencies = Readonly<{
  env?: TopUpWebhookEnvironment;
  ingest?: TopUpInboxIngest;
  params?: Promise<Record<string, string | string[]>>;
}>;

export function stripeTopUpWebhookEnabled(
  env: TopUpWebhookEnvironment = process.env,
): boolean {
  return env[STRIPE_TOP_UP_WEBHOOK_FLAG] === '1';
}

function json(body: Readonly<Record<string, boolean | string>>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Three endpoints already exist, and this one must collide with none of them.
 * A shared secret would let a correctly signed delivery for another purpose
 * cross into this scope, where checkout.session.completed means something else
 * entirely.
 */
function usesAnotherEndpointSecret(
  env: TopUpWebhookEnvironment,
  topUpSecret: string,
): boolean {
  const legacySecret = env.STRIPE_WEBHOOK_SECRET;
  const billingSecret = env.STRIPE_BILLING_WEBHOOK_SECRET;
  const connectedPaymentSecret = env.STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET;

  return (
    Boolean(legacySecret && topUpSecret === legacySecret)
    || Boolean(billingSecret && topUpSecret === billingSecret)
    || Boolean(connectedPaymentSecret && topUpSecret === connectedPaymentSecret)
  );
}

/**
 * Receipt boundary for platform top-up purchases.
 *
 * This records and does nothing else. It does not invoke the projector, grant
 * credit, or read the Session back from Stripe — the worker does that, from a
 * durable row, so a slow or failing fulfillment can never cost us the receipt of
 * a payment the customer has already made.
 */
export async function handleStripeTopUpWebhook(
  request: Request,
  dependencies: StripeTopUpWebhookDependencies = {},
): Promise<Response> {
  const env = dependencies.env ?? process.env;

  // This must remain the first effectful branch. While dark, do not consume the
  // body, initialize Stripe/Supabase, verify, or disclose endpoint setup.
  if (!stripeTopUpWebhookEnabled(env)) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const webhookSecret = env[STRIPE_TOP_UP_WEBHOOK_SECRET];
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
      // Server-owned purpose binding: the endpoint declares the scope, so the
      // same checkout.session.completed cannot drift in from the Connect rail,
      // where it means a contractor was paid.
      expectedScope: 'platform_top_up',
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
