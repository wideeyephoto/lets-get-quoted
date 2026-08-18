import { readFile } from 'node:fs/promises';
import Stripe from 'stripe';

// Read the live Stripe webhook endpoints and diff them against the event list
// the route dispatches on.
//
// WHY THIS EXISTS. src/lib/billing/stripe-webhook-subscription.ts writes down the
// required events and exports missingLiveWebhookEvents() to diff them against an
// endpoint's actual subscription. Nothing called it. The list was written down,
// the comparison function was written, the unit test was written — and the unit
// test compares the list against the ROUTE'S DISPATCH TABLE, which is code
// against code. It passes whether the live endpoint is right or wrong.
//
// On 2026-08-17 that gap cost half a day. A dashboard reading reported seven of
// the eleven events, byte-for-byte matching a documented earlier fault, and was
// believed. The Stripe API then reported all eleven. The dashboard was wrong, but
// nothing in this repository could say so, because the only way to know the state
// of the endpoint was for a person to open a browser and read it correctly.
//
// This is that check. Read-only: it retrieves and compares, and never writes to
// Stripe. Run it after any deploy that touches the webhook route, and any time
// somebody claims the endpoint is or is not configured.
//
// Run:
//   node scripts/verify-webhook-subscription.mjs
//   node scripts/verify-webhook-subscription.mjs --json

const JSON_OUT = process.argv.includes('--json');
const SUBSCRIPTION_MODULE = new URL('../src/lib/billing/stripe-webhook-subscription.ts', import.meta.url);
const INBOX_MODULE = new URL('../src/lib/billing/stripe-event-inbox.ts', import.meta.url);

