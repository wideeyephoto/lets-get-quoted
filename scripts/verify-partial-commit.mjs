/**
 * Prove `commit_usage_reservation_partial` settles a reservation for less than
 * it held, against a real PostgreSQL 17, on the real ledger DDL.
 *
 * WHY THIS IS THE MOST CAREFUL HARNESS IN THE SET. Every other ledger function
 * either consumes everything a reservation holds or returns everything. This one
 * splits a hold — some units consumed, the rest returned — in a single UPDATE
 * per credit lot. If that arithmetic is wrong, the failure mode is not an error:
 * it is credit lots whose numbers no longer add up, discovered a month later as
 * a workspace that cannot spend credits it visibly has, or one that can spend
 * credits it does not.
 *
 * So the central assertion here is not "the function returned 3". It is that
 * after every operation, for every lot,
 *
 *     granted - consumed - reserved - revoked
 *
 * equals what it should, and that reserved_units returns to zero once nothing is
 * outstanding. A settlement that returns the right number while leaving a lot
 * permanently short would pass a weaker test and lose real money.
 *
 * The ledger DDL is lifted verbatim from 20260815213142 rather than retyped, and
 * the new function from its own migration, so a drift in either fails here.
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
const LEDGER = m('20260815213142_pricing_entitlements.sql');
const PARTIAL = m('20260819110000_commit_usage_reservation_partial.sql');

function liftTable(name) {
  const start = LEDGER.indexOf(`create table if not exists public.${name} (`);
  if (start < 0) throw new Error(`table ${name} not found`);
  const end = LEDGER.indexOf('\n);', start);
  if (end < 0) throw new Error(`table ${name} unterminated`);
  return LEDGER.slice(start, end + 3);
}

function liftFunction(name) {
  const start = LEDGER.search(new RegExp(`create or replace function public\\.${name}\\(`));
  if (start < 0) throw new Error(`function ${name} not found`);
  const tag = LEDGER.slice(start).match(/\nas (\$\$)\n/);
  if (!tag) throw new Error(`function ${name} has no $$ body`);
  const close = LEDGER.indexOf('\n$$;', start + tag.index + tag[0].length);
  if (close < 0) throw new Error(`function ${name} unterminated`);
  return LEDGER.slice(start, close + 4);
}

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const RESOURCE = 'voice_minutes';

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-partial-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_PARTIAL_CHECK_PORT || 54341),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_partial');
  c = pg.getPgClient('lgq_partial');
  await c.connect();

  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
  };

  await q(`
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $roles$;
    create table public.accounts (id uuid primary key);
    create table public.billing_events (id uuid primary key, account_id uuid);
  `);
  for (const t of ['workspace_entitlements', 'usage_credit_lots', 'usage_reservations', 'usage_reservation_allocations']) {
    await q(liftTable(t));
  }
  for (const f of ['grant_usage_credits', 'reserve_usage_credits', 'commit_usage_reservation', 'release_usage_reservation']) {
    await q(liftFunction(f));
  }
  await q('insert into public.accounts (id) values ($1)', [ACCOUNT]);
  await q(PARTIAL);
  ck('the partial-commit migration applies on top of the real ledger', true);

  /** The identity that must hold for every lot, always. */
  const lots = async () => (await q(
    `select id, granted_units::int as granted, consumed_units::int as consumed,
            reserved_units::int as reserved, revoked_units::int as revoked
       from public.usage_credit_lots where account_id = $1 and resource_code = $2
      order by created_at, id`, [ACCOUNT, RESOURCE])).rows;

  const totals = async () => {
    const rows = await lots();
    return rows.reduce((a, l) => ({
      granted: a.granted + l.granted, consumed: a.consumed + l.consumed,
      reserved: a.reserved + l.reserved, revoked: a.revoked + l.revoked,
      available: a.available + (l.granted - l.consumed - l.reserved - l.revoked),
    }), { granted: 0, consumed: 0, reserved: 0, revoked: 0, available: 0 });
  };

  const grant = (key, units) => q(
    `select public.grant_usage_credits(
       p_account_id => $1, p_resource_code => $2, p_source_type => 'plan_period',
       p_idempotency_key => $3, p_units => $4)`, [ACCOUNT, RESOURCE, key, units]);

  const reserve = (key, units, ttlMinutes = 90) => q(
    `select public.reserve_usage_credits(
       p_account_id => $1, p_resource_code => $2, p_units => $3,
       p_idempotency_key => $4, p_operation_type => 'ai_voice_minute',
       p_expires_at => now() + ($5 || ' minutes')::interval,
       p_metadata => '{"schema":"ai-voice.v1"}'::jsonb) as id`,
    [ACCOUNT, RESOURCE, units, key, String(ttlMinutes)]);

  const settle = (id, key, units) => q(
    'select public.commit_usage_reservation_partial($1, $2, $3) as n', [id, key, units]);

  // -------------------------------------------------------------------
  // 1. The ordinary case: hold the cap, use a little.
  // -------------------------------------------------------------------
  await grant('seed:1', 100);
  const held = (await reserve('call-1', 60)).rows[0].id;
  ck('a 60-minute cap can be held against a 90-minute TTL', typeof held === 'string');
  ck('holding moves units from available to reserved',
    JSON.stringify(await totals()) === JSON.stringify(
      { granted: 100, consumed: 0, reserved: 60, revoked: 0, available: 40 }));

  const settled = Number((await settle(held, 'call-1:settle', 1)).rows[0].n);
  ck('a 33-second call settles as one minute, not sixty', settled === 1, settled);
  ck('the other 59 go back, and nothing stays held',
    JSON.stringify(await totals()) === JSON.stringify(
      { granted: 100, consumed: 1, reserved: 0, revoked: 0, available: 99 }),
    JSON.stringify(await totals()));

  // -------------------------------------------------------------------
  // 2. Across several lots, which is where split arithmetic goes wrong.
  // -------------------------------------------------------------------
  await q('delete from public.usage_reservation_allocations');
  await q('delete from public.usage_reservations');
  await q('delete from public.usage_credit_lots');
  for (const [key, units] of [['a', 5], ['b', 5], ['c', 5]]) await grant(`multi:${key}`, units);
  const spanning = (await reserve('call-2', 12)).rows[0].id;
  ck('a hold can span three lots', (await lots()).filter((l) => l.reserved > 0).length === 3);

  const across = Number((await settle(spanning, 'call-2:settle', 7)).rows[0].n);
  ck('settling 7 of 12 across three lots returns 7', across === 7, across);
  const after = await totals();
  ck('7 consumed, 5 returned, none left held',
    after.consumed === 7 && after.reserved === 0 && after.available === 8, JSON.stringify(after));
  ck('no lot is left with impossible numbers',
    (await lots()).every((l) => l.consumed >= 0 && l.reserved === 0
      && l.granted - l.consumed - l.reserved - l.revoked >= 0), JSON.stringify(await lots()));

  // -------------------------------------------------------------------
  // 3. The edges.
  // -------------------------------------------------------------------
  await q('delete from public.usage_reservation_allocations');
  await q('delete from public.usage_reservations');
  await q('delete from public.usage_credit_lots');
  await grant('edges', 50);

  const zero = (await reserve('call-zero', 10)).rows[0].id;
  ck('settling zero consumes nothing', Number((await settle(zero, 'z:settle', 0)).rows[0].n) === 0);
  ck('...and returns the whole hold', (await totals()).available === 50, JSON.stringify(await totals()));

  const capped = (await reserve('call-cap', 10)).rows[0].id;
  const over = Number((await settle(capped, 'cap:settle', 999)).rows[0].n);
  // A call that genuinely runs to the 60-minute cap uses all it reserved. It is
  // not an error, and it must never consume more than was held.
  ck('asking for more than was held commits only what was held', over === 10, over);
  ck('...and consumes exactly that', (await totals()).consumed === 10, JSON.stringify(await totals()));

  // -------------------------------------------------------------------
  // 4. Replay. The receipt is fixed; a retry must not move a settled bill.
  // -------------------------------------------------------------------
  await q('delete from public.usage_reservation_allocations');
  await q('delete from public.usage_reservations');
  await q('delete from public.usage_credit_lots');
  await grant('replay', 50);
  const once = (await reserve('call-3', 20)).rows[0].id;
  await settle(once, 'call-3:settle', 4);
  const beforeReplay = await totals();

  const replay = Number((await settle(once, 'call-3:settle', 17)).rows[0].n);
  ck('a replay returns what was committed, not what it now asks for', replay === 4, replay);
  ck('...and consumes nothing further',
    JSON.stringify(await totals()) === JSON.stringify(beforeReplay), JSON.stringify(await totals()));

  const wrongKey = await fails(
    'select public.commit_usage_reservation_partial($1, $2, $3)', [once, 'other:key', 4]);
  ck('a different finalization key is refused, as on the whole commit',
    /different finalization key/.test(wrongKey ?? ''), wrongKey);

  // -------------------------------------------------------------------
  // 5. Expiry: the ordinary path for a call that never reported.
  // -------------------------------------------------------------------
  await q('delete from public.usage_reservation_allocations');
  await q('delete from public.usage_reservations');
  await q('delete from public.usage_credit_lots');
  await grant('expiry', 50);
  const stale = (await reserve('call-4', 30)).rows[0].id;
  // expires_at > created_at is a CHECK, so age the whole row rather than only
  // its expiry -- otherwise the harness cannot build the state it needs to test.
  await q(`update public.usage_reservations
              set created_at = now() - interval '3 hours',
                  expires_at = now() - interval '1 minute'
            where id = $1`, [stale]);
  const expired = Number((await settle(stale, 'call-4:settle', 12)).rows[0].n);
  ck('a hold past its expiry settles nothing', expired === 0, expired);
  ck('...and gives every unit back', (await totals()).available === 50, JSON.stringify(await totals()));
  ck('...and is marked expired rather than committed',
    (await q('select state, release_reason from public.usage_reservations where id = $1', [stale]))
      .rows[0].state === 'expired');

  // -------------------------------------------------------------------
  // 6. Bad input, and the whole commit still behaving.
  // -------------------------------------------------------------------
  await q('delete from public.usage_reservation_allocations');
  await q('delete from public.usage_reservations');
  await q('delete from public.usage_credit_lots');
  await grant('guards', 50);
  const guard = (await reserve('call-5', 10)).rows[0].id;

  ck('negative units are refused',
    /zero or more/.test(await fails('select public.commit_usage_reservation_partial($1,$2,$3)', [guard, 'k', -1]) ?? ''));
  ck('a null unit count is refused',
    /zero or more/.test(await fails('select public.commit_usage_reservation_partial($1,$2,null)', [guard, 'k']) ?? ''));
  ck('an empty finalization key is refused',
    /finalization key is required/.test(await fails('select public.commit_usage_reservation_partial($1,$2,$3)', [guard, '  ', 3]) ?? ''));
  ck('an unknown reservation raises rather than returning zero',
    /reservation not found/.test(await fails(
      'select public.commit_usage_reservation_partial($1,$2,$3)',
      ['99999999-9999-4999-8999-999999999999', 'k', 1]) ?? ''));

  // The whole commit is untouched by this migration and must still consume all.
  const wholeId = (await reserve('call-6', 6)).rows[0].id;
  await q('select public.commit_usage_reservation($1, $2)', [wholeId, 'call-6:settle']);
  const wholeRow = (await q(
    'select state, units::int as units, committed_units from public.usage_reservations where id = $1',
    [wholeId])).rows[0];
  ck('commit_usage_reservation still commits whole', wholeRow.state === 'committed' && wholeRow.units === 6);
  ck('...and leaves committed_units null, so readers must coalesce',
    wholeRow.committed_units === null, wholeRow.committed_units);

  // -------------------------------------------------------------------
  // 7. The constraint that stops a bad row existing at all.
  // -------------------------------------------------------------------
  ck('committed_units can never exceed the units held',
    /usage_reservations_committed_units_check/.test(await fails(
      'update public.usage_reservations set committed_units = units + 1 where id = $1', [wholeId]) ?? ''));

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
