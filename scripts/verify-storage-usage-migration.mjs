/**
 * Run 20260819000000_workspace_storage_usage.sql against a real PostgreSQL 17.
 *
 * WHY THIS EXISTS. test/workspace-storage-usage-migration.test.ts asserts the
 * migration's SOURCE, which is all the hermetic suite can do -- there is no
 * PostgreSQL in it. Source assertions cannot catch SQL that parses and then
 * fails at runtime (the `pg_catalog.coalesce` trap the purchased-capacity
 * migration documents is exactly that shape), and they cannot catch arithmetic
 * or predicates that are simply wrong. This boots a throwaway cluster, applies
 * the migration on top of its dependencies, and exercises the behaviour.
 *
 * NOT PART OF THE DEFAULT SUITE, on purpose: it needs a PostgreSQL distribution
 * that is not a dependency of this app. Install it only when you need to run
 * this, and do not save it to package.json:
 *
 *   npm install --no-save embedded-postgres@17 @embedded-postgres/windows-x64@17
 *   node scripts/verify-storage-usage-migration.mjs
 *
 * The cluster is created in a temp directory, listens on localhost only, and is
 * deleted on the way out. It never reads LGQ_PG17_DATABASE_URL and cannot touch
 * a hosted database -- unlike test-pg17/, which talks to a provisioned one and
 * carries a destructive-sentinel gate for that reason.
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
let Client;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  ({ Client } = await import('pg'));
} catch {
  console.error(
    'embedded-postgres is not installed. This check is deliberately not a\n'
    + 'dependency of the app. To run it:\n\n'
    + '  npm install --no-save embedded-postgres@17 @embedded-postgres/windows-x64@17\n',
  );
  process.exit(2);
}

// A backend that cannot resolve its own bin directory dies on startup with an
// error that does not mention the path. Prepending it is the whole fix.
for (const dir of BIN_DIRS) process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-storage-'));
const port = Number(process.env.LGQ_STORAGE_CHECK_PORT || 54329);

const migration = (name) =>
  readFileSync(join(REPO, 'migrations', name), 'utf8').replace(/\r\n/g, '\n');

/**
 * The migration's dependencies, reduced to the shapes it actually touches.
 * A stand-in for the real schema, not a substitute for it: the point is that
 * the migration's OWN SQL is what runs. The purchased-capacity migration below
 * is applied verbatim, because workspace_storage_limit_bytes calls into it and
 * a stub of that function would test nothing.
 */
const PREREQS = `
create role anon;
create role authenticated;
create role service_role;

create table public.accounts (id uuid primary key);
create table public.billing_events (id uuid primary key);
create table public.workspace_entitlements (
  account_id uuid primary key references public.accounts(id),
  feature_limits jsonb not null default '{}'::jsonb
);

-- The RLS policy calls this. The body is irrelevant here; the signature is not.
create function public.is_owner(p_account_id uuid) returns boolean
language sql stable as $$ select false $$;

-- Supabase's storage schema, reduced to the columns the sweep reads.
create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  metadata jsonb
);
`;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
  onLog: () => {},
  onError: () => {},
});

