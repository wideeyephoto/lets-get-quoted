import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/stripe', () => ({ getStripeClient: () => { throw new Error('not used'); } }));
vi.mock('@/lib/auth', () => ({
  createAdminClient: () => { throw new Error('not used'); },
}));

import {
  TOP_UP_PURCHASE_ERROR_CODES,
  buildTopUpPurchaseCheckoutIdempotencyKey,
} from '@/lib/billing/top-up-purchase-checkout';

/**
 * The seam mocked unit tests cannot see.
 *
 * PostgREST resolves a function by the EXACT SET of argument names it is given.
 * One renamed, missing or extra `p_` key is a PGRST202 "function not found" at
 * runtime -- and nothing else in this repository would catch it. TypeScript
 * types the object literal, not the database. Every orchestration test injects a
 * fake store, so the real argument names are never exercised. The migration test
 * reads only the SQL. This is the one place the two sides are compared.
 *
 * Three CHECK constraints are executed here as well, in JavaScript, against the
 * values the code actually produces. A CHECK that rejects is not a soft failure:
 * the RPC raises, and the claim never happens.
 */

const MIGRATION_FILE = '20260818190000_top_up_purchase_operations.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');
const source = readFileSync(
  join(process.cwd(), 'src', 'lib', 'billing', 'top-up-purchase-checkout.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

/** The `p_` parameter names a migration function declares, in order. */
function declaredParameters(functionName: string): string[] {
  const marker = `create or replace function public.${functionName}(`;
  const start = sql.toLowerCase().indexOf(marker);
  expect(start, `${functionName} must exist in ${MIGRATION_FILE}`).toBeGreaterThanOrEqual(0);
  const open = start + marker.length;
  const close = sql.indexOf(')', open);
  expect(close).toBeGreaterThan(open);
  return sql.slice(open, close)
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((name) => name.startsWith('p_'));
}

/** The `p_` keys the store sends to one `admin.rpc(...)` call, in order. */
function sentParameters(functionName: string): string[] {
  const marker = `this.admin.rpc('${functionName}', {`;
  const start = source.indexOf(marker);
  expect(start, `${functionName} must be called from the store`).toBeGreaterThanOrEqual(0);
  const open = start + marker.length;
  const close = source.indexOf('\n    });', open);
  expect(close).toBeGreaterThan(open);
  return [...source.slice(open, close).matchAll(/^\s{6}(p_[a-z0-9_]+):/gm)].map((m) => m[1]);
}

/** A POSIX regex out of a CHECK, usable in JavaScript. */
function checkPattern(column: string): RegExp {
  const match = new RegExp(`${column} ~ '(\\^[^']+\\$)'`).exec(sql);
  expect(match, `${column} must carry a regex CHECK`).not.toBeNull();
  return new RegExp(match![1]);
}

const RPC_CONTRACT = [
  'claim_stripe_top_up_purchase',
  'begin_stripe_top_up_purchase_submission',
  'complete_stripe_top_up_purchase',
  'mark_stripe_top_up_purchase_indeterminate',
  'fail_stripe_top_up_purchase',
] as const;

describe('the store and the migration agree on every RPC', () => {
  it.each(RPC_CONTRACT)('sends %s exactly the parameters it declares', (functionName) => {
    // Order is asserted too, though PostgREST does not care: a diff that reads
    // in declaration order is the one a human can check against the migration.
    expect(sentParameters(functionName)).toEqual(declaredParameters(functionName));
  });

  it('calls no top-up RPC the migration does not declare', () => {
    const called = [...source.matchAll(/this\.admin\.rpc\('([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(called).toEqual([...RPC_CONTRACT]);
  });

  it('grants every one of them to service_role and nobody else', () => {
    // The table has RLS on with no policy, so these functions are the only way
    // in. A missing grant is a runtime 403 the mocked tests cannot see.
    for (const functionName of RPC_CONTRACT) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${functionName}\\([^)]*\\)\\s*from public, anon, authenticated, service_role;`),
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${functionName}\\([^)]*\\)\\s*to service_role;`),
      );
    }
  });
});

describe('the CHECK constraints, run against what the code produces', () => {
  it('accepts the idempotency key the code builds, and rejects the subscription one', () => {
    const pattern = checkPattern('stripe_idempotency_key');
    const key = buildTopUpPurchaseCheckoutIdempotencyKey({
      workspaceId: '10000000-0000-4000-8000-000000000001',
      operationId: 'top-up-purchase:40000000-0000-4000-8000-000000000004',
      livemode: false,
    });
    expect(pattern.test(key)).toBe(true);
    expect(key.length).toBeLessThanOrEqual(255);
    // The failure this constraint is here to catch: the subscription ledger's
    // purpose segment copied across. Every claim would fail before Stripe.
    expect(pattern.test(key.replace('top_up_purchase.create', 'subscription_checkout.create')))
      .toBe(false);
    expect(pattern.test(key.toUpperCase())).toBe(false);
  });

  it('accepts every error code in the taxonomy', () => {
    const pattern = checkPattern('last_error');
    for (const code of Object.values(TOP_UP_PURCHASE_ERROR_CODES)) {
      expect(pattern.test(code), `${code} must satisfy the last_error CHECK`).toBe(true);
    }
    // What the subscription ledger writes into its own last_error column.
    expect(pattern.test('Error: socket hang up')).toBe(false);
  });

  it('accepts the request fingerprint shape the code sends', () => {
    const pattern = checkPattern('request_fingerprint');
    expect(pattern.test('a'.repeat(64))).toBe(true);
    expect(pattern.test('A'.repeat(64))).toBe(false);
    expect(pattern.test('a'.repeat(63))).toBe(false);
    expect(source).toContain("sha256Fingerprint");
  });

  it('accepts a test Session ID in test mode and refuses a live one', () => {
    // Both branches live in one CHECK, so they are read out of the SQL together
    // rather than being restated here.
    expect(sql).toContain("(livemode and provider_object_id ~ '^cs_live_[A-Za-z0-9_]+$')");
    expect(sql).toContain("(not livemode and provider_object_id ~ '^cs_test_[A-Za-z0-9_]+$')");
    expect(/^cs_test_[A-Za-z0-9_]+$/.test('cs_test_topUp123')).toBe(true);
    expect(/^cs_test_[A-Za-z0-9_]+$/.test('cs_live_topUp123')).toBe(false);
  });
});

describe('the states the orchestrator branches on are the states that exist', () => {
  it('handles every state the ledger can hold, and invents none', () => {
    const match = /check \(state in \(([^)]+)\)\)/.exec(sql);
    expect(match).not.toBeNull();
    const declared = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(declared).toEqual([
      'checkout_created', 'claimed', 'failed', 'indeterminate', 'submitted',
    ]);
    // OPERATION_STATES is what the store will accept off the wire; anything the
    // ledger can hold but the store rejects is a claim that throws in production.
    const accepted = /const OPERATION_STATES = new Set<TopUpPurchaseOperationState>\(\[([\s\S]*?)\]\)/
      .exec(source);
    expect(accepted).not.toBeNull();
    expect([...accepted![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual(declared);
  });

  it('only ever asks for a transition the append-only trigger permits', () => {
    // claimed -> submitted -> checkout_created is the create path; the two
    // releases the orchestrator can request are claimed/submitted -> failed and
    // submitted -> indeterminate.
    for (const transition of [
      "(old.state = 'claimed' and new.state in ('submitted', 'failed'))",
      "(old.state = 'submitted' and new.state in ('checkout_created', 'failed', 'indeterminate'))",
      "(old.state = 'indeterminate' and new.state in ('checkout_created', 'failed'))",
    ]) {
      expect(sql).toContain(transition);
    }
    // mark_..._indeterminate requires 'submitted' exactly, which is why the
    // orchestrator never calls it before the begin RPC has committed.
    expect(sql).toContain("or v_row.state <> 'submitted' or v_row.claim_token is distinct from p_claim_token");
    // fail_... accepts both pre-Stripe states, which is what makes it usable for
    // a claim that never reached the submitted boundary.
    expect(sql).toContain("or v_row.state not in ('claimed', 'submitted')");
  });
});
