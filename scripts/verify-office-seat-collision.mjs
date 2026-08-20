/**
 * Run 20260816053000_office_seat_entitlement_gate.sql against a real PostgreSQL
 * 17, TOGETHER WITH the one-owner-per-user index that production actually has.
 *
 * WHY. Read separately, each is fine. Read together they cannot both hold:
 *
 *   - the office-seat RPC inserts `memberships.role = 'owner'`;
 *   - `memberships_one_owner_per_user_idx` is UNIQUE on (user_id) WHERE
 *     role = 'owner'.
 *
 * So an office invitation succeeds only for a person who owns no workspace at
 * all, and the moment it succeeds that person holds the ONLY owner row they are
 * allowed -- on their employer's workspace. `ensureAccountMembership` then reads
 * that row as "this user owns a business" and hands them the employer's
 * dashboard as their own, forever, with no way to ever own theirs.
 *
 * docs/office-seat-activation.md files this under "handle the constraint when an
 * invited person already owns another workspace", which reads as an edge case.
 * It is not an edge case. It is every case, in one of two directions.
 *
 * This script is the proof. Not part of the default suite. Exits 2 when it
 * cannot run.
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

const GATE = '20260816053000_office_seat_entitlement_gate.sql';
const ONE_OWNER = '2026-08-03-one-owner-account.sql';
const FIX_ENUM = '20260819090000_office_role_value.sql';
const FIX_ROLE = '20260819090100_office_seat_uses_office_role.sql';
const INVITES = '20260819210000_office_invitations.sql';
const CAPS = '20260819220000_office_capabilities.sql';
const REMOVE = '20260819230000_remove_office_user.sql';
const CREW_FIX = '20260819240000_office_invitation_crew_conflict.sql';
const SEAT_CAPACITY = '20260819250000_office_seat_limit_includes_purchased_capacity.sql';

/** Enough schema for the real migrations to install and run unmodified. */
const SCHEMA = `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end
$roles$;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
-- The real column type. It matters: 'office' has to be ADDED to an enum, which
-- is the constraint that forces the fix into two migrations.
create type public.member_role as enum ('owner', 'crew');
create table public.accounts (id uuid primary key default gen_random_uuid());
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null,
  role public.member_role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (account_id, user_id)
);
create table public.workspace_entitlements (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  feature_limits jsonb not null default '{}'::jsonb,
  entitlement_state text not null default 'active'
);
-- Supabase grants these to the authenticated role and relies on RLS to scope
-- them. The
-- guard trigger is the layer BEYOND RLS, so the grants have to be here or the
-- self-entry check passes for the wrong reason.
grant select, insert, update, delete on public.memberships to authenticated;
-- auth.uid() reads a session setting so the harness can act AS a given owner,
-- exactly as PostgREST would supply it.
create function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('lgq.actor', true), '')::uuid
$fn$;
-- Lifted from schema.sql. 63 RLS policies are built on this; the fix migration
-- must leave its meaning alone, and that is asserted below.
create or replace function public.is_owner(acc uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from memberships m
    where m.account_id = acc and m.user_id = auth.uid() and m.role = 'owner'
  );
$fn$;
`;

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-office-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, port: 55437, persistent: false });

