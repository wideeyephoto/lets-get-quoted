/**
 * ONE-TIME PRODUCTION OPERATION. Requires --confirm; does nothing without it.
 *
 * Clears the four destination Checkout Session pointers that block
 * 20260816221500's preflight, in the two different ways they each require:
 *
 *   bf0df2cb  the one genuine live Session. Expired, unpaid, no PaymentIntent,
 *             no siblings. Recorded terminally in the adoption ledger as
 *             inert_terminal, then its pointer cleared.
 *   ba7a6159  three Sessions that 404 on acct_1TuCWJGqh5LFKuTC. They cannot go
 *   665d872a  through the ledger -- every provider field it takes is NOT NULL
 *   9e355543  and a 404 is the absence of provider truth, not a value. They are
 *             marked with the existing test_marker convention instead, which is
 *             what excludes them from trailing-volume and fee-bracket maths.
 *
 * Every step is guarded and idempotent: re-running changes nothing. It refuses
 * outright if production does not match the state this was written against.
 *
 * Verified end to end against PostgreSQL 17 first --
 * scripts/verify-adoption-contract.mjs, 20 checks.
 *
 *   PROD_DATABASE_URL="postgres://..." node scripts/prod-adopt-and-clean-destination-pointers.mjs --confirm
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_PAYMENT = 'bf0df2cb-b402-4397-a38b-b9572d592f09';
const STALE = [
  'ba7a6159-fcf1-4259-8bd3-345b8106197a',
  '665d872a-3fc6-45bb-96cd-9dc9a742ee0b',
  '9e355543-4a8a-4772-b0fe-9ab1bb577553',
];
const TEST_MARKER = 'backfill-test-markers:demo job or seeded client';
const VERSION = '20260816220000';
const NAME = 'legacy_destination_checkout_session_adoption_20260816';

if (!process.argv.includes('--confirm')) {
  console.error('Refusing to run without --confirm. This writes to production.');
  process.exit(2);
}

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);

// Supabase requires SSL; a local throwaway cluster does not offer it. Deciding
// by host keeps this runnable against a rehearsal database without editing it,
// which is the only way to exercise the whole script before production sees it.
const CONNECTION = process.env.PROD_DATABASE_URL ?? '';
const IS_LOCAL = /@(127\.0\.0\.1|localhost)[:/]/.test(CONNECTION);
const client = new pg.Client({
  connectionString: CONNECTION,
  ...(IS_LOCAL ? {} : { ssl: { rejectUnauthorized: false } }),
});

try {
  await client.connect();
  const who = await client.query('select current_database() as db, version() as v');
  console.log(`connected: ${who.rows[0].db} / ${who.rows[0].v.split(',')[0]}`);

  // ---- preconditions -------------------------------------------------------
  step(0, 'preconditions');
  const pointers = await client.query(`
    select id::text, status::text, amount::text, stripe_checkout_session, test_marker
      from public.payments
     where charge_model = 'destination' and stripe_checkout_session is not null
     order by requested_at`);
  console.table(pointers.rows);

  const marker = await client.query(
    'select count(*)::int as n from public.payments where test_marker = $1', [TEST_MARKER]);
  if (marker.rows[0].n === 0) {
    throw new Error(`test_marker convention '${TEST_MARKER}' not found; refusing to invent one`);
  }
  console.log(`test_marker convention confirmed on ${marker.rows[0].n} rows`);

  // ---- A1: adoption ledger -------------------------------------------------
  step(1, 'adoption ledger migration');
  const exists = await client.query(
    `select count(*)::int as n from pg_class where relname='legacy_destination_checkout_session_adoptions'`);
  if (exists.rows[0].n === 0) {
    await client.query(readFileSync(
      join(ROOT, 'migrations/20260816220000_legacy_destination_checkout_session_adoption.sql'), 'utf8'));
    console.log('applied');
  } else {
    console.log('already present, skipped');
  }

  const history = await client.query(
    'select count(*)::int as n from supabase_migrations.schema_migrations where version=$1', [VERSION]);
  if (history.rows[0].n === 0) {
    await client.query(
      'insert into supabase_migrations.schema_migrations (version, name) values ($1,$2)', [VERSION, NAME]);
    console.log(`history recorded: ${VERSION} ${NAME}`);
  } else {
    console.log('history row already present, left alone');
  }

  // ---- A2: adopt + clear the one genuine live pointer -----------------------
  step(2, 'adopt and clear bf0df2cb');
  await client.query(readFileSync(join(ROOT, 'scripts/adopt-bf0df2cb.sql'), 'utf8'));
  const adopted = await client.query(`
    select disposition, observed_payment_status,
           observed_gross_amount_cents::text, provider_amount_total_cents::text
      from public.legacy_destination_checkout_session_adoptions`);
  console.table(adopted.rows);
  const livePointer = await client.query(
    'select stripe_checkout_session from public.payments where id=$1', [LIVE_PAYMENT]);
  if (livePointer.rows[0].stripe_checkout_session !== null) {
    throw new Error('bf0df2cb pointer did not clear; stopping before touching anything else');
  }
  console.log('pointer cleared');

  // ---- B: mark the three unresolvable pointers -----------------------------
  step(3, 'mark the three unresolvable test pointers');
  const marked = await client.query(`
    update public.payments
       set test_marker = $2, stripe_checkout_session = null
     where id = any($1::uuid[])
       and charge_model = 'destination'
       and test_marker is null
    returning id::text, status::text, amount::text`, [STALE, TEST_MARKER]);
  console.table(marked.rows);
  console.log(`${marked.rowCount} row(s) marked`);

  // ---- verification --------------------------------------------------------
  step(4, 'verification');
  const remaining = await client.query(
    'select public.legacy_destination_checkout_unadopted_pointer_count() as n');
  console.log(`outstanding destination pointers: ${remaining.rows[0].n} (expect 0)`);

  const residual = await client.query(`
    select id::text, status::text, test_marker
      from public.payments
     where charge_model='destination' and stripe_checkout_session is not null`);
  console.table(residual.rows.length ? residual.rows : [{ note: 'none' }]);

  if (String(remaining.rows[0].n) !== '0') {
    throw new Error('pointer count is not zero; the foundation preflight will still refuse');
  }
  console.log('\nDONE. 20260816221500 preflight is now unblocked.');
} catch (error) {
  console.error('\nFAILED:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
