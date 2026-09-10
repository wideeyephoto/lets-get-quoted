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
import { CRON_JOBS, cronSummaryHasFailures } from '@/lib/cron-jobs';
import { extractLogicalFailureReason } from '@/lib/cron-runs';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const MIGRATION = read('migrations', '20260819260000_overage_settlement.sql');
const REAPER_MIGRATION = read('migrations', '20260909210000_overage_settlement_reaper_and_starvation.sql');
const ALERT_MIGRATION = read('migrations', '20260909210100_operational_alert_overage_settlements.sql');
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
    // The candidate scan delegates to list_unclosed_overage_periods, which
    // filters on a.period_end <= pg_catalog.now().
    expect(WORKER).toContain("admin.rpc('list_unclosed_overage_periods'");
    expect(REAPER_MIGRATION).toContain('a.period_end <= pg_catalog.now()');
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

describe('settlement reaper and idempotency preservation (Bugs 1a-1d)', () => {
  it('reclaims an expired submitted settlement preserving the exact same idempotency key', () => {
    // Bug 1a: reap_overage_settlement_leases moves expired-lease 'submitted' rows
    // to 'indeterminate' with last_error = 'lease_expired'.
    expect(REAPER_MIGRATION).toContain("state = 'indeterminate'");
    expect(REAPER_MIGRATION).toContain("last_error = 'lease_expired'");
    expect(REAPER_MIGRATION).toContain('lease_expires_at <= pg_catalog.now()');

    // The reaper SQL must not touch or nullify stripe_idempotency_key or claim_token.
    expect(REAPER_MIGRATION).not.toContain('stripe_idempotency_key = null');
    expect(REAPER_MIGRATION).not.toContain('claim_token = null');

    // Claiming an indeterminate row reuses the existing idempotency key.
    expect(MIGRATION).toContain("if v_row.state not in ('closed', 'indeterminate') then");
    expect(MIGRATION).toContain('stripe_idempotency_key = p_stripe_idempotency_key');

    // Even if recomputed by the worker on retry, the idempotency key is strictly
    // identical because it derives solely from settlementId and chargeableCents.
    const settlementId = '3f7c1a52-0a5e-4c31-9b2f-0c9d6c1f2b34';
    const chargeableCents = 2_500;
    const initialKey = overageSettlementIdempotencyKey({ settlementId, chargeableCents });
    const retryKey = overageSettlementIdempotencyKey({ settlementId, chargeableCents });
    expect(initialKey).toBe(retryKey);

    // Bug 1b: Partial index on (state, lease_expires_at) where state = 'submitted'.
    expect(REAPER_MIGRATION).toContain('create index if not exists workspace_overage_settlements_reaper_idx');
    expect(REAPER_MIGRATION).toContain('on public.workspace_overage_settlements (state, lease_expires_at)');
    expect(REAPER_MIGRATION).toContain("where state = 'submitted'");

    // Bug 1c: runOverageSettlementBatch calls the reaper at the head and surfaces reaped count.
    expect(WORKER).toContain("admin.rpc('reap_overage_settlement_leases'");
    expect(WORKER).toContain('reaped:');

    // Bug 1d: corrected comment at lines 298-300 explicitly naming reap_overage_settlement_leases
    expect(WORKER).toContain('recovered by reap_overage_settlement_leases');
    expect(WORKER).not.toContain('re-claimed as indeterminate once its lease expires');
  });
});

describe('period-close starvation prevention (Bugs 2a-2c)', () => {
  it('prevents starvation by anti-joining accruals against settlements in the RPC', () => {
    // Bug 2a: list_unclosed_overage_periods(p_limit) anti-joins accruals against settlements
    // on (account_id, period_start) inside Postgres, so having >100 historical closed accruals
    // does not starve newly ended periods from ever being selected.
    expect(REAPER_MIGRATION).toContain('create or replace function public.list_unclosed_overage_periods');
    expect(REAPER_MIGRATION).toContain('from public.workspace_overage_accruals a');
    expect(REAPER_MIGRATION).toContain('not exists (');
    expect(REAPER_MIGRATION).toContain('from public.workspace_overage_settlements s');
    expect(REAPER_MIGRATION).toContain('s.account_id = a.account_id');
    expect(REAPER_MIGRATION).toContain('s.period_start = a.period_start');

    // Bug 2b: index on workspace_overage_accruals (period_end) to support candidate scan
    expect(REAPER_MIGRATION).toContain('create index if not exists workspace_overage_accruals_period_end_idx');
    expect(REAPER_MIGRATION).toContain('on public.workspace_overage_accruals (period_end)');

    // Bug 2c: runOveragePeriodCloseBatch calls list_unclosed_overage_periods with p_limit
    expect(WORKER).toContain("admin.rpc('list_unclosed_overage_periods'");
    expect(WORKER).toContain('p_limit: limit');
    expect(WORKER).not.toContain("from('workspace_overage_accruals').select");
    expect(WORKER).toContain('anti-joins accruals against existing settlements');
    expect(WORKER).toContain('(account_id, period_start)');
  });
});