async function loadEnv() {
  // Same tolerance as scripts/remove-demo-data.mjs: this repo is checked out as a
  // worktree in some places and .env.local only exists in the primary checkout.
  for (const candidate of ['../.env.local', '../../CLAUDE CODE FOLDER/.env.local']) {
    try {
      const contents = await readFile(new URL(candidate, import.meta.url), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;
        const key = trimmed.slice(0, separator).trim();
        if (!process.env[key]) {
          process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        }
      }
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

/**
 * The required list, parsed out of the TypeScript module rather than duplicated
 * here. Duplicating it would reintroduce exactly the drift this file exists to
 * detect, one layer further out.
 */
async function requiredEvents() {
  const source = (await readFile(SUBSCRIPTION_MODULE, 'utf8')).replace(/\r\n/g, '\n');
  const block = source.match(/export const REQUIRED_LIVE_WEBHOOK_EVENTS = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error('Could not find REQUIRED_LIVE_WEBHOOK_EVENTS in stripe-webhook-subscription.ts.');
  const events = [...block[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]);
  // A parse that silently yields nothing would make every endpoint look perfect,
  // which is the failure mode this whole file is about.
  if (events.length === 0) throw new Error('Parsed REQUIRED_LIVE_WEBHOOK_EVENTS as empty. Refusing to report success.');
  return events;
}

/**
 * The subscription scope, parsed the same way out of the inbox module.
 *
 * The billing endpoint is checked in BOTH directions, unlike the payment one.
 * A missing event means a subscription change nothing ever hears about. An EXTRA
 * event is just as bad and far more deceptive: the route validates every delivery
 * against the scope it declares and rejects anything outside it, so a stray
 * checkout.session.completed produces an endpoint Stripe shows as healthy,
 * returning 200, while the product silently never updates. Counting events cannot
 * see either fault — which is exactly how "18 event(s)" would have read as a pass.
 */
async function subscriptionEvents() {
  const source = (await readFile(INBOX_MODULE, 'utf8')).replace(/\r\n/g, '\n');
  const block = source.match(/export const PLATFORM_SUBSCRIPTION_EVENT_TYPES = \[([\s\S]*?)\] as const/);
  if (!block) throw new Error('Could not find PLATFORM_SUBSCRIPTION_EVENT_TYPES in stripe-event-inbox.ts.');
  const events = [...block[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]);
  if (events.length === 0) throw new Error('Parsed PLATFORM_SUBSCRIPTION_EVENT_TYPES as empty. Refusing to report success.');
  return events;
}

await loadEnv();
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('No STRIPE_SECRET_KEY. This script reads the Stripe API and cannot run without one.');
  process.exit(1);
}

// Which account this key even addresses, derived from its prefix and never from
// its value. Without this line an empty endpoint list is ambiguous between "the
// endpoint is missing" and "you are looking at the test account", and the first
// reading would send somebody to fix something that is not broken — which is the
// specific way the 2026-08-17 morning was lost.
const keyMode = /^(sk|rk)_live_/.test(secretKey)
  ? 'live'
  : /^(sk|rk)_test_/.test(secretKey)
    ? 'TEST'
    : 'unrecognised';

const required = await requiredEvents();
const subscriptionRequired = await subscriptionEvents();
const stripe = new Stripe(secretKey, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

let endpoints;
try {
  endpoints = (await stripe.webhookEndpoints.list({ limit: 100 })).data;
} catch (error) {
  console.error(`Could not list webhook endpoints: ${error.message}`);
  process.exit(1);
}

// `enabled_events: ['*']` means every event, so nothing can be missing.
const missingFrom = (endpoint, wanted) =>
  endpoint.enabled_events?.includes('*')
    ? []
    : wanted.filter((event) => !endpoint.enabled_events?.includes(event));

const missingFor = (endpoint) => missingFrom(endpoint, required);

// Only meaningful for the billing endpoint, whose route rejects out-of-scope
// deliveries. A wildcard is NOT a pass here: it subscribes the endpoint to every
// event Stripe emits, most of which that route will refuse.
const extraFor = (endpoint, wanted) =>
  (endpoint.enabled_events ?? []).filter((event) => !wanted.includes(event));

const PAYMENT_ROUTE = '/api/stripe/webhook';
const BILLING_ROUTE = '/api/stripe/billing/webhook';

const report = endpoints.map((endpoint) => ({
  id: endpoint.id,
  url: endpoint.url,
  status: endpoint.status,
  livemode: endpoint.livemode,
  api_version: endpoint.api_version,
  event_count: endpoint.enabled_events?.length ?? 0,
  enabled_events: endpoint.enabled_events ?? [],
  serves: endpoint.url?.endsWith(PAYMENT_ROUTE)
    ? 'payment'
    : endpoint.url?.endsWith(BILLING_ROUTE)
      ? 'billing'
      : 'other',
  missing: endpoint.url?.endsWith(PAYMENT_ROUTE)
    ? missingFor(endpoint)
    : endpoint.url?.endsWith(BILLING_ROUTE)
      ? missingFrom(endpoint, subscriptionRequired)
      : [],
  extra: endpoint.url?.endsWith(BILLING_ROUTE) ? extraFor(endpoint, subscriptionRequired) : [],
}));

const paymentEndpoints = report.filter((e) => e.serves === 'payment' && e.status === 'enabled');
const billingEndpoints = report.filter((e) => e.serves === 'billing' && e.status === 'enabled');
const broken = [
  ...paymentEndpoints.filter((e) => e.missing.length > 0),
  ...billingEndpoints.filter((e) => e.missing.length > 0 || e.extra.length > 0),
];

if (JSON_OUT) {
  console.log(JSON.stringify({
    key_mode: keyMode,
    required,
    endpoint_count: report.length,
    endpoints: report,
    ok: broken.length === 0 && paymentEndpoints.length > 0,
  }, null, 2));
} else {
  console.log(`Key mode: ${keyMode}   ·   required by the route: ${required.length} events`);
  if (keyMode !== 'live') {
    console.log('This key is not a live key, so everything below describes the TEST account.');
    console.log('A finding here says nothing about production.');
  }
  console.log(`Endpoints visible to this key: ${report.length}\n`);
  if (report.length === 0) {
    console.log('No webhook endpoints at all on this account — which for a test key usually means');
    console.log('nothing is configured there, not that production is broken.\n');
  }
  for (const e of report) {
    console.log(`${e.id}  ${e.status}  ${e.livemode ? 'live' : 'test'}  ${e.api_version ?? '(account default)'}`);
    console.log(`  ${e.url}`);
    console.log(`  serves: ${e.serves} · ${e.event_count} event(s)`);
    if (e.serves === 'payment') {
      console.log(e.missing.length === 0
        ? '  all required events present'
        : `  MISSING ${e.missing.length}: ${e.missing.join(', ')}`);
    }
    if (e.serves === 'billing') {
      if (e.missing.length === 0 && e.extra.length === 0) {
        console.log('  exactly the subscription scope, no more and no less');
      }
      if (e.missing.length > 0) console.log(`  MISSING ${e.missing.length}: ${e.missing.join(', ')}`);
      // Out-of-scope events are the quiet failure: Stripe reports the delivery
      // healthy, the route returns 200, and nothing projects.
      if (e.extra.length > 0) console.log(`  OUT OF SCOPE ${e.extra.length}: ${e.extra.join(', ')}`);
    }
    console.log('');
  }
  if (paymentEndpoints.length === 0) console.log('WARNING: no enabled endpoint serves the payment route.');
  if (billingEndpoints.length === 0) {
    console.log('NOTE: no enabled endpoint serves the billing route. Subscriptions cannot project until one exists.');
  }
}

// Exit code is the point: this is meant to be runnable as a gate, not only read.
// A test key is not a pass and not a failure — it is an inconclusive run, and
// saying so is the whole reason the mode is printed above. Exit 2 so a caller can
// tell "production is wrong" from "you did not check production".
if (keyMode !== 'live') process.exit(2);
if (paymentEndpoints.length === 0 || broken.length > 0) process.exit(1);
