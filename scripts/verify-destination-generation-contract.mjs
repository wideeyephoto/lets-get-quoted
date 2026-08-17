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
// Any uuid will do: the preflight's second arm only tests the pointer for null,
// and the stub declares no FK on it.
const LINEAGE_PK = '55555555-5555-4555-8555-555555555555';

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

/**
 * Mirrors production's real definitions for the columns and constraints these
 * migrations touch, taken from the catalog on 2026-08-17. Nullability and
 * defaults are copied exactly rather than guessed: an earlier version of this
 * stub declared refunded_amount nullable when production has it NOT NULL
 * DEFAULT 0, which manufactured a failure state that cannot occur and led to a
 * "fix" for a defect that did not exist. A stub that is wrong in the permissive
 * direction invents bugs; one that is wrong in the strict direction hides them.
 */
const STUB = `
  drop schema public cascade;
  create schema public;
  grant usage on schema public to public;
  create type public.payment_status as enum (
    'requested','processing','paid','failed','refunded','disputed'
  );
  create type public.payment_kind as enum (
    'deposit','stage','final','plan_installment'
  );
  create table public.accounts (
    id uuid primary key,
    stripe_connect_id text,
    -- The claim RPC will not mint a Checkout for a recipient that is not
    -- onboarded or whose payouts are restricted.
    connect_onboarded boolean not null default false,
    payouts_restricted_at timestamptz
  );
  create table public.payments (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts(id),
    amount numeric(12,2) not null,
    -- No default, because production has none. An earlier version of this stub
    -- invented a 'deposit' default, which let the fixture insert a payment without
    -- naming kind -- an INSERT production rejects with 23502. That is the same
    -- permissive direction as the refunded_amount error described above.
    kind public.payment_kind not null,
    status public.payment_status not null default 'requested',
    charge_model text not null default 'destination',
    stripe_checkout_session text,
    stripe_payment_intent text,
    stripe_charge_id text,
    stripe_account_id text,
    stripe_livemode boolean,
    paid_at timestamptz,
    disputed_at timestamptz,
    refunded_amount numeric(12,2) not null default 0,
    platform_fee_refunded numeric(12,2) not null default 0,
    eligible_service_refunded_amount numeric(12,2) default 0,
    current_checkout_operation_pk uuid,
    platform_fee numeric(12,2),
    fee_rate numeric(6,4),
    fee_basis_amount numeric(12,2),
    constraint payments_charge_model_check
      check (charge_model in ('destination','direct')),
    constraint payments_refunded_amount_check
      check (refunded_amount >= 0 and refunded_amount <= amount),
    constraint payments_platform_fee_refunded_check
      check (platform_fee_refunded >= 0
             and (platform_fee is null or platform_fee_refunded <= platform_fee)),
    constraint payments_fee_rate_check
      check (fee_rate is null or fee_rate between 0 and 1),
    constraint payments_platform_fee_check
      check (platform_fee is null
             or (platform_fee >= 0 and platform_fee <= amount
                 and (fee_basis_amount is null or platform_fee <= fee_basis_amount))),
    unique (id, account_id)
  );
`;

