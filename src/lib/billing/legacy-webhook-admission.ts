import 'server-only';

import type Stripe from 'stripe';

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

/* ------------------------------------------------------------------------- *
 * Envelope admission: which Stripe account may send which event type, and in
 * which livemode. Everything below is gated by legacyWebhookAdmissionMode().
 * ------------------------------------------------------------------------- */

export const LEGACY_WEBHOOK_ADMISSION_FLAG =
  'LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENABLED' as const;
export const LEGACY_WEBHOOK_ADMISSION_ENFORCE_FLAG =
  'LGQ_LEGACY_STRIPE_WEBHOOK_ADMISSION_ENFORCED' as const;

/**
 * `off` evaluates nothing — byte-for-byte the behaviour that predates this
 * module. `observe` evaluates and reports but still dispatches. `enforce`
 * refuses.
 *
 * Two exact-1 flags composing one three-state mode, mirroring voiceMinuteMode()
 * in voice-minute-usage.ts. The intermediate state is the point: these are the
 * only rules here that can refuse traffic Stripe delivers successfully today,
 * and on a live money path a false positive stops a real contractor being paid.
 * Run `observe` until the logs are quiet, then set the second flag.
 */
export type LegacyWebhookAdmissionMode = 'off' | 'observe' | 'enforce';

export function legacyWebhookAdmissionMode(
  env: LegacyWebhookEnvironment = process.env,
): LegacyWebhookAdmissionMode {
  if (env[LEGACY_WEBHOOK_ADMISSION_FLAG] !== '1') return 'off';
  return env[LEGACY_WEBHOOK_ADMISSION_ENFORCE_FLAG] === '1' ? 'enforce' : 'observe';
}

/**
 * `platform` — the event must carry NO `event.account`. The legacy rail creates
 * destination charges on the platform account (`transfer_data.destination` on a
 * client with no `stripeAccount` header), so its Sessions, Charges and
 * PaymentIntents are platform objects. The ad-budget subscriptions and invoices
 * are platform objects for the same reason.
 *
 * `connected` — the event is ABOUT a connected account and carries its id.
 */
export type LegacyWebhookEventScope = 'platform' | 'connected';

/**
 * Every event type this endpoint actually acts on, and where each must come
 * from. Three handlers feed off one endpoint — dispatchStripeEvent in the route,
 * handleAdBudgetWebhookEvent and handleMerchandiseWebhookEvent — so this table
 * is the union of all three. test/legacy-webhook-admission.test.ts reads those
 * three sources and fails if any handled type is missing here, because a type
 * absent from this table is admitted unchecked.
 *
 * WHY THIS EXISTS. Dispatch binds on `metadata.payment_id` alone. Without a
 * scope rule, a connected account can create a Checkout Session on its OWN
 * account carrying another workspace's payment id; Stripe signs and delivers it
 * legitimately, and the handler settles a payment belonging to someone else.
 * Nothing in code prevented that — only the Dashboard's connected-events
 * setting, which is not a control this repository owns.
 */
export const LEGACY_WEBHOOK_EVENT_SCOPES = {
  // Destination-charge payment lifecycle (route + merchandise).
  'checkout.session.completed': 'platform',
  'checkout.session.async_payment_succeeded': 'platform',
  'checkout.session.async_payment_failed': 'platform',
  'checkout.session.expired': 'platform',
  'charge.failed': 'platform',
  'charge.refunded': 'platform',
  'charge.dispute.created': 'platform',
  'charge.dispute.closed': 'platform',
  'payment_intent.succeeded': 'platform',
  'payment_intent.payment_failed': 'platform',
  // Managed-ad budget subscriptions, billed on the platform account.
  'invoice.paid': 'platform',
  'invoice.payment_failed': 'platform',
  'customer.subscription.updated': 'platform',
  'customer.subscription.deleted': 'platform',
  // The one genuinely connected-scope type on this endpoint.
  'account.updated': 'connected',
} as const satisfies Readonly<Record<string, LegacyWebhookEventScope>>;