const U = {
  founderA: '11111111-1111-4111-8111-111111111111',
  founderB: '22222222-2222-4222-8222-222222222222',
  // Someone with no workspace of their own -- a bookkeeper, an office manager.
  freshHire: '33333333-3333-4333-8333-333333333333',
  another: '44444444-4444-4444-8444-444444444444',
  founderC: '55555555-5555-4555-8555-555555555555',
  freshHire2: '66666666-6666-4666-8666-666666666666',
  secondOwner: '77777777-7777-4777-8777-777777777777',
};

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq');
  const db = pg.getPgClient('lgq');
  await db.connect();

  const q = (sql, params) => db.query(sql, params);
  /** Run and return the error message instead of throwing. */
  const fails = async (sql, params) => {
    try {
      await q(sql, params);
      return null;
    } catch (error) {
      return error.message ?? String(error);
    }
  };

  await q(SCHEMA);
  await q(m(ONE_OWNER));
  await q(m(GATE));
  ck('both migrations apply to one database', true);

  // Two real workspaces, each with a founder, each entitled to 3 office users.
  const { rows: [acctA] } = await q('insert into public.accounts default values returning id');
  const { rows: [acctB] } = await q('insert into public.accounts default values returning id');
  for (const [acct, founder] of [[acctA, U.founderA], [acctB, U.founderB]]) {
    await q('insert into public.memberships (account_id, user_id, role) values ($1, $2, $3)',
      [acct.id, founder, 'owner']);
    await q(`insert into public.workspace_entitlements (account_id, feature_limits)
             values ($1, '{"office_users": 3}'::jsonb)`, [acct.id]);
  }

  // Session-scoped rather than transaction-local: each statement below is its
  // own transaction, so a local setting would be gone by the next one.
  const actAs = (userId) => q(`select set_config('lgq.actor', $1, false)`, [userId]);
  const RPC = 'select public.create_office_user_membership_with_seat_entitlement($1, $2) as row';

  const invite = async (acct, actor, target) => {
    await actAs(actor);
    return q(RPC, [acct, target]);
  };
  const inviteFails = async (acct, actor, target) => {
    await actAs(actor);
    return fails(RPC, [acct, target]);
  };

  // ---------------------------------------------------------------------
  // 1. The seat accounting itself is sound. The finding below is NOT that it
  //    miscounts, which matters: the fix is a role change, not a rewrite.
  // ---------------------------------------------------------------------
  const forbidden = await inviteFails(acctA.id, U.founderB, U.freshHire);
  ck('an outsider cannot add office access to a workspace',
    /office_seat_forbidden/.test(forbidden ?? ''), forbidden);

  // ---------------------------------------------------------------------
  // 2. THE FINDING, direction one: the invitee already owns a workspace.
  //    Every contractor who is themselves a customer, every partner, every
  //    spouse who signed up to look around. The unique index rejects the
  //    insert; the RPC catches unique_violation and reports it as though the
  //    PERSON were unavailable.
  // ---------------------------------------------------------------------
  const ownerElsewhere = await inviteFails(acctA.id, U.founderA, U.founderB);
  ck('inviting someone who owns another workspace is IMPOSSIBLE, not merely gated',
    /office_user_target_unavailable/.test(ownerElsewhere ?? ''), ownerElsewhere);

  const { rows: [seatUse] } = await q(
    `select count(*)::int as n from public.memberships where account_id = $1 and role = 'owner'`,
    [acctA.id]);
  ck('...and it consumed no seat, so at least the refusal is clean', seatUse.n === 1, seatUse);

  // ---------------------------------------------------------------------
  // 3. THE FINDING, direction two: the invitee owns nothing. This SUCCEEDS,
  //    and that is the worse of the two outcomes.
  // ---------------------------------------------------------------------
  await invite(acctA.id, U.founderA, U.freshHire);
  const { rows: [hire] } = await q(
    `select account_id, role from public.memberships where user_id = $1`, [U.freshHire]);
  ck('inviting someone with no workspace succeeds', hire?.role === 'owner', hire);

  // This is the row ensureAccountMembership looks for. It cannot tell this
  // person from the founder: same table, same role, same workspace.
  const { rows: [distinct] } = await q(
    `select count(distinct role)::int as roles from public.memberships where account_id = $1`,
    [acctA.id]);
  ck('the office user is INDISTINGUISHABLE from the founder in the schema',
    distinct.roles === 1, distinct);

  // And now they can never own their own business: this is the same error a
  // brand-new signup hits on their very first page load.
  const ownTheirOwn = await fails(
    `with a as (insert into public.accounts default values returning id)
     insert into public.memberships (account_id, user_id, role)
     select a.id, $1, 'owner' from a`, [U.freshHire]);
  ck('the office user can now NEVER own a workspace of their own',
    /memberships_one_owner_per_user_idx|duplicate key/.test(ownTheirOwn ?? ''), ownTheirOwn);

  // ---------------------------------------------------------------------
  // 4. Seat limits still behave.
  // ---------------------------------------------------------------------
  await q(`update public.workspace_entitlements set feature_limits = '{"office_users": 2}'::jsonb
           where account_id = $1`, [acctA.id]);
  const capped = await inviteFails(acctA.id, U.founderA, U.another);
  ck('the seat limit is enforced at the boundary, counting the founder',
    /office_seat_limit_reached/.test(capped ?? ''), capped);

  const idem = await invite(acctA.id, U.founderA, U.freshHire);
  ck('re-inviting the same person is idempotent and buys no seat',
    idem.rows[0]?.row?.user_id === U.freshHire, idem.rows[0]?.row ?? null);

  // =====================================================================
  // THE FIX. Everything above is the state production is in today.
  // =====================================================================

  // Proving the split is necessary rather than cautious: the enum value cannot
  // be used by the transaction that adds it, so a single combined migration
  // would fail at apply time, on production, half-applied.
  const combined = await fails(
    `begin;
     alter type public.member_role add value if not exists 'trial_run';
     create index tmp_combined_idx on public.memberships (account_id) where role = 'trial_run';
     commit;`);
  ck('a COMBINED migration would fail: an enum value is unusable in its own transaction',
    /unsafe use of new value|is not yet committed/i.test(combined ?? ''), combined);
  await fails('rollback');

  // The second file refuses to run before the first, rather than half-moving.
  const outOfOrder = await fails(m(FIX_ROLE));
  ck('the fix refuses to apply out of order',
    /Apply 20260819090000/.test(outOfOrder ?? ''), outOfOrder);
  // Its own `begin` is still open and aborted -- which is the point: it changed
  // nothing on the way to refusing.
  await fails('rollback');

  await q(m(FIX_ENUM));
  await q(m(FIX_ROLE));
  ck('both fix migrations apply, in order', true);

  // A clean workspace, so what follows is the new behaviour and not old drift.
  const { rows: [acctC] } = await q('insert into public.accounts default values returning id');
  await q('insert into public.memberships (account_id, user_id, role) values ($1, $2, $3)',
    [acctC.id, U.founderC, 'owner']);
  await q(`insert into public.workspace_entitlements (account_id, feature_limits)
           values ($1, '{"office_users": 3}'::jsonb)`, [acctC.id]);

  // ---------------------------------------------------------------------
  // 5. The collision is gone in BOTH directions.
  // ---------------------------------------------------------------------
  const nowOk = await invite(acctC.id, U.founderC, U.founderB);
  ck('inviting someone who owns another workspace now SUCCEEDS',
    nowOk.rows[0]?.row?.role === 'office', nowOk.rows[0]?.row ?? null);

  const { rows: [stillOwns] } = await q(
    `select count(*)::int as n from public.memberships
     where user_id = $1 and role = 'owner'`, [U.founderB]);
  ck('...and they still own their own workspace, exactly one', stillOwns.n === 1, stillOwns);

  await invite(acctC.id, U.founderC, U.freshHire2);
  const { rows: [canOwn] } = await q(
    `with a as (insert into public.accounts default values returning id)
     insert into public.memberships (account_id, user_id, role)
     select a.id, $1, 'owner' from a returning id`, [U.freshHire2]);
  ck('an office user with no workspace can still go on to own one', Boolean(canOwn?.id), canOwn);

  // ---------------------------------------------------------------------
  // 6. Fail closed: an office user gains no authority from this migration.
  // ---------------------------------------------------------------------
  await actAs(U.freshHire2);
  const { rows: [perms] } = await q(
    `select public.is_owner($1) as owner,
            public.is_office($1) as office,
            public.has_office_access($1) as access`, [acctC.id]);
  ck('is_owner() still means owner exactly, so all 63 policies are unmoved',
    perms.owner === false, perms);
  ck('the office user is recognised as one, and by the superset predicate',
    perms.office === true && perms.access === true, perms);

  await actAs(U.founderC);
  const { rows: [ownerPerms] } = await q(
    `select public.is_owner($1) as owner, public.has_office_access($1) as access`, [acctC.id]);
  ck('the founder is both an owner and an office user', ownerPerms.owner && ownerPerms.access, ownerPerms);

  // ---------------------------------------------------------------------
  // 7. Seats: office rows are counted, and the browser still cannot self-enter.
  // ---------------------------------------------------------------------
  const cappedNow = await inviteFails(acctC.id, U.founderC, U.another);
  ck('office rows consume seats alongside the founder',
    /office_seat_limit_reached/.test(cappedNow ?? ''), cappedNow);

  // LOCAL needs a transaction, or this runs as superuser and proves nothing:
  // the guard only fires for anon/authenticated.
  await q('begin');
  await q('set local role authenticated');
  const selfEntry = await fails(
    `insert into public.memberships (account_id, user_id, role) values ($1, $2, 'office')`,
    [acctC.id, U.another]);
  await fails('rollback');
  ck('a browser client cannot insert itself an office row',
    /office_seat_entry_requires_entitlement_gate/.test(selfEntry ?? ''), selfEntry);

  // ---------------------------------------------------------------------
  // 8. Last-owner protection.
  // ---------------------------------------------------------------------
  const { rows: [officeRow] } = await q(
    `select id from public.memberships where account_id = $1 and role = 'office' limit 1`,
    [acctC.id]);
  const dropOffice = await fails('delete from public.memberships where id = $1', [officeRow.id]);
  ck('removing an office user is allowed', dropOffice === null, dropOffice);

  const { rows: [ownerRow] } = await q(
    `select id from public.memberships where account_id = $1 and role = 'owner' limit 1`,
    [acctC.id]);
  const dropOwner = await fails('delete from public.memberships where id = $1', [ownerRow.id]);
  ck('removing the LAST owner is refused',
    /workspace_requires_one_owner/.test(dropOwner ?? ''), dropOwner);

  const demote = await fails(
    `update public.memberships set role = 'office' where id = $1`, [ownerRow.id]);
  ck('demoting the last owner is refused too, not just deleting them',
    /workspace_requires_one_owner/.test(demote ?? ''), demote);

  // Two owners: either may leave, because one remains.
  await q('insert into public.memberships (account_id, user_id, role) values ($1, $2, $3)',
    [acctC.id, U.secondOwner, 'owner']);
  const dropOne = await fails('delete from public.memberships where id = $1', [ownerRow.id]);
  ck('an owner may leave while another remains', dropOne === null, dropOne);

  // Closing the business is not abandoning it. The cascade must pass through.
  const closeShop = await fails('delete from public.accounts where id = $1', [acctC.id]);
  ck('deleting the WORKSPACE still cascades, owners and all', closeShop === null, closeShop);


  // =====================================================================
  // INVITATIONS. The activation path the foundation said had to exist.
  // =====================================================================
  await q(m(INVITES));
  ck('the invitations migration applies, post-conditions and all', true);

  // A FRESH workspace. acctC was deleted by the last-owner section above -- it
  // ends by cascading the whole account away to prove closing a business still
  // works -- so every invitation below would have been made against nothing.
  const OWNER_D = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const { rows: [acctD] } = await q('insert into public.accounts default values returning id');
  await q('insert into public.memberships (account_id, user_id, role) values ($1, $2, $3)',
    [acctD.id, OWNER_D, 'owner']);
  await q(`insert into public.workspace_entitlements (account_id, feature_limits)
           values ($1, '{"office_users": 8}'::jsonb)`, [acctD.id]);

  const HIRE = '88888888-8888-4888-8888-888888888888';
  const STRANGER = '99999999-9999-4999-8999-999999999999';
  await q(`insert into auth.users (id, email) values
             ($1, 'ownerd@acme.test'), ($2, 'bookkeeper@acme.test'), ($3, 'nobody@else.test')`,
    [OWNER_D, HIRE, STRANGER]);

  /** A 64-hex stand-in for sha256(token). The real token is never stored. */
  const hash = (seed) => (seed + 'abcdef0123456789'.repeat(8)).slice(0, 64);

  const sendInvite = async (actor, account, email, token, days = 7) => {
    await actAs(actor);
    return fails(
      `select public.create_office_invitation($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [account, email, token, String(days)]);
  };
  const accept = async (user, token) => {
    await actAs(user);
    return fails('select public.accept_office_invitation($1)', [token]);
  };
  const setLimit = (n) => q(
    `update public.workspace_entitlements set feature_limits = $2::jsonb where account_id = $1`,
    [acctD.id, JSON.stringify({ office_users: n })]);

  await setLimit(8);

  ck('an outsider cannot invite anybody',
    /office_seat_forbidden/.test(
      await sendInvite(STRANGER, acctD.id, 'bookkeeper@acme.test', hash('a1')) ?? ''));

  const inviteErr = await sendInvite(OWNER_D, acctD.id, 'BookKeeper@Acme.test', hash('b2'));
  ck('an owner can invite', inviteErr === null, inviteErr);

  ck('the address is stored lowercased, so one person cannot be invited twice',
    (await q('select email from public.office_invitations where account_id = $1', [acctD.id]))
      .rows[0].email === 'bookkeeper@acme.test');

  ck('the token is stored only as a hash',
    (await q('select token_sha256 from public.office_invitations limit 1')).rows[0].token_sha256
      === hash('b2'));

  const before = (await q('select token_sha256, send_count from public.office_invitations')).rows[0];
  await sendInvite(OWNER_D, acctD.id, 'bookkeeper@acme.test', hash('c3'));
  const after = (await q('select token_sha256, send_count from public.office_invitations')).rows[0];
  ck('a resend reuses the row, bumps the count and replaces the token',
    after.send_count === 2 && after.token_sha256 !== before.token_sha256, after);
  ck('the superseded link no longer works',
    /not_found/.test(await accept(HIRE, hash('b2')) ?? ''));

  ck('a forwarded link does not admit whoever opened it',
    /wrong_recipient/.test(await accept(STRANGER, hash('c3')) ?? ''));

  ck('the addressee can accept', (await accept(HIRE, hash('c3'))) === null);
  ck('...and becomes an office user, not an owner',
    (await q('select role from public.memberships where user_id = $1', [HIRE])).rows[0].role === 'office');
  ck('...and the invitation is spent',
    (await q('select accepted_user_id from public.office_invitations where token_sha256 = $1',
      [hash('c3')])).rows[0].accepted_user_id === HIRE);
  ck('a spent invitation cannot be used again',
    /not_found/.test(await accept(HIRE, hash('c3')) ?? ''));

  // The seat check that decides.
  const counted = async () => Number((await q(
    `select count(*)::int as n from public.memberships
      where account_id = $1 and role in ('owner','office')`, [acctD.id])).rows[0].n);
  await setLimit(await counted());
  ck('inviting into a full workspace is refused up front',
    /office_seat_limit_reached/.test(
      await sendInvite(OWNER_D, acctD.id, 'later@acme.test', hash('d4')) ?? ''));

  // Invited while there was room, accepted after somebody took the last seat --
  // the case the courtesy check at invite time cannot cover.
  await setLimit((await counted()) + 1);
  await q("insert into auth.users (id, email) values ($1, 'late@acme.test')", [U.another]);
  await sendInvite(OWNER_D, acctD.id, 'late@acme.test', hash('e5'));
  await setLimit(await counted());
  ck('accepting after the last seat went is refused, not squeezed in',
    /office_seat_limit_reached/.test(await accept(U.another, hash('e5')) ?? ''));

  // Revocation, and what it deliberately does not do.
  await setLimit(20);
  await sendInvite(OWNER_D, acctD.id, 'gone@acme.test', hash('f6'));
  const pending = (await q(
    "select id from public.office_invitations where email = 'gone@acme.test'")).rows[0];
  await actAs(OWNER_D);
  ck('an owner can revoke a pending invitation',
    (await q('select public.revoke_office_invitation($1) as ok', [pending.id])).rows[0].ok === true);
  ck('...and the link stops working',
    /not_found/.test(await accept(STRANGER, hash('f6')) ?? ''));
  await actAs(OWNER_D);
  ck('revoking twice reports nothing further to do',
    (await q('select public.revoke_office_invitation($1) as ok', [pending.id])).rows[0].ok === false);

  const acceptedRow = (await q(
    'select id from public.office_invitations where accepted_at is not null limit 1')).rows[0];
  await actAs(OWNER_D);
  ck('revoking an ACCEPTED invitation does nothing; removing a person is a different act',
    (await q('select public.revoke_office_invitation($1) as ok', [acceptedRow.id])).rows[0].ok === false);
  ck('...and the membership it created still stands',
    Number((await q('select count(*)::int as n from public.memberships where user_id = $1', [HIRE]))
      .rows[0].n) === 1);

  for (const role of ['anon', 'authenticated']) {
    const w = (await q(
      `select has_table_privilege($1, 'public.office_invitations', 'INSERT') as ins,
              has_table_privilege($1, 'public.office_invitations', 'UPDATE') as upd,
              has_table_privilege($1, 'public.office_invitations', 'TRUNCATE') as trunc`,
      [role])).rows[0];
    ck(`${role} cannot write invitations`, !w.ins && !w.upd && !w.trunc, w);
  }
  ck('the original seat RPC is still reachable by nobody',
    Number((await q(`select count(*)::int as n from pg_proc p
                     cross join lateral aclexplode(coalesce(p.proacl,'{}'::aclitem[])) x
                     where p.proname = 'create_office_user_membership_with_seat_entitlement'
                       and x.privilege_type = 'EXECUTE' and x.grantee <> p.proowner`)).rows[0].n) === 0);


  // =====================================================================
  // CAPABILITIES. The switch, shipped off and wired to nothing.
  // =====================================================================
  await q(m(CAPS));
  ck('the capabilities migration applies, post-conditions and all', true);

  const capCount = Number((await q(
    'select count(*)::int as n from public.office_capabilities')).rows[0].n);
  ck('the catalog is seeded', capCount === 25, capCount);

  ck('every switch ships off, which is the point of the whole migration',
    Number((await q(
      'select count(*)::int as n from public.office_capabilities where enabled')).rows[0].n) === 0);

  // The office user from the invitation section is a real subject to test with.
  await actAs(HIRE);
  ck('an office user can do nothing while every switch is off',
    (await q('select public.office_can($1, $2) as ok', [acctD.id, 'jobs.read'])).rows[0].ok === false);

  await actAs(OWNER_D);
  ck('an owner passes anyway, so swapping a policy cannot close a surface for them',
    (await q('select public.office_can($1, $2) as ok', [acctD.id, 'jobs.read'])).rows[0].ok === true);
  ck('...including a capability nobody has ever defined',
    (await q('select public.office_can($1, $2) as ok', [acctD.id, 'not.acapability'])).rows[0].ok === true);

  // Flip one, and only that one moves.
  await q("update public.office_capabilities set enabled = true where capability = 'jobs.read'");
  await actAs(HIRE);
  ck('flipping one switch grants exactly that capability',
    (await q('select public.office_can($1, $2) as ok', [acctD.id, 'jobs.read'])).rows[0].ok === true);
  ck('...and nothing else',
    (await q('select public.office_can($1, $2) as ok', [acctD.id, 'jobs.write'])).rows[0].ok === false);

  // Scope: a switch is global, but the MEMBERSHIP is not.
  ck('an office user of one workspace gains nothing in another',
    (await q('select public.office_can($1, $2) as ok', [acctA.id, 'jobs.read'])).rows[0].ok === false);

  await actAs(STRANGER);
  ck('somebody with no membership gains nothing from an enabled capability',
    (await q('select public.office_can($1, $2) as ok', [acctD.id, 'jobs.read'])).rows[0].ok === false);

  // Re-running must not undo a deliberate change in either direction.
  await q(m(CAPS));
  ck('re-applying the migration leaves a deliberately-enabled switch alone',
    (await q(`select enabled from public.office_capabilities where capability = 'jobs.read'`))
      .rows[0].enabled === true);
  await q("update public.office_capabilities set enabled = false where capability = 'jobs.read'");

  // Reach.
  for (const role of ['anon', 'authenticated']) {
    const w = (await q(
      `select has_table_privilege($1, 'public.office_capabilities', 'UPDATE') as upd,
              has_table_privilege($1, 'public.office_capabilities', 'INSERT') as ins,
              has_table_privilege($1, 'public.office_capabilities', 'TRUNCATE') as trunc`,
      [role])).rows[0];
    ck(`${role} cannot change what an office user may do`, !w.upd && !w.ins && !w.trunc, w);
  }
  ck('but a signed-in session can READ the list, so a team screen can render it',
    (await q(`select has_table_privilege('authenticated', 'public.office_capabilities', 'SELECT') as ok`))
      .rows[0].ok === true);

  ck('no policy in the database uses office_can yet',
    Number((await q(`select count(*)::int as n from pg_policy p
                     where pg_get_expr(p.polqual, p.polrelid) like '%office_can%'
                        or pg_get_expr(p.polwithcheck, p.polrelid) like '%office_can%'`))
      .rows[0].n) === 0);


  // =====================================================================
  // REMOVAL. Taking access away, and refusing to take the wrong thing.
  // =====================================================================
  await q(m(REMOVE));
  ck('the removal migration applies, post-conditions and all', true);

  const remove = async (actor, account, target) => {
    await actAs(actor);
    return fails('select public.remove_office_user($1, $2) as ok', [account, target]);
  };

  ck('an outsider cannot remove anybody',
    /office_seat_forbidden/.test(await remove(STRANGER, acctD.id, HIRE) ?? ''));

  await actAs(OWNER_D);
  ck('an owner can remove an office user',
    (await q('select public.remove_office_user($1, $2) as ok', [acctD.id, HIRE])).rows[0].ok === true);
  ck('...and the membership is gone',
    Number((await q('select count(*)::int as n from public.memberships where user_id = $1', [HIRE]))
      .rows[0].n) === 0);

  await actAs(OWNER_D);
  ck('removing somebody already gone reports false rather than raising',
    (await q('select public.remove_office_user($1, $2) as ok', [acctD.id, HIRE])).rows[0].ok === false);

  // The seat is freed immediately, because seat counting reads memberships.
  const freed = Number((await q(
    `select count(*)::int as n from public.memberships
      where account_id = $1 and role in ('owner','office')`, [acctD.id])).rows[0].n);
  ck('the seat is free the moment the row goes', freed >= 1, freed);

  // An OWNER is refused here, whatever the caller intended.
  ck('an owner cannot be removed through the office-removal path',
    /office_removal_wrong_role/.test(await remove(OWNER_D, acctD.id, OWNER_D) ?? ''));
  ck('...and is still there',
    Number((await q(
      `select count(*)::int as n from public.memberships
        where account_id = $1 and user_id = $2 and role = 'owner'`, [acctD.id, OWNER_D]))
      .rows[0].n) === 1);

  ck('anon cannot call it',
    (await q(`select has_function_privilege('anon',
       'public.remove_office_user(uuid,uuid)', 'EXECUTE') as ok`)).rows[0].ok === false);


  // =====================================================================
  // A CREW MEMBER INVITED TO THE OFFICE.
  // =====================================================================
  const FIELD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await q("insert into auth.users (id, email) values ($1, 'installer@acme.test')", [FIELD]);
  await q("insert into public.memberships (account_id, user_id, role) values ($1, $2, 'crew')",
    [acctD.id, FIELD]);

  // Before the fix, this SUCCEEDED -- and the failure surfaced only when the
  // invitee clicked, because memberships is unique on (account_id, user_id).
  const beforeFix = await sendInvite(OWNER_D, acctD.id, 'installer@acme.test', hash('c7'));
  ck('the bug is real: inviting a crew member used to be accepted', beforeFix === null, beforeFix);

  await q(m(CREW_FIX));
  ck('the crew-conflict fix applies, post-conditions and all', true);

  // Clear the invitation the bug allowed, so the refusal below is about the
  // crew membership rather than about a pending row.
  await q("delete from public.office_invitations where email = 'installer@acme.test'");

  const crewInvite = await sendInvite(OWNER_D, acctD.id, 'installer@acme.test', hash('c8'));
  ck('inviting a crew member is now REFUSED at invite time, not at acceptance',
    /office_invitation_is_crew/.test(crewInvite ?? ''), crewInvite);

  ck('an owner or office member still gets the plain already-a-member answer',
    /office_invitation_already_a_member/.test(
      await sendInvite(OWNER_D, acctD.id, 'ownerd@acme.test', hash('c9')) ?? ''));

  // Somebody genuinely new is still invitable: the widened check must not have
  // turned every invitation into a refusal.
  const NEWCOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await q("insert into auth.users (id, email) values ($1, 'newcomer@acme.test')", [NEWCOMER]);
  ck('somebody with no membership can still be invited',
    (await sendInvite(OWNER_D, acctD.id, 'newcomer@acme.test', hash('ca'))) === null);

  // And if one somehow exists, accepting still cannot half-promote them.
  ck('the crew membership is untouched by the attempt',
    (await q('select role from public.memberships where user_id = $1', [FIELD])).rows[0].role === 'crew');


  // =====================================================================
  // A PURCHASED OFFICE SEAT MUST ACTUALLY BE A SEAT.
  // =====================================================================
  // The capacity ledger and the helper the crew gate already uses. Lifted in
  // shape rather than imported, because the real table reaches billing_events.
  await q(`
    create table public.workspace_purchased_capacity (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id),
      resource_code text not null,
      units bigint not null check (units > 0),
      status text not null default 'active' check (status in ('active','past_due','canceled'))
    );
    create or replace function public.workspace_purchased_capacity_units(
      p_account_id uuid, p_resource_code text
    ) returns bigint language sql stable security definer set search_path = '' as $cap$
      select coalesce(pg_catalog.sum(c.units), 0)::bigint
        from public.workspace_purchased_capacity c
       where c.account_id = p_account_id
         and c.resource_code = p_resource_code
         and c.status in ('active', 'past_due');
    $cap$;
  `);

  // Fill the workspace to exactly its plan limit.
  const seatCount = async () => Number((await q(
    `select count(*)::int as n from public.memberships
      where account_id = $1 and role in ('owner','office')`, [acctD.id])).rows[0].n);
  await setLimit(await seatCount());

  const beforeCapacity = await sendInvite(OWNER_D, acctD.id, 'extra@acme.test', hash('d1'));
  ck('a full workspace refuses, as it should',
    /office_seat_limit_reached/.test(beforeCapacity ?? ''), beforeCapacity);

  // Buy a seat. Before the fix this changed NOTHING -- money taken, no seat.
  await q(`insert into public.workspace_purchased_capacity
             (account_id, resource_code, units) values ($1, 'office_users', 1)`, [acctD.id]);
  const stillRefused = await sendInvite(OWNER_D, acctD.id, 'extra@acme.test', hash('d2'));
  ck('the bug is real: a purchased seat raised nothing',
    /office_seat_limit_reached/.test(stillRefused ?? ''), stillRefused);

  await q(m(SEAT_CAPACITY));
  ck('the seat-capacity migration applies, post-conditions and all', true);

  await q("insert into auth.users (id, email) values ($1, 'extra@acme.test')",
    ['dddddddd-dddd-4ddd-8ddd-dddddddddddd']);
  const afterCapacity = await sendInvite(OWNER_D, acctD.id, 'extra@acme.test', hash('d3'));
  ck('a purchased seat now raises the limit', afterCapacity === null, afterCapacity);

  // past_due still counts -- a card that failed this morning must not lock
  // somebody out while Stripe is still retrying.
  await q("update public.workspace_purchased_capacity set status = 'past_due'");
  await q("delete from public.office_invitations where email = 'extra@acme.test'");
  ck('a past-due seat still counts, matching the crew gate',
    (await sendInvite(OWNER_D, acctD.id, 'extra@acme.test', hash('d4'))) === null);

  // Canceled does not.
  await q("update public.workspace_purchased_capacity set status = 'canceled'");
  await q("delete from public.office_invitations where email = 'extra@acme.test'");
  ck('a canceled seat stops counting',
    /office_seat_limit_reached/.test(
      await sendInvite(OWNER_D, acctD.id, 'extra@acme.test', hash('d5')) ?? ''));

  // Re-running must not double-count.
  await q("update public.workspace_purchased_capacity set status = 'active'");
  await q(m(SEAT_CAPACITY));
  const usage = (await q('select * from public.office_seat_usage($1)', [acctD.id])).rows[0];
  ck('re-applying does not add the capacity twice',
    Number(usage.office_limit) === (await seatCount()) + 1, usage);

  await db.end();
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
console.log(`\n${R.length - failed}/${R.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
