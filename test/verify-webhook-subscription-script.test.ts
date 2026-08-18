import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_LIVE_WEBHOOK_EVENTS,
  missingLiveWebhookEvents,
} from '@/lib/billing/stripe-webhook-subscription';
import { PLATFORM_SUBSCRIPTION_EVENT_TYPES } from '@/lib/billing/stripe-event-inbox';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = read('scripts/verify-webhook-subscription.mjs');
const MODULE = read('src/lib/billing/stripe-webhook-subscription.ts');
const INBOX = read('src/lib/billing/stripe-event-inbox.ts');

// scripts/verify-webhook-subscription.mjs is plain ESM run by node, so it cannot
// import the TypeScript module. It parses the required list out of the source
// instead — deliberately, because duplicating the list would reintroduce the drift
// the script exists to detect, one layer further out.
//
// That parse is the script's single point of failure: a regex that silently
// matched nothing would report every endpoint as fully subscribed. The script
// throws on an empty parse; this test is the other half, checking the parse still
// agrees with the module it is reading.
function parseAsScriptDoes(source: string): string[] {
  const block = source.match(/export const REQUIRED_LIVE_WEBHOOK_EVENTS = \[([\s\S]*?)\] as const;/);
  if (!block) return [];
  return [...block[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]);
}

describe('the live webhook verification script', () => {
  it('parses exactly the events the module exports', () => {
    expect(parseAsScriptDoes(MODULE)).toEqual([...REQUIRED_LIVE_WEBHOOK_EVENTS]);
  });

  it('parses a non-empty list, which is what the script refuses to proceed without', () => {
    expect(parseAsScriptDoes(MODULE).length).toBeGreaterThan(0);
    expect(SCRIPT).toContain('Refusing to report success');
  });

  it('returns nothing for a module whose declaration has been reshaped', () => {
    // If someone reformats the export so the regex stops matching, the parse must
    // come back empty and the script must abort — never quietly pass.
    expect(parseAsScriptDoes('export const REQUIRED_LIVE_WEBHOOK_EVENTS = buildList();')).toEqual([]);
  });

  it('feeds the comparison function the module already exported and nobody called', () => {
    expect(SCRIPT).toContain('missing');
    // The real point of the script: a live read, not a fixture.
    expect(SCRIPT).toContain('stripe.webhookEndpoints.list');
    expect(missingLiveWebhookEvents([...REQUIRED_LIVE_WEBHOOK_EVENTS])).toEqual([]);
  });

  it('treats a test-mode key as inconclusive rather than as a pass', () => {
    // The failure this whole script answers was a confident wrong answer. A run
    // against the test account must not be able to masquerade as a green check.
    expect(SCRIPT).toContain("if (keyMode !== 'live') process.exit(2)");
    expect(SCRIPT).toContain('says nothing about production');
  });

  it('never writes to Stripe', () => {
    for (const mutation of ['webhookEndpoints.create', 'webhookEndpoints.update', 'webhookEndpoints.del']) {
      expect(SCRIPT).not.toContain(mutation);
    }
  });

  it('parses exactly the subscription scope the inbox module exports', () => {
    const block = INBOX.match(/export const PLATFORM_SUBSCRIPTION_EVENT_TYPES = \[([\s\S]*?)\] as const/);
    const parsed = block ? [...block[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]) : [];
    expect(parsed).toEqual([...PLATFORM_SUBSCRIPTION_EVENT_TYPES]);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('checks the billing endpoint in both directions, not just for missing events', () => {
    // The payment endpoint only needs its required events present. The billing
    // route rejects anything outside the scope it declares, so an EXTRA event
    // yields an endpoint Stripe reports as healthy, returning 200, while nothing
    // projects. Counting events sees neither fault.
    expect(SCRIPT).toContain('extraFor');
    expect(SCRIPT).toContain('OUT OF SCOPE');
    expect(SCRIPT).toContain('subscriptionRequired');
  });

  it('fails the run when the billing endpoint is out of scope', () => {
    // A billing fault must reach the exit code, not merely the transcript.
    expect(SCRIPT).toMatch(/billingEndpoints\.filter\(\(e\) => e\.missing\.length > 0 \|\| e\.extra\.length > 0\)/);
  });

  it('treats a wildcard subscription as complete', () => {
    // `enabled_events: ['*']` means every event; diffing it naively would report
    // all eleven as missing and send someone to "fix" a correct endpoint.
    expect(SCRIPT).toContain("includes('*')");
  });
});
