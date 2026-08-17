/**
 * Exercises the legacy destination Checkout adoption contract against a real
 * PostgreSQL 17 cluster, including the reviewed one-time production script in
 * scripts/adopt-bf0df2cb.sql.
 *
 * The rest of this migration's coverage is static: test/legacy-destination-
 * checkout-session-adoption-migration.test.ts reads the SQL as text and asserts
 * its shape. That catches a missing constraint but cannot catch a constraint that
 * does not fire, an RPC that rejects a legitimate call, or a script that is not
 * safe to re-run. Those need an engine, which is why this exists separately and
 * is not a *.test.ts file — vitest.config.ts collects only test/-star-star/-star.test.ts, and
 * requiring a database for the unit suite would be the wrong trade.
 *
 * It found one real defect: the production script called the adoption RPC
 * unconditionally, so a second run after a successful one raised "does not match
 * the recorded Session pointer" — the RPC checks that the payment still carries
 * the exact Session, and the first run had just cleared it. Harmless in a
 * transaction, but it reads as a failure to an operator and invites someone to
 * restore the pointer to make it pass. The script now filters to a pending CTE so
 * a completed run is a clean no-op.
 *
 * Usage, against a throwaway cluster only. It DROPS SCHEMA public CASCADE.
 *
 *   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGPASSWORD=... \
 *     node scripts/verify-adoption-contract.mjs
 *
 * The stub schema below is deliberately minimal: only the columns the adoption
 * migration actually reads, plus the composite key its foreign key targets. The
 * production base schema is not reproducible from this repo — no migration here
 * creates public.payments — so a full replay is not available, and a stub is the
 * honest substitute rather than a shortcut.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAYMENT = 'bf0df2cb-b402-4397-a38b-b9572d592f09';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const SESSION = 'cs_live_a1RKiUykiIblzCfdeMq7pEnQ5netaDslAVO1DXBmaqdJpgJ6159loKM2mN';
const CONNECT = 'acct_1TuEg3GjJLVfg2pQ';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

async function main() {
  const client = new pg.Client({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 54329),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'password',
    database: process.env.PGDATABASE ?? 'postgres',
  });
  await client.connect();

  for (const role of ['anon', 'authenticated', 'service_role']) {
    await client.query(
      `do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$;`,
    );
  }

  // Dropping only the tables leaves the migration's functions behind, and the
  // next run then fails on the trigger function rather than on anything real.
  await client.query(`
    drop schema public cascade;
    create schema public;
    grant usage on schema public to public;
    create table public.accounts (
      id uuid primary key,
      stripe_connect_id text
    );
    create table public.payments (
      id uuid primary key,
      account_id uuid not null references public.accounts(id),
      amount numeric(12,2) not null,
      charge_model text,
      status text not null,
      stripe_checkout_session text,
      unique (id, account_id)
    );
  `);
  check('stub schema created', true);

  try {
    await client.query(readFileSync(
      join(ROOT, 'migrations/20260816220000_legacy_destination_checkout_session_adoption.sql'),
      'utf8',
    ));
    check('adoption migration applies to a real PG17 cluster', true);
  } catch (error) {
    check('adoption migration applies to a real PG17 cluster', false, error.message);
    await client.end();
    return report();
  }

  await client.query('insert into public.accounts (id, stripe_connect_id) values ($1,$2)', [ACCOUNT, CONNECT]);
  await client.query(
    `insert into public.payments (id, account_id, amount, charge_model, status, stripe_checkout_session)
     values ($1,$2,$3,'destination','failed',$4)`,
    [PAYMENT, ACCOUNT, '125.00', SESSION],
  );

  const before = await client.query('select public.legacy_destination_checkout_unadopted_pointer_count() as n');
  check('counter sees the outstanding pointer', String(before.rows[0].n) === '1', `n=${before.rows[0].n}`);

  const script = readFileSync(join(ROOT, 'scripts/adopt-bf0df2cb.sql'), 'utf8');

  try {
    await client.query(script);
    check('adopt/clear script runs', true);
  } catch (error) {
    check('adopt/clear script runs', false, error.message);
  }

  const row = await client.query(`
    select disposition, observed_payment_status, observed_gross_amount_cents, provider_amount_total_cents
      from public.legacy_destination_checkout_session_adoptions`);
  check(
    'exactly one adoption row, inert_terminal',
    row.rowCount === 1 && row.rows[0].disposition === 'inert_terminal',
    JSON.stringify(row.rows[0] ?? null),
  );
  // 125.00 dollars against Stripe's 12500 cents. This conversion had never been
  // checked against a real Session before the 2026-08-17 audit.
  check(
    'amount reconciles at 12500 cents from both sides',
    row.rows[0] && String(row.rows[0].provider_amount_total_cents) === '12500'
      && String(row.rows[0].observed_gross_amount_cents) === '12500',
    row.rows[0] ? `provider=${row.rows[0].provider_amount_total_cents} observed=${row.rows[0].observed_gross_amount_cents}` : '',
  );

  const pointer = await client.query('select stripe_checkout_session from public.payments where id=$1', [PAYMENT]);
  check('pointer cleared', pointer.rows[0].stripe_checkout_session === null,
    `value=${pointer.rows[0].stripe_checkout_session}`);

  const after = await client.query('select public.legacy_destination_checkout_unadopted_pointer_count() as n');
  check('counter back to zero', String(after.rows[0].n) === '0', `n=${after.rows[0].n}`);

  // The regression this file was written for.
  let rerunError = null;
  try {
    await client.query(script);
  } catch (error) {
    rerunError = error.message;
    await client.query('rollback').catch(() => {});
  }
  check('re-running a completed script is a no-op, not an error', rerunError === null,
    rerunError ? `raised: ${rerunError}` : 'no error');

  const stillOne = await client.query(
    'select count(*)::int as n from public.legacy_destination_checkout_session_adoptions');
  check('still exactly one adoption row after re-run', stillOne.rows[0].n === 1, `n=${stillOne.rows[0].n}`);

  const expectFail = async (label, sql) => {
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('rollback');
      check(label, false, 'statement unexpectedly succeeded');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      check(label, true, error.message.split('\n')[0].slice(0, 90));
    }
  };

  await expectFail('ledger refuses UPDATE (append-only)',
    "update public.legacy_destination_checkout_session_adoptions set disposition='frozen_paid'");
  await expectFail('ledger refuses DELETE (append-only)',
    'delete from public.legacy_destination_checkout_session_adoptions');

  // Negative cases run against a second payment that still carries a pointer.
  const P2 = '22222222-2222-4222-8222-222222222222';
  const S2 = 'cs_live_secondpointerAAAAAAAAAAAAAAAAAAAA';
  await client.query(
    `insert into public.payments (id, account_id, amount, charge_model, status, stripe_checkout_session)
     values ($1,$2,'50.00','destination','failed',$3)`, [P2, ACCOUNT, S2]);

  const call = (over = {}) => {
    const a = {
      p: P2, s: S2, disp: 'inert_terminal', ss: 'expired', ps: 'unpaid', cents: 5000,
      cur: 'usd', live: true, exp: '2026-07-19T20:58:22Z', pi: null, ch: null, fee: null,
      dest: CONNECT, sib: 0, digest: 'a'.repeat(64), ...over,
    };
    const q = (v) => (v === null ? 'null' : `'${v}'`);
    return `select * from public.record_legacy_destination_checkout_session_adoption(
      '${a.p}'::uuid, '${a.s}', '${a.disp}', '${a.ss}', '${a.ps}', ${a.cents}, '${a.cur}',
      ${a.live}, '${a.exp}'::timestamptz, ${q(a.pi)}, ${q(a.ch)},
      ${a.fee === null ? 'null' : a.fee}, '${a.dest}', ${a.sib}, null,
      'contract verification', '${a.digest}', now())`;
  };

  await expectFail('refuses inert_terminal with a paid provider status', call({ ps: 'paid' }));
  await expectFail('refuses an amount that disagrees with payment truth', call({ cents: 9999 }));
  await expectFail('refuses a destination that is not the recipient', call({ dest: 'acct_9999999999999999' }));
  await expectFail('refuses sibling Sessions on a non-unsafe disposition', call({ sib: 2 }));
  await expectFail('refuses a livemode flag contradicting a cs_live_ id', call({ live: false }));
  await expectFail('refuses a malformed evidence digest', call({ digest: 'nothex' }));

  const first = await client.query(call());
  const second = await client.query(call());
  check('identical evidence replays instead of double-writing',
    first.rows[0].adoption_status === 'recorded' && second.rows[0].adoption_status === 'replay',
    `first=${first.rows[0].adoption_status} second=${second.rows[0].adoption_status}`);

  await expectFail('refuses a replay whose evidence changed', call({ digest: 'b'.repeat(64) }));

  await client.end();
  report();
}

function report() {
  const failed = results.filter((entry) => !entry.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('FAILURES:');
    for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('HARNESS ERROR:', error.message);
  process.exitCode = 1;
});