/**
 * `config` means OUR environment is wrong and the event may well be valid, so
 * the route answers a retryable 5xx and the delivery survives the repair.
 * `scope` means the envelope itself is not something this endpoint may act on;
 * that never becomes true later, so it is refused outright.
 */
export type LegacyWebhookRejectionKind = 'config' | 'scope';

export type LegacyWebhookAdmissionVerdict =
  | Readonly<{ outcome: 'admit' }>
  | Readonly<{ outcome: 'reject'; kind: LegacyWebhookRejectionKind; reason: string }>;

const ADMIT: LegacyWebhookAdmissionVerdict = Object.freeze({ outcome: 'admit' });

function reject(
  kind: LegacyWebhookRejectionKind,
  reason: string,
): LegacyWebhookAdmissionVerdict {
  return Object.freeze({ outcome: 'reject', kind, reason });
}

/** Accepts a restricted key too — a live rail may legitimately run on `rk_`. */
const STRIPE_SECRET_KEY_MODE_PATTERN = /^(?:sk|rk)_(test|live)_\S{8,}$/;

/**
 * The livemode our API credential implies, or null when the key declares none.
 *
 * Deliberately derived from the key rather than from LGQ_STRIPE_BILLING_LIVEMODE.
 * That flag is scoped to the Billing rail; reading it here would give one
 * invariant two independent sources of truth, and the failure it guards against
 * is precisely a credential that disagrees with its environment.
 */
function credentialLivemode(env: LegacyWebhookEnvironment): boolean | null {
  const match = STRIPE_SECRET_KEY_MODE_PATTERN.exec(env.STRIPE_SECRET_KEY?.trim() ?? '');
  return match ? match[1] === 'live' : null;
}

function eventAccount(event: Stripe.Event): string | null {
  return typeof event.account === 'string' && event.account ? event.account : null;
}

function dataObjectId(event: Stripe.Event): string | null {
  const candidate = event.data?.object as { id?: unknown } | undefined;
  return typeof candidate?.id === 'string' && candidate.id ? candidate.id : null;
}

/**
 * Whether a signature-verified event may be dispatched by the legacy endpoint.
 *
 * Called only after constructEvent, so the payload is known to be Stripe's. What
 * it adds is that the envelope is one THIS endpoint is entitled to act on —
 * right mode, right account.
 *
 * Reasons are fixed strings plus the event type. No metadata, customer, email or
 * amount crosses into them: they are logged, and a rejected envelope is exactly
 * the one whose contents should not be retained.
 */
export function inspectLegacyWebhookEvent(
  event: Stripe.Event,
  env: LegacyWebhookEnvironment = process.env,
): LegacyWebhookAdmissionVerdict {
  if (typeof event.livemode !== 'boolean') {
    return reject('scope', 'event livemode is not explicit');
  }

  const expectedLivemode = credentialLivemode(env);
  if (expectedLivemode === null) {
    return reject('config', 'STRIPE_SECRET_KEY declares no test/live mode');
  }
  if (event.livemode !== expectedLivemode) {
    // Our webhook secret and our API key disagree about mode. The event is
    // probably fine; the environment is not. Retryable on purpose.
    return reject(
      'config',
      `event livemode ${event.livemode} does not match the configured credential`,
    );
  }

  const expectedScope = (
    LEGACY_WEBHOOK_EVENT_SCOPES as Readonly<Record<string, LegacyWebhookEventScope | undefined>>
  )[event.type];

  // A type no handler reads reaches no handler whether or not it is listed, so
  // admitting it changes nothing. The source-scan guard in the test suite is
  // what keeps the table in step with the handlers.
  if (!expectedScope) return ADMIT;

  const account = eventAccount(event);

  if (expectedScope === 'platform') {
    return account === null
      ? ADMIT
      : reject('scope', `${event.type} must arrive on the platform account`);
  }

  // Connected scope. A null account here is the platform's own account.updated,
  // which the handler already no-ops on because no row carries the platform id
  // as its stripe_connect_id.
  if (account === null) return ADMIT;

  return dataObjectId(event) === account
    ? ADMIT
    : reject('scope', `${event.type} account does not match its subject`);
}
