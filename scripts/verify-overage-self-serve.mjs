/**
 * Run 20260822100000_overage_self_serve_authorization.sql against a real
 * PostgreSQL 17, on top of the rail it opens up.
 *
 * This function is the ONLY writable door into a table whose whole purpose is
 * to make "nobody is charged without approval and a cap" provable. So the
 * assertions are about the door, not the arithmetic:
 *
 *  - Only the owner may open it. Not an office user, not a member, not an
 *    anonymous session. It is `security definer`, which means it runs PAST RLS
 *    by construction -- the check inside it is the only check there is.
 *  - The audit trail says what HAPPENED, not what the caller claimed. A caller
 *    that could label a first-time enable as 'cap_changed' could write false
 *    history through a function that otherwise behaves perfectly.
 *  - Re-saving an unchanged form writes no evidence. An audit trail that grows
 *    a row every page load is one nobody can read.
 *  - And the thing that made this migration bigger than one function: a
 *    workspace that uses the switch must still be DELETABLE.
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

const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');
const RAIL = '20260819080000_usage_overage_authorization.sql';
const DOOR = '20260822100000_overage_self_serve_authorization.sql';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OFFICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHA = 'a'.repeat(64);
const TERMS = 'overage-2026-08-22';
const P0 = '2026-08-01T00:00:00Z';
const P1 = '2026-09-01T00:00:00Z';
const TEXT = 4800; // 4.8c a segment

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-overage-door-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_OVERAGE_DOOR_PORT || 54341),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_overage_door');
  c = pg.getPgClient('lgq_overage_door');
  await c.connect();

  await c.query(`
    create schema if not exists auth;
    create table public.accounts (id uuid primary key);
    create table public.memberships (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id) on delete cascade,
      user_id uuid not null,
      role text not null
    );
    -- Reads a session setting so the harness can act AS a given user, exactly
    -- as PostgREST supplies it.
    create function auth.uid() returns uuid language sql stable as $fn$
      select nullif(current_setting('lgq.actor', true), '')::uuid
    $fn$;
    create or replace function public.is_owner(acc uuid)
    returns boolean language sql stable security definer set search_path = public as $fn$
      select exists (
        select 1 from memberships m
        where m.account_id = acc and m.user_id = auth.uid() and m.role = 'owner'
      );
    $fn$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
  `);
  await c.query('insert into public.accounts (id) values ($1), ($2)', [ACCOUNT, OTHER]);
  await c.query(
    `insert into public.memberships (account_id, user_id, role) values
       ($1, $2, 'owner'), ($1, $3, 'office'), ($4, $5, 'owner')`,
    [ACCOUNT, OWNER, OFFICE, OTHER, STRANGER],
  );

  await c.query(m(RAIL));
  await c.query(m(DOOR));
  ck('migration applies on a real engine', true);
  await c.query(m(DOOR));
  ck('migration re-applies as a no-op', true);

  const actAs = async (user) => c.query('select set_config($1, $2, false)', ['lgq.actor', user ?? '']);
  const set = async (account, enabled, cap, terms = TERMS, sha = SHA) => (await c.query(
    'select public.set_workspace_overage_authorization($1, $2, $3, $4, $5) as out',
    [account, enabled, cap, terms, sha],
  )).rows[0].out;
  const refused = async (fn) => {
    try { await fn(); return null; } catch (err) { return err.message; }
  };
  const evidence = async (account = ACCOUNT) => (await c.query(
    `select action, cap_cents, authorized_by, terms_version from public.workspace_overage_authorizations
      where account_id = $1 order by authorized_at, action`, [account])).rows;
  const settings = async (account = ACCOUNT) => (await c.query(
    'select * from public.workspace_overage_settings where account_id = $1', [account])).rows[0] ?? null;

  // --- Who may open the door ---
  await actAs(null);
  ck('an anonymous session is refused',
    (await refused(() => set(ACCOUNT, true, 5000)))?.includes('overage_forbidden'));

  await actAs(OFFICE);
  ck('an OFFICE user is refused -- this is exposure to a bill, not work',
    (await refused(() => set(ACCOUNT, true, 5000)))?.includes('overage_forbidden'));

  await actAs(STRANGER);
  ck("an owner of a DIFFERENT workspace cannot touch this one",
    (await refused(() => set(ACCOUNT, true, 5000)))?.includes('overage_forbidden'));

  ck('and none of the three left a trace', (await evidence()).length === 0 && (await settings()) === null);

  // --- What the owner must supply ---
  await actAs(OWNER);
  ck('enabling without a cap is refused',
    (await refused(() => set(ACCOUNT, true, null)))?.includes('overage_cap_required'));
  ck('a zero or negative cap is refused',
    (await refused(() => set(ACCOUNT, true, 0)))?.includes('overage_cap_required'));
  ck('a cap past the units-guard ceiling is refused',
    (await refused(() => set(ACCOUNT, true, 1000001)))?.includes('overage_cap_too_large'));
  ck('a malformed terms digest is refused',
    (await refused(() => set(ACCOUNT, true, 5000, TERMS, 'not-a-digest')))?.includes('overage_terms_digest_invalid'));
  ck('blank terms are refused',
    (await refused(() => set(ACCOUNT, true, 5000, '   ')))?.includes('overage_terms_missing'));
  ck('still nothing written after five refusals',
    (await evidence()).length === 0 && (await settings()) === null);

  // --- Enabling ---
  const first = await set(ACCOUNT, true, 5000);
  ck('enabling reports a change', first.changed === true && first.enabled === true && Number(first.cap_cents) === 5000);
  let ev = await evidence();
  ck("the first enable is recorded as 'enabled'", ev.length === 1 && ev[0].action === 'enabled', JSON.stringify(ev));
  ck('the evidence names the human who did it', ev[0]?.authorized_by === OWNER);
  let s = await settings();
  ck('the settings row points AT that evidence',
    s?.enabled === true && Number(s.cap_cents) === 5000 && s.authorization_id === first.authorization_id);

  // --- The no-op ---
  const again = await set(ACCOUNT, true, 5000);
  ck('re-saving an unchanged form reports no change', again.changed === false);
  ck('and writes NO second row into the audit trail', (await evidence()).length === 1);

  // --- Changing the cap ---
  const raised = await set(ACCOUNT, true, 9000);
  ck('raising the cap reports a change', raised.changed === true && Number(raised.cap_cents) === 9000);
  ev = await evidence();
  ck("a change while already on is recorded as 'cap_changed', not 'enabled'",
    ev.length === 2 && ev[1].action === 'cap_changed', JSON.stringify(ev.map((r) => r.action)));

  // --- The cap actually binds the meter ---
  const decide = async (units) => (await c.query(
    'select * from public.authorize_usage_overage($1, $2, $3, $4, $5, $6)',
    [ACCOUNT, 'text_segments', units, TEXT, P0, P1],
  )).rows[0];
  let d = await decide(10); // 10 * 4.8c = 48c
  ck('a charge under the cap set through this door is admitted', d.decision === 'accrued', d.decision);
  d = await decide(100000);
  ck('and one past it is refused', d.decision === 'cap_reached', d.decision);

  // --- Lowering below what is already spent ---
  const lowered = await set(ACCOUNT, true, 1);
  ck('a cap may be lowered BELOW what is already accrued', lowered.changed === true && Number(lowered.cap_cents) === 1);
  d = await decide(1);
  ck('which stops further spending without unspending the past', d.decision === 'cap_reached', d.decision);
  ck('and the accrual already recorded still stands', Number((await c.query(
    'select coalesce(sum(millicents),0)::bigint as t from public.workspace_overage_accruals where account_id = $1',
    [ACCOUNT])).rows[0].t) > 0);

  // --- Switching off ---
  const off = await set(ACCOUNT, false, 9999);
  ck('switching off ignores whatever cap the caller sent', off.changed === true && off.cap_cents === null);
  s = await settings();
  ck('the stored row is disabled with a null cap', s?.enabled === false && s.cap_cents === null);
  ev = await evidence();
  ck("switching off is recorded as 'disabled' with no cap",
    ev.at(-1).action === 'disabled' && ev.at(-1).cap_cents === null);
  const offAgain = await set(ACCOUNT, false, null);
  ck('switching off twice writes nothing the second time', offAgain.changed === false);

  // --- Re-enabling after a disable ---
  const reEnabled = await set(ACCOUNT, true, 2500);
  ev = await evidence();
  ck("re-enabling after a disable is 'enabled' again, not 'cap_changed'",
    reEnabled.changed === true && ev.at(-1).action === 'enabled', ev.at(-1)?.action);

  // --- THE REASON THIS MIGRATION IS NOT JUST A FUNCTION ---
  ck('the account FK is gone from the evidence table', Number((await c.query(
    `select count(*)::int as n from pg_constraint
      where conrelid = 'public.workspace_overage_authorizations'::regclass
        and contype = 'f'`)).rows[0].n) === 0);

  const deleteError = await refused(() => c.query('delete from public.accounts where id = $1', [ACCOUNT]));
  ck('a workspace that used this switch can still be DELETED', deleteError === null, deleteError);
  ck('its current settings die with it', (await settings()) === null);
  ck('but the evidence of what was authorized survives', (await evidence()).length >= 5);

  // --- Grants ---
  await c.query('set role anon');
  const anonErr = await refused(() => c.query(
    'select public.set_workspace_overage_authorization($1, $2, $3, $4, $5)',
    [OTHER, true, 100, TERMS, SHA]));
  await c.query('reset role');
  ck('anon cannot execute the function at all', anonErr?.includes('permission denied'), anonErr);

  await c.query('set role authenticated');
  const authErr = await refused(() => c.query(
    'select public.set_workspace_overage_authorization($1, $2, $3, $4, $5)',
    [OTHER, true, 100, TERMS, SHA]));
  await c.query('reset role');
  // Reaches the owner check rather than the grant check -- which is the proof
  // that `authenticated` holds EXECUTE.
  ck('authenticated may execute it, and is then judged on ownership',
    authErr?.includes('overage_forbidden'), authErr);
} catch (err) {
  ck('harness completed without throwing', false, String(err?.message ?? err).slice(0, 300));
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
