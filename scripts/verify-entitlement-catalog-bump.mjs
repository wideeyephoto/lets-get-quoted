/**
 * Run 20260819040000_workspace_entitlement_catalog_2026_08_18.sql against a real
 * PostgreSQL 17.
 *
 * This migration REWRITES LIVE ENTITLEMENT ROWS, so the thing worth proving is
 * not that it updates the rows it should — it is that it leaves alone every row
 * it cannot prove equivalent. A drifted entitlement quietly overwritten is a
 * workspace's capacity changed without anyone deciding to.
 *
 * The embedded maps are checked against the TypeScript catalog by
 * test/entitlement-catalog-bump-migration.test.ts. This checks the behaviour.
 *
 * Not part of the default suite — see scripts/verify-storage-usage-migration.mjs
 * for the one npm command it needs. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIRS = [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
];

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error(
    'embedded-postgres is not installed. To run this check:\n\n'
    + '  npm install --no-save embedded-postgres@17 @embedded-postgres/windows-x64@17\n',
  );
  process.exit(2);
}

for (const dir of BIN_DIRS) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-catalog-'));
const port = Number(process.env.LGQ_CATALOG_CHECK_PORT || 54335);
const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

/** Exactly what the 2026-08-15 catalog wrote: eight keys. */
const OLD_FLEX = {
  office_users: 1, crew_users: 2, custom_domain_connections: 1,
  dedicated_business_numbers: 0, storage_gb: 5, quickbooks_connections: 1,
  voice_concurrent_calls: 1, voice_history_days: 30,
};
const OLD_SOLO = {
  office_users: 1, crew_users: 2, custom_domain_connections: 1,
  dedicated_business_numbers: 1, storage_gb: 10, quickbooks_connections: 1,
  voice_concurrent_calls: 1, voice_history_days: 30,
};

const STUB = `
create table public.accounts (id uuid primary key);
create table public.workspace_entitlements (
  account_id uuid primary key references public.accounts(id),
  plan_code text not null,
  catalog_version text not null,
  platform_fee_bps integer not null default 125,
  feature_limits jsonb not null default '{}'::jsonb
);
`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port,
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_catalog_check');
  c = pg.getPgClient('lgq_catalog_check');
  await c.connect();
  await c.query(STUB);

  const seed = async (id, plan, version, limits) => {
    await c.query('insert into public.accounts (id) values ($1)', [id]);
    await c.query(
      `insert into public.workspace_entitlements
         (account_id, plan_code, catalog_version, feature_limits)
       values ($1,$2,$3,$4::jsonb)`,
      [id, plan, version, JSON.stringify(limits)],
    );
  };
  const row = async (id) => (await c.query(
    'select * from public.workspace_entitlements where account_id = $1', [id],
  )).rows[0];

  const FLEX = '11111111-1111-4111-8111-111111111111';
  const SOLO = '22222222-2222-4222-8222-222222222222';
  const DRIFTED = '33333333-3333-4333-8333-333333333333';
  const OTHER_VERSION = '44444444-4444-4444-8444-444444444444';
  const ALREADY = '55555555-5555-4555-8555-555555555555';

  await seed(FLEX, 'flex', '2026-08-15-preview', OLD_FLEX);
  await seed(SOLO, 'solo', '2026-08-15-preview', OLD_SOLO);
  // Same plan and version, but somebody changed its storage. Must not be touched.
  await seed(DRIFTED, 'flex', '2026-08-15-preview', { ...OLD_FLEX, storage_gb: 99 });
  // A catalog this migration knows nothing about.
  await seed(OTHER_VERSION, 'flex', '2026-07-01-preview', OLD_FLEX);
  // Already current: must be left exactly as-is.
  await seed(ALREADY, 'flex', '2026-08-18-preview', { ...OLD_FLEX, forwarding_minutes: 0, voice_included_minutes: 0 });

  await c.query(m('20260819040000_workspace_entitlement_catalog_2026_08_18.sql'));
  ck('migration applies on a real engine', true);

  const flex = await row(FLEX);
  ck('a settled Flex row moves to the current catalog',
    flex.catalog_version === '2026-08-18-preview', flex.catalog_version);
  ck('and gains exactly the two added keys at the catalog values',
    flex.feature_limits.forwarding_minutes === 0
    && flex.feature_limits.voice_included_minutes === 0
    && Object.keys(flex.feature_limits).length === 10,
    JSON.stringify(flex.feature_limits));
  ck('without changing any value it already had',
    flex.feature_limits.storage_gb === 5 && flex.feature_limits.crew_users === 2
    && flex.feature_limits.office_users === 1,
    JSON.stringify(flex.feature_limits));

  const solo = await row(SOLO);
  ck('a Solo row gets Solo forwarding minutes, not Flex',
    solo.catalog_version === '2026-08-18-preview'
    && solo.feature_limits.forwarding_minutes === 100
    && solo.feature_limits.storage_gb === 10,
    JSON.stringify(solo.feature_limits));

  // The assertions that matter most.
  const drifted = await row(DRIFTED);
  ck('a DRIFTED row is left completely alone',
    drifted.catalog_version === '2026-08-15-preview'
    && drifted.feature_limits.storage_gb === 99
    && Object.keys(drifted.feature_limits).length === 8,
    JSON.stringify(drifted));

  const otherVersion = await row(OTHER_VERSION);
  ck('a row on an unrecognised catalog is left alone',
    otherVersion.catalog_version === '2026-07-01-preview'
    && Object.keys(otherVersion.feature_limits).length === 8,
    otherVersion.catalog_version);

  const already = await row(ALREADY);
  ck('a row already on the current catalog is untouched',
    already.catalog_version === '2026-08-18-preview'
    && Object.keys(already.feature_limits).length === 10);

  // Idempotence.
  await c.query(m('20260819040000_workspace_entitlement_catalog_2026_08_18.sql'));
  ck('migration re-applies as a no-op', true);
  const flexAgain = await row(FLEX);
  ck('a second apply changes nothing',
    JSON.stringify(flexAgain.feature_limits) === JSON.stringify(flex.feature_limits)
    && flexAgain.catalog_version === '2026-08-18-preview');
  const driftedAgain = await row(DRIFTED);
  ck('and still leaves the drifted row alone',
    driftedAgain.catalog_version === '2026-08-15-preview'
    && driftedAgain.feature_limits.storage_gb === 99);

  // The post-check must refuse a half-moved row.
  await c.query(
    `update public.workspace_entitlements
        set catalog_version = '2026-08-18-preview',
            feature_limits = $1::jsonb
      where account_id = $2`,
    [JSON.stringify(OLD_FLEX), DRIFTED],
  );
  let refused = false;
  try {
    await c.query(m('20260819040000_workspace_entitlement_catalog_2026_08_18.sql'));
  } catch (err) {
    refused = err.code === '55000';
  }
  ck('the post-check refuses a row claiming the new catalog without its limits', refused);
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 240));
} finally {
  try { await c?.end(); } catch { /* going away */ }
  try { await pg.stop(); } catch { /* going away */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp */ }
}

let failed = 0;
for (const r of R) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${!r.ok && r.d ? `  [${r.d}]` : ''}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