async function reset(client, { withPointer, withLineage = false }) {
  await client.query(STUB);
  await client.query(
    'insert into public.accounts (id, stripe_connect_id, connect_onboarded) values ($1,$2,true)',
    [ACCOUNT, CONNECT],
  );
  // refunded_amount is 0 rather than null on purpose: the claim RPC tests
  // `refunded_amount is distinct from 0`, so a null there makes a payment
  // unclaimable exactly like a refunded one would. See the note in the report.
  //
  // kind is named explicitly because the stub, like production, gives it no
  // default. withLineage seeds current_checkout_operation_pk so the preflight's
  // SECOND fail-closed arm can be exercised; leave the Session pointer null for
  // that case, or arm one refuses first and arm two is never reached.
  await client.query(
    `insert into public.payments
       (id, account_id, amount, kind, charge_model, status,
        stripe_checkout_session, current_checkout_operation_pk, refunded_amount)
     values ($1,$2,'125.00','deposit','destination','requested',$3,$4,0)`,
    [
      'bf0df2cb-b402-4397-a38b-b9572d592f09',
      ACCOUNT,
      withPointer ? 'cs_live_leftoverpointerAAAAAAAAAAAA' : null,
      withLineage ? LINEAGE_PK : null,
    ],
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

  // 1b. The preflight's OTHER fail-closed arm: a destination payment carrying a
  //     direct-rail Checkout lineage pointer, which is the cross-rail mix the
  //     migration header calls out. Until this case existed the arm was dead in the
  //     harness -- deleting it outright left the suite fully green -- so a refactor
  //     could have dropped the guard with nothing turning red.
  await reset(client, { withPointer: false, withLineage: true });
  let lineageRefusal = null;
  try {
    await client.query(foundation);
  } catch (error) {
    lineageRefusal = error;
    await client.query('rollback').catch(() => {});
  }
  check(
    'preflight refuses a destination payment holding a direct Checkout lineage pointer',
    lineageRefusal !== null && /unexpected direct Checkout lineage pointer/i.test(lineageRefusal.message),
    lineageRefusal
      ? `${lineageRefusal.code} ${lineageRefusal.message.slice(0, 70)}`
      : 'migration installed anyway',
  );
  check('and that refusal is 55000 as well',
    lineageRefusal?.code === '55000', `code=${lineageRefusal?.code}`);

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
  // rowCount is asserted so the label is true: reading rows[0] alone would inspect
  // the first of however many operation rows exist, and stay green in exactly the
  // double-mint this section is here to catch.
  check('the surviving operation carries two distinct provider idempotency keys',
    keys.rowCount === 1
    && keys.rows[0].ach_stripe_idempotency_key !== keys.rows[0].card_stripe_idempotency_key
    && /:ach$/.test(keys.rows[0].ach_stripe_idempotency_key)
    && /:card$/.test(keys.rows[0].card_stripe_idempotency_key),
    `rows=${keys.rowCount} ${keys.rows[0].ach_stripe_idempotency_key} | ${keys.rows[0].card_stripe_idempotency_key}`);

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
  // A conjunction, not a disjunction. As `||` this passed on either half alone, so
  // flipping projection_allowed to true in the replay return left the suite green --
  // which is precisely the double-settlement regression the check is cited for.
  check('a redelivery is recognized as a replay AND refused projection',
    replayed.rows[0].event_status === 'replay' && replayed.rows[0].projection_allowed === false,
    JSON.stringify({ status: replayed.rows[0].event_status, allowed: replayed.rows[0].projection_allowed }));

  // Not a row count. `id` is the primary key, so `count(*) where id=$1` is 0 or 1 by
  // construction and can never show a second settlement. A double settlement would
  // show up as the settled row being rewritten -- a fresh paid_at, a re-bound
  // PaymentIntent, a recomputed fee -- so compare against the snapshot taken before
  // the replay.
  const afterReplay = await client.query(
    'select status, paid_at, stripe_payment_intent, stripe_checkout_session, platform_fee from public.payments where id=$1',
    [PAYMENT_ID]);
  const stamp = (row) => JSON.stringify({
    status: row.status,
    paid_at: row.paid_at instanceof Date ? row.paid_at.toISOString() : row.paid_at,
    pi: row.stripe_payment_intent,
    session: row.stripe_checkout_session,
    fee: String(row.platform_fee),
  });
  const beforeStamp = stamp(settled.rows[0]);
  const afterStamp = afterReplay.rowCount === 1 ? stamp(afterReplay.rows[0]) : `rows=${afterReplay.rowCount}`;
  check('the redelivery left the settled row untouched, not re-settled',
    beforeStamp === afterStamp,
    beforeStamp === afterStamp ? `unchanged ${afterStamp}` : `before ${beforeStamp} after ${afterStamp}`);

  // 7. The refund scope check, against the shape production actually has.
  //    refunded_amount is NOT NULL DEFAULT 0, so `is distinct from 0` and a
  //    coalesced form are equivalent and the guard is exercised only by a real
  //    non-zero refund. Asserting both directions keeps that honest: a default
  //    row claims, a partially refunded one does not.
  const REFUNDED_PAYMENT = '33333333-3333-4333-8333-333333333333';
  await reset(client, { withPointer: false });
  await client.query(foundation);
  await client.query(
    `insert into public.payments (id, account_id, amount, kind, charge_model, status)
     values ($1,$2,'125.00','deposit','destination','requested')`,
    [REFUNDED_PAYMENT, ACCOUNT],
  );
  const defaulted = await client.query(claimSql, [REFUNDED_PAYMENT, ...args.slice(1)]);
  check('a payment at the default refund state is claimable',
    defaulted.rows[0].claim_status === 'claimed', `status=${defaulted.rows[0].claim_status}`);

  const PARTIAL_REFUND = '44444444-4444-4444-8444-444444444444';
  await client.query(
    `insert into public.payments (id, account_id, amount, kind, charge_model, status, refunded_amount)
     values ($1,$2,'125.00','deposit','destination','requested','25.00')`,
    [PARTIAL_REFUND, ACCOUNT],
  );
  let refundedError = null;
  try {
    await client.query(claimSql, [PARTIAL_REFUND, ...args.slice(1)]);
  } catch (error) {
    refundedError = error.message;
  }
  check('a partially refunded payment is refused as out of scope',
    refundedError !== null && /not claimable/i.test(refundedError),
    refundedError ? refundedError.slice(0, 70) : 'claim was granted');

  // 8. The failure side. The projection gate stands failure down as well as
  //    settlement, so the classifier owning it has to actually mark the payment
  //    failed -- otherwise an expired Checkout leaves the row stuck forever.
  const FAIL_SESSION = 'cs_live_expiredAAAAAAAAAAAAAAAAAAAAAAAAAA';
  await reset(client, { withPointer: false });
  await client.query(foundation);
  const fc = (await client.query(claimSql, args)).rows[0];
  await client.query('select public.begin_legacy_destination_checkout_submission($1,$2)', [fc.operation_pk, fc.claim_token]);
  await client.query(
    `select public.complete_legacy_destination_checkout_operation($1,$2,$3,'open','unpaid',$4)`,
    [fc.operation_pk, fc.claim_token, FAIL_SESSION, new Date(Date.now() + 3600_000).toISOString()]);

  const failObserved = new Date().toISOString();
  const failClass = await client.query(
    `select * from public.classify_legacy_destination_checkout_event(
       $1,'checkout.session.expired',$2,$3,$2,null,true,'failure','expired','unpaid',$4::timestamptz)`,
    ['evt_expired12345678', FAIL_SESSION, PAYMENT_ID, failObserved]);
  check('an expired Checkout classifies as a current failure',
    failClass.rows[0].projection_allowed === true,
    JSON.stringify({ status: failClass.rows[0].event_status, allowed: failClass.rows[0].projection_allowed }));

  const failed = await client.query('select status from public.payments where id=$1', [PAYMENT_ID]);
  check('the payment is marked failed rather than left stuck',
    failed.rows[0].status === 'failed', `status=${failed.rows[0].status}`);

  // A failure must never overwrite a settled payment.
  await client.query("update public.payments set status='paid' where id=$1", [PAYMENT_ID]);
  await client.query(
    `select * from public.classify_legacy_destination_checkout_event(
       $1,'checkout.session.expired',$2,$3,$2,null,true,'failure','expired','unpaid',$4::timestamptz)`,
    ['evt_expired87654321', FAIL_SESSION, PAYMENT_ID, new Date().toISOString()]);
  const stillPaid = await client.query('select status from public.payments where id=$1', [PAYMENT_ID]);
  check('a late failure cannot demote an already-paid payment',
    stillPaid.rows[0].status === 'paid', `status=${stillPaid.rows[0].status}`);

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
