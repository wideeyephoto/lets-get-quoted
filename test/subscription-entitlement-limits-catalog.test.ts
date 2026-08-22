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
 * body with every patch migration applied in order -- and compares every paid plan to
 * `workspaceEntitlementCatalogSnapshot`, field by field. Asserting against the
 * base migration alone would have kept passing while production was wrong;
 * asserting against the patch alone would not notice Solo or Growth drifting
 * next.
 */

const MIGRATIONS = join(process.cwd(), 'migrations');
const BASE_FILE = '20260816060000_stripe_billing_subscription_event_projection.sql';
/**
 * Every migration that patches the projector's feature-limit table, oldest
 * first. Applying them in this order is what the database itself did, so the
 * reconstruction below is faithful only while this list is complete: a new patch
 * migration left out of it leaves this test asserting a body production no
 * longer has, and passing.
 */
const PATCH_FILES = [
  '20260818200000_scale_entitlement_limits_catalog_drift.sql',
  '20260820150000_zero_dedicated_business_number_allowance.sql',
  '20260821010000_solo_grants_a_second_office_seat.sql',
] as const;

function read(file: string): string {
  return readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
}

const base = read(BASE_FILE);

/** The Scale-drift migration, which the block at the foot of this file inspects directly. */
const PATCH_FILE = PATCH_FILES[0];
const patch = read(PATCH_FILE);

/** Every dollar-quoted body carrying the given tag, in file order. */
function dollarQuotedAll(source: string, tag: string, file: string): string[] {
  const open = `$${tag}$`;
  const found: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = source.indexOf(open, cursor);
    if (start < 0) break;
    const end = source.indexOf(open, start + open.length);
    expect(end, `${open} must be closed in ${file}`).toBeGreaterThan(start);
    found.push(source.slice(start + open.length, end));
    cursor = end + open.length;
  }
  return found;
}

/** The base function body with every patch migration applied, in order. */
function patchedSource(): string {
  let source = base;
  for (const file of PATCH_FILES) {
    const patch = read(file);
    const needles = dollarQuotedAll(patch, 'needle', file);
    const replacements = dollarQuotedAll(patch, 'replacement', file);
    expect(needles.length, `${file} must pair every needle with a replacement`).toBe(replacements.length);
    expect(needles.length, `${file} must carry at least one patch`).toBeGreaterThan(0);
    needles.forEach((needle, index) => {
      const occurrences = source.split(needle).length - 1;
      // Each migration asserts exactly-once at apply time and refuses otherwise.
      // If that stops being true the migration will not apply, so fail here with
      // a message that says why rather than at deploy time.
      expect(occurrences, `anchor ${index} of ${file} must occur exactly once`).toBe(1);
      source = source.replace(needle, replacements[index]);
    });
  }
  return source;
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

  it('moves Solo and Growth only where a migration says so', () => {
    // 20260818200000 moved only Scale. 20260820150000 then took the dedicated
    // business number away from all three, because nothing can provision one.
    // 20260821010000 then gave Solo a second office seat, because the owner
    // occupies one and a one-seat plan could never invite anybody.
    //
    // Named field by field, and restored before the byte comparison, so a
    // fourth patch touching anything else still fails here.
    const PERMITTED: Readonly<Record<string, Record<string, number>>> = {
      solo: { dedicated_business_numbers: 1, office_users: 1 },
      growth: { dedicated_business_numbers: 1 },
    };

    for (const planCode of ['solo', 'growth'] as const) {
      const after = sqlLimitsFor(patchedSource(), planCode);
      const before = sqlLimitsFor(base, planCode);

      expect(after.dedicated_business_numbers).toBe(0);
      expect(before.dedicated_business_numbers).toBe(1);
      // Each named field must genuinely have moved, or the entry is silencing
      // a drift rather than recording one.
      for (const [field, original] of Object.entries(PERMITTED[planCode])) {
        expect(before[field], `${planCode}.${field} in the base migration`).toBe(original);
        expect(after[field], `${planCode}.${field} after patching`).not.toBe(original);
      }

      expect({ ...after, ...PERMITTED[planCode] }).toEqual(before);
    }

    expect(sqlLimitsFor(patchedSource(), 'solo').office_users).toBe(2);
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
    //
    // The probe MUST be tagged. Written as a bare $$ it closed the enclosing
    // `do $$` body at the first delimiter and the file would not parse at all --
    // PostgreSQL 17 reported it as a syntax error at a comma 4,149 characters
    // in, nowhere near the mistake. See test/sql-grammar-construct-guards.
    // The nested-delimiter sweep itself lives in
    // test/sql-grammar-construct-guards.test.ts, which strips comments first --
    // asserting it here trips on the comment above explaining the bug.
    expect(patch).toContain("strpos(v_before, $probe$'office_users', 15, 'crew_users', 50$probe$) > 0");
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
