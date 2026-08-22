import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OVERAGE_PERIOD_CLOSE_FLAG,
  OVERAGE_SETTLEMENT_FLAG,
  overagePeriodCloseWorkerEnabled,
  overageSettlementIdempotencyKey,
  overageSettlementWorkerEnabled,
} from '@/lib/billing/overage-settlement-worker';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const MIGRATION = read('migrations', '20260819260000_overage_settlement.sql');
const WORKER = read('src', 'lib', 'billing', 'overage-settlement-worker.ts');
const CLOSE_ROUTE = read('src', 'app', 'api', 'cron', 'overage-period-close', 'route.ts');
const SETTLE_ROUTE = read('src', 'app', 'api', 'cron', 'overage-settlement', 'route.ts');
const ENV = read('.env.example');

/**
 * The rail this drives was written to make double-billing impossible, and every
 * one of those guarantees is only as good as the worker holding it. So the
 * assertions here are about the two things a worker can get wrong that the
 * database cannot catch for it: reusing the idempotency key across retries, and
 * deciding that a request which MIGHT have charged somebody did not.
 */

describe('the idempotency key is what makes a retry safe', () => {
  const key = () => overageSettlementIdempotencyKey({
    settlementId: '3f7c1a52-0a5e-4c31-9b2f-0c9d6c1f2b34',
    chargeableCents: 1_234,
  });

  it('is the exact shape the database will store', () => {
    // The column has a CHECK on this pattern, so a key of the wrong shape is
    // refused at claim time -- after the row has already moved to `submitted`.
    expect(key()).toMatch(/^lgq:billing:v1:overage\.settle:[0-9a-f]{64}$/);
    expect(MIGRATION).toContain("stripe_idempotency_key ~ '^lgq:billing:v1:overage[.]settle:[0-9a-f]{64}$'");
  });

  it('is identical on every attempt for the same settlement', () => {
    // `indeterminate` is re-claimable on purpose: Stripe may or may not have
    // created the item, and asking again is the only way to find out. That is
    // safe only while the second ask carries the SAME key.
    expect(key()).toBe(key());
  });

  it('derives from nothing that can move between attempts', () => {
    // Attempt count, claim token and timestamps all change on a re-claim. If
    // any of them fed the digest, the retry built to PREVENT a double charge
    // would be the thing causing one.
    const digestInput = WORKER.slice(WORKER.indexOf('createHash(\'sha256\')'));
    for (const mutable of ['attempt', 'claimToken', 'Date.now', 'now()', 'token']) {
      expect(digestInput.slice(0, 300), mutable).not.toContain(mutable);
    }
    expect(WORKER).toContain('`${input.settlementId}:${input.chargeableCents}`');
  });

  it('separates settlements that differ only in amount', () => {
    const a = overageSettlementIdempotencyKey({ settlementId: 'a', chargeableCents: 100 });
    const b = overageSettlementIdempotencyKey({ settlementId: 'a', chargeableCents: 101 });
    expect(a).not.toBe(b);
  });
});

describe('an uncertain Stripe failure must not be recorded as a definite one', () => {
  it('defaults the unknown case to indeterminate, not to failed', () => {
    // The whole file turns on this default. "We do not know" resolving to
    // "it did not happen" is how a second attempt charges somebody twice, and
    // an unrecognised error shape is exactly the case nobody thought about.
    const classify = WORKER.slice(WORKER.indexOf('function classifyStripeFailure'));
    const body = classify.slice(0, classify.indexOf('\n}'));
    // The last return in the function is the fallthrough, and it is the true one.
    const returns = [...body.matchAll(/indeterminate:\s*(true|false)/g)].map((m) => m[1]);
    expect(returns.length).toBeGreaterThanOrEqual(2);
    expect(returns.at(-1)).toBe('true');
  });

  it('treats only a refusal Stripe is certain about as terminal', () => {
    const classify = WORKER.slice(WORKER.indexOf('function classifyStripeFailure'));
    expect(classify).toContain('StripeInvalidRequestError');
    expect(classify).toContain('resource_missing');
  });

  it('records the claim before calling Stripe, never after', () => {
    // A process that dies mid-request must leave evidence that we were about to
    // ask. The rail cannot enforce the ordering; only the worker can.
    //
    // Comments stripped first. The header explains that this settles with
    // `invoiceItems.create` rather than a metered Price, and matching raw source
    // found that sentence at byte 807 -- an ordering assertion that passed or
    // failed on where the prose sat.
    const code = WORKER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const claimAt = code.indexOf("rpc('claim_overage_settlement'");
    const callAt = code.indexOf('invoiceItems.create');
    const completeAt = code.indexOf("rpc('complete_overage_settlement'");
    for (const [name, at] of [['claim', claimAt], ['call', callAt], ['complete', completeAt]] as const) {
      expect(at, name).toBeGreaterThan(-1);
    }
    expect(claimAt).toBeLessThan(callAt);
    expect(callAt).toBeLessThan(completeAt);
  });
});

