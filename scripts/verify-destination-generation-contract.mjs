/**
 * Exercises the legacy destination Checkout generation foundation against a real
 * PostgreSQL 17 cluster: its fail-closed preflight, and the two-session race it
 * exists to prevent.
 *
 * The static test over this migration asserts the SQL's shape. It cannot show
 * that the preflight actually refuses to install, nor that two concurrent callers
 * are genuinely serialized into one Checkout generation — which is the entire
 * safety claim of this rail, and the one that turns into a double charge if it is
 * wrong. Those need an engine and two real connections.
 *
 * Usage, against a throwaway cluster only. It DROPS SCHEMA public CASCADE.
 *
 *   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGPASSWORD=... \
 *     node scripts/verify-destination-generation-contract.mjs
 *
 * The stub schema is minimal but sufficient: this migration references only
 * public.payments and public.accounts besides the objects it creates, so unlike
 * most of the backlog it can be exercised without replaying the whole chain.
 * current_checkout_operation_pk is stubbed because migration 20260816161844
 * creates it and the preflight reads it — without that column the preflight dies
 * on 42703 instead of its intended domain error, which is itself worth pinning.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOUNDATION = join(ROOT, 'migrations/20260816221500_legacy_destination_checkout_generation_foundation.sql');
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CONNECT = 'acct_1TuEg3GjJLVfg2pQ';
// The RPC requires ^[0-9a-f]{64}$ -- a request fingerprint is a digest, and it
// refuses anything that is not shaped like one.
const FINGERPRINT = 'a1b2c3d4'.repeat(8);

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
}

function connection() {
  return new pg.Client({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 54329),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'password',
    database: process.env.PGDATABASE ?? 'postgres',
  });
}

const STUB = `
  drop schema public cascade;
  create schema public;
  grant usage on schema public to public;
  create table public.accounts (
    id uuid primary key,
    stripe_connect_id text,
    -- The claim RPC will not mint a Checkout for a recipient that is not
    -- onboarded or whose payouts are restricted.
    connect_onboarded boolean not null default false,
    payouts_restricted_at timestamptz
  );
  create table public.payments (
    id uuid primary key,
    account_id uuid not null references public.accounts(id),
    amount numeric(12,2) not null,
    charge_model text,
    status text not null,
    stripe_checkout_session text,
    stripe_payment_intent text,
    stripe_charge_id text,
    paid_at timestamptz,
    disputed_at timestamptz,
    refunded_amount numeric(12,2),
    current_checkout_operation_pk uuid,
    -- classify writes both of these on the paid path.
    platform_fee numeric(12,2),
    fee_rate numeric,
    unique (id, account_id)
  );
`;

async function reset(client, { withPointer }) {
  await client.query(STUB);
  await client.query(
    'insert into public.accounts (id, stripe_connect_id, connect_onboarded) values ($1,$2,true)',
    [ACCOUNT, CONNECT],
  );
  // refunded_amount is 0 rather than null on purpose: the claim RPC tests
  // `refunded_amount is distinct from 0`, so a null there makes a payment
  // unclaimable exactly like a refunded one would. See the note in the report.
  await client.query(
    `insert into public.payments
       (id, account_id, amount, charge_model, status, stripe_checkout_session, refunded_amount)
     values ($1,$2,'125.00','destination','requested',$3,0)`,
    ['bf0df2cb-b402-4397-a38b-b9572d592f09', ACCOUNT, withPointer ? 'cs_live_leftoverpointerAAAAAAAAAAAA' : null],
  );
}

async function main() {
  const client = connection();
  await client.connect();
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await client.query(
      `do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$;`,
    );
  }
  const foundation = readFileSync(FOUNDATION, 'utf8');

  // 1. Fail-closed preflight, with a leftover Session pointer present.
  await reset(client, { withPointer: true });
  let refusal = null;
  try {
    await client.query(foundation);
  } catch (error) {
    refusal = error;
    await client.query('rollback').catch(() => {});
  }
  check(
    'preflight refuses to install while a destination Session pointer exists',
    refusal !== null && /provider-audited backfill/i.test(refusal.message),
    refusal ? `${refusal.code} ${refusal.message.slice(0, 70)}` : 'migration installed anyway',
  );
  check('and refuses with 55000, not a syntax or missing-column error',
    refusal?.code === '55000', `code=${refusal?.code}`);

  // 2. The same migration installs once the pointer is cleared.
  await reset(client, { withPointer: false });
  let installed = true;
  try {
    await client.query(foundation);
  } catch (error) {
    installed = false;
    check('foundation installs on a clean pointer state', false, error.message.slice(0, 120));
  }
  if (!installed) { await client.end(); return report(); }
  check('foundation installs on a clean pointer state', true);

  // 3. First claim wins outright.
  const claimSql = `select * from public.claim_legacy_destination_checkout_operation($1,$2,$3,$4,$5,$6)`;
  const args = ['bf0df2cb-b402-4397-a38b-b9572d592f09', true, FINGERPRINT, 12500, 625, 0.05];
  const first = await client.query(claimSql, args);
  check('a first claim is granted', first.rows[0].claim_status === 'claimed',
    `status=${first.rows[0].claim_status} generation=${first.rows[0].checkout_generation}`);
  check('the granted claim carries a token and generation 1',
    first.rows[0].claim_token !== null && first.rows[0].checkout_generation === 1,
    `token=${first.rows[0].claim_token ? 'set' : 'null'} gen=${first.rows[0].checkout_generation}`);

  // 4. A second claim while the lease is live must not mint a second generation.
  const second = await client.query(claimSql, args);
  check('a second claim under a live lease is refused a new generation',
    second.rows[0].claim_status !== 'claimed',
    `status=${second.rows[0].claim_status}`);

  // 5. The real race: two connections claiming concurrently, the second entering
  //    while the first transaction is still open and holding the row lock.
  await reset(client, { withPointer: false });
  await client.query(foundation);

  const a = connection();
  const b = connection();
  await a.connect();
  await b.connect();

  await a.query('begin');
  const aResult = await a.query(claimSql, args);

  let bResolved = false;
  const bPromise = (async () => {
    await b.query('begin');
    const r = await b.query(claimSql, args);
    await b.query('commit');
    bResolved = true;
    return r;
  })();

  // Give B a real chance to run. If the lock were not taken it would finish here.
  await new Promise((r) => setTimeout(r, 700));
  const bBlockedWhileAOpen = !bResolved;
  await a.query('commit');
  const bResult = await bPromise;

  check('the second concurrent claim blocks until the first commits',
    bBlockedWhileAOpen, bBlockedWhileAOpen ? 'blocked as expected' : 'B completed while A held the row');
  check('exactly one of two concurrent claims is granted',
    [aResult.rows[0].claim_status, bResult.rows[0].claim_status].filter((s) => s === 'claimed').length === 1,
    `A=${aResult.rows[0].claim_status} B=${bResult.rows[0].claim_status}`);

  const ops = await client.query(
    'select count(*)::int as n, count(distinct checkout_generation)::int as gens from public.legacy_destination_checkout_operations');
  check('the race produced exactly one operation row, at one generation',
    ops.rows[0].n === 1 && ops.rows[0].gens === 1, `rows=${ops.rows[0].n} generations=${ops.rows[0].gens}`);

  const keys = await client.query(
    'select ach_stripe_idempotency_key, card_stripe_idempotency_key from public.legacy_destination_checkout_operations');
  check('the surviving operation carries two distinct provider idempotency keys',
    keys.rows[0].ach_stripe_idempotency_key !== keys.rows[0].card_stripe_idempotency_key
    && /:ach$/.test(keys.rows[0].ach_stripe_idempotency_key)
    && /:card$/.test(keys.rows[0].card_stripe_idempotency_key),
    `${keys.rows[0].ach_stripe_idempotency_key} | ${keys.rows[0].card_stripe_idempotency_key}`);

  await a.end();
  await b.end();

  // 6. Full lifecycle through to settlement. This is the path the projection
  //    gate hands ownership to, so "does it actually mark the payment paid" is
  //    the question that decides whether that handover is safe.
  const PAYMENT_ID = 'bf0df2cb-b402-4397-a38b-b9572d592f09';
  const SESSION_ID = 'cs_live_lifecycleAAAAAAAAAAAAAAAAAAAAAAAA';
  const PI_ID = 'pi_lifecycle12345678';
  await reset(client, { withPointer: false });
  await client.query(foundation);

  const claimed = (await client.query(claimSql, args)).rows[0];
  const opPk = claimed.operation_pk;
  const token = claimed.claim_token;

  const began = await client.query(
    'select public.begin_legacy_destination_checkout_submission($1,$2) as ok', [opPk, token]);
  check('submission can be begun under the live claim token', began.rows[0].ok === true,
    `ok=${began.rows[0].ok}`);

  // This completes the OPERATION -- the provider create call -- not the payment.
  // The Session it binds has just been created, so the only lifecycle it accepts
  // is open/unpaid; a complete/paid Session here is rejected as invalid evidence.
  const completed = await client.query(
    `select public.complete_legacy_destination_checkout_operation($1,$2,$3,'open','unpaid',$4) as ok`,
    [opPk, token, SESSION_ID, new Date(Date.now() + 3600_000).toISOString()]);
  check('the operation completes with the freshly created Session bound',
    completed.rows[0].ok === true, `ok=${completed.rows[0].ok}`);

  // A redelivery carries the same event, so observed_at is fixed rather than
  // now(): the RPC refuses a "replay" whose input differs, which is the point.
  const OBSERVED = new Date().toISOString();
  const classified = await client.query(
    `select * from public.classify_legacy_destination_checkout_event(
       $1,'checkout.session.completed',$2,$3,$2,$4,true,'success','complete','paid',$5::timestamptz)`,
    ['evt_lifecycle12345678', SESSION_ID, PAYMENT_ID, PI_ID, OBSERVED]);
  check('a signed paid completion classifies as current and projectable',
    classified.rows[0].projection_allowed === true,
    JSON.stringify({ status: classified.rows[0].event_status, disposition: classified.rows[0].disposition,
      allowed: classified.rows[0].projection_allowed }));

  const settled = await client.query(
    'select status, paid_at, stripe_payment_intent, stripe_checkout_session, platform_fee from public.payments where id=$1',
    [PAYMENT_ID]);
  check('the payment is marked paid with the provider identities bound',
    settled.rows[0].status === 'paid'
      && settled.rows[0].paid_at !== null
      && settled.rows[0].stripe_payment_intent === PI_ID
      && settled.rows[0].stripe_checkout_session === SESSION_ID,
    JSON.stringify(settled.rows[0]));
  check('the application fee is projected as dollars, not cents',
    String(settled.rows[0].platform_fee) === '6.25', `platform_fee=${settled.rows[0].platform_fee}`);

  // At-least-once delivery: the same signed event must not settle twice.
  const replayed = await client.query(
    `select * from public.classify_legacy_destination_checkout_event(
       $1,'checkout.session.completed',$2,$3,$2,$4,true,'success','complete','paid',$5::timestamptz)`,
    ['evt_lifecycle12345678', SESSION_ID, PAYMENT_ID, PI_ID, OBSERVED]);
  check('a redelivery of the same event is recognized as a replay',
    replayed.rows[0].event_status === 'replay' || replayed.rows[0].projection_allowed === false,
    JSON.stringify({ status: replayed.rows[0].event_status, allowed: replayed.rows[0].projection_allowed }));

  const afterReplay = await client.query(
    'select count(*)::int as n from public.payments where id=$1 and status=$2', [PAYMENT_ID, 'paid']);
  check('the payment is still settled exactly once after redelivery',
    afterReplay.rows[0].n === 1, `n=${afterReplay.rows[0].n}`);

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
  // Open pool connections keep the event loop alive, so a mid-run failure would
  // otherwise hang instead of reporting.
  process.exit(1);
});
