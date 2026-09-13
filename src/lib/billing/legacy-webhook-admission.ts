import 'server-only';

/**
 * Admission checks for the LEGACY Stripe webhook endpoint (/api/stripe/webhook).
 *
 * The three newer Stripe endpoints — platform Billing, connected payments and
 * platform top-ups — each refuse a delivery before reading it when their own
 * configuration is wrong, and each validates the envelope before anything binds
 * to a workspace row. The legacy endpoint predates all of that and settles every
 * real contractor payment, refund and dispute, so the same floor belongs here.
 *
 * These helpers are deliberately pure and environment-injectable: the route they
 * serve is a live money path, and the only way to test its admission rules
 * without a Stripe round trip is to keep the decisions out of the route itself.
 */

export const LEGACY_STRIPE_WEBHOOK_SECRET = 'STRIPE_WEBHOOK_SECRET' as const;

/**
 * Mirrors MAX_RAW_BODY_BYTES in stripe-event-inbox.ts. A genuine Stripe event is
 * orders of magnitude smaller; this only exists so an unauthenticated caller
 * cannot make the endpoint read an arbitrarily large body into memory before the
 * signature — the thing that actually establishes trust — is ever computed.
 */
export const MAX_LEGACY_WEBHOOK_BODY_BYTES = 512 * 1024;

type LegacyWebhookEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Whether the legacy signing secret is also in use by another Stripe endpoint.
 *
 * Each of the three newer endpoints already refuses to run when ITS secret
 * matches one of the others (see `usesAnotherEndpointSecret` in
 * stripe-top-up-webhook.ts). Every one of those checks compares against
 * STRIPE_WEBHOOK_SECRET — but nothing ever performed the check in this
 * direction, so the legacy endpoint was the one member of the set that would
 * happily accept a delivery signed for a different scope.
 *
 * That matters because scope is what decides what an event MEANS. A
 * checkout.session.completed is a contractor being paid on this endpoint and a
 * workspace buying credits on the top-up endpoint, and the two bind to different
 * columns. A shared secret makes them indistinguishable.
 */
export function legacyWebhookSecretCollides(
  env: LegacyWebhookEnvironment = process.env,
): boolean {
  const legacySecret = env[LEGACY_STRIPE_WEBHOOK_SECRET];
  if (!legacySecret) return false;

  const billingSecret = env.STRIPE_BILLING_WEBHOOK_SECRET;
  const connectedPaymentSecret = env.STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET;
  const topUpSecret = env.STRIPE_TOP_UP_WEBHOOK_SECRET;

  return (
    Boolean(billingSecret && legacySecret === billingSecret)
    || Boolean(connectedPaymentSecret && legacySecret === connectedPaymentSecret)
    || Boolean(topUpSecret && legacySecret === topUpSecret)
  );
}

/**
 * Whether a declared Content-Length already exceeds the ceiling.
 *
 * Checked before the body is consumed so an oversized delivery costs nothing.
 * A missing, malformed or negative header is NOT treated as a rejection —
 * chunked transfers legitimately omit it — which is why the post-read check
 * below still has to exist. This header is a hint from the caller, not a fact.
 */
export function legacyWebhookContentLengthTooLarge(header: string | null): boolean {
  if (!header) return false;
  const declared = Number.parseInt(header, 10);
  if (!Number.isSafeInteger(declared) || declared < 0) return false;
  return declared > MAX_LEGACY_WEBHOOK_BODY_BYTES;
}

/**
 * Whether the body actually read exceeds the ceiling.
 *
 * Byte length, not string length: the signature is computed over bytes, and a
 * multi-byte payload would otherwise slip past a `.length` comparison.
 */
export function legacyWebhookBodyTooLarge(rawBody: string): boolean {
  return Buffer.byteLength(rawBody, 'utf8') > MAX_LEGACY_WEBHOOK_BODY_BYTES;
}
