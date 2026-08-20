/**
 * Prove a period can be closed for exactly what was accrued, exactly once.
 *
 * WHAT THIS GUARDS. Between the accrual ledger and any invoice there has to be
 * a snapshot: something that says what the workspace owed at the moment the
 * period ended, itemised, frozen, and impossible to compute twice. Without it
 * the invoicer would read live accrual rows -- rows that a release can still
 * decrement -- and two runs of the same sweep would produce two charges.
 *
 * The assertions that matter are the ones about money: that the total rounds
 * DOWN to cents and the residual makes the arithmetic close, that a period with
 * less than a cent in it is terminal rather than queued, and that closing the
 * same period twice yields the first snapshot rather than a second row.
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

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const P1 = '2026-07-01T00:00:00Z';
const P1_END = '2026-08-01T00:00:00Z';
const P2 = '2026-08-01T00:00:00Z';
const P2_END = '2026-09-01T00:00:00Z';
const KEY = `lgq:billing:v1:overage.settle:${'a'.repeat(64)}`;

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-settle-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_SETTLE_PORT || 54363),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_settle');
  c = pg.getPgClient('lgq_settle');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
  };

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
      cap_cents bigint
    );
    create table public.workspace_overage_accruals (
      account_id uuid not null references public.accounts(id) on delete cascade,
      period_start timestamptz not null,
      period_end timestamptz not null,
      resource_code text not null,
      units bigint not null default 0,
      millicents bigint not null default 0,
      first_accrued_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (account_id, period_start, resource_code)
    );
    insert into public.accounts (id) values ('${ACCOUNT}'), ('${OTHER}');
    insert into public.workspace_overage_settings (account_id, enabled, cap_cents)
      values ('${ACCOUNT}', true, 5000);
  `);

  await q(SETTLEMENT);
  ck('the settlement migration applies, post-conditions and all', true);

  const accrue = (account, start, end, resource, units, millicents) => q(
    `insert into public.workspace_overage_accruals
       (account_id, period_start, period_end, resource_code, units, millicents)
     values ($1::uuid, $2::timestamptz, $3::timestamptz, $4::text, $5::bigint, $6::bigint)`,
    [account, start, end, resource, units, millicents],
  );

  const close = (account, start, end) => q(
    'select public.close_overage_period($1::uuid, $2::timestamptz, $3::timestamptz) as r',
    [account, start, end],
  ).then((r) => r.rows[0].r);

  // -------------------------------------------------------------------
  // 1. The snapshot, and the rounding.
  // -------------------------------------------------------------------
  // 4,812,345 millicents = $48.12345. Billable: 4812 cents. Residual: 345.
  await accrue(ACCOUNT, P2, P2_END, 'text_segments', 100, 4_800_000);
  await accrue(ACCOUNT, P2, P2_END, 'voice_minutes', 1, 12_345);

  const closed = await close(ACCOUNT, P2, P2_END);
  ck('closing a period produces a settlement', closed?.id != null, closed);
  ck('...that was not already closed', closed.already_closed === false);
  ck('...totalling every accrued resource',
    Number(closed.total_millicents) === 4_812_345, closed.total_millicents);
  ck('THE TOTAL ROUNDS DOWN TO CENTS, never up',
    Number(closed.chargeable_cents) === 4_812, closed.chargeable_cents);
  ck('...and the residual is what rounding down left behind',
    Number(closed.residual_millicents) === 345, closed.residual_millicents);
  ck('...so the arithmetic closes exactly',
    Number(closed.total_millicents)
      === Number(closed.chargeable_cents) * 1000 + Number(closed.residual_millicents));
  ck('it opens in the closed state, owing money and unresolved',
    closed.state === 'closed' && closed.resolved_at === null, closed.state);
  ck('...and records the cap that was in force, as evidence',
    Number(closed.cap_cents_at_close) === 5000, closed.cap_cents_at_close);

  const lines = closed.lines;
  ck('the snapshot itemises each resource', Array.isArray(lines) && lines.length === 2, lines);
  ck('...largest first, so an invoice reads sensibly',
    lines[0].resource_code === 'text_segments' && lines[1].resource_code === 'voice_minutes', lines);
  ck('...carrying units as well as money, so a line can be argued with',
    Number(lines[0].units) === 100 && Number(lines[0].millicents) === 4_800_000, lines[0]);

  // -------------------------------------------------------------------
  // 2. Closing twice. The constraint that makes double billing impossible.
  // -------------------------------------------------------------------
  const again = await close(ACCOUNT, P2, P2_END);
  ck('CLOSING THE SAME PERIOD AGAIN RETURNS THE FIRST SNAPSHOT',
    again.id === closed.id, { first: closed.id, second: again.id });
  ck('...and says so rather than pretending it did the work',
    again.already_closed === true);
  ck('...and there is exactly one settlement row for that period',
    Number((await q(`select count(*)::int as n from public.workspace_overage_settlements
      where account_id = '${ACCOUNT}' and period_start = '${P2}'`)).rows[0].n) === 1);

  // A late accrual cannot change a closed snapshot. This is the whole reason a
  // snapshot exists rather than an invoice built from live rows.
  await q(`update public.workspace_overage_accruals set millicents = 9_000_000
           where account_id = '${ACCOUNT}' and period_start = '${P2}' and resource_code = 'text_segments'`);
  const unchanged = (await q(`select total_millicents from public.workspace_overage_settlements
    where account_id = '${ACCOUNT}' and period_start = '${P2}'`)).rows[0];
  ck('a later change to the accruals cannot move a closed settlement',
    Number(unchanged.total_millicents) === 4_812_345, unchanged);

  // -------------------------------------------------------------------
  // 3. Less than a cent is terminal, not queued.
  // -------------------------------------------------------------------
  // 340 millicents is a third of a cent: one marketing email. Nobody is billed.
  await accrue(ACCOUNT, P1, P1_END, 'marketing_email_sends', 1, 340);
  const dust = await close(ACCOUNT, P1, P1_END);
  ck('a period worth less than a cent closes as nothing owed',
    dust.state === 'nothing_owed', dust.state);
  ck('...billing zero cents', Number(dust.chargeable_cents) === 0);
  ck('...keeping the residual so the books still reconcile',
    Number(dust.residual_millicents) === 340);
  ck('...and RESOLVED, so no sweep waits for a $0.00 Stripe call for ever',
    dust.resolved_at !== null);

  const queue = await q(`select count(*)::int as n from public.workspace_overage_settlements
    where state in ('closed', 'indeterminate')`);
  ck('the work queue holds only the period that actually owes money',
    Number(queue.rows[0].n) === 1, queue.rows[0]);

  // A workspace with no accruals at all closes the same way, not by raising.
  const empty = await close(OTHER, P2, P2_END);
  ck('a workspace that never overran closes as nothing owed',
    empty.state === 'nothing_owed' && Number(empty.total_millicents) === 0, empty);
  ck('...with an empty line list, not a null one',
    Array.isArray(empty.lines) && empty.lines.length === 0, empty.lines);

  // -------------------------------------------------------------------
  // 4. Invalid periods are refused rather than stored.
  // -------------------------------------------------------------------
  const backwards = await fails(
    `select public.close_overage_period('${ACCOUNT}'::uuid,
       '${P2_END}'::timestamptz, '${P2}'::timestamptz)`);
  ck('a period that ends before it starts is refused',
    /period is invalid/.test(backwards ?? ''), backwards);

  // -------------------------------------------------------------------
  // 5. Claim, complete, fail.
  // -------------------------------------------------------------------
  const token = (await q(
    `select public.claim_overage_settlement($1::uuid, $2::text, false, $3::text) as t`,
    [closed.id, KEY, 'cus_abcd1234'])).rows[0].t;
  ck('a closed settlement can be claimed', typeof token === 'string' && token.length === 36);

  const submitted = (await q(`select * from public.workspace_overage_settlements
    where id = $1`, [closed.id])).rows[0];
  ck('...which moves it to submitted with a lease',
    submitted.state === 'submitted' && submitted.lease_expires_at !== null, submitted.state);
  ck('...records the Stripe idempotency key BEFORE the call',
    submitted.stripe_idempotency_key === KEY);
  ck('...and counts the attempt', Number(submitted.attempt_count) === 1);

  const reclaim = await fails(
    `select public.claim_overage_settlement($1::uuid, $2::text, false, $3::text)`,
    [closed.id, KEY, 'cus_abcd1234']);
  ck('a submitted settlement cannot be claimed again',
    /not claimable in state submitted/.test(reclaim ?? ''), reclaim);

  const wrongToken = await fails(
    `select public.complete_overage_settlement($1::uuid, $2::uuid, $3::text)`,
    [closed.id, '99999999-9999-4999-8999-999999999999', 'ii_abcd1234']);
  ck('completing with the wrong claim token is refused',
    /claim is not owned/.test(wrongToken ?? ''), wrongToken);

  await q(`select public.complete_overage_settlement($1::uuid, $2::uuid, $3::text)`,
    [closed.id, token, 'ii_abcd1234']);
  const charged = (await q('select * from public.workspace_overage_settlements where id = $1',
    [closed.id])).rows[0];
  ck('completing records the invoice item and resolves it',
    charged.state === 'charged' && charged.stripe_invoice_item_id === 'ii_abcd1234'
    && charged.resolved_at !== null, charged.state);
  ck('...and drops the lease, so nothing can claim it again',
    charged.claim_token === null && charged.lease_expires_at === null);

  const doubleComplete = await fails(
    `select public.complete_overage_settlement($1::uuid, $2::uuid, $3::text)`,
    [closed.id, token, 'ii_second999']);
  ck('A CHARGED SETTLEMENT CANNOT BE CHARGED AGAIN',
    /claim is not owned/.test(doubleComplete ?? ''), doubleComplete);

  // -------------------------------------------------------------------
  // 6. Indeterminate keeps the claim, because Stripe may have acted.
  // -------------------------------------------------------------------
  await accrue(OTHER, P1, P1_END, 'text_segments', 10, 500_000);
  const other = await close(OTHER, P1, P1_END);
  const otherToken = (await q(
    `select public.claim_overage_settlement($1::uuid, $2::text, false, $3::text) as t`,
    [other.id, `lgq:billing:v1:overage.settle:${'b'.repeat(64)}`, 'cus_efgh5678'])).rows[0].t;

  await q('select public.fail_overage_settlement($1::uuid, $2::uuid, $3::text, true)',
    [other.id, otherToken, 'provider_timeout']);
  const indeterminate = (await q('select * from public.workspace_overage_settlements where id = $1',
    [other.id])).rows[0];
  ck('an indeterminate failure keeps its claim token',
    indeterminate.state === 'indeterminate' && indeterminate.claim_token === otherToken,
    indeterminate.state);
  ck('...and is not resolved, so it stays in the queue',
    indeterminate.resolved_at === null);

  const sameKey = indeterminate.stripe_idempotency_key;
  const retryToken = (await q(
    `select public.claim_overage_settlement($1::uuid, $2::text, false, $3::text) as t`,
    [other.id, sameKey, 'cus_efgh5678'])).rows[0].t;
  ck('an indeterminate settlement is claimable again -- the key makes that safe',
    typeof retryToken === 'string' && retryToken !== otherToken);

  await q('select public.fail_overage_settlement($1::uuid, $2::uuid, $3::text, false)',
    [other.id, retryToken, 'card_declined']);
  const failed = (await q('select * from public.workspace_overage_settlements where id = $1',
    [other.id])).rows[0];
  ck('a terminal failure resolves and drops the lease',
    failed.state === 'failed' && failed.resolved_at !== null && failed.claim_token === null,
    failed.state);
  ck('...naming the reason', failed.last_error === 'card_declined');
  ck('...and counting both attempts', Number(failed.attempt_count) === 2);

  const badCode = await fails(
    'select public.fail_overage_settlement($1::uuid, $2::uuid, $3::text, false)',
    [closed.id, token, 'Card Declined!']);
  ck('an unshaped error code is refused rather than stored',
    /error code is invalid/.test(badCode ?? ''), badCode);

  // -------------------------------------------------------------------
  // 7. The arithmetic constraint is real, not decorative.
  // -------------------------------------------------------------------
  const badMath = await fails(`insert into public.workspace_overage_settlements
    (account_id, period_start, period_end, lines, total_millicents, chargeable_cents,
     residual_millicents, state, resolved_at)
    values ('${ACCOUNT}', '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', '[]'::jsonb,
            1000, 5, 0, 'closed', null)`);
  ck('a settlement whose figures do not reconcile cannot be stored',
    /amount_check/.test(badMath ?? ''), badMath);

  const badState = await fails(`insert into public.workspace_overage_settlements
    (account_id, period_start, period_end, lines, total_millicents, chargeable_cents,
     residual_millicents, state, stripe_invoice_item_id, resolved_at)
    values ('${ACCOUNT}', '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z', '[]'::jsonb,
            1000, 1, 0, 'closed', 'ii_abcd1234', null)`);
  ck('a closed settlement cannot already carry an invoice item',
    /state_shape_check/.test(badState ?? ''), badState);

  // -------------------------------------------------------------------
  // 8. Reach.
  // -------------------------------------------------------------------
  for (const role of ['anon', 'authenticated']) {
    for (const [label, sig] of [
      ['close a period', 'public.close_overage_period(uuid,timestamptz,timestamptz)'],
      ['claim a settlement', 'public.claim_overage_settlement(uuid,text,boolean,text)'],
      ['complete a settlement', 'public.complete_overage_settlement(uuid,uuid,text)'],
      ['fail a settlement', 'public.fail_overage_settlement(uuid,uuid,text,boolean)'],
    ]) {
      ck(`${role} cannot ${label}`,
        (await q('select has_function_privilege($1, $2, \'EXECUTE\') as ok', [role, sig]))
          .rows[0].ok === false);
    }
    ck(`${role} cannot write a settlement`,
      (await q(`select has_table_privilege($1,
        'public.workspace_overage_settlements', 'INSERT') as ok`, [role])).rows[0].ok === false);
  }
  ck('anon cannot read settlements at all',
    (await q(`select has_table_privilege('anon',
      'public.workspace_overage_settlements', 'SELECT') as ok`)).rows[0].ok === false);
  ck('an owner may read their own, through row-level security',
    (await q(`select relrowsecurity as ok from pg_class
      where oid = 'public.workspace_overage_settlements'::regclass`)).rows[0].ok === true
    && (await q(`select has_table_privilege('authenticated',
      'public.workspace_overage_settlements', 'SELECT') as ok`)).rows[0].ok === true);

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
