/**
 * Prove 20260820240000 grants an office user reads and NOT writes, on real
 * PostgreSQL 17, with real row-level security doing the deciding.
 *
 * WHY THIS CANNOT BE VERIFIED IN PRODUCTION. `memberships` holds six rows and
 * every one is an owner: there is no office user anywhere to read as. So the one
 * migration that actually widens who can see a contractor's customer list is the
 * one whose effect production cannot demonstrate. That is exactly backwards, and
 * this script is the answer -- it builds the situation that does not exist yet
 * and asks the database what happens.
 *
 * WHAT A MIGRATION POST-CONDITION CANNOT TELL YOU. It can assert that
 * `lead_owner_read` is `for select` and mentions `office_can(account_id,
 * 'leads.read')`. It cannot assert what a session can actually SEE, because that
 * is decided by every policy on the table at once -- permissive policies OR
 * together, and `..._owner_write` is `for all`, so it governs select too. The
 * whole design rests on that OR producing reads for an office user and writes
 * for nobody but the owner, and only a live query can show it does.
 *
 * The four things checked, in the order they would go wrong:
 *
 *   1. An owner is unaffected. `office_can` admits an owner unconditionally, and
 *      if that ever stopped being true, swapping a tenant predicate would close
 *      the business's own surface.
 *   2. An office user reads their employer's rows -- the grant works at all.
 *   3. An office user CANNOT insert, update or delete. The write policy is still
 *      owner-only and `for all`; if the split had left the read policy `for all`
 *      instead, this is where deletes under a capability named "read" appear.
 *   4. Turning the capability off takes the reads away again, and an office user
 *      of a DIFFERENT account never sees anything. The tenant boundary is a
 *      separate question from the capability, and both must hold.
 *
 * Not part of the default suite -- it boots a database. Exits 2 when it cannot
 * run, 1 on a failed check.
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

const SPLIT = '20260820230000_split_core_work_policies.sql';
const SWAP = '20260820240000_office_can_read_core_work.sql';

/**
 * Enough schema for both migrations to install and run unmodified.
 *
 * `office_capabilities` and `office_can` are recreated here rather than lifted
 * from 20260819220000, because that migration also asserts no policy references
 * office_can -- which is true when it runs in sequence and false here, where the
 * point is to run the swap against it. The DEFINITIONS are copied verbatim so
 * the thing under test is the real predicate.
 */
const SCHEMA = `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end
$roles$;
create table public.accounts (id uuid primary key);
create type public.member_role as enum ('owner', 'crew', 'office');
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null,
  role public.member_role not null default 'owner',
  unique (account_id, user_id)
);
create function auth_uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('lgq.actor', true), '')::uuid
$fn$;
create function public.is_owner(acc uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from memberships m
    where m.account_id = acc and m.user_id = auth_uid() and m.role = 'owner');
$fn$;
create function public.is_office(acc uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from memberships m
    where m.account_id = acc and m.user_id = auth_uid() and m.role = 'office');
$fn$;
create table public.office_capabilities (
  capability text primary key,
  enabled boolean not null default false,
  grants text not null default '',
  band text not null default 'work'
);
create function public.office_can(acc uuid, p_capability text) returns boolean
language sql stable security definer set search_path = public as $can$
  select public.is_owner(acc)
    or (public.is_office(acc)
        and exists (select 1 from public.office_capabilities c
                     where c.capability = p_capability and c.enabled));
$can$;
insert into public.office_capabilities (capability, enabled) values
  ('leads.read', true), ('clients.read', true), ('jobs.read', true);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text
);
alter table public.leads enable row level security;
alter table public.clients enable row level security;
alter table public.jobs enable row level security;
grant select, insert, update, delete on public.leads, public.clients, public.jobs to authenticated;
-- The combined policies as production had them before the split.
create policy lead_all on public.leads for all using (public.is_owner(account_id));
create policy clients_all on public.clients for all using (public.is_owner(account_id));
create policy job_owner on public.jobs for all using (public.is_owner(account_id));
-- The crew policy the split must not drop. crew_on_job is stubbed false: its
-- behaviour is not what is under test, its survival is.
create function public.crew_on_job(j uuid) returns boolean language sql stable as $fn$ select false $fn$;
create policy job_crew_read on public.jobs for select using (public.crew_on_job(id));
`;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

const ACCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const OFFICE_A = '33333333-3333-4333-8333-333333333333';
const OFFICE_B = '44444444-4444-4444-8444-444444444444';

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-officeread-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, port: 55441, persistent: false });

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq');
  const db = pg.getPgClient('lgq');
  await db.connect();

  const q = (sql, params) => db.query(sql, params);

  /** Run as a given user, through the authenticated role, as PostgREST would. */
  const as = async (userId, sql, params) => {
    await q('begin');
    try {
      await q('set local role authenticated');
      await q('select set_config($1,$2,true)', ['lgq.actor', userId]);
      return await q(sql, params);
    } finally {
      await q('rollback');
    }
  };
  /** Same, but returns the error message rather than throwing. */
  const asFails = async (userId, sql, params) => {
    try {
      const r = await as(userId, sql, params);
      return { blocked: false, rowCount: r.rowCount };
    } catch (error) {
      return { blocked: true, message: error.message };
    }
  };

  await q(SCHEMA);
  await q('insert into public.accounts (id) values ($1), ($2)', [ACCT_A, ACCT_B]);
  await q(`insert into public.memberships (account_id, user_id, role) values
    ($1,$2,'owner'), ($3,$4,'owner'), ($1,$5,'office'), ($3,$6,'office')`,
  [ACCT_A, OWNER_A, ACCT_B, OWNER_B, OFFICE_A, OFFICE_B]);
  await q(`insert into public.leads (account_id, name) values ($1,'A1'), ($1,'A2'), ($2,'B1')`, [ACCT_A, ACCT_B]);
  await q(`insert into public.clients (account_id, name) values ($1,'A1'), ($2,'B1'), ($2,'B2')`, [ACCT_A, ACCT_B]);
  await q(`insert into public.jobs (account_id, title) values ($1,'A1'), ($2,'B1')`, [ACCT_A, ACCT_B]);

  // ---- before the swap: an office user sees nothing --------------------------
  await q(m(SPLIT));
  const beforeOffice = await as(OFFICE_A, 'select count(*)::int n from public.leads');
  check('before the swap, an office user sees no leads',
    beforeOffice.rows[0].n === 0, `saw ${beforeOffice.rows[0].n}`);
  const beforeOwner = await as(OWNER_A, 'select count(*)::int n from public.leads');
  check('the split alone left the owner seeing all their own leads',
    beforeOwner.rows[0].n === 2, `saw ${beforeOwner.rows[0].n} of 2`);

  // ---- the migration under test ---------------------------------------------
  await q(m(SWAP));

  for (const [table, own, other] of [['leads', 2, 1], ['clients', 1, 2], ['jobs', 1, 1]]) {
    const ownerSees = await as(OWNER_A, `select count(*)::int n from public.${table}`);
    check(`${table}: the owner still sees exactly their own`,
      ownerSees.rows[0].n === own, `saw ${ownerSees.rows[0].n} of ${own}`);

    const officeSees = await as(OFFICE_A, `select count(*)::int n from public.${table}`);
    check(`${table}: the office user now reads their employer's`,
      officeSees.rows[0].n === own, `saw ${officeSees.rows[0].n} of ${own}`);

    const neighbour = await as(OFFICE_B, `select count(*)::int n from public.${table} where account_id = $1`, [ACCT_A]);
    check(`${table}: an office user of another account sees none of A's`,
      neighbour.rows[0].n === 0, `saw ${neighbour.rows[0].n}, and account B holds ${other}`);
  }

  // ---- reads only. This is the assertion the split exists for -----------------
  const ins = await asFails(OFFICE_A,
    'insert into public.leads (account_id, name) values ($1, $2)', [ACCT_A, 'sneaked in']);
  check('an office user cannot INSERT a lead', ins.blocked, ins.blocked ? ins.message.split('\n')[0] : 'the insert succeeded');

  const upd = await as(OFFICE_A, `update public.leads set name = 'changed' where account_id = $1`, [ACCT_A]);
  check('an office user UPDATEs no rows', upd.rowCount === 0, `updated ${upd.rowCount}`);

  const del = await as(OFFICE_A, 'delete from public.leads where account_id = $1', [ACCT_A]);
  check('an office user DELETEs no rows -- the whole point of splitting the policy',
    del.rowCount === 0, `deleted ${del.rowCount}`);

  // An owner must still be able to do all three, or the swap closed the
  // business's own surface while opening the employee's.
  const ownerIns = await asFails(OWNER_A,
    'insert into public.leads (account_id, name) values ($1,$2)', [ACCT_A, 'owner row']);
  check('the owner can still INSERT', !ownerIns.blocked, ownerIns.message ?? 'ok');
  const ownerDel = await as(OWNER_A, 'delete from public.leads where account_id = $1', [ACCT_A]);
  check('the owner can still DELETE', ownerDel.rowCount === 2, `deleted ${ownerDel.rowCount} of 2`);

  // ---- the switch is load-bearing -------------------------------------------
  await q(`update public.office_capabilities set enabled = false where capability = 'leads.read'`);
  const revoked = await as(OFFICE_A, 'select count(*)::int n from public.leads');
  check('turning the capability off takes the reads away again',
    revoked.rows[0].n === 0, `still saw ${revoked.rows[0].n}`);
  const stillClients = await as(OFFICE_A, 'select count(*)::int n from public.clients');
  check('and takes away only that one -- clients still readable',
    stillClients.rows[0].n === 1, `saw ${stillClients.rows[0].n} of 1`);
  // Pinned to the real number, not to "some number". Every write above ran
  // inside a rolled-back transaction, so account A still holds its original two
  // leads -- and an assertion like `n >= 0` would pass no matter what the
  // capability did to the owner, which is the failure it exists to catch.
  const ownerUnaffected = await as(OWNER_A, 'select count(*)::int n from public.leads');
  check('the owner reads leads with the capability OFF -- office_can admits an owner unconditionally',
    ownerUnaffected.rows[0].n === 2, `saw ${ownerUnaffected.rows[0].n} of 2`);
  await q(`update public.office_capabilities set enabled = true where capability = 'leads.read'`);
  await db.end();
} catch (error) {
  console.error('\nHarness error:', error.message);
  process.exitCode = 2;
} finally {
  try { await pg.stop(); } catch { /* already down */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* windows lock */ }
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -- ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed > 0) process.exitCode = 1;