const GiB = 1073741824n;
let client;

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_storage_check');
  client = new Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'lgq_storage_check' });
  await client.connect();

  const q = (sql, params) => client.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];

  await q(PREREQS);
  await q(migration('20260818210000_workspace_purchased_capacity.sql'));
  await q(migration('20260819000000_workspace_storage_usage.sql'));
  check('migration applies on a real engine', true);

  await q(migration('20260819000000_workspace_storage_usage.sql'));
  check('migration re-applies as a no-op', true);

  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const ORPHAN = '33333333-3333-4333-8333-333333333333';
  const UNSWEPT = '44444444-4444-4444-8444-444444444444';

  await q('insert into public.accounts (id) values ($1), ($2)', [A, B]);
  await q(
    `insert into public.workspace_entitlements (account_id, feature_limits)
     values ($1, '{"storage_gb": 5}'::jsonb)`,
    [A],
  );

  const obj = (bucket, name, size) => q(
    'insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3::jsonb)',
    [bucket, name, size === null ? null : JSON.stringify({ size })],
  );

  await obj('job-photos', `${A}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`, 1000);
  await obj('job-photos', `${A}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`, 2000);
  await obj('crew-photos', `${A}/crew-1/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg`, 500);
  await obj('site-videos', `${B}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.mp4`, 9000);
  // The four hazards, each of which would break the sweep in a different way.
  await obj('job-photos', 'not-a-uuid/whatever.jpg', 777);
  await obj('job-photos', `${ORPHAN}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg`, 888);
  await obj('avatars', `${A}/ffffffff-ffff-4fff-8fff-ffffffffffff.png`, 999);
  await obj('job-photos', `${A}/99999999-9999-4999-8999-999999999999.jpg`, null);

  const sweep = await one('select * from public.reconcile_workspace_storage_usage_v1()');
  check('sweep runs and reports counts', sweep.workspaces_measured === '2', `measured=${sweep.workspaces_measured}`);

  const a = await one('select * from public.workspace_storage_usage where account_id = $1', [A]);
  // 1000 + 2000 + 500. The unmetered bucket, the stray folder and the sizeless
  // object all have to be absent from this number for it to be 3500.
  check('sums only metered buckets for the right account', a.bytes_used === '3500', `bytes=${a.bytes_used}`);
  check('counts the object whose metadata carries no size', a.object_count === '4', `count=${a.object_count}`);

  const orphan = await one('select count(*)::int as n from public.workspace_storage_usage where account_id = $1', [ORPHAN]);
  check('skips a uuid folder that is not an account', orphan.n === 0, `rows=${orphan.n}`);

  const planOnly = await one('select public.workspace_storage_limit_bytes($1) as v', [A]);
  check('limit is the plan allowance', BigInt(planOnly.v) === 5n * GiB, `got=${planOnly.v}`);

  await q(
    `insert into public.workspace_purchased_capacity
       (account_id, top_up_id, resource_code, units, unit_amount_cents,
        catalog_version, livemode, stripe_subscription_id, status)
     values ($1, 'storage_100gb', 'storage_gb', 100, 1500,
             '2026-08-18-preview', false, 'sub_TESTstorage001', 'active')`,
    [A],
  );
  const bought = await one('select public.workspace_storage_limit_bytes($1) as v', [A]);
  check('limit adds purchased capacity', BigInt(bought.v) === 105n * GiB, `got=${bought.v}`);

  await q("update public.workspace_purchased_capacity set status = 'past_due' where account_id = $1", [A]);
  const pastDue = await one('select public.workspace_storage_limit_bytes($1) as v', [A]);
  check('past_due capacity still counts', BigInt(pastDue.v) === 105n * GiB, `got=${pastDue.v}`);

  await q(
    "update public.workspace_purchased_capacity set status = 'canceled', canceled_at = now() where account_id = $1",
    [A],
  );
  const canceled = await one('select public.workspace_storage_limit_bytes($1) as v', [A]);
  check('canceled capacity stops counting', BigInt(canceled.v) === 5n * GiB, `got=${canceled.v}`);

  const noEntitlement = await one('select public.workspace_storage_limit_bytes($1) as v', [B]);
  check('no entitlement row yields NULL, not 0', noEntitlement.v === null, `got=${noEntitlement.v}`);

  const measured = await q('select * from public.workspace_storage_state_v1($1)', [A]);
  check('state returns one row for a measured workspace', measured.rowCount === 1, `rows=${measured.rowCount}`);

  await q('insert into public.accounts (id) values ($1)', [UNSWEPT]);
  await q(
    `insert into public.workspace_entitlements (account_id, feature_limits)
     values ($1, '{"storage_gb": 10}'::jsonb)`,
    [UNSWEPT],
  );
  const unswept = await q('select * from public.workspace_storage_state_v1($1)', [UNSWEPT]);
  check('state returns one row for an unswept workspace', unswept.rowCount === 1, `rows=${unswept.rowCount}`);
  check(
    'unswept usage is NULL while its limit is real',
    unswept.rows[0]?.bytes_used === null && BigInt(unswept.rows[0]?.limit_bytes) === 10n * GiB,
    `used=${unswept.rows[0]?.bytes_used} limit=${unswept.rows[0]?.limit_bytes}`,
  );

  await q('delete from storage.objects where name like $1', [`${A}/%`]);
  const second = await one('select * from public.reconcile_workspace_storage_usage_v1()');
  const zeroed = await one('select * from public.workspace_storage_usage where account_id = $1', [A]);
  check('a workspace that deleted everything returns to zero', zeroed.bytes_used === '0', `bytes=${zeroed.bytes_used}`);
  check('the zeroing pass is reported', Number(second.workspaces_zeroed) >= 1, `zeroed=${second.workspaces_zeroed}`);

  const untouched = await one('select * from public.workspace_storage_usage where account_id = $1', [B]);
  check('the other workspace is untouched by the zeroing pass', untouched.bytes_used === '9000', `bytes=${untouched.bytes_used}`);
} catch (error) {
  check('harness completed without throwing', false, String(error?.message ?? error));
} finally {
  try { if (client) await client.end(); } catch { /* the cluster is going away anyway */ }
  try { await pg.stop(); } catch { /* ditto */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir */ }
}

let failed = 0;
for (const result of results) {
  if (!result.ok) failed += 1;
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${!result.ok && result.detail ? `  [${result.detail}]` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
