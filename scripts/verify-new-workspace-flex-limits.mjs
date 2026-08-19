/**
 * Run 20260819060000_new_workspace_gets_current_flex_limits.sql against a real
 * PostgreSQL 17.
 *
 * The function under test is built the way production actually holds it: the real
 * body is extracted from 20260815213142 and then put through the same
 * REPLACE('2026-08-15-preview','2026-08-18-preview') that 20260818120000 performs.
 * Hand-typing an approximation here would test a function that exists nowhere.
 *
 * Not part of the default suite -- see scripts/verify-storage-usage-migration.mjs
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

const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = '20260819060000_new_workspace_gets_current_flex_limits.sql';

/** The real function body, lifted from the migration that first created it. */
function realInitializeFunction() {
  const src = m('20260815213142_pricing_entitlements.sql');
  const start = src.indexOf('create or replace function public.initialize_workspace_pricing()');
  if (start < 0) throw new Error('initialize_workspace_pricing not found in 20260815213142');
  const end = src.indexOf('\n$$;', start);
  if (end < 0) throw new Error('could not find the end of initialize_workspace_pricing');
  return src.slice(start, end + 4);
}

const OLD_FLEX = {
  office_users: 1, crew_users: 2, custom_domain_connections: 1,
  dedicated_business_numbers: 0, storage_gb: 5, quickbooks_connections: 1,
  voice_concurrent_calls: 1, voice_history_days: 30,
};

const STUB = `
create table public.accounts (id uuid primary key);
create table public.workspace_entitlements (
  account_id uuid primary key references public.accounts(id),
  plan_code text not null,
  billing_interval text not null,
  billing_status text not null,
  entitlement_state text not null,
  catalog_version text not null,
  platform_fee_bps integer not null default 125,
  starter_credits_issued_at timestamptz,
  feature_limits jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb
);
create table public.usage_credit_lots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  resource_code text not null,
  source_type text not null,
  idempotency_key text not null,
  catalog_version text,
  granted_units bigint not null,
  available_from timestamptz not null default now(),
  constraint usage_credit_lots_idempotency_unique unique (account_id, resource_code, idempotency_key)
);
`;

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const basePort = Number(process.env.LGQ_FLEX_LIMITS_CHECK_PORT || 54336);

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-flexlimits-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port: basePort,
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_flex_check');
  c = pg.getPgClient('lgq_flex_check');
  await c.connect();
  await c.query(STUB);

  const fn = realInitializeFunction();
  // Exactly what 20260818120000 does to it.
  const bumped = fn.replace(/2026-08-15-preview/g, '2026-08-18-preview');
  ck('the real function carries the eight-key Flex map', !fn.includes('forwarding_minutes'));
  ck('and the version bump alone does not add the two keys',
    !bumped.includes('forwarding_minutes'));

  await c.query(bumped);
  await c.query(`
    create trigger initialize_workspace_pricing_trigger
    after insert on public.accounts
    for each row execute function public.initialize_workspace_pricing();
  `);

  const row = async (id) => (await c.query(
    'select * from public.workspace_entitlements where account_id = $1', [id],
  )).rows[0];
  const newAccount = async (id) => {
    await c.query('insert into public.accounts (id) values ($1)', [id]);
    return row(id);
  };
  const keys = (r) => Object.keys(r.feature_limits).length;

  // The defect, reproduced before the fix.
  const BEFORE = '11111111-1111-4111-8111-111111111111';
  const before = await newAccount(BEFORE);
  ck('BEFORE: a new workspace claims the current catalog',
    before.catalog_version === '2026-08-18-preview', before.catalog_version);
  ck('BEFORE: but carries only eight limits -- the defect',
    keys(before) === 8, JSON.stringify(before.feature_limits));

  // A row someone deliberately changed. Its drift must survive.
  const DRIFTED = '33333333-3333-4333-8333-333333333333';
  await c.query('insert into public.accounts (id) values ($1)', [DRIFTED]);
  await c.query(
    'update public.workspace_entitlements set feature_limits = $1::jsonb where account_id = $2',
    [JSON.stringify({ ...OLD_FLEX, storage_gb: 99 }), DRIFTED],
  );

  // A row that already carries one of the two keys at a deliberate value. This is
  // the assertion the LEFT-hand concatenation exists for: supplying a default must
  // never overwrite a value someone stored.
  const PARTIAL = '44444444-4444-4444-8444-444444444444';
  await c.query('insert into public.accounts (id) values ($1)', [PARTIAL]);
  await c.query(
    'update public.workspace_entitlements set feature_limits = $1::jsonb where account_id = $2',
    [JSON.stringify({ ...OLD_FLEX, forwarding_minutes: 500 }), PARTIAL],
  );

  await c.query(m(MIGRATION));
  ck('migration applies on a real engine', true);

  const repaired = await row(BEFORE);
  ck('the already-provisioned truncated row is repaired',
    keys(repaired) === 10
    && repaired.feature_limits.forwarding_minutes === 0
    && repaired.feature_limits.voice_included_minutes === 0,
    JSON.stringify(repaired.feature_limits));
  ck('without changing any value it already had',
    repaired.feature_limits.storage_gb === 5
    && repaired.feature_limits.crew_users === 2
    && repaired.feature_limits.dedicated_business_numbers === 0,
    JSON.stringify(repaired.feature_limits));

  const drifted = await row(DRIFTED);
  ck('a DRIFTED row keeps every value it was deliberately given',
    drifted.feature_limits.storage_gb === 99,
    JSON.stringify(drifted.feature_limits));
  ck('and gains only the two keys its catalog version requires',
    keys(drifted) === 10
    && drifted.feature_limits.forwarding_minutes === 0
    && drifted.feature_limits.voice_included_minutes === 0,
    JSON.stringify(drifted.feature_limits));

  const partial = await row(PARTIAL);
  ck('a stored value is never overwritten by the supplied default',
    partial.feature_limits.forwarding_minutes === 500
    && partial.feature_limits.voice_included_minutes === 0
    && keys(partial) === 10,
    JSON.stringify(partial.feature_limits));

  const AFTER = '22222222-2222-4222-8222-222222222222';
  const after = await newAccount(AFTER);
  ck('a workspace created AFTER the fix gets ten limits',
    keys(after) === 10
    && after.feature_limits.forwarding_minutes === 0
    && after.feature_limits.voice_included_minutes === 0,
    JSON.stringify(after.feature_limits));
  ck('on the current catalog version',
    after.catalog_version === '2026-08-18-preview', after.catalog_version);
  ck('and its starter credits are keyed to the current catalog', (await c.query(
    "select count(*)::int as n from public.usage_credit_lots"
    + " where account_id = $1 and idempotency_key like 'flex-starter:2026-08-18-preview:%'",
    [AFTER],
  )).rows[0].n === 4);

  // Idempotence.
  await c.query(m(MIGRATION));
  ck('migration re-applies as a no-op', true);
  const afterAgain = await row(AFTER);
  ck('a second apply changes nothing',
    JSON.stringify(afterAgain.feature_limits) === JSON.stringify(after.feature_limits));
  const driftedAgain = await row(DRIFTED);
  ck('and still leaves the drifted row alone',
    driftedAgain.feature_limits.storage_gb === 99);
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 240));
} finally {
  try { await c?.end(); } catch { /* going away */ }
  try { await pg.stop(); } catch { /* going away */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp */ }
}

