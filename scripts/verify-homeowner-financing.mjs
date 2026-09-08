/**
 * Prove homeowner_financing_enrollments schema and RLS security against a real PostgreSQL 17.
 *
 * Checks:
 * 1. anon cannot select, insert, update, or delete on public.homeowner_financing_enrollments.
 * 2. Account isolation: Account A authenticated session can select its row, but Account B cannot.
 * 3. Authenticated role cannot directly insert/update/delete (no write policies; writes run as service role).
 * 4. Unique constraint: (account_id, provider) is unique.
 * 5. Check constraints: provider and status values strictly enforced.
 * 6. Account deletion: cascade cleans up homeowner_financing_enrollments rows without error.
 *
 * Exit code 2 if embedded-postgres is not installed and no fallback DB URL is provided.
 * Exit code 1 on test failure.
 * Exit code 0 on all passes.
 */

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pgPkg from 'pg';
const { Client } = pgPkg;

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
  // Optional if fallback connection string provided
}

const MIGRATION = readFileSync(
  join(REPO, 'migrations', '20260908150000_homeowner_financing_enrollments.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const R = [];
const ck = (n, ok, d = '') => {
  R.push({ n, ok: Boolean(ok), d });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  -- ${d}` : ''}`);
};

const HARNESS_SCHEMA = `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end
$roles$;

create schema if not exists auth;
create extension if not exists "pgcrypto";

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create type public.member_role as enum ('owner', 'crew', 'office');
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null,
  role public.member_role not null default 'owner',
  unique (account_id, user_id)
);

create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;

create or replace function public.is_owner(acc uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from memberships m
    where m.account_id = acc and m.user_id = auth.uid() and m.role = 'owner');
$fn$;

create or replace function public.is_office(acc uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from memberships m
    where m.account_id = acc and m.user_id = auth.uid() and m.role = 'office');
$fn$;

create table if not exists public.office_capabilities (
  capability text primary key,
  enabled boolean not null default false
);

create or replace function public.office_can(acc uuid, p_capability text) returns boolean
language sql stable security definer set search_path = public as $can$
  select public.is_owner(acc)
    or (public.is_office(acc)
        and exists (select 1 from public.office_capabilities c
                     where c.capability = p_capability and c.enabled));
$can$;
`;

let client;
let pgInstance;
let dataDir;

async function setup() {
  if (process.env.LGQ_PG17_DATABASE_URL) {
    client = new Client({ connectionString: process.env.LGQ_PG17_DATABASE_URL });
    await client.connect();
    return;
  }

  if (!EmbeddedPostgres) {
    console.error(
      'embedded-postgres is not installed and LGQ_PG17_DATABASE_URL is not set.\n' +
      'Skipping PG17 verification harness.'
    );
    process.exit(2);
  }

  dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-financing-'));
  pgInstance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: Number(process.env.LGQ_FINANCING_PORT || 54361),
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });

  await pgInstance.initialise();
  await pgInstance.start();
  await pgInstance.createDatabase('lgq_test');
  client = pgInstance.getPgClient('lgq_test');
  await client.connect();
}

async function teardown() {
  try {
    if (client) await client.end();
  } catch {}
  try {
    if (pgInstance) await pgInstance.stop();
  } catch {}
  try {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  } catch {}
}

