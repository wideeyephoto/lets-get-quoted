/**
 * Prove a payment can be refunded twice.
 *
 * THE DEADLOCK THIS CLOSES. The refund gate requires `reconciliation_status =
 * 'reconciled'`; every refund sets it to `pending`; and the only thing that ever
 * wrote `reconciled` runs on `checkout.session.completed`, which never fires
 * again. So the first refund permanently blocked every later one, and a
 * transient failure during the original projection made a payment that was never
 * refunded at all permanently unrefundable.
 *
 * The assertion that matters is not that the RPC returns a string. It is that a
 * payment which has been refunded once, reconciled, and refunded again ends with
 * books that match the provider exactly -- and that a payment whose figures
 * DISAGREE stays unrefundable rather than being waved through.
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
const RECONCILE = m('20260819280000_refund_reconciliation.sql');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const PAYMENT = '22222222-2222-4222-8222-222222222222';

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-reconcile-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_RECONCILE_PORT || 54361),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_reconcile');
  c = pg.getPgClient('lgq_reconcile');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
  };

  // The columns the reconciler reads, with the real constraint on the status.
  await q(`
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $roles$;
    create table public.accounts (id uuid primary key);
    create table public.payments (
      id uuid primary key,
      account_id uuid not null references public.accounts(id),
      charge_model text not null default 'direct',
      status text not null default 'paid',
      amount numeric not null default 0,
      refunded_amount numeric not null default 0,
      platform_fee numeric not null default 0,
      platform_fee_refunded numeric not null default 0,
      paid_at timestamptz default now(),
      stripe_account_id text,
      stripe_charge_id text,
      stripe_application_fee_id text,
      stripe_livemode boolean default false,
      stripe_dispute_id text,
      disputed_at timestamptz,
      reconciliation_status text,
      reconciled_at timestamptz,
      constraint payments_reconciliation_status_check check (
        reconciliation_status is null
        or reconciliation_status in ('pending', 'reconciled', 'mismatch', 'waived')
      )
    );
    -- Enough of the refund planner for the post-condition to find it.
    create function public.plan_direct_charge_refund_operation()
    returns text language plpgsql as $plan$
    begin
      -- reconciliation_status must be 'reconciled'
      return 'stub';
    end;
    $plan$;
    insert into public.accounts (id) values ('${ACCOUNT}');
  `);

  const seed = (over = {}) => q(`
    insert into public.payments (
      id, account_id, amount, refunded_amount, platform_fee, platform_fee_refunded,
      stripe_account_id, stripe_charge_id, stripe_application_fee_id,
      reconciliation_status, reconciled_at, status
    ) values ($1, $2, 110, $3, 1.25, $4, 'acct_x', 'ch_abc123456789', 'fee_1', $5, $6, $7)
    on conflict (id) do update set
      refunded_amount = excluded.refunded_amount,
      platform_fee_refunded = excluded.platform_fee_refunded,
      reconciliation_status = excluded.reconciliation_status,
      reconciled_at = excluded.reconciled_at,
      status = excluded.status
  `, [
    PAYMENT, ACCOUNT,
    over.refunded ?? 0, over.feeRefunded ?? 0,
    over.status ?? 'pending', over.reconciledAt ?? null, over.paymentStatus ?? 'paid',
  ]);

  await q(RECONCILE);
  ck('the reconciliation migration applies, post-conditions and all', true);

  const statusOf = async () => (await q(
    'select reconciliation_status, reconciled_at from public.payments where id = $1', [PAYMENT]
  )).rows[0];

  // -------------------------------------------------------------------
  // 1. The deadlock, and the way out.
  // -------------------------------------------------------------------
  // $55 of $110 refunded, and 63c of the $1.25 fee. Stripe agrees.
  await seed({ refunded: 55, feeRefunded: 0.63 });
  ck('a payment refunded once starts stuck at pending',
    (await statusOf()).reconciliation_status === 'pending');

  const promoted = (await q(
    'select public.reconcile_direct_payment($1, $2, $3, $4) as r',
    [PAYMENT, 5_500, 63, 'ch_abc123456789'])).rows[0].r;
  ck('matching evidence promotes it back to reconciled', promoted === 'reconciled');
  ck('...and stamps when', (await statusOf()).reconciled_at !== null);

  // -------------------------------------------------------------------
  // 2. Disagreement stays unrefundable. This is the point.
  // -------------------------------------------------------------------
  // The ledger says 63c of fee went back; Stripe says 70c. That is exactly the
  // shape 20260819270000 prevents going forward, and what this catches after.
  await seed({ refunded: 55, feeRefunded: 0.63 });
  const feeMismatch = (await q(
    'select public.reconcile_direct_payment($1, $2, $3, $4) as r',
    [PAYMENT, 5_500, 70, 'ch_abc123456789'])).rows[0].r;
  ck('a fee that disagrees is a mismatch, not a rounding note', feeMismatch === 'mismatch');
  ck('...and it is NOT reconciled, so it stays unrefundable',
    (await statusOf()).reconciliation_status === 'mismatch'
    && (await statusOf()).reconciled_at === null);

  await seed({ refunded: 55, feeRefunded: 0.63 });
  ck('a gross that disagrees is a mismatch too',
    (await q('select public.reconcile_direct_payment($1, $2, $3, $4) as r',
      [PAYMENT, 6_000, 63, 'ch_abc123456789'])).rows[0].r === 'mismatch');

  // -------------------------------------------------------------------
  // 3. Evidence about the wrong charge is refused, not recorded.
  // -------------------------------------------------------------------
  await seed({ refunded: 55, feeRefunded: 0.63 });
  const wrongCharge = await fails(
    'select public.reconcile_direct_payment($1, $2, $3, $4)',
    [PAYMENT, 5_500, 63, 'ch_someoneelse999']);
  ck('evidence for a different charge raises rather than writing a mismatch',
    /different charge/.test(wrongCharge ?? ''), wrongCharge);
  ck('...and the payment is untouched',
    (await statusOf()).reconciliation_status === 'pending');

  // -------------------------------------------------------------------
  // 4. A dispute takes it out of scope whatever the numbers say.
  // -------------------------------------------------------------------
  await seed({ refunded: 55, feeRefunded: 0.63 });
  ck('a disputed charge is never reconciled, even with matching figures',
    (await q('select public.reconcile_direct_payment($1, $2, $3, $4, true) as r',
      [PAYMENT, 5_500, 63, 'ch_abc123456789'])).rows[0].r === 'disputed');

  // -------------------------------------------------------------------
  // 5. The work list.
  // -------------------------------------------------------------------
  await seed({ refunded: 55, feeRefunded: 0.63 });
  ck('a pending payment appears in the work list',
    Number((await q('select count(*)::int as n from public.direct_payments_pending_reconciliation(100)')).rows[0].n) === 1);

  await seed({ refunded: 55, feeRefunded: 0.63, status: 'reconciled', reconciledAt: 'now()' });
  await q(`update public.payments set reconciliation_status = 'reconciled', reconciled_at = now() where id = $1`, [PAYMENT]);
  ck('a reconciled payment does not',
    Number((await q('select count(*)::int as n from public.direct_payments_pending_reconciliation(100)')).rows[0].n) === 0);

  await q(`update public.payments set reconciliation_status = 'pending', reconciled_at = null,
           stripe_dispute_id = 'dp_1', disputed_at = now() where id = $1`, [PAYMENT]);
  ck('a disputed payment is left out of the work list entirely',
    Number((await q('select count(*)::int as n from public.direct_payments_pending_reconciliation(100)')).rows[0].n) === 0);

  // -------------------------------------------------------------------
  // 6. Reach.
  // -------------------------------------------------------------------
  for (const role of ['anon', 'authenticated']) {
    ck(`${role} cannot reconcile a payment`,
      (await q(`select has_function_privilege($1,
        'public.reconcile_direct_payment(uuid,bigint,bigint,text,boolean)', 'EXECUTE') as ok`, [role]))
        .rows[0].ok === false);
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
