import 'server-only';

import {
  StripeEventInboxValidationError,
  StripeEventInboxVerificationError,
  ingestStripeEventInboxDelivery,
  type StripeEventInboxDelivery,
  type StripeEventInboxResult,
} from '@/lib/billing/stripe-event-inbox';

/**
 * Dark launch switch for the dedicated platform-subscription destination.
 *
 * Activation requires both:
 *   LGQ_STRIPE_BILLING_WEBHOOK_ENABLED=1
 *   STRIPE_BILLING_WEBHOOK_SECRET=whsec_...
 *
 * The secret must belong to /api/stripe/billing/webhook. It must never reuse
 * STRIPE_WEBHOOK_SECRET, which belongs to the legacy Connect/payment endpoint.
 */
export const STRIPE_BILLING_WEBHOOK_FLAG = 'LGQ_STRIPE_BILLING_WEBHOOK_ENABLED' as const;
export const STRIPE_BILLING_WEBHOOK_SECRET = 'STRIPE_BILLING_WEBHOOK_SECRET' as const;

type BillingWebhookEnvironment = Readonly<Record<string, string | undefined>>;
type BillingInboxIngest = (
  delivery: StripeEventInboxDelivery,
) => Promise<StripeEventInboxResult>;

export type StripeBillingWebhookDependencies = Readonly<{
  env?: BillingWebhookEnvironment;
  ingest?: BillingInboxIngest;
}>;

export function stripeBillingWebhookEnabled(
  env: BillingWebhookEnvironment = process.env,
): boolean {
  return env[STRIPE_BILLING_WEBHOOK_FLAG] === '1';
}

function json(body: Readonly<Record<string, boolean | string>>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Narrow HTTP boundary for platform Stripe Billing events.
 *
 * This function only verifies, minimizes, and durably records a delivery. It
 * intentionally does not invoke the projector or retrieve anything from
 * Stripe, so webhook acknowledgement is independent of downstream processing.
 */
export async function handleStripeBillingWebhook(
  request: Request,
  dependencies: StripeBillingWebhookDependencies = {},
): Promise<Response> {
  const env = dependencies.env ?? process.env;

  // This must stay first. While dark, do not consume the body, initialize a
  // Stripe/Supabase client, verify a signature, or disclose configuration.
  if (!stripeBillingWebhookEnabled(env)) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const webhookSecret = env[STRIPE_BILLING_WEBHOOK_SECRET];
  if (!webhookSecret) {
    // Retryable: an enabled endpoint without its dedicated secret is a deploy
    // fault, not an event Stripe should consider delivered.
    return json({ received: false, error: 'Webhook unavailable.' }, 503);
  }

  const legacyWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (legacyWebhookSecret && webhookSecret === legacyWebhookSecret) {
    // The two Stripe destinations intentionally accept disjoint event scopes.
    // Sharing a secret would let a correctly signed legacy delivery cross that
    // trust boundary, so treat it as an unavailable deployment before reading
    // the potentially sensitive body.
    return json({ received: false, error: 'Webhook unavailable.' }, 503);
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return json({ received: false, error: 'Invalid signature.' }, 400);
  }

  let rawBody: string;
  try {
    // Stripe requires the byte-for-byte body. Never call request.json() here.
    rawBody = await request.text();
  } catch {
    return json({ received: false, error: 'Invalid request body.' }, 400);
  }

  try {
    const result = await (dependencies.ingest ?? ingestStripeEventInboxDelivery)({
      rawBody,
      signature,
      webhookSecret,
      expectedScope: 'platform_subscription',
    });

    // At-least-once delivery is normal. The database RPC identifies a durable
    // replay, and both the original and duplicate are safely acknowledged.
    return json({ received: true, duplicate: !result.inserted }, 200);
  } catch (error) {
    if (
      error instanceof StripeEventInboxVerificationError
      || error instanceof StripeEventInboxValidationError
    ) {
      // These fixed responses cannot echo stripe-node's signature error, whose
      // hidden payload field can contain the complete raw customer event.
      return json({ received: false, error: 'Invalid webhook.' }, 400);
    }

    // Durable ingest failed. Returning 500 asks Stripe to retry; deliberately
    // do not log the error or body at this public boundary.
    return json({ received: false, error: 'Webhook temporarily unavailable.' }, 500);
  }
}
