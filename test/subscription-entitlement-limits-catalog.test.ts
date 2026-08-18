import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { workspaceEntitlementCatalogSnapshot } from '@/lib/billing/entitlement-catalog';

/**
 * The two copies of the plan catalog, compared.
 *
 * `project_stripe_billing_subscription_event_v1_unchecked` does not trust the
 * feature_limits its caller sends. It recomputes them from a hardcoded per-plan
 * table and raises 22000 if the two differ. That check is the reason a caller
 * cannot invent an entitlement -- and it is also a second copy of the catalog,
 * in SQL, that nothing kept in step with TypeScript.
 *
 * It drifted. Commit 7dc8f96a raised four Scale allowances and left the SQL
 * behind, so every Scale activation would have raised
 * 'Stripe Billing projection does not match the canonical catalog' and
 * dead-lettered -- a subscriber charged and never entitled. Nobody hit it only
 * because the subscription flags are off.
 *
 * This test reconstructs what the DATABASE will hold -- the original function
 * body with 20260818200000's patch applied -- and compares every paid plan to
 * `workspaceEntitlementCatalogSnapshot`, field by field. Asserting against the
 * base migration alone would have kept passing while production was wrong;
 * asserting against the patch alone would not notice Solo or Growth drifting
 * next.
 */

const MIGRATIONS = join(process.cwd(), 'migrations');
const BASE_FILE = '20260816060000_stripe_billing_subscription_event_projection.sql';
const PATCH_FILE = '20260818200000_scale_entitlement_limits_catalog_drift.sql';

function read(file: string): string {
  return readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
}

const base = read(BASE_FILE);
const patch = read(PATCH_FILE);

/** The text between a pair of dollar-quote tags in the patch migration. */
function dollarQuoted(tag: string): string {
  const open = `$${tag}$`;
  const start = patch.indexOf(open);
  expect(start, `${open} must exist in ${PATCH_FILE}`).toBeGreaterThanOrEqual(0);
  const end = patch.indexOf(open, start + open.length);
  expect(end, `${open} must be closed`).toBeGreaterThan(start);
  return patch.slice(start + open.length, end);
}

/** The base function body with the migration's replacement applied. */
function patchedSource(): string {
  const needle = dollarQuoted('needle');
  const replacement = dollarQuoted('replacement');
  const occurrences = base.split(needle).length - 1;
  // The migration asserts exactly-once at apply time and refuses otherwise. If
  // this ever stops being true the migration will not apply, so fail here first
  // with a message that says why rather than at deploy time.
  expect(occurrences, 'the patch anchor must occur exactly once in the base migration').toBe(1);
  return base.replace(needle, replacement);
}

/** The `v_expected_feature_limits := case ... end;` block only. */
function featureLimitsBlock(source: string): string {
  const start = source.indexOf('v_expected_feature_limits := case v_plan_code');
  expect(start, 'the feature-limits case block must exist').toBeGreaterThanOrEqual(0);
  const end = source.indexOf('end;', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** The `'key', number` pairs of one plan's jsonb_build_object. */
function sqlLimitsFor(source: string, planCode: string): Record<string, number> {
  const block = featureLimitsBlock(source);
  const marker = `when '${planCode}' then pg_catalog.jsonb_build_object(`;
  const start = block.indexOf(marker);
  expect(start, `${planCode} must have a feature-limits branch`).toBeGreaterThanOrEqual(0);
  const end = block.indexOf(')', start);
  expect(end).toBeGreaterThan(start);
  const body = block.slice(start + marker.length, end);

  const limits: Record<string, number> = {};
  for (const [, key, value] of body.matchAll(/'([a-z_]+)',\s*(\d+)/g)) {
    limits[key] = Number(value);
  }
  return limits;
}

const PAID_PLANS = ['solo', 'growth', 'scale'] as const;

describe('the SQL projector and the TypeScript catalog agree on every paid plan', () => {
  it.each(PAID_PLANS)('%s feature limits match the catalog exactly', (planCode) => {
    const expected = workspaceEntitlementCatalogSnapshot(planCode, 'monthly').featureLimits;
    // toEqual, not toMatchObject: the SQL compares the whole jsonb with
    // `is distinct from`, so an extra or missing key fails just as hard as a
    // wrong number.
    expect(sqlLimitsFor(patchedSource(), planCode)).toEqual({ ...expected });
  });

  it('is the Scale branch that drifted, and the patch is what fixes it', () => {
    // Guards the test itself: if the base ever stops being wrong, this migration
    // has become a no-op that should be deleted rather than left to rot.
    const beforePatch = sqlLimitsFor(base, 'scale');
    expect(beforePatch).toMatchObject({
      office_users: 5,
      crew_users: 10,
      storage_gb: 100,
      forwarding_minutes: 100,
    });

    const afterPatch = sqlLimitsFor(patchedSource(), 'scale');
    expect(afterPatch).toMatchObject({
      office_users: 15,
      crew_users: 50,
      storage_gb: 250,
      forwarding_minutes: 200,
    });
    // Scale's voice allowances were already right and must survive the patch.
    expect(afterPatch.voice_concurrent_calls).toBe(3);
    expect(afterPatch.voice_history_days).toBe(90);
    expect(afterPatch.voice_included_minutes).toBe(100);
  });

  it('leaves Solo and Growth byte-identical', () => {
    for (const planCode of ['solo', 'growth'] as const) {
      expect(sqlLimitsFor(patchedSource(), planCode)).toEqual(sqlLimitsFor(base, planCode));
    }
  });
});

describe('the drift migration itself', () => {
  it('patches the live function source rather than restating its body', () => {
    // Restating a body wholesale silently discards anything another migration
    // changed in it. 20260818120000 rewrote 11 function bodies in this tree.
    expect(patch).toContain('pg_catalog.pg_get_functiondef(');
    expect(patch).toContain('project_stripe_billing_subscription_event_v1_unchecked(uuid,uuid,jsonb)');
    expect(patch).not.toMatch(/create or replace function/i);
  });

  it('normalises CRLF on both sides before matching', () => {
    // Production has held a mix of CRLF and LF function bodies, and exact-text
    // patching has already failed here once because of it.
    const normalisations = patch.match(/chr\(13\) \|\| pg_catalog\.chr\(10\)/g) ?? [];
    expect(normalisations.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses a drifted body instead of rewriting it', () => {
    expect(patch).toContain('source contract drifted');
    expect(patch).toContain("errcode = '55000'");
  });

  it('is idempotent on the corrected value, not on the anchor it consumes', () => {
    // This replacement does not re-include its own anchor, so a second apply
    // would find no needle and the exactly-once assertion would raise. The skip
    // has to key on the new text.
    expect(patch).toContain("strpos(v_before, $$'office_users', 15, 'crew_users', 50$$) > 0");
  });

  it('proves afterwards that the other plans and the equality guard survived', () => {
    expect(patch).toContain('Solo entitlement limits were lost');
    expect(patch).toContain('Growth entitlement limits were lost');
    expect(patch).toContain('the canonical-catalog equality check was lost');
  });

  it('is one transactional migration', () => {
    expect(patch).toContain('begin;');
    expect(patch.trimEnd().endsWith('commit;')).toBe(true);
    expect(PATCH_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });
});