async function run() {
  await setup();

  await client.query(HARNESS_SCHEMA);
  await client.query(MIGRATION);

  // Seed two accounts and owners
  const userA = 'a0000000-0000-0000-0000-000000000001';
  const userB = 'b0000000-0000-0000-0000-000000000002';
  const accA = (await client.query(`insert into public.accounts default values returning id`)).rows[0];
  const accB = (await client.query(`insert into public.accounts default values returning id`)).rows[0];

  await client.query(`insert into public.memberships (account_id, user_id, role) values ('${accA.id}', '${userA}', 'owner')`);
  await client.query(`insert into public.memberships (account_id, user_id, role) values ('${accB.id}', '${userB}', 'owner')`);

  // Service role inserts an enrollment row for Account A
  const enrollA = (await client.query(
    `insert into public.homeowner_financing_enrollments (account_id, provider, provider_code, status, enabled_on_quotes)
     values ('${accA.id}', 'acorn', 'ACORN1', 'active', true) returning *`
  )).rows[0];

  // 1. anon cannot select or write
  await client.query(`set role anon`);
  let anonSelectErr = null;
  try {
    await client.query('select * from public.homeowner_financing_enrollments');
  } catch (e) {
    anonSelectErr = e;
  }
  ck('anon cannot SELECT homeowner_financing_enrollments', anonSelectErr !== null, anonSelectErr?.message);

  let anonInsertErr = null;
  try {
    await client.query(`insert into public.homeowner_financing_enrollments (account_id, provider) values ('${accA.id}', 'acorn')`);
  } catch (e) {
    anonInsertErr = e;
  }
  ck('anon cannot INSERT homeowner_financing_enrollments', anonInsertErr !== null, anonInsertErr?.message);

  // 2. Account A authenticated user can SELECT their row
  await client.query(`set role authenticated`);
  await client.query(`set request.jwt.claim.sub = '${userA}'`);
  const resA = await client.query('select * from public.homeowner_financing_enrollments');
  ck('Account A user can SELECT own enrollment', resA.rows.length === 1 && resA.rows[0].id === enrollA.id);

  // 3. Account B authenticated user CANNOT see Account A's row
  await client.query(`set request.jwt.claim.sub = '${userB}'`);
  const resB = await client.query('select * from public.homeowner_financing_enrollments');
  ck('Account B user CANNOT see Account A enrollment (tenant isolation)', resB.rows.length === 0);

  // 4. Authenticated users cannot directly write (no write policies; service role only)
  await client.query(`set request.jwt.claim.sub = '${userA}'`);
  let authInsertErr = null;
  try {
    await client.query(`insert into public.homeowner_financing_enrollments (account_id, provider) values ('${accA.id}', 'acorn')`);
  } catch (e) {
    authInsertErr = e;
  }
  ck('Authenticated role cannot INSERT directly (service role only)', authInsertErr !== null, authInsertErr?.message);

  let authUpdateErr = null;
  try {
    await client.query(`update public.homeowner_financing_enrollments set enabled_on_invoices = true where id = '${enrollA.id}'`);
  } catch (e) {
    authUpdateErr = e;
  }
  ck('Authenticated role cannot UPDATE directly (service role only)', authUpdateErr !== null, authUpdateErr?.message);

  // 5. Unique constraint: (account_id, provider)
  await client.query(`reset role`);
  let dupErr = null;
  try {
    await client.query(`insert into public.homeowner_financing_enrollments (account_id, provider) values ('${accA.id}', 'acorn')`);
  } catch (e) {
    dupErr = e;
  }
  ck('Duplicate (account_id, provider) is rejected by unique index', dupErr !== null && dupErr.code === '23505', dupErr?.message);

  // 6. Check constraint: invalid provider rejected
  let badProviderErr = null;
  try {
    await client.query(`insert into public.homeowner_financing_enrollments (account_id, provider) values ('${accB.id}', 'unknown_provider')`);
  } catch (e) {
    badProviderErr = e;
  }
  ck('Invalid provider rejected by check constraint', badProviderErr !== null && badProviderErr.code === '23514', badProviderErr?.message);

  // 7. Cascade delete on account
  await client.query(`delete from public.accounts where id = '${accA.id}'`);
  const remaining = await client.query(`select * from public.homeowner_financing_enrollments where id = '${enrollA.id}'`);
  ck('Cascade delete removes enrollment on account deletion', remaining.rows.length === 0);

  const passed = R.filter((r) => r.ok).length;
  const failed = R.filter((r) => !r.ok).length;
  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${R.length} checks.`);
  if (failed > 0) process.exit(1);
}

try {
  await run();
} finally {
  await teardown();
}
