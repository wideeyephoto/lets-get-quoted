import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX,
  missingLiveWebhookEvents,
  REQUIRED_LIVE_WEBHOOK_EVENTS,
} from '@/lib/billing/stripe-webhook-subscription';

const routePath = fileURLToPath(new URL(
  '../src/app/api/stripe/webhook/route.ts',
  import.meta.url,
));
const routeSource = readFileSync(routePath, 'utf8');

/** Every event type the route branches on, e.g. `event.type === 'charge.failed'`. */
function dispatchedEventTypes(): string[] {
  const matches = routeSource.matchAll(/event\.type === '([a-z_]+(?:\.[a-z_]+)+)'/g);
  return [...new Set([...matches].map((match) => match[1]))].sort();
}

describe('platform Stripe webhook subscription contract', () => {
  it('requires exactly the events the route dispatches on', () => {
    const dispatched = dispatchedEventTypes();
    // Guards the parse itself: a refactor to a switch or a lookup table would
    // silently yield zero matches and make every assertion below vacuous.
    expect(dispatched.length).toBeGreaterThan(5);
    expect(dispatched).toEqual([...REQUIRED_LIVE_WEBHOOK_EVENTS]);
  });

  it('lists required events sorted and unique', () => {
    const required = [...REQUIRED_LIVE_WEBHOOK_EVENTS];
    expect(required).toEqual([...new Set(required)].sort());
  });

  it('reports the four events the live endpoint was missing before the fix', () => {
    // A live endpoint read, not a fixture. These four handlers were dead in
    // production: two of them are the only paths that settle an ACH payment.
    // Resolved 2026-08-17; kept so the detector is proven against the real defect.
    expect(missingLiveWebhookEvents(LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX)).toEqual([
      'charge.dispute.closed',
      'checkout.session.async_payment_failed',
      'checkout.session.async_payment_succeeded',
      'payment_intent.succeeded',
    ]);
  });

  it('treats every historically observed event as one the route still handles', () => {
    // The converse gap: an endpoint subscribed to something nothing handles
    // means deliveries that can only ever 200-and-drop.
    const required = new Set<string>(REQUIRED_LIVE_WEBHOOK_EVENTS);
    for (const observed of LIVE_WEBHOOK_EVENTS_BEFORE_2026_08_17_FIX) {
      expect(required.has(observed)).toBe(true);
    }
  });

  it('reports nothing missing for a fully subscribed endpoint', () => {
    expect(missingLiveWebhookEvents(REQUIRED_LIVE_WEBHOOK_EVENTS)).toEqual([]);
    expect(missingLiveWebhookEvents([...REQUIRED_LIVE_WEBHOOK_EVENTS, 'invoice.paid'])).toEqual([]);
  });

  it('reports every required event for an endpoint subscribed to nothing', () => {
    expect(missingLiveWebhookEvents([])).toEqual([...REQUIRED_LIVE_WEBHOOK_EVENTS]);
  });
});
