import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_PLAN_IDS, PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import { workspaceEntitlementCatalogSnapshot } from '@/lib/billing/entitlement-catalog';

/**
 * The four feature-limit maps embedded in 20260819040000 must BE the catalog.
 *
 * That migration rewrites live entitlement rows. Its maps are hand-transcribed
 * into SQL because the catalog lives in TypeScript and a migration cannot read
 * it — which makes a transcription slip the single most dangerous thing about
 * the file, and the one no amount of SQL review would reliably catch. These
 * assertions compare the embedded JSON against what the catalog itself produces,
 * so a wrong number fails here rather than granting or removing capacity on a
 * real workspace.
 */

const FILE = '20260819040000_workspace_entitlement_catalog_2026_08_18.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', FILE), 'utf8').replace(/\r\n/g, '\n');

/** The jsonb literal the migration carries for one plan. */
function embeddedLimits(planCode: string): Record<string, number> {
  const match = sql.match(new RegExp(`\\('${planCode}', \\$j\\$(\\{[^}]*\\})\\$j\\$::jsonb\\)`));
  if (!match) throw new Error(`no embedded map for ${planCode}`);
  return JSON.parse(match[1]) as Record<string, number>;
}

describe('the embedded feature limits are the catalog', () => {
  for (const planCode of BILLING_PLAN_IDS) {
    it(`${planCode} matches workspaceEntitlementCatalogSnapshot exactly`, () => {
      const expected = workspaceEntitlementCatalogSnapshot(
        planCode,
        planCode === 'flex' ? 'none' : 'monthly',
      ).featureLimits;
      expect(embeddedLimits(planCode)).toEqual({ ...expected });
    });
  }

  it('carries a map for every plan the catalog defines', () => {
    // A plan added to the catalog and not here would be silently left pinned.
    for (const planCode of BILLING_PLAN_IDS) {
      expect(() => embeddedLimits(planCode)).not.toThrow();
    }
  });

  it('targets the version the app actually runs', () => {
    expect(PRICING_CATALOG_VERSION).toBe('2026-08-18-preview');
    expect(sql).toContain("catalog_version = '2026-08-18-preview'");
    expect(sql).toContain("e.catalog_version = '2026-08-15-preview'");
  });
});

describe('the guard that decides which rows move', () => {
  it('matches the stored map against the new map minus exactly the two added keys', () => {
    // Expressed this way round so no copy of the OLD catalog is needed, and so
    // the key count and all eight values are pinned by one comparison.
    expect(sql).toContain(
      "e.feature_limits = (v_plan.limits - 'forwarding_minutes' - 'voice_included_minutes')",
    );
  });

  it('adds exactly two keys and no others', () => {
    // If a future catalog adds a third key, the guard above silently stops
    // matching and every row is left pinned — which is safe, but this is where
    // it should be noticed.
    const flexNow = workspaceEntitlementCatalogSnapshot('flex', 'none').featureLimits;
    const added = ['forwarding_minutes', 'voice_included_minutes'];
    const oldKeys = Object.keys(flexNow).filter((k) => !added.includes(k));
    expect(oldKeys).toHaveLength(8);
    expect(Object.keys(flexNow)).toHaveLength(10);
  });

  it('never touches a row on an unrecognised catalog version', () => {
    // Only 2026-08-15-preview is migrated. Anything else is a decision, not a
    // relabel — Scale in particular changed allowances between the two catalogs
    // and must fail the match rather than be quietly rewritten.
    const updates = sql.match(/^\s*update public\.workspace_entitlements/gm) ?? [];
    expect(updates).toHaveLength(1);
  });

  it('refuses to leave a row claiming the new catalog without its new limits', () => {
    expect(sql).toContain("e.feature_limits -> 'forwarding_minutes' is null");
    expect(sql).toContain("e.feature_limits -> 'voice_included_minutes' is null");
    expect(sql).toContain('without its limits');
  });
});