describe('complete_overage_settlement RPC error handling (Bug 3)', () => {
  it('stops counting unconfirmed completions as charged and increments completion_unconfirmed', () => {
    // When complete_overage_settlement fails, the invoice item was created in Stripe
    // but the DB state write failed. This must NOT increment charged.
    expect(WORKER).toContain("const { error: completeError } = await admin.rpc('complete_overage_settlement'");
    expect(WORKER).toContain('if (completeError) {');
    expect(WORKER).toContain('completionUnconfirmed += 1;');
    expect(WORKER).toContain('} else {');
    expect(WORKER).toContain('charged += 1;');
    expect(WORKER).toContain('completion_unconfirmed: completionUnconfirmed');
  });
});

describe('operator alerting for settlement and period-close anomalies', () => {
  it('flags settlement runs with completion_unconfirmed or no_customer as logical failures', () => {
    const cleanSettlementSummary = {
      reaped: 0,
      claimable: 1,
      charged: 1,
      completion_unconfirmed: 0,
      no_customer: 0,
      indeterminate: 0,
      terminal_failures: 0,
      worker_errors: 0,
    };
    expect(cronSummaryHasFailures(cleanSettlementSummary)).toBe(false);

    const unconfirmedSummary = { ...cleanSettlementSummary, charged: 0, completion_unconfirmed: 1 };
    expect(cronSummaryHasFailures(unconfirmedSummary)).toBe(true);
    expect(extractLogicalFailureReason('overage-settlement', unconfirmedSummary)).toContain('completion_unconfirmed=1');

    const noCustomerSummary = { ...cleanSettlementSummary, charged: 0, no_customer: 1 };
    expect(cronSummaryHasFailures(noCustomerSummary)).toBe(true);
    expect(extractLogicalFailureReason('overage-settlement', noCustomerSummary)).toContain('no_customer=1');

    const noStripeCustomerSummary = { no_stripe_customer: 1 };
    expect(cronSummaryHasFailures(noStripeCustomerSummary)).toBe(true);
    expect(extractLogicalFailureReason('overage-settlement', noStripeCustomerSummary)).toContain('no_stripe_customer=1');
  });

  it('flags period-close starvation (candidates > 0 and closed === 0) as logical failure', () => {
    const starvedSummary = {
      candidates: 5,
      closed: 0,
      already_closed: 0,
      nothing_owed: 0,
      failures: 0,
    };
    expect(cronSummaryHasFailures(starvedSummary)).toBe(true);
    expect(extractLogicalFailureReason('overage-period-close', starvedSummary)).toBe(
      'overage-period-close reported 0 closed periods while 5 candidate(s) exist',
    );

    const normalSummary = {
      candidates: 5,
      closed: 5,
      already_closed: 0,
      nothing_owed: 0,
      failures: 0,
    };
    expect(cronSummaryHasFailures(normalSummary)).toBe(false);
  });

  it('marks both overage crons with importance money in cron registry', () => {
    const closeJob = CRON_JOBS.find((j) => j.job === 'overage-period-close');
    const settleJob = CRON_JOBS.find((j) => j.job === 'overage-settlement');
    expect(closeJob?.importance).toBe('money');
    expect(settleJob?.importance).toBe('money');
  });

  it('patches scan_operational_failures to detect terminal failed overage settlements', () => {
    expect(ALERT_MIGRATION).toContain('from public.workspace_overage_settlements s');
    expect(ALERT_MIGRATION).toContain("where s.state = 'failed'");
    expect(ALERT_MIGRATION).toContain("'settlement:'||s.id as source_key");
    expect(ALERT_MIGRATION).toContain("'billing' as category");
    expect(ALERT_MIGRATION).toContain('Overage settlement');
  });
});
