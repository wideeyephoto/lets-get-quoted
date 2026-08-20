/**
 * Prove the same overrun cannot be charged twice.
 *
 * THE HOLE THIS CLOSES. authorize_usage_overage did a blind increment into
 * workspace_overage_accruals with nothing recording which overrun it was, so a
 * retry charged again. The retry is not hypothetical: the RPC commits, the
 * connection drops before the row comes back, the TypeScript side answers
 * `unavailable`, the caller refuses to send -- and the workspace has paid for
 * work nobody did. Then it retries, and pays twice.
 *
 * The assertion that matters is not that a second call returns something. It is
 * that a second call moves NO money, returns the SAME numbers as the first, and
 * keeps doing so after the cap has since filled -- because a replay that
 * re-evaluated the cap would refuse work that was already paid for.
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
const SETTLEMENT = m('20260819260000_overage_settlement.sql');
const IDEMPOTENCY = m('20260819290000_overage_accrual_idempotency.sql');
const SETTLED_GUARD = m('20260819300000_release_respects_settled_period.sql');
const OVERLAP = m('20260819310000_cap_counts_overlapping_periods.sql');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const P_START = '2026-08-01T00:00:00Z';
const P_END = '2026-09-01T00:00:00Z';
const RATE = 35_000; // voice_minutes: $0.35/min in millicents

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-overage-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_OVERAGE_PORT || 54362),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_overage');
  c = pg.getPgClient('lgq_overage');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
  };

  // Just enough of 20260819080000 for the new migration to stand on.
  await q(`
    create extension if not exists pgcrypto;
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $roles$;
    create table public.accounts (id uuid primary key);
    create function public.is_owner(p uuid) returns boolean
      language sql stable as $o$ select false $o$;
    create table public.workspace_overage_settings (
      account_id uuid primary key references public.accounts(id) on delete cascade,
      enabled boolean not null default false,
      cap_cents bigint,
      constraint workspace_overage_settings_cap_required_check check (
        (enabled and cap_cents is not null) or (not enabled and cap_cents is null)
      )
    );
    create table public.workspace_overage_accruals (
      account_id uuid not null references public.accounts(id) on delete cascade,
      period_start timestamptz not null,
      period_end timestamptz not null,
      resource_code text not null check (resource_code ~ '^[a-z][a-z0-9_]{1,63}$'),
      units bigint not null default 0 check (units >= 0),
      millicents bigint not null default 0 check (millicents >= 0),
      first_accrued_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (account_id, period_start, resource_code),
      constraint workspace_overage_accruals_period_check check (period_end > period_start)
    );
    insert into public.accounts (id) values ('${ACCOUNT}');
    -- $50 cap. Every figure below is measured against it.
    insert into public.workspace_overage_settings (account_id, enabled, cap_cents)
      values ('${ACCOUNT}', true, 5000);
  `);

  // In migration order: the settlement snapshot, then the anchor, then the
  // guard that keeps a settled period's accruals still.
  await q(SETTLEMENT);
  await q(IDEMPOTENCY);
  await q(SETTLED_GUARD);
  await q(OVERLAP);
  ck('all four migrations apply, post-conditions and all', true);

  const authorize = (key, units = 10, resource = 'voice_minutes', start = P_START) => q(
    `select * from public.authorize_usage_overage(
       '${ACCOUNT}'::uuid, $1::text, $2::bigint, ${RATE}::bigint,
       $3::timestamptz, '${P_END}'::timestamptz, $4::text)`,
    [resource, units, start, key],
  ).then((r) => r.rows[0]);

  const accrued = async () => (await q(
    `select coalesce(sum(millicents), 0)::bigint as m, coalesce(sum(units), 0)::bigint as u
       from public.workspace_overage_accruals where account_id = '${ACCOUNT}'`,
  )).rows[0];

  // -------------------------------------------------------------------
  // 1. The first charge, and the replay that must not repeat it.
  // -------------------------------------------------------------------
  const first = await authorize('ai-voice:v1:call_aaaa1111');
  ck('a first overrun accrues', first.decision === 'accrued', first);
  ck('...for units x rate', Number(first.charged_millicents) === 10 * RATE, first);
  ck('...and the cap is cents x 1000, not cents',
    Number(first.cap_millicents) === 5_000_000, first.cap_millicents);
  ck('...and the ledger holds exactly that',
    Number((await accrued()).m) === 350_000);

  const replay = await authorize('ai-voice:v1:call_aaaa1111');
  ck('a replay is still accrued, not refused', replay.decision === 'accrued', replay);
  ck('...returns the identical numbers',
    Number(replay.charged_millicents) === Number(first.charged_millicents)
    && Number(replay.accrued_millicents) === Number(first.accrued_millicents),
    replay);
  ck('...AND MOVES NO MONEY -- the whole point',
    Number((await accrued()).m) === 350_000 && Number((await accrued()).u) === 10);

  // -------------------------------------------------------------------
  // 2. A distinct key is distinct work.
  // -------------------------------------------------------------------
  const second = await authorize('ai-voice:v1:call_bbbb2222', 4);
  ck('a different key accrues on top', second.decision === 'accrued');
  ck('...and the total is the sum', Number((await accrued()).m) === 350_000 + 140_000);

  // -------------------------------------------------------------------
  // 3. The cap, and the replay that must survive it.
  // -------------------------------------------------------------------
  // 4,510,000 of the 5,000,000 cap is left. 200 minutes would be 7,000,000.
  const over = await authorize('ai-voice:v1:call_cccc3333', 200);
  ck('a charge that would cross the cap is refused whole', over.decision === 'cap_reached', over);
  ck('...and nothing was billed in part', Number(over.charged_millicents) === 0);
  ck('...and the ledger did not move', Number((await accrued()).m) === 490_000);

  // Fill the cap to the brim with a separate resource, then replay the FIRST
  // key. A replay that re-evaluated the cap would now answer cap_reached and
  // the caller would refuse work the customer has already paid for.
  // 4,510,000 of the cap is unspent. 128 units takes 4,480,000 of it.
  const fill = await authorize('text-credit:v1:blast_dddd4444', 128, 'text_segments');
  ck('the filler charge itself accrued -- else nothing below is being tested',
    fill.decision === 'accrued', fill);
  const nearCap = Number((await accrued()).m);
  ck('the cap is now nearly full', nearCap > 4_900_000 && nearCap <= 5_000_000, nearCap);
  const lateReplay = await authorize('ai-voice:v1:call_aaaa1111');
  ck('A REPLAY AFTER THE CAP FILLED STILL SAYS ACCRUED',
    lateReplay.decision === 'accrued', lateReplay);
  ck('...with the original figures, not current ones',
    Number(lateReplay.accrued_millicents) === Number(first.accrued_millicents), lateReplay);
  ck('...and still moved nothing', Number((await accrued()).m) === nearCap);

  // -------------------------------------------------------------------
  // 4. A key that means something else is a caller bug, not a shrug.
  // -------------------------------------------------------------------
  const reusedUnits = await fails(
    `select * from public.authorize_usage_overage(
       '${ACCOUNT}'::uuid, 'voice_minutes'::text, 99::bigint, ${RATE}::bigint,
       '${P_START}'::timestamptz, '${P_END}'::timestamptz, 'ai-voice:v1:call_aaaa1111'::text)`);
  ck('the same key for different units raises',
    /reused for different work/.test(reusedUnits ?? ''), reusedUnits);

  const reusedResource = await fails(
    `select * from public.authorize_usage_overage(
       '${ACCOUNT}'::uuid, 'text_segments'::text, 10::bigint, ${RATE}::bigint,
       '${P_START}'::timestamptz, '${P_END}'::timestamptz, 'ai-voice:v1:call_aaaa1111'::text)`);
  ck('the same key for a different resource raises',
    /reused for different work/.test(reusedResource ?? ''), reusedResource);

  // -------------------------------------------------------------------
  // 5. No key, no charge.
  // -------------------------------------------------------------------
  for (const [label, key] of [['null', null], ['empty', ''], ['too short', 'abc']]) {
    const message = await fails(
      `select * from public.authorize_usage_overage(
         '${ACCOUNT}'::uuid, 'voice_minutes'::text, 1::bigint, ${RATE}::bigint,
         '${P_START}'::timestamptz, '${P_END}'::timestamptz, $1::text)`, [key]);
    ck(`a ${label} idempotency key is refused`,
      /idempotency key is missing or malformed/.test(message ?? ''), message);
  }

  ck('the un-anchored six-argument signature is gone',
    Number((await q(`select count(*)::int as n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'authorize_usage_overage'
        and p.pronargs = 6`)).rows[0].n) === 0);

  // -------------------------------------------------------------------
  // 6. The release, which takes its amount from the event.
  // -------------------------------------------------------------------
  const before = Number((await accrued()).m);
  const released = Number((await q(
    `select public.release_usage_overage('${ACCOUNT}'::uuid, 'ai-voice:v1:call_bbbb2222'::text) as r`,
  )).rows[0].r);
  ck('releasing gives back exactly what that event charged', released === 140_000, released);
  ck('...and the ledger drops by exactly that',
    Number((await accrued()).m) === before - 140_000);

  const again = Number((await q(
    `select public.release_usage_overage('${ACCOUNT}'::uuid, 'ai-voice:v1:call_bbbb2222'::text) as r`,
  )).rows[0].r);
  ck('A SECOND RELEASE OF THE SAME KEY GIVES BACK NOTHING', again === 0, again);
  ck('...and the ledger is untouched by it',
    Number((await accrued()).m) === before - 140_000);

  const unknown = Number((await q(
    `select public.release_usage_overage('${ACCOUNT}'::uuid, 'never:v1:accrued0000'::text) as r`,
  )).rows[0].r);
  ck('releasing a key that never accrued gives back nothing', unknown === 0);

  const resurrect = await fails(
    `select * from public.authorize_usage_overage(
       '${ACCOUNT}'::uuid, 'voice_minutes'::text, 4::bigint, ${RATE}::bigint,
       '${P_START}'::timestamptz, '${P_END}'::timestamptz, 'ai-voice:v1:call_bbbb2222'::text)`);
  ck('a released key cannot be re-authorized into a live charge',
    /already released/.test(resurrect ?? ''), resurrect);

  // A release can never drive the ledger negative even if the accrual row was
  // trimmed underneath it.
  await q(`update public.workspace_overage_accruals set units = 0, millicents = 0
           where account_id = '${ACCOUNT}' and resource_code = 'voice_minutes'`);
  await q(`select public.release_usage_overage('${ACCOUNT}'::uuid, 'ai-voice:v1:call_aaaa1111'::text)`);
  const floored = (await q(`select units, millicents from public.workspace_overage_accruals
    where account_id = '${ACCOUNT}' and resource_code = 'voice_minutes'`)).rows[0];
  ck('a release floors at zero rather than minting credit',
    Number(floored.units) === 0 && Number(floored.millicents) === 0, floored);

  // -------------------------------------------------------------------
  // 7. A cap that moved its boundary is still the same cap.
  // -------------------------------------------------------------------
  // The subscription projector writes period_start from Stripe on every
  // subscription event, and the TypeScript falls back to the calendar month
  // when there is no entitlement period. So a Flex workspace that subscribes on
  // the 15th moves from 08-01..09-01 to 08-15..09-15 mid-month. Summing by
  // exact period_start found nothing in the new bucket and handed back the
  // whole cap: one cap, set once, spent twice, in the same month.
  const MOVER = '44444444-4444-4444-8444-444444444444';
  await q(`insert into public.accounts (id) values ('${MOVER}')`);
  await q(`insert into public.workspace_overage_settings (account_id, enabled, cap_cents)
           values ('${MOVER}', true, 5000)`);

  const authorizeFor = (account, key, units, start, end) => q(
    `select * from public.authorize_usage_overage(
       $1::uuid, 'voice_minutes'::text, $2::bigint, ${RATE}::bigint,
       $3::timestamptz, $4::timestamptz, $5::text)`,
    [account, units, start, end, key],
  ).then((r) => r.rows[0]);

  const CAL = ['2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z'];
  const SUB = ['2026-08-15T00:00:00Z', '2026-09-15T00:00:00Z'];
  const NEXT = ['2026-09-15T00:00:00Z', '2026-10-15T00:00:00Z'];

  // Nearly all of the $50 cap, under the calendar month. 141 x 35,000 =
  // 4,935,000, leaving 65,000 of the 5,000,000 -- room for exactly one more.
  const spent = await authorizeFor(MOVER, 'text-credit:v1:aug_first0001', 141, ...CAL);
  ck('a workspace spends nearly all of its cap in the calendar month',
    spent.decision === 'accrued' && Number(spent.accrued_millicents) === 4_935_000, spent);

  const afterMove = await authorizeFor(MOVER, 'ai-voice:v1:sub_second002', 10, ...SUB);
  ck('THE CAP DOES NOT RE-ARM WHEN THE PERIOD BOUNDARY MOVES MID-MONTH',
    afterMove.decision === 'cap_reached', afterMove);
  ck('...and it can still see what was already spent',
    Number(afterMove.accrued_millicents) === 4_935_000, afterMove);

  // A charge that fits in what is genuinely left still goes through.
  const fits = await authorizeFor(MOVER, 'ai-voice:v1:sub_small00003', 1, ...SUB);
  ck('...while a charge that fits the remaining cap is still allowed',
    fits.decision === 'accrued' && Number(fits.accrued_millicents) === 4_970_000, fits);

  // And a genuine roll DOES reset it, with no dependence on anything settling.
  const nextMonth = await authorizeFor(MOVER, 'ai-voice:v1:sep_fresh00004', 100, ...NEXT);
  ck('A GENUINE MONTHLY ROLL STILL RESETS THE CAP',
    nextMonth.decision === 'accrued', nextMonth);
  ck('...starting from what that period alone has spent',
    Number(nextMonth.accrued_millicents) === 3_500_000, nextMonth);

  // -------------------------------------------------------------------
  // 8. A settled period does not move.
  // -------------------------------------------------------------------
  // close_overage_period freezes a snapshot and an invoice is built from THAT,
  // not from the live accrual rows. A call admitted at 23:58 that fails at
  // 00:02 would otherwise release into a period that closed in between, leaving
  // the accrual table saying something different from the settlement that came
  // from it.
  const LATE = 'ai-voice:v1:call_late5555';
  const lateCharge = await authorize(LATE, 3);
  ck('a fresh charge accrues before the period closes', lateCharge.decision === 'accrued');

  await q(`select public.close_overage_period('${ACCOUNT}'::uuid,
    '${P_START}'::timestamptz, '${P_END}'::timestamptz)`);
  const settledTotal = Number((await q(
    `select total_millicents from public.workspace_overage_settlements
      where account_id = '${ACCOUNT}' and period_start = '${P_START}'`)).rows[0].total_millicents);
  ck('the period closes with a snapshot to protect', settledTotal > 0, settledTotal);

  const refused = await fails(
    `select public.release_usage_overage('${ACCOUNT}'::uuid, '${LATE}'::text)`);
  ck('A RELEASE AFTER THE PERIOD SETTLED IS REFUSED, NOT SILENTLY APPLIED',
    /already been settled/.test(refused ?? ''), refused);
  ck('...and the refusal is distinguishable from a duplicate release',
    !/^0$/.test(String(refused)), refused);

  const stillOpen = (await q(
    `select released_at from public.workspace_overage_accrual_events
      where account_id = '${ACCOUNT}' and idempotency_key = '${LATE}'`)).rows[0];
  ck('...the event stays open, as evidence the charge should not have stood',
    stillOpen.released_at === null, stillOpen);

  const afterRefusal = Number((await q(
    `select coalesce(sum(millicents), 0)::bigint as m from public.workspace_overage_accruals
      where account_id = '${ACCOUNT}' and period_start = '${P_START}'`)).rows[0].m);
  ck('...and the accruals still agree with the settlement they produced',
    afterRefusal === settledTotal, { afterRefusal, settledTotal });

  // -------------------------------------------------------------------
  // 9. Reach.
  // -------------------------------------------------------------------
  for (const role of ['anon', 'authenticated']) {
    ck(`${role} cannot authorize an overage`,
      (await q(`select has_function_privilege($1,
        'public.authorize_usage_overage(uuid,text,bigint,bigint,timestamptz,timestamptz,text)',
        'EXECUTE') as ok`, [role])).rows[0].ok === false);
    ck(`${role} cannot release an overage`,
      (await q(`select has_function_privilege($1,
        'public.release_usage_overage(uuid,text)', 'EXECUTE') as ok`, [role])).rows[0].ok === false);
    ck(`${role} cannot write the evidence`,
      (await q(`select has_table_privilege($1,
        'public.workspace_overage_accrual_events', 'INSERT') as ok`, [role])).rows[0].ok === false);
  }
  ck('anon cannot even read the evidence',
    (await q(`select has_table_privilege('anon',
      'public.workspace_overage_accrual_events', 'SELECT') as ok`)).rows[0].ok === false);
  ck('row-level security is on, so the owner policy is what authenticated gets',
    (await q(`select relrowsecurity as ok from pg_class
      where oid = 'public.workspace_overage_accrual_events'::regclass`)).rows[0].ok === true);

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
