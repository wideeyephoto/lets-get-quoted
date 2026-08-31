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

/**
 * What the catalog has been allowed to change since this migration was written,
 * and nothing else.
 *
 * 20260819040000 is applied. Its maps are a record of what the catalog said on
 * 2026-08-19, and editing an applied migration to chase the catalog would break
 * its own guard -- it matches rows on `feature_limits = v_plan.limits` minus two
 * keys, so a rewritten map would match no row and the file would become a silent
 * no-op on any fresh or replayed database.
 *
 * So the comparison is pinned to the historical value, with each accepted delta
 * named here. Every other field stays byte-compared, which is the point of the
 * test: a transcription slip still fails.
 */
const HISTORICAL_DELTA: Readonly<Record<string, Record<string, number>>> = {
  // 20260820150000 took the dedicated business number away from the paid plans,
  // because nothing in the product can provision a phone number. Flex never had
  // one, so it carries no delta.
  //
  // 20260821010000 then gave Solo a second office seat: the owner occupies one,
  // so a one-seat plan could never invite anybody. Flex still grants one and is
  // meant to.
  solo: { dedicated_business_numbers: 1, office_users: 1 },
  growth: { dedicated_business_numbers: 1 },
  scale: { dedicated_business_numbers: 1 },
};

describe('the embedded feature limits are the catalog', () => {
  for (const planCode of BILLING_PLAN_IDS) {
    it(`${planCode} matches workspaceEntitlementCatalogSnapshot exactly`, () => {
      const expected = workspaceEntitlementCatalogSnapshot(
        planCode,
        planCode === 'flex' ? 'none' : 'monthly',
      ).featureLimits;
      expect(embeddedLimits(planCode)).toEqual({ ...expected, ...(HISTORICAL_DELTA[planCode] ?? {}) });
    });
  }

  it('names a delta only for fields that genuinely moved', () => {
    // Guards the guard. A delta entry that matches what the catalog now says
    // would silence a real drift forever, so every entry has to still differ.
    for (const [planCode, delta] of Object.entries(HISTORICAL_DELTA)) {
      const current = workspaceEntitlementCatalogSnapshot(
        planCode as (typeof BILLING_PLAN_IDS)[number],
        planCode === 'flex' ? 'none' : 'monthly',
      ).featureLimits as unknown as Record<string, number>;
      for (const [field, historical] of Object.entries(delta)) {
        expect(current[field], `${planCode}.${field} no longer differs; drop it from HISTORICAL_DELTA`)
          .not.toBe(historical);
      }
    }
  });

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
