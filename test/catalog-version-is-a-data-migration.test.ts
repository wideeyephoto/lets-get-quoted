import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';

/**
 * THE BUMP THAT TOOK A WORKSPACE'S ABILITY TO COLLECT MONEY.
 *
 * `catalog_version` does two jobs that need opposite handling when the constant
 * moves:
 *
 *   EVIDENCE      -- the version an agreement was signed under. Immutable, and
 *                    it must stay readable at its own version, so the READERS
 *                    widen. Migration 20260818120000 widened three CHECKs.
 *   CURRENTNESS   -- "this row carries catalog X's limits and fee right now".
 *                    Live guards compare it to a LITERAL, so the ROWS must move.
 *
 * The 2026-08-18 bump did the first and not the second. One
 * `workspace_entitlements` row stayed on `2026-08-15-preview`, and three live
 * functions refuse on exactly that column -- so the only paid workspace could
 * not take a card payment from its own customers.
 *
 * WHAT THIS FILE CAN AND CANNOT DO. It cannot reach the database, so it cannot
 * prove no row is stale; only `npm run audit:applied` and the migration's own
 * postconditions do that. What it CAN do is make the next bump impossible to
 * perform silently, which is the actual failure mode: a human edited one
 * constant and did not know there was a second half. So this guards the
 * WARNING at the point of edit, and the migration that carries the fix.
 *
 * That makes it a documentation guard, and documentation guards are exactly the
 * kind this repo has been burned by -- a copy guard outlives the fact it
 * asserts. It is written to fail on the CODE FACTS it can actually check
 * (the constant's shape, the migration's existence, the clauses that must be
 * present) rather than on prose wording, so it cannot go stale while staying
 * green.
 */

const CATALOG_SRC = readFileSync(
  join(process.cwd(), 'src', 'lib', 'billing', 'catalog.ts'), 'utf8',
);
const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const migrationNames = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

describe('the catalog version warns that a bump is a data migration', () => {
  it('names both jobs at the constant, where the edit happens', () => {
    // Not a wording check -- these two words ARE the distinction, and losing
    // either means the next reader sees one job and does half the work.
    const header = CATALOG_SRC.slice(0, CATALOG_SRC.indexOf('export const PRICING_CATALOG_VERSION'));
    expect(header).toMatch(/EVIDENCE/);
    expect(header).toMatch(/CURRENTNESS/);
  });

  it('names the currentness columns, because those are the ones that must move', () => {
    const header = CATALOG_SRC.slice(0, CATALOG_SRC.indexOf('export const PRICING_CATALOG_VERSION'));
    expect(header).toContain('workspace_entitlements.catalog_version');
    expect(header).toContain('payments.fee_catalog_version');
  });

  it('names at least one guard that refuses on a stale currentness row', () => {
    // If somebody deletes these names the warning becomes unfalsifiable advice.
    const header = CATALOG_SRC.slice(0, CATALOG_SRC.indexOf('export const PRICING_CATALOG_VERSION'));
    expect(header).toMatch(/require_direct_checkout_entitlement_snapshot|prepare_one_off_direct_invoice_payment|claim_one_off_direct_checkout_operation/);
  });

  it('says a bump is not needed for an allowance change', () => {
    // Two migrations changed included capacity under this same version on
    // purpose. Without this, the next allowance change bumps the version
    // needlessly and re-runs the whole hazard.
    const header = CATALOG_SRC.slice(0, CATALOG_SRC.indexOf('export const PRICING_CATALOG_VERSION'));
    expect(header).toMatch(/price book/i);
  });
});

describe('the currentness fix is present and did the whole job', () => {
  const fix = migrationNames.find((f) => f.includes('entitlement_catalog_currentness'));

  it('exists as a migration', () => {
    expect(fix).toBeDefined();
  });

  const sql = fix ? readFileSync(join(MIGRATIONS_DIR, fix), 'utf8') : '';

  it('moves the limits, not just the label', () => {
    // A relabel alone would make the row claim a catalog whose numbers it does
    // not carry -- the exact substitution 20260819040000 warns against. The
    // stale row really did carry office_users 1 and dedicated_business_numbers 1.
    expect(sql).toContain('feature_limits');
    expect(sql).toMatch(/'office_users',\s*2/);
    expect(sql).toMatch(/'dedicated_business_numbers',\s*0/);
  });

  it('refuses rather than reporting success if a paid row is still behind', () => {
    expect(sql).toMatch(/paid entitlement rows still behind the current catalog/);
  });

  it('stops the projector stamping an agreement version onto a currentness column', () => {
    // This is the half that prevents recurrence. Today it changes nothing --
    // the projector's own gate means the two strings are already equal -- but
    // the moment that gate widens to let old-catalog renewals project, this
    // UPDATE would re-create the outage.
    expect(sql).toContain(`catalog_version = ''2026-08-18-preview''`);
  });

  it('asserts the evidence write survived, by arity rather than indentation', () => {
    // The first draft pinned a literal line with fourteen leading spaces; the
    // live body has thirteen, so the postcondition raised and would have rolled
    // back a correct patch. Counting occurrences is indentation-proof.
    expect(sql).toMatch(/expected exactly one remaining agreement-version write/);
  });

  it('filters EVERY pg_proc scan on prokind, or it aborts on an aggregate', () => {
    // pg_get_functiondef raises 42809 ('"array_agg" is an aggregate function')
    // and this database has one in reach of an unfiltered pg_proc scan. A
    // postcondition that does that rolls back the whole migration.
    //
    // Counted per scan, not "does the word appear". The first version of this
    // test asserted only that `prokind = 'f'` was present SOMEWHERE, and the
    // migration has two scans -- so deleting one filter left the other and the
    // test stayed green. A guard that survives the mutation it exists to catch
    // is worth nothing.
    const scans = sql.match(/pg_catalog\.pg_proc\s+p\b/g) ?? [];
    const filters = sql.match(/p\.prokind\s*=\s*'f'/g) ?? [];
    expect(scans.length).toBeGreaterThan(0);
    expect(filters).toHaveLength(scans.length);
  });
});

describe('the constant itself', () => {
  it('is a dated preview label, so a bump is visible in review', () => {
    expect(PRICING_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-preview$/);
  });
});
