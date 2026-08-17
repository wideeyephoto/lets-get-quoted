import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_LIVE_WEBHOOK_EVENTS,
  missingLiveWebhookEvents,
} from '@/lib/billing/stripe-webhook-subscription';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = read('scripts/verify-webhook-subscription.mjs');
const MODULE = read('src/lib/billing/stripe-webhook-subscription.ts');

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

  it('treats a wildcard subscription as complete', () => {
    // `enabled_events: ['*']` means every event; diffing it naively would report
    // all eleven as missing and send someone to "fix" a correct endpoint.
    expect(SCRIPT).toContain("includes('*')");
  });
});
