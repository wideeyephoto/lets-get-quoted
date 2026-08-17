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
