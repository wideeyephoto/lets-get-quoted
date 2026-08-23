import {
  CONNECTED_PAYMENT_EVENT_TYPES,
  PLATFORM_SUBSCRIPTION_EVENT_TYPES,
  PLATFORM_TOP_UP_EVENT_TYPES,
} from '@/lib/billing/stripe-event-inbox';

/**
 * The event types the platform webhook route dispatches on, and therefore the
 * subscription a Stripe endpoint must carry for that route to function.
 *
 * Handling an event in code does nothing unless the endpoint is subscribed to
 * it — Stripe delivers only what the endpoint asks for. A handler with no
 * matching subscription is silently dead code, and that is invisible to the
 * test suite, because tests invoke handlers directly and never consult the
 * endpoint's configuration. The only way to catch it is to write the required
 * set down and diff it against what the endpoint actually reports.
 *
 * `stripe-webhook-subscription.test.ts` parses the route and fails if this list
 * and the route's dispatch table drift apart in either direction, so a new
 * handler cannot land without declaring the subscription it depends on.
 */
export const REQUIRED_LIVE_WEBHOOK_EVENTS = [
  'account.updated',
  'charge.dispute.closed',
  'charge.dispute.created',
  'charge.failed',
  'charge.refunded',
  'checkout.session.async_payment_failed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'payment_intent.succeeded',
] as const;

export type RequiredLiveWebhookEvent = typeof REQUIRED_LIVE_WEBHOOK_EVENTS[number];

/**
 * RESOLVED 2026-08-17. Retained as the evidence this module exists for, and
 * because a regression would look exactly like this again.
 *
 * What the live endpoint reported when first read from the Stripe API that day:
 * `we_1TuE0BGqh5LFKuTCEyt5d4jh`, https://letsgetquoted.com/api/stripe/webhook,
 * on `acct_1TuCWJGqh5LFKuTC`, API version 2026-06-24.dahlia, status enabled —
 * seven of the eleven events the route dispatches on. The four it omitted were
 * dead handlers in production:
 *
 * - `checkout.session.async_payment_succeeded` and `payment_intent.succeeded`
 *   are the only two events that ever move an ACH payment to paid. ACH is
 *   offered on every one-off payment at or above the ACH threshold that is not
 *   a plan deposit, and /pay tells the customer they will be "confirmed once it
 *   settles". Without these, the bank debit clears at Stripe and the payment
 *   row stays `processing` forever.
 * - `checkout.session.async_payment_failed` is the matching bounce path, so a
 *   failed debit never marked the payment failed or notified anyone.
 * - `charge.dispute.closed` was subscribed nowhere, so disputes opened in the
 *   database and never closed.
 *
 * The endpoint was corrected in place the same day — `id`, `url`, `api_version`
 * and `status` unchanged, so the signing secret was preserved — and re-read to
 * confirm all eleven. Stripe does not backfill events fired while an endpoint
 * was unsubscribed; a reconciliation sweep over `processing` payments within the
 * ~30-day event-retention window found no stranded settlement, so nothing needed
 * resending.
 */
export const LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX = [
  'account.updated',
  'charge.dispute.created',
  'charge.failed',
  'charge.refunded',
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
] as const;

/** Required events that a given endpoint subscription does not cover. */
export function missingLiveWebhookEvents(
  subscribed: readonly string[],
): RequiredLiveWebhookEvent[] {
  const has = new Set(subscribed);
  return REQUIRED_LIVE_WEBHOOK_EVENTS.filter((event) => !has.has(event));
}


/**
 * THE OTHER THREE ENDPOINTS, which had no declaration at all.
 *
 * REQUIRED_LIVE_WEBHOOK_EVENTS above covers the legacy platform route and
 * nothing else. Three more Stripe endpoints have landed since -- platform
 * subscriptions, platform top-ups, and events on connected accounts -- and each
 * one repeats the failure mode that module exists to catch: a handler is
 * silently dead unless the endpoint is subscribed to the event that reaches it,
 * and no test can see that, because tests call handlers directly and never
 * consult Stripe's configuration.
 *
 * That is not hypothetical here. The legacy endpoint went live subscribed to
 * seven of the eleven events its route dispatches on, and the four it omitted
 * were the only ones that could ever settle an ACH payment or close a dispute.
 * See LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX.
 *
 * `required` is what the endpoint must be subscribed to. `projected` is the
 * subset something in this codebase actually acts on today. They are different
 * numbers on purpose, and the difference is the point: an event that is required
 * but not projected is durably received and waiting for a projector, not
 * handled. Nineteen of the connected endpoint's twenty are in exactly that
 * state, and nothing would otherwise say so out loud.
 */
