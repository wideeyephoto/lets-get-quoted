// Stamp test_marker on the seeded and probe rows that predate the column.
//
// WHY. migrations/2026-08-24-test-record-marker.sql added test_marker, and every
// seeding and probe script now sets it on the rows it writes. But the column can
// only speak for rows written after it existed — everything already in the
// database reads null, which means "real". On a database whose clients table is
// mostly seeded personas, turning the read filter on without this changes
// nothing at all, because there is nothing marked to exclude.
//
// So this stamps what is already there, using the SAME two markers
// scripts/remove-demo-data.mjs already trusts enough to DELETE rows on, and the
// same J-DEMO- reference the seeder writes:
//   clients, leads — an @example.com address, or a phone on the 555 exchange
//   jobs           — a J-DEMO- reference prefix
//   invoices, payments — reached through the demo job they hang off, because
//                    neither carries a name, an email or a phone of its own.
//
// THIS DOES NOT DELETE ANYTHING, and that is the point of preferring it to
// remove-demo-data.mjs. Stamping is reversible: undoing it is
// `update <table> set test_marker = null where test_marker like 'backfill%'`.
// A row this gets wrong is hidden from a list, not lost from the business.
//
// WHAT IT DELIBERATELY DOES NOT CATCH. src/lib/test-data-markers.ts also has a
// placeholder-NAME rule, and it is written to be conservative: only whole names
// built entirely from placeholder words ("Test User"), never "Brett Test", a man
// with a surname. Names like "Skip Tester" and "ZZ Probe Client" are obviously
// junk to a human and are NOT matched by that rule or by this script — "tester"
// and "probe" are not in the vocabulary, and adding them is a bet that no
// customer in any trade is called that. Those rows are REPORTED here and left
// alone, so the decision to widen the vocabulary stays a human one.
//
// ONLY EVER FILLS A NULL. Every update carries `and test_marker is null`, so a
// row a script already stamped keeps that script's name — this can never
// overwrite the answer to "which script wrote this". Safe to run twice.
//
// Run:
//   node scripts/backfill-test-markers.mjs                     (dry run: counts only)
//   node scripts/backfill-test-markers.mjs --rehearse          (really writes, then rolls back)
//   node scripts/backfill-test-markers.mjs --apply
//   node scripts/backfill-test-markers.mjs --account <uuid>    (scope to one account)
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

async function loadEnv() {
  const contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? true;
}

const ACCOUNT = typeof arg('account') === 'string' ? arg('account') : null;
const REHEARSE = process.argv.includes('--rehearse');
const APPLY = process.argv.includes('--apply') || REHEARSE;

// The contact match, in one place so the report and the write can never diverge.
// COALESCE is load-bearing: a row with neither email nor phone makes both sides
// NULL, and without it such a row falls out of BOTH the matched and the kept
// count — a report that under-states what survives is worse than no report.
const contactOn = (alias) =>
  `coalesce(${alias}.email ilike '%@example.com' or regexp_replace(${alias}.phone, '\\D', '', 'g') ~ '555[0-9]{4}$', false)`;
const CONTACT_MATCH = contactOn('t');
const SCOPE = ACCOUNT ? `and t.account_id = $1` : '';
const PARAMS = ACCOUNT ? [ACCOUNT] : [];

// Reached through the relationship, not through a marker set earlier in this
// run, so the dry run and the write compute the same set and neither depends on
// the order the tables are stamped in.
//
// THE J-DEMO- REF IS NOT ENOUGH ON ITS OWN. Only the seeder's own jobs carry it;
// seed-customers.mjs writes ordinary-looking work against the personas it
// creates, and on this database that was 85 of 484 jobs matched by ref against
// 390 of 432 clients matched by contact. Jobs, invoices and payments are where
// every money figure the audit flagged comes from, so leaving them out would
// stamp the names and keep the revenue.
const TEST_CLIENT_IDS = `select c.id from clients c where ${contactOn('c')}`;
const TEST_JOB_IDS = `select j.id from jobs j where j.ref like 'J-DEMO-%' or j.client_id in (${TEST_CLIENT_IDS})`;

// Names a human reads as junk that the placeholder vocabulary does not match.
// Reported, never written — see the header.
const UNMATCHED_LOOK = `(t.name ilike '%probe%' or t.name ilike '%tester%' or t.name ilike '%delete me%' or t.name ilike 'zz %')`;

const TABLES = [
  { name: 'clients', where: CONTACT_MATCH, reason: 'seeded contact' },
  { name: 'leads', where: CONTACT_MATCH, reason: 'seeded contact' },
  { name: 'jobs', where: `t.ref like 'J-DEMO-%' or t.client_id in (${TEST_CLIENT_IDS})`, reason: 'demo job or seeded client' },
  { name: 'invoices', where: `t.job_id in (${TEST_JOB_IDS})`, reason: 'demo job or seeded client' },
  { name: 'payments', where: `t.job_id in (${TEST_JOB_IDS})`, reason: 'demo job or seeded client' },
];

async function main() {
  await loadEnv();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(ACCOUNT ? `Account ${ACCOUNT}` : 'ALL accounts');
  console.log(APPLY ? (REHEARSE ? 'REHEARSE — writes, then rolls back\n' : 'APPLY — writing\n') : 'DRY RUN — nothing is written\n');

  console.log('table       total   already   to stamp   left real');
  const planned = {};
  for (const table of TABLES) {
    const { rows } = await client.query(
      `select count(*)::int total,
              count(*) filter (where t.test_marker is not null)::int already,
              count(*) filter (where t.test_marker is null and (${table.where}))::int to_stamp
         from ${table.name} t where true ${SCOPE}`,
      PARAMS,
    );
    const r = rows[0];
    planned[table.name] = r.to_stamp;
    const real = r.total - r.already - r.to_stamp;
    console.log(
      table.name.padEnd(11),
      String(r.total).padStart(5),
      String(r.already).padStart(9),
      String(r.to_stamp).padStart(10),
      String(real).padStart(11),
    );
  }

  for (const name of ['clients', 'leads']) {
    const { rows } = await client.query(
      `select t.name, count(*)::int n from ${name} t
        where t.test_marker is null and not (${CONTACT_MATCH}) and ${UNMATCHED_LOOK} ${SCOPE}
        group by t.name order by count(*) desc limit 10`,
      PARAMS,
    );
    if (!rows.length) continue;
    console.log(`\nLooks like junk but NOT stamped (${name}) — widen the vocabulary by hand or leave it:`);
    for (const row of rows) console.log(`  ${String(row.n).padStart(4)}  ${row.name}`);
  }

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply (or --rehearse first).');
    await client.end();
    return;
  }

  await client.query('begin');
  let total = 0;
  for (const table of TABLES) {
    const marker = `backfill-test-markers:${table.reason}`;
    const result = await client.query(
      `update ${table.name} t set test_marker = $${PARAMS.length + 1}
        where t.test_marker is null and (${table.where}) ${SCOPE}`,
      [...PARAMS, marker],
    );
    total += result.rowCount;
    const expected = planned[table.name];
    const drift = result.rowCount === expected ? '' : `  <- expected ${expected}`;
    console.log(`\nstamped ${String(result.rowCount).padStart(5)}  ${table.name}${drift}`);
  }

  if (REHEARSE) {
    await client.query('rollback');
    console.log(`\nRehearsed ${total} rows, rolled back. Nothing changed.`);
  } else {
    await client.query('commit');
    console.log(`\nStamped ${total} rows. Undo: update <table> set test_marker = null where test_marker like 'backfill%';`);
  }
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
