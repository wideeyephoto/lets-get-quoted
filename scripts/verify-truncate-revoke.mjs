/**
 * Prove the TRUNCATE sweep against a real PostgreSQL 17.
 *
 * TWO THINGS ARE UNDER TEST, and only the second is obvious.
 *
 * 1. That anon and authenticated can no longer TRUNCATE anything in `public`.
 * 2. That nothing ELSE was taken away. `revoke truncate on all tables` is one
 *    keyword from `revoke all on all tables`, and the difference between them
 *    is a working product and a dashboard where every page 403s. A run that
 *    removed SELECT would look identical in the "no longer truncatable" check
 *    and fail only when somebody opened a page.
 *
 * The harness reproduces Supabase's default privileges before creating anything,
 * so the grants this revokes actually exist. Without that line the whole script
 * would pass by revoking a privilege that was never there — the exact shape of
 * green-run-that-means-nothing this migration exists because of.
 *
 * Not part of the default suite. Exits 2 when it cannot run.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
]) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

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

const SWEEP = readFileSync(
  join(REPO, 'migrations', '20260819170000_revoke_truncate_from_browser_roles.sql'), 'utf8',
).replace(/\r\n/g, '\n');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-truncate-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_TRUNCATE_CHECK_PORT || 54353),
  persistent: false, onLog: () => {}, onError: () => {},
});

const priv = async (q, table, role, privilege) =>
  (await q('select has_table_privilege($1, $2, $3) as ok', [role, `public.${table}`, privilege]))
    .rows[0].ok;

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_trunc');
  c = pg.getPgClient('lgq_trunc');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);

  await q(`
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $roles$;
    -- Supabase's own defaults. Everything below depends on these being real.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table public.accounts (id uuid primary key);
    create table public.leads (id uuid primary key, account_id uuid);
    create table public.payments (id uuid primary key, account_id uuid);
    alter table public.accounts enable row level security;
    alter table public.leads enable row level security;
  `);

  // The state production was found in, reproduced.
  for (const table of ['accounts', 'leads', 'payments']) {
    ck(`${table} starts truncatable by authenticated, as production was`,
      await priv(q, table, 'authenticated', 'TRUNCATE') === true);
  }
  ck('RLS is on and does nothing about it',
    (await q(`select relrowsecurity from pg_class where relname = 'leads'`)).rows[0].relrowsecurity === true);

  await q(SWEEP);
  ck('the sweep applies, post-conditions and all', true);

  // 1. The thing it is for.
  for (const table of ['accounts', 'leads', 'payments']) {
    for (const role of ['anon', 'authenticated']) {
      ck(`${role} can no longer truncate ${table}`,
        await priv(q, table, role, 'TRUNCATE') === false);
    }
  }

  // 2. The thing that would look identical if it had gone too wide.
  for (const table of ['accounts', 'leads', 'payments']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      ck(`authenticated kept ${privilege} on ${table}`,
        await priv(q, table, 'authenticated', privilege) === true);
    }
  }
  ck('service_role kept everything, including truncate',
    await priv(q, 'accounts', 'service_role', 'TRUNCATE') === true
    && await priv(q, 'accounts', 'service_role', 'SELECT') === true);

  // 3. It must not decay. A table created afterwards is the real test of the
  //    default-privileges half; without it this is a one-off that lasts until
  //    the next migration adds a table.
  await q('create table public.later_table (id uuid primary key)');
  ck('a table created AFTER the sweep is not truncatable either',
    await priv(q, 'later_table', 'authenticated', 'TRUNCATE') === false);
  ck('...and still has the grants the app needs',
    await priv(q, 'later_table', 'authenticated', 'SELECT') === true);

  // 4. Re-running changes nothing. Migrations get replayed.
  await q(SWEEP);
  ck('applying it twice is safe',
    await priv(q, 'leads', 'authenticated', 'SELECT') === true
    && await priv(q, 'leads', 'authenticated', 'TRUNCATE') === false);

  await c.end();
} catch (error) {
  ck('harness ran to completion', false, error.message ?? String(error));
} finally {
  try { await pg.stop(); } catch { /* already down */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* leave it */ }
}

let failed = 0;
for (const { n, ok, d } of R) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok || d == null ? '' : `\n       ${typeof d === 'string' ? d : JSON.stringify(d)}`}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