export type StripeWebhookEndpoint = Readonly<{
  /** The route path, for an operator configuring Stripe. */
  path: string;
  /** The inbox scope the route declares for itself. Never inferred. */
  scope: 'legacy_platform' | 'platform_subscription' | 'platform_top_up' | 'connected_payment';
  /** Which Stripe account the endpoint lives on. */
  account: 'platform' | 'connect';
  /** Env var that turns the route on. Off means 404 before anything is read. */
  flag: string | null;
  /** Env var holding this endpoint's own signing secret. Never shared. */
  secret: string;
  /** What Stripe must be subscribed to for the route to receive its work. */
  required: readonly string[];
  /** Of `required`, what something actually projects today. */
  projected: readonly string[];
}>;

export const STRIPE_WEBHOOK_ENDPOINTS: readonly StripeWebhookEndpoint[] = Object.freeze([
  Object.freeze({
    path: '/api/stripe/webhook',
    scope: 'legacy_platform',
    account: 'platform',
    // No flag: this one has been live since before the flag convention.
    flag: null,
    secret: 'STRIPE_WEBHOOK_SECRET',
    required: REQUIRED_LIVE_WEBHOOK_EVENTS,
    // Every one of them dispatches to a handler in the route itself.
    projected: REQUIRED_LIVE_WEBHOOK_EVENTS,
  }),
  Object.freeze({
    path: '/api/stripe/billing/webhook',
    scope: 'platform_subscription',
    account: 'platform',
    flag: 'LGQ_STRIPE_BILLING_WEBHOOK_ENABLED',
    secret: 'STRIPE_BILLING_WEBHOOK_SECRET',
    required: PLATFORM_SUBSCRIPTION_EVENT_TYPES,
    // subscription-event-projector.ts claims all eighteen.
    projected: PLATFORM_SUBSCRIPTION_EVENT_TYPES,
  }),
  Object.freeze({
    path: '/api/stripe/top-ups/webhook',
    scope: 'platform_top_up',
    account: 'platform',
    flag: 'LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED',
    secret: 'STRIPE_TOP_UP_WEBHOOK_SECRET',
    required: PLATFORM_TOP_UP_EVENT_TYPES,
    // top-up-event-projector.ts gives all four an outcome: fulfilled, expired,
    // payment_failed, or awaiting_async_payment.
    projected: PLATFORM_TOP_UP_EVENT_TYPES,
  }),
  Object.freeze({
    path: '/api/stripe/connected-payments/webhook',
    scope: 'connected_payment',
    account: 'connect',
    flag: 'LGQ_STRIPE_CONNECTED_PAYMENT_WEBHOOK_ENABLED',
    secret: 'STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET',
    required: CONNECTED_PAYMENT_EVENT_TYPES,
    /**
     * ONE OF TWENTY. claim_next_due_stripe_connected_payment_event selects
     * `event_type = 'checkout.session.completed'` and nothing else, so every
     * other connected event is durably received and then sits at
     * processing_status 'received' with no worker that will ever claim it.
     *
     * That is the designed state, not a bug -- the receipt is the point, and a
     * projector must correlate the connected-account object before changing any
     * payment state. But it is a state somebody has to be able to see, because
     * the inbox looks identical whether an event is queued or abandoned.
     */
    projected: Object.freeze(['checkout.session.completed']),
  }),
]);

/** Required events an endpoint's actual Stripe subscription does not cover. */
export function missingEventsForEndpoint(
  endpoint: StripeWebhookEndpoint,
  subscribed: readonly string[],
): string[] {
  const has = new Set(subscribed);
  return endpoint.required.filter((event) => !has.has(event));
}

/**
 * Received durably, projected by nothing. Not an error -- a backlog, and the
 * one number that says how much of an endpoint is still receipt-only.
 */
export function receivedOnlyEvents(endpoint: StripeWebhookEndpoint): string[] {
  const projected = new Set(endpoint.projected);
  return endpoint.required.filter((event) => !projected.has(event));
}
