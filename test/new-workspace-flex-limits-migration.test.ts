import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import { workspaceEntitlementCatalogSnapshot } from '@/lib/billing/entitlement-catalog';

/**
 * The Flex map 20260819060000 writes into initialize_workspace_pricing must BE
 * the catalog.
 *
 * That migration decides what every future workspace is provisioned with. Its map
 * is hand-transcribed into SQL because a migration cannot read the TypeScript
 * catalog, which makes a transcription slip the single most dangerous thing about
 * the file -- and the one no amount of SQL review would reliably catch, because
 * the SQL is internally consistent either way. These assertions compare the
 * embedded JSON against what the catalog itself produces.
 */

const FILE = '20260819060000_new_workspace_gets_current_flex_limits.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');

/**
 * The same file with comment-only lines removed.
 *
 * Counting assertions must run on this, not on `sql`. The header deliberately
 * quotes the REPLACE from 20260818120000 to explain what went wrong, so a naive
 * count of `pg_get_functiondef` finds three where the code has two -- and a
 * migration would fail review for explaining itself well.
 */
const code = sql.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n');

/** Both halves of the source patch, as JSON. */
function patchPair(): { needle: Record<string, number>; replacement: Record<string, number> } {
  const needle = sql.match(/v_old text := \$needle\$'(\{[^}]*\})'::jsonb,\$needle\$/);
  const replacement = sql.match(/v_new text := \$replacement\$'(\{[^}]*\})'::jsonb,\$replacement\$/);
  if (!needle || !replacement) throw new Error('could not find the source-patch pair');
  return {
    needle: JSON.parse(needle[1]) as Record<string, number>,
    replacement: JSON.parse(replacement[1]) as Record<string, number>,
  };
}

const FLEX = workspaceEntitlementCatalogSnapshot('flex', 'none').featureLimits;

describe('the map a new workspace is provisioned with', () => {
  it('is exactly what the catalog produces for Flex', () => {
    expect(patchPair().replacement).toEqual({ ...FLEX });
  });

  it('replaces exactly the eight-key map, the current one minus the two added keys', () => {
    // Expressed this way round so no copy of the OLD catalog is needed. If the
    // needle were anything else the source patch would silently match nothing,
    // and the exactly-once assertion in the migration would refuse it -- but this
    // says so at review time rather than at apply time.
    const { forwarding_minutes: _f, voice_included_minutes: _v, ...withoutAdded } = FLEX;
    expect(patchPair().needle).toEqual(withoutAdded);
    expect(Object.keys(patchPair().needle)).toHaveLength(8);
    expect(Object.keys(patchPair().replacement)).toHaveLength(10);
  });

  it('repairs already-provisioned rows to the same two keys at the same values', () => {
    // The repair supplies defaults; they must be the catalog's, not zero by habit.
    expect(sql).toContain(
      `'{"forwarding_minutes":${FLEX.forwarding_minutes},`
      + `"voice_included_minutes":${FLEX.voice_included_minutes}}'::jsonb || e.feature_limits`,
    );
  });
});

describe('the guards that decide whether it may run at all', () => {
  it('targets the one function that provisions a workspace', () => {
    expect(code).toContain("'public.initialize_workspace_pricing()'::pg_catalog.regprocedure");
    // Nothing else may be rewritten by this file: one read to patch, one to verify.
    expect(code.match(/pg_get_functiondef/g) ?? []).toHaveLength(2);
    expect(code.match(/execute v_after/g) ?? []).toHaveLength(1);
  });

  it('refuses to run before the catalog version was moved', () => {
    // Eight limits is CORRECT under 2026-08-15-preview. Moving the map without the
    // label would manufacture the mirror-image defect, so this must stop.
    expect(sql).toContain('apply 20260818120000 first');
  });

  it('adds the missing keys rather than overwriting the stored map', () => {
    // Left-hand concatenation: anything already stored wins. Reversing these
    // operands would silently reset a deliberately raised limit.
    expect(sql).toMatch(/'\{"forwarding_minutes":\d+,"voice_included_minutes":\d+\}'::jsonb \|\| e\.feature_limits/);
    expect(sql).not.toMatch(/e\.feature_limits \|\| '\{"forwarding_minutes"/);
  });

  it('leaves nothing claiming the current catalog without its limits', () => {
    expect(sql).toContain("e.feature_limits -> 'forwarding_minutes' is null");
    expect(sql).toContain("e.feature_limits -> 'voice_included_minutes' is null");
    expect(sql).toContain('without its limits');
  });

  it('targets the version the app actually runs', () => {
    expect(PRICING_CATALOG_VERSION).toBe('2026-08-18-preview');
    expect(sql).toContain("e.catalog_version = '2026-08-18-preview'");
  });
});