// --- Second engine: the out-of-order refusal needs a function that still pins
// --- the old catalog, which the first engine has already moved past.
const dataDir2 = mkdtempSync(join(tmpdir(), 'lgq-pg17-flexorder-'));
const pg2 = new EmbeddedPostgres({
  databaseDir: dataDir2, user: 'postgres', password: 'postgres', port: basePort + 1,
  persistent: false, onLog: () => {}, onError: () => {},
});
let c2;
try {
  await pg2.initialise();
  await pg2.start();
  await pg2.createDatabase('lgq_flex_order');
  c2 = pg2.getPgClient('lgq_flex_order');
  await c2.connect();
  await c2.query(STUB);
  // 20260818120000 NOT applied: the function still pins the old catalog.
  await c2.query(realInitializeFunction());

  let refused = false;
  try {
    await c2.query(m(MIGRATION));
  } catch (err) {
    refused = err.code === '55000';
    // The migration opens its own transaction, so the raise leaves this session
    // in an aborted one. Without this, every later probe reports 25P02 instead of
    // the thing it was asked about.
    await c2.query('rollback');
  }
  const src = (await c2.query(
    "select pg_get_functiondef('public.initialize_workspace_pricing()'::regprocedure) as d",
  )).rows[0].d;
  ck('refuses to run before 20260818120000', refused);
  ck('and leaves the old-catalog function untouched when it refuses',
    src.includes('2026-08-15-preview') && !src.includes('forwarding_minutes'));
} catch (err) {
  ck('order harness completed without throwing', false, String(err?.message ?? err).slice(0, 240));
} finally {
  try { await c2?.end(); } catch { /* going away */ }
  try { await pg2.stop(); } catch { /* going away */ }
  try { rmSync(dataDir2, { recursive: true, force: true }); } catch { /* temp */ }
}

let failed = 0;
for (const r of R) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${!r.ok && r.d ? `  [${r.d}]` : ''}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
