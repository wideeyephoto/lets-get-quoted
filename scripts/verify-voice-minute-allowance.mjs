/**
 * Prove voice minutes are granted, and granted in a shape the meter can spend.
 *
 * THE ASSERTION THAT MATTERS IS THE LAST ONE. It is not that a lot was created —
 * it is that a 90-minute voice reservation can still be taken against that lot
 * in the final minutes of the period. `reserve_usage_credits` only draws on lots
 * that OUTLIVE the reservation, so a lot expiring exactly at period end is
 * ineligible for the last 90 minutes of every period: a call would refuse for
 * insufficient credits with the credits sitting visibly in the balance, once a
 * month, per workspace, silently. Granting minutes without the tail would pass
 * every other check in this file.
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
const ALLOWANCE = m('20260819190000_voice_minute_allowance.sql');

function liftTable(name) {
  const start = LEDGER.indexOf(`create table if not exists public.${name} (`);
  if (start < 0) throw new Error(`table ${name} not found`);
  return LEDGER.slice(start, LEDGER.indexOf('\n);', start) + 3);
}
function liftFunction(name) {
  const start = LEDGER.search(new RegExp(`create or replace function public\\.${name}\\(`));
  if (start < 0) throw new Error(`function ${name} not found`);
  const tag = LEDGER.slice(start).match(/\nas (\$\$)\n/);
  const close = LEDGER.indexOf('\n$$;', start + tag.index + tag[0].length);
  return LEDGER.slice(start, close + 4);
}

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-voiceallow-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_VOICE_ALLOWANCE_PORT || 54355),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_voice_allow');
  c = pg.getPgClient('lgq_voice_allow');
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
    -- Only the columns the granter reads.
    create table public.workspace_purchased_capacity (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id),
      top_up_id text not null check (top_up_id in ('crew_user','office_user','storage_100gb')),
      resource_code text not null,
      units bigint not null check (units > 0),
      status text not null default 'active' check (status in ('active','past_due','canceled'))
    );
  `);
  for (const t of ['workspace_entitlements', 'usage_credit_lots', 'usage_reservations', 'usage_reservation_allocations']) {
    await q(liftTable(t));
  }
  for (const f of ['grant_usage_credits', 'reserve_usage_credits']) await q(liftFunction(f));
  await q('insert into public.accounts (id) values ($1), ($2)', [ACCOUNT, OTHER]);
  await q(ALLOWANCE);
  ck('the allowance migration applies, post-conditions and all', true);

  ck('the capacity table now admits the three voice add-on SKUs',
    (await fails(`insert into public.workspace_purchased_capacity
                    (account_id, top_up_id, resource_code, units)
                  values ($1, 'ai_voice_growth', 'voice_minutes', 200)`, [OTHER])) === null);

  const PERIOD_START = '2026-08-01T00:00:00Z';
  const PERIOD_END = '2026-09-01T00:00:00Z';
  const grant = (account) => q(
    'select public.grant_voice_minute_allowance($1, $2::timestamptz, $3::timestamptz) as n',
    [account, PERIOD_START, PERIOD_END]);
  const balance = async (account) => Number((await q(
    `select coalesce(sum(granted_units - consumed_units - reserved_units - revoked_units), 0) as n
       from public.usage_credit_lots where account_id = $1 and resource_code = 'voice_minutes'`,
    [account])).rows[0].n);

  // -------------------------------------------------------------------
  // 1. Nothing to grant is not an error.
  // -------------------------------------------------------------------
  ck('a workspace with no entitlement gets nothing, quietly',
    Number((await grant(ACCOUNT)).rows[0].n) === 0);

  const entitle = (account, limits) => q(
    `insert into public.workspace_entitlements
       (account_id, plan_code, billing_interval, billing_status, entitlement_state,
        catalog_version, platform_fee_bps, feature_limits, period_start, period_end)
     values ($1, 'scale', 'monthly', 'active', 'active', '2026-08-18-preview', 10, $2::jsonb,
             now() - interval '1 day', now() + interval '29 days')`,
    [account, JSON.stringify(limits)]);

  await entitle(ACCOUNT, { voice_included_minutes: 0 });
  ck('a plan that includes no minutes and bought none gets nothing',
    Number((await grant(ACCOUNT)).rows[0].n) === 0 && await balance(ACCOUNT) === 0);

  // -------------------------------------------------------------------
  // 2. Scale: included with the base plan.
  // -------------------------------------------------------------------
  await q(`update public.workspace_entitlements
             set feature_limits = '{"voice_included_minutes": 100}'::jsonb
           where account_id = $1`, [ACCOUNT]);
  ck('a base-plan inclusion is granted', Number((await grant(ACCOUNT)).rows[0].n) === 100);
  ck('...and lands in the balance', await balance(ACCOUNT) === 100);

  // -------------------------------------------------------------------
  // 3. Idempotent per period. A sweep may overlap itself.
  // -------------------------------------------------------------------
  await grant(ACCOUNT);
  await grant(ACCOUNT);
  ck('running it again in the same period grants nothing further',
    await balance(ACCOUNT) === 100, await balance(ACCOUNT));

  const nextMonth = await q(
    'select public.grant_voice_minute_allowance($1, $2::timestamptz, $3::timestamptz) as n',
    [ACCOUNT, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z']);
  ck('the NEXT period grants again', Number(nextMonth.rows[0].n) === 100);
  ck('...and adds to the balance', await balance(ACCOUNT) === 200);

  // -------------------------------------------------------------------
  // 4. Included plus purchased, in one lot.
  // -------------------------------------------------------------------
  await entitle(OTHER, { voice_included_minutes: 0 });
  ck('a purchased add-on alone is granted', Number((await grant(OTHER)).rows[0].n) === 200);

  await q(`update public.workspace_entitlements
             set feature_limits = '{"voice_included_minutes": 100}'::jsonb
           where account_id = $1`, [OTHER]);
  const both = await q(
    'select public.grant_voice_minute_allowance($1, $2::timestamptz, $3::timestamptz) as n',
    [OTHER, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z']);
  ck('included and purchased are summed into one balance', Number(both.rows[0].n) === 300, both.rows[0]);

  // -------------------------------------------------------------------
  // 5. A lapsed subscription stops granting. This is the crew-seat failure.
  // -------------------------------------------------------------------
  await q(`update public.workspace_purchased_capacity set status = 'canceled' where account_id = $1`, [OTHER]);
  const lapsed = await q(
    'select public.grant_voice_minute_allowance($1, $2::timestamptz, $3::timestamptz) as n',
    [OTHER, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z']);
  ck('a canceled add-on grants only what the base plan includes',
    Number(lapsed.rows[0].n) === 100, lapsed.rows[0]);

  await q(`update public.workspace_purchased_capacity set status = 'past_due' where account_id = $1`, [OTHER]);
  const pastDue = await q(
    'select public.grant_voice_minute_allowance($1, $2::timestamptz, $3::timestamptz) as n',
    [OTHER, '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z']);
  ck('a past-due add-on does not grant either', Number(pastDue.rows[0].n) === 100, pastDue.rows[0]);

  // -------------------------------------------------------------------
  // 6. An archived entitlement gets nothing.
  // -------------------------------------------------------------------
  // archived_at is required alongside the state -- the table refuses an archive
  // with no record of when, which is the right shape and worth tripping over
  // here rather than in a worker.
  await q(`update public.workspace_entitlements
             set entitlement_state = 'archived', archived_at = now()
           where account_id = $1`, [OTHER]);
  const archived = await q(
    'select public.grant_voice_minute_allowance($1, $2::timestamptz, $3::timestamptz) as n',
    [OTHER, '2026-12-01T00:00:00Z', '2027-01-01T00:00:00Z']);
  ck('an archived workspace is granted nothing', Number(archived.rows[0].n) === 0);

  // -------------------------------------------------------------------
  // 7. THE ONE THAT MATTERS: the lot outlives a 90-minute hold at period end.
  // -------------------------------------------------------------------
  const LATE = '33333333-3333-4333-8333-333333333333';
  await q('insert into public.accounts (id) values ($1)', [LATE]);
  await entitle(LATE, { voice_included_minutes: 100 });

  // A period ending in ten minutes. Without the tail, the lot expires then, and
  // a 90-minute reservation cannot draw on it at all.
  await q(`select public.grant_voice_minute_allowance($1, now() - interval '30 days', now() + interval '10 minutes')`,
    [LATE]);

  const held = await fails(
    `select public.reserve_usage_credits(
       p_account_id => $1, p_resource_code => 'voice_minutes', p_units => 60,
       p_idempotency_key => 'late-call', p_operation_type => 'ai_voice_minute',
       p_expires_at => now() + interval '90 minutes',
       p_metadata => '{"schema":"ai-voice.v1"}'::jsonb)`, [LATE]);
  ck('a 90-minute hold still works in the last minutes of a period', held === null, held);

  const tail = (await q(
    `select expires_at from public.usage_credit_lots
      where account_id = $1 and resource_code = 'voice_minutes'`, [LATE])).rows[0];
  ck('...because the lot was given a tail past period end',
    new Date(tail.expires_at).getTime() > Date.now() + 90 * 60_000, tail);

  // -------------------------------------------------------------------
  // 8. Bad input is refused rather than guessed at.
  // -------------------------------------------------------------------
  for (const [start, end] of [
    ['2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z'],
    ['2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'],
  ]) {
    ck(`a period of ${start}..${end} is refused`,
      /period is invalid/.test(await fails(
        'select public.grant_voice_minute_allowance($1, $2::timestamptz, $3::timestamptz)',
        [ACCOUNT, start, end]) ?? ''));
  }

  // -------------------------------------------------------------------
  // 9. Reach.
  // -------------------------------------------------------------------
  for (const role of ['anon', 'authenticated']) {
    ck(`${role} cannot call the granter`,
      (await q('select has_function_privilege($1, $2, $3) as ok',
        [role, 'public.grant_voice_minute_allowance(uuid,timestamptz,timestamptz)', 'EXECUTE'])).rows[0].ok === false);
  }

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
