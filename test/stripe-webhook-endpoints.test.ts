import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  STRIPE_WEBHOOK_ENDPOINTS,
  missingEventsForEndpoint,
  receivedOnlyEvents,
  type StripeWebhookEndpoint,
} from '@/lib/billing/stripe-webhook-subscription';

/**
 * A HANDLER IS DEAD CODE UNLESS THE ENDPOINT IS SUBSCRIBED TO WHAT REACHES IT.
 *
 * No test can see that on its own: tests call handlers directly and never
 * consult Stripe's configuration. The only defence is to write down what each
 * endpoint requires and diff it against the code, so a new handler cannot land
 * without declaring the subscription it depends on -- and so an operator has an
 * exact list to configure against.
 *
 * The cost of not having this is on the record. The legacy platform endpoint
 * went live subscribed to seven of the eleven events its route dispatches on,
 * and the four missing ones were the only events that could ever settle an ACH
 * payment or close a dispute. Three endpoints have been added since and none of
 * them had a declaration at all.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const byPath = (path: string): StripeWebhookEndpoint => {
  const found = STRIPE_WEBHOOK_ENDPOINTS.find((e) => e.path === path);
  expect(found, `no declaration for ${path}`).toBeDefined();
  return found!;
};

describe('every Stripe webhook route is declared', () => {
  it('declares one endpoint per route that exists on disk', () => {
    // Walking the filesystem rather than listing paths: a fifth endpoint added
    // without a declaration is exactly the regression this file exists for.
    const root = join(process.cwd(), 'src', 'app', 'api', 'stripe');
    const found: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}/${entry.name}`);
        else if (entry.name === 'route.ts' && prefix.endsWith('/webhook')) found.push(prefix);
      }
    };
    walk(root, '/api/stripe');

    expect(found.length).toBeGreaterThan(0);
    expect(found.sort()).toEqual(STRIPE_WEBHOOK_ENDPOINTS.map((e) => e.path).sort());
  });

  it('points every declaration at a route that is really there', () => {
    for (const endpoint of STRIPE_WEBHOOK_ENDPOINTS) {
      const file = join(process.cwd(), 'src', 'app', `${endpoint.path}`.replace(/^\//, ''), 'route.ts');
      expect(existsSync(file), endpoint.path).toBe(true);
    }
  });

  it('gives each endpoint its own signing secret', () => {
    // A shared secret means an event meant for one scope verifies against
    // another, and scope is what decides whether checkout.session.completed
    // paid a contractor or bought credits.
    const secrets = STRIPE_WEBHOOK_ENDPOINTS.map((e) => e.secret);
    expect(new Set(secrets).size).toBe(secrets.length);
    for (const secret of secrets) expect(secret).toMatch(/^STRIPE_[A-Z_]*WEBHOOK_SECRET$/);
  });

  it('names a flag for every endpoint added since the convention', () => {
    const env = read('.env.example');
    for (const endpoint of STRIPE_WEBHOOK_ENDPOINTS) {
      if (endpoint.flag === null) {
        // Only the legacy route predates the flag convention, and it is live.
        expect(endpoint.path).toBe('/api/stripe/webhook');
        continue;
      }
      expect(endpoint.flag, endpoint.path).toMatch(/^LGQ_[A-Z_]+_ENABLED$/);
      expect(env, `${endpoint.flag} is undocumented`).toContain(endpoint.flag);
    }
  });

  it('requires at least everything it projects', () => {
    for (const endpoint of STRIPE_WEBHOOK_ENDPOINTS) {
      const required = new Set(endpoint.required);
      for (const event of endpoint.projected) {
        // Projecting an event the endpoint is not subscribed to is the exact
        // shape of a dead handler.
        expect(required.has(event), `${endpoint.path} projects unsubscribed ${event}`).toBe(true);
      }
      expect(endpoint.required.length).toBeGreaterThan(0);
    }
  });
});

describe('what each declaration claims matches the code that would run', () => {
  it('the billing endpoint requires exactly what the subscription projector claims', () => {
    const source = read('src', 'lib', 'billing', 'subscription-event-projector.ts');
    const block = source.slice(source.indexOf('const PLATFORM_EVENT_TYPES'));
    const handled = [...block.slice(0, block.indexOf(']')).matchAll(/'([a-z_]+\.[a-z_.]+)'/g)]
      .map((m) => m[1]);
    expect(handled.length).toBe(18);
    expect([...byPath('/api/stripe/billing/webhook').projected].sort()).toEqual(handled.sort());
  });

  it('the connected endpoint projects exactly what the claim RPC selects', () => {
    // The strongest available cross-check: the SQL is the thing that decides,
    // and reading it here means the declaration cannot drift from it silently.
    const sql = read('migrations', '20260816090000_stripe_connected_payment_projection_worker.sql')
      .replace(/\r\n/g, '\n');
    const selected = [...sql.matchAll(/event_type\s*=\s*'([a-z_.]+)'/g)].map((m) => m[1]);
    expect(selected.length).toBeGreaterThan(0);
    expect([...new Set(selected)]).toEqual(['checkout.session.completed']);
    expect([...byPath('/api/stripe/connected-payments/webhook').projected])
      .toEqual(['checkout.session.completed']);
  });

  it('says out loud that nineteen of the connected twenty are receipt-only', () => {
    // Not a bug -- the receipt IS the design, and a projector must correlate the
    // connected-account object before touching payment state. But the inbox
    // looks identical whether an event is queued or abandoned, so the number
    // has to be written down somewhere a person will find it.
    const connected = byPath('/api/stripe/connected-payments/webhook');
    const backlog = receivedOnlyEvents(connected);
    expect(backlog).toHaveLength(19);
    expect(backlog).toContain('charge.refunded');
    expect(backlog).toContain('charge.dispute.created');
    expect(backlog).not.toContain('checkout.session.completed');
  });

  it('has no receipt-only events on the three platform endpoints', () => {
    for (const path of [
      '/api/stripe/webhook',
      '/api/stripe/billing/webhook',
      '/api/stripe/top-ups/webhook',
    ]) {
      expect(receivedOnlyEvents(byPath(path)), path).toEqual([]);
    }
  });
});

describe('reporting a real Stripe subscription back', () => {
  it('names what an endpoint is missing', () => {
    const billing = byPath('/api/stripe/billing/webhook');
    const partial = billing.required.slice(0, 3);
    const missing = missingEventsForEndpoint(billing, partial);
    expect(missing).toHaveLength(billing.required.length - 3);
    expect(missing).toContain('invoice.paid');
  });

  it('finds nothing missing when the subscription covers it', () => {
    for (const endpoint of STRIPE_WEBHOOK_ENDPOINTS) {
      expect(missingEventsForEndpoint(endpoint, endpoint.required), endpoint.path).toEqual([]);
      // Extra subscriptions are the operator's business, not a failure.
      expect(missingEventsForEndpoint(endpoint, [...endpoint.required, 'ping.pong'])).toEqual([]);
    }
  });

  it('reports everything missing for an endpoint subscribed to nothing', () => {
    // The state a freshly created Stripe endpoint is in.
    for (const endpoint of STRIPE_WEBHOOK_ENDPOINTS) {
      expect(missingEventsForEndpoint(endpoint, []).length, endpoint.path)
        .toBe(endpoint.required.length);
    }
  });
});