describe('two workers, two flags, because they are not equally dangerous', () => {
  it('is off unless the value is exactly 1', () => {
    for (const check of [overagePeriodCloseWorkerEnabled, overageSettlementWorkerEnabled]) {
      expect(check({})).toBe(false);
      for (const value of ['0', '', 'true', 'yes', '1 ', '01']) {
        expect(check({ [OVERAGE_PERIOD_CLOSE_FLAG]: value, [OVERAGE_SETTLEMENT_FLAG]: value }), value)
          .toBe(false);
      }
    }
    expect(overagePeriodCloseWorkerEnabled({ [OVERAGE_PERIOD_CLOSE_FLAG]: '1' })).toBe(true);
    expect(overageSettlementWorkerEnabled({ [OVERAGE_SETTLEMENT_FLAG]: '1' })).toBe(true);
  });

  it('gates the money one independently of the harmless one', () => {
    // Closing a period freezes a number; settling one charges a card. One flag
    // for both would mean turning on the safe half turns on the other.
    expect(OVERAGE_PERIOD_CLOSE_FLAG).not.toBe(OVERAGE_SETTLEMENT_FLAG);
    expect(overageSettlementWorkerEnabled({ [OVERAGE_PERIOD_CLOSE_FLAG]: '1' })).toBe(false);
    expect(ENV).toContain('LGQ_OVERAGE_PERIOD_CLOSE_ENABLED=0');
    expect(ENV).toContain('LGQ_OVERAGE_SETTLEMENT_ENABLED=0');
  });

  it('404s before doing anything at all while dark', () => {
    for (const [name, route] of [['close', CLOSE_ROUTE], ['settle', SETTLE_ROUTE]] as const) {
      // The flag check must precede authenticatedGET, or a dark worker still
      // reads a secret, writes a heartbeat and builds a service-role client.
      const gate = route.indexOf('WorkerEnabled()');
      const run = route.indexOf('return authenticatedGET(request)');
      expect(gate, name).toBeGreaterThan(-1);
      expect(gate, name).toBeLessThan(run);
      expect(route).toContain('status: 404');
    }
  });
});

describe('what the workers refuse to do', () => {
  it('closes only periods that have actually ended', () => {
    // A period still running has accruals that can still move. Freezing one
    // early bills somebody for a month they are halfway through.
    expect(WORKER).toContain(".lte('period_end', new Date().toISOString())");
  });

  it('never charges a settlement worth nothing', () => {
    expect(WORKER).toContain(".gt('chargeable_cents', 0)");
  });

  it('does not take a settlement another worker still holds', () => {
    expect(WORKER).toContain('lease_expires_at');
  });

  it('does not log amounts, only the workspace', () => {
    // A worker log is not a place to reproduce somebody's billing.
    const logs = [...WORKER.matchAll(/console\.(error|warn|log)\([^)]*\)/g)].map((m) => m[0]);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line, line).not.toMatch(/chargeableCents|total_millicents|amount/);
    }
  });

  it('is declared as a cron, and named in the health registry with a consequence', () => {
    const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] };
    const jobs = read('src', 'lib', 'cron-jobs.ts');
    for (const name of ['overage-period-close', 'overage-settlement']) {
      // A worker with no cron never runs; one missing from the registry runs
      // and nobody is told when it stops.
      expect(vercel.crons.some((c) => c.path === `/api/cron/${name}`), name).toBe(true);
      expect(jobs, name).toContain(`job: '${name}'`);
    }
  });
});
