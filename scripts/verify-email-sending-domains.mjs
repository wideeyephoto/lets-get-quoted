/**
 * Prove email_sending_domains schema and RLS security against a real PostgreSQL 17.
 *
 * Checks:
 * 1. anon cannot select, insert, update, or delete on public.email_sending_domains.
 * 2. Account isolation: Account A authenticated session can select its row, but Account B cannot.
 * 3. Authenticated role cannot directly insert/update/delete (no write policies; writes run as service role).
 * 4. Unique domain constraint: lower(domain) uniqueness is enforced globally.
 * 5. One verified sending domain per account: partial unique index rejects a second verified domain,
 *    but allows multiple unverified/pending rows.
 * 6. Account deletion: cascade cleans up email_sending_domains rows without error.
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
  join(REPO, 'migrations', '20260907180000_email_sending_domains.sql'),
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
      'To run this check locally:\n' +
      '  npm install --no-save embedded-postgres@17 @embedded-postgres/windows-x64@17\n'
    );
    process.exit(2);
  }

  dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-sending-domains-'));
  pgInstance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: Number(process.env.LGQ_SENDING_DOMAINS_PORT || 54359),
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });

  await pgInstance.initialise();
  await pgInstance.start();
  await pgInstance.createDatabase('lgq_test');
  client = pgInstance.getPgClient('lgq_test');
  await client.connect();
}

try {
  await setup();

  // Install schema and migration
  await client.query(HARNESS_SCHEMA);
  await client.query(MIGRATION);

  // Seed two accounts and owners
  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';
  const { rows: [accA] } = await client.query('insert into public.accounts default values returning id');
  const { rows: [accB] } = await client.query('insert into public.accounts default values returning id');

  await client.query('insert into public.memberships (account_id, user_id, role) values ($1, $2, $3)', [accA.id, userA, 'owner']);
  await client.query('insert into public.memberships (account_id, user_id, role) values ($1, $2, $3)', [accB.id, userB, 'owner']);

  // Insert test sending domain row as superuser / service role
  const { rows: [domainA] } = await client.query(
    `insert into public.email_sending_domains (account_id, domain, status)
     values ($1, 'contractor-a.com', 'verified') returning *`,
    [accA.id],
  );

  // Test 1: anon cannot select, insert, update, or delete
  for (const op of ['select', 'insert', 'update', 'delete']) {
    let denied = false;
    try {
      await client.query('begin');
      await client.query('set local role anon');
      if (op === 'select') {
        await client.query('select * from public.email_sending_domains');
      } else if (op === 'insert') {
        await client.query(`insert into public.email_sending_domains (account_id, domain) values ('${accA.id}', 'anon.com')`);
      } else if (op === 'update') {
        await client.query(`update public.email_sending_domains set from_local_part = 'evil' where id = '${domainA.id}'`);
      } else if (op === 'delete') {
        await client.query(`delete from public.email_sending_domains where id = '${domainA.id}'`);
      }
      await client.query('rollback');
    } catch (err) {
      denied = /permission denied/i.test(err.message);
      await client.query('rollback');
    }
    ck(`anon refused ${op}`, denied, denied ? '' : `anon was permitted to ${op}`);
  }

  // Test 2: Account A can select its row
  let accASees = 0;
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query(`set local "request.jwt.claim.sub" = '${userA}'`);
    const res = await client.query('select * from public.email_sending_domains');
    accASees = res.rowCount;
    await client.query('rollback');
  } catch (err) {
    await client.query('rollback');
  }
  ck('Account A reads own sending domain', accASees === 1, `got ${accASees} rows`);

  // Test 3: Account B cannot see Account A's row
  let accBSees = 0;
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query(`set local "request.jwt.claim.sub" = '${userB}'`);
    const res = await client.query('select * from public.email_sending_domains');
    accBSees = res.rowCount;
    await client.query('rollback');
  } catch (err) {
    await client.query('rollback');
  }
  ck('Account B cannot read Account A sending domain', accBSees === 0, `got ${accBSees} rows`);

  // Test 4: Authenticated user cannot write directly (must go through server action)
  let authInsertDenied = false;
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query(`set local "request.jwt.claim.sub" = '${userA}'`);
    await client.query(`insert into public.email_sending_domains (account_id, domain) values ('${accA.id}', 'new.com')`);
    await client.query('rollback');
  } catch (err) {
    authInsertDenied = /permission denied/i.test(err.message);
    await client.query('rollback');
  }
  ck('Authenticated user refused direct insert', authInsertDenied);

  // Test 5: lower(domain) unique index rejects duplicate domain across tenants
  let duplicateRejected = false;
  try {
    await client.query(
      `insert into public.email_sending_domains (account_id, domain, status)
       values ($1, 'CONTRACTOR-A.COM', 'pending')`,
      [accB.id],
    );
  } catch (err) {
    duplicateRejected = /unique/i.test(err.message);
  }
  ck('Duplicate lower(domain) refused across tenants', duplicateRejected);

  // Test 6: One verified sending domain per account
  let secondVerifiedRejected = false;
  try {
    await client.query(
      `insert into public.email_sending_domains (account_id, domain, status)
       values ($1, 'contractor-a-second.com', 'verified')`,
      [accA.id],
    );
  } catch (err) {
    secondVerifiedRejected = /unique/i.test(err.message);
  }
  ck('Second verified domain refused for same account', secondVerifiedRejected);

  // But a pending domain for same account IS allowed
  let pendingAllowed = false;
  try {
    const { rowCount } = await client.query(
      `insert into public.email_sending_domains (account_id, domain, status)
       values ($1, 'contractor-a-pending.com', 'pending')`,
      [accA.id],
    );
    pendingAllowed = rowCount === 1;
  } catch (err) {
    pendingAllowed = false;
  }
  ck('Multiple unverified domains allowed for account', pendingAllowed);

  // Test 8: every status the PROVIDER ADAPTER can produce must survive the
  // column's check constraint.
  //
  // These two are why this file exists in the state it does. resend-domains.ts
  // maps Resend's vocabulary onto the column's, because Resend answers a newly
  // created domain with `not_started` and the column allows only
  // pending|verified|failed|disabled. Storing the raw provider status raised
  // 23514 on the FIRST write of every connection attempt, and the eleven checks
  // that stood here only ever inserted 'verified' and 'pending' — they were
  // green throughout. Assert the mapped set, and assert the raw set is refused,
  // so that widening one vocabulary without the other fails here.
  const STORED_STATUSES = ['pending', 'verified', 'failed', 'disabled'];
  const PROVIDER_ONLY_STATUSES = ['not_started', 'temporary_failure'];

  let allStoredAccepted = true;
  for (const status of STORED_STATUSES) {
    try {
      await client.query(
        `insert into public.email_sending_domains (account_id, domain, status)
         values ($1, $2, $3)`,
        [accB.id, `stored-${status}.com`, status],
      );
    } catch (err) {
      allStoredAccepted = false;
      ck(`Stored status '${status}' accepted`, false, err.message.split('\n')[0]);
    }
  }
  ck('Every mapped status is accepted by the check constraint', allStoredAccepted);

  let allProviderOnlyRefused = true;
  for (const status of PROVIDER_ONLY_STATUSES) {
    let refused = false;
    try {
      await client.query(
        `insert into public.email_sending_domains (account_id, domain, status)
         values ($1, $2, $3)`,
        [accB.id, `raw-${status}.com`, status],
      );
    } catch (err) {
      refused = err.code === '23514';
    }
    if (!refused) allProviderOnlyRefused = false;
  }
  ck(
    'Raw provider statuses are refused, so the mapping cannot be skipped',
    allProviderOnlyRefused,
    'not_started / temporary_failure must be translated by toStoredStatus()',
  );

  // Test 9: the write path's conflict target must be inferable.
  //
  // The action used `.upsert(..., { onConflict: 'domain' })`, which emits
  // `ON CONFLICT (domain)`. The only unique index is on `lower(domain)`, an
  // expression index Postgres cannot infer from a bare column — so every
  // connection attempt raised 42P10. The action now branches explicitly instead;
  // this check pins the reason it has to.
  let bareColumnInferenceFails = false;
  try {
    await client.query(
      `insert into public.email_sending_domains (account_id, domain, status)
       values ($1, 'inference-probe.com', 'pending')
       on conflict (domain) do update set from_local_part = excluded.from_local_part`,
      [accB.id],
    );
  } catch (err) {
    bareColumnInferenceFails = err.code === '42P10';
  }
  ck(
    'ON CONFLICT (domain) is NOT inferable — the write path must not upsert on it',
    bareColumnInferenceFails,
    'a plain unique index on (domain) would also let a raced upsert move a domain between tenants',
  );

  // Test 10: the losing side of an ownership race is refused, not served.
  let raceRefused = false;
  try {
    await client.query(
      `insert into public.email_sending_domains (account_id, domain, status)
       values ($1, 'contractor-a.com', 'pending')`,
      [accB.id],
    );
  } catch (err) {
    raceRefused = err.code === '23505';
  }
  ck('A second account cannot insert a domain another account holds', raceRefused);

  // Test 7: Cascade on account deletion removes sending domain
  await client.query('delete from public.accounts where id = $1', [accA.id]);
  const { rowCount: remaining } = await client.query(
    'select 1 from public.email_sending_domains where account_id = $1',
    [accA.id],
  );
  ck('Account delete cascades and removes sending domains', remaining === 0);

} finally {
  if (client) await client.end();
  if (pgInstance) await pgInstance.stop();
  if (dataDir) {
    try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
  }
}

const failed = R.filter((c) => !c.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${R.length} checks failed.`);
  process.exit(1);
} else {
  console.log(`\nAll ${R.length} checks passed.`);
  process.exit(0);
}
