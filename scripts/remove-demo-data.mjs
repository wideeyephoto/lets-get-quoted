import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Remove seeded demo data from an account, in the order the foreign keys allow.
//
// WHY THIS EXISTS. Demo crew and their hours were seeded straight into
// production to make the dashboard look inhabited. That was fine while it was
// only rows in `crew` and `costs`. It stopped being fine once payroll started
// recording evidence about them: crew_pay_entry_lines and crew_pay_events are
// insert-and-read-only by RLS, and crew_pay_entries.crew_id is ON DELETE
// RESTRICT — so every payroll run makes the demo crew slightly harder to
// remove, and none of it can be undone through the app.
//
// DRY RUN BY DEFAULT. It prints every row it would delete, and — just as
// importantly — every crew member on the account it would KEEP, so an
// over-broad match is visible before it is destructive rather than after.
// Nothing is deleted without --apply.
//
// HOW DEMO ROWS ARE RECOGNISED. There is no is_demo column, and adding one for
// internal tooling would be a migration for its own sake. The markers below are
// descriptive of how the data was actually seeded, not a convention anyone has
// to remember:
//   crew     — an @example.com email, or a phone on the 555 exchange, which is
//              reserved and never assigned to real service, so it cannot collide
//              with a contractor's actual number
//   jobs     — a J-DEMO- reference prefix
//   customers— the same email/phone markers, which is what seed-customers.mjs
//              writes onto every client and lead it creates
// Anything else is treated as real. Pass --all-crew to override the crew match
// on an account you know has no real crew; it still lists what it will remove.
//
// ORDER MATTERS, and not only for the FK errors it avoids:
//   1. crew_pay_entry_lines / events / entries — RESTRICT blocks crew deletion
//   2. costs                                   — crew_id is ON DELETE SET NULL,
//      so deleting crew FIRST would leave orphaned labor costs sitting on real
//      jobs with no payee, quietly changing what those jobs cost
//   3. crew                                    — cascades assignments, prefs,
//      push subscriptions, sms events, time entries
//   4. demo jobs                               — cascades their own costs, feed,
//      tasks, tracking, invoices, payments, customer links
//   5. demo leads, then demo clients           — clients LAST, because
//      jobs.client_id and leads.client_id are both ON DELETE SET NULL: remove a
//      client while a REAL job still points at them and that job silently loses
//      its customer instead of failing loudly.
//
// Run:
//   node scripts/remove-demo-data.mjs --account <uuid>              (dry run: counts only)
//   node scripts/remove-demo-data.mjs --account <uuid> --rehearse   (really deletes, then rolls back)
//   node scripts/remove-demo-data.mjs --account <uuid> --apply
//
// --rehearse exists because counting rows proves nothing about whether the
// deletes will actually run in this order. It performs every statement inside
// the transaction, prints the real row counts, and rolls back — so a foreign
// key this script got wrong surfaces as a failed rehearsal rather than as a
// half-finished teardown.

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

const ACCOUNT = arg('account');
const REHEARSE = process.argv.includes('--rehearse');
const APPLY = process.argv.includes('--apply') || REHEARSE;
const ALL_CREW = process.argv.includes('--all-crew');

if (!ACCOUNT || typeof ACCOUNT !== 'string') {
  console.error('Usage: node scripts/remove-demo-data.mjs --account <uuid> [--rehearse | --apply] [--all-crew]');
  console.error('Without --apply this only reports. Never defaults to an account.');
  process.exit(1);
}

// The crew match, in one place so the dry run and the delete can never diverge.
const CREW_MATCH = ALL_CREW
  ? `c.account_id = $1`
  : `c.account_id = $1 and (c.email ilike '%@example.com' or regexp_replace(c.phone, '\\D', '', 'g') ~ '555[0-9]{4}$')`;

// The same two markers, for the customers seed-customers.mjs writes. Spelled as
// a fragment rather than a whole clause so the count and the delete cannot drift
// — the bug this file exists to avoid is a match that means one thing when it
// reports and another when it deletes. `t` is whichever of clients/leads the
// caller aliased.
// COALESCE IS LOad-BEARING. A client with no email and no phone makes both sides
// NULL, so the match is NULL: `where MATCH` excludes it (safe) but `where not
// MATCH` excludes it too, and the row vanishes from BOTH counts. The first run
// of this reported "2 to delete, 0 being kept" on an account holding 21 clients
// — a dry run that under-reports what survives is worse than no dry run, because
// this file's whole claim is that an over-broad match is visible before it is
// destructive.
const CUSTOMER_MATCH = `coalesce(t.email ilike '%@example.com' or regexp_replace(t.phone, '\\D', '', 'g') ~ '555[0-9]{4}$', false)`;

const money = (value) => `$${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

await loadEnv();
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('No DATABASE_URL in .env.local — this script talks to Postgres directly so it can use a transaction.');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const { rows: accountRows } = await client.query('select id, business_name from accounts where id = $1', [ACCOUNT]);
  if (accountRows.length === 0) {
    console.error(`No account ${ACCOUNT}.`);
    process.exit(1);
  }
  console.log(`Account: ${accountRows[0].business_name ?? '(unnamed)'} · ${ACCOUNT}`);
  console.log(
    REHEARSE
      ? '\nRehearsal. Every delete runs, then the whole transaction rolls back.\n'
      : APPLY
        ? '\n*** APPLYING — rows will be deleted ***\n'
        : '\nDry run. Nothing will be deleted. Add --apply to do it for real.\n',
  );

  const { rows: demoCrew } = await client.query(`select c.id, c.name, c.phone, c.email from crew c where ${CREW_MATCH} order by c.name`, [ACCOUNT]);
  const crewIds = demoCrew.map((row) => row.id);

  const { rows: keptCrew } = await client.query(
    `select c.id, c.name, c.phone, c.email from crew c where c.account_id = $1 and not (c.id = any($2::uuid[])) order by c.name`,
    [ACCOUNT, crewIds],
  );

  console.log(`Demo crew to remove (${demoCrew.length}):`);
  for (const row of demoCrew) console.log(`  - ${row.name} · ${row.phone ?? 'no phone'} · ${row.email ?? 'no email'}`);
  console.log(`\nCrew being KEPT (${keptCrew.length}):`);
  if (keptCrew.length === 0) console.log('  (none — this account has no crew that look real)');
  for (const row of keptCrew) console.log(`  - ${row.name} · ${row.phone ?? 'no phone'} · ${row.email ?? 'no email'}`);

  // What hangs off those crew.
  const counts = {};
  const count = async (label, sql, params) => {
    const { rows } = await client.query(sql, params);
    counts[label] = rows[0];
    return rows[0];
  };

  await count('labor costs', `select count(*)::int as n, coalesce(sum(hours),0)::float as hours, coalesce(sum(amount),0)::float as amount
     from costs where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  await count('pay entries', `select count(*)::int as n, count(*) filter (where status = 'paid')::int as paid,
     coalesce(sum(coalesce(paid_amount, approved_amount)),0)::float as amount
     from crew_pay_entries where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  await count('pay entry lines', `select count(*)::int as n from crew_pay_entry_lines l
     join crew_pay_entries e on e.id = l.pay_entry_id
     where l.account_id = $1 and e.crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  // Only events naming a demo crew member. Period-level events (crew_id null)
  // are left alone here — crew_pay_events.period_id cascades, so they go with
  // the period below if it empties, and survive if it does not.
  await count('pay history events', `select count(*)::int as n from crew_pay_events
     where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  await count('job assignments', `select count(*)::int as n from crew_assignments where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  await count('time entries', `select count(*)::int as n from time_entries where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  await count('demo jobs', `select count(*)::int as n from jobs where account_id = $1 and ref like 'J-DEMO-%'`, [ACCOUNT]);
  await count('demo clients', `select count(*)::int as n from clients t where t.account_id = $1 and ${CUSTOMER_MATCH}`, [ACCOUNT]);
  await count('demo leads', `select count(*)::int as n from leads t where t.account_id = $1 and ${CUSTOMER_MATCH}`, [ACCOUNT]);
  await count('kept clients', `select count(*)::int as n from clients t where t.account_id = $1 and not ${CUSTOMER_MATCH}`, [ACCOUNT]);
  await count('kept leads', `select count(*)::int as n from leads t where t.account_id = $1 and not ${CUSTOMER_MATCH}`, [ACCOUNT]);

  console.log('\nAttached to them:');
  console.log(`  labor costs        ${counts['labor costs'].n} (${counts['labor costs'].hours} h · ${money(counts['labor costs'].amount)})`);
  console.log(`  pay entries        ${counts['pay entries'].n} (${counts['pay entries'].paid} already marked paid · ${money(counts['pay entries'].amount)})`);
  console.log(`  pay entry lines    ${counts['pay entry lines'].n}   <- append-only in the app; only this script can remove them`);
  console.log(`  pay history events ${counts['pay history events'].n}   <- append-only in the app`);
  console.log(`  job assignments    ${counts['job assignments'].n}`);
  console.log(`  time entries       ${counts['time entries'].n}`);
  console.log(`  demo jobs (J-DEMO) ${counts['demo jobs'].n}   <- cascades their own costs, feed, tasks, invoices`);
  console.log('\nSeeded customers (seed-customers.mjs):');
  console.log(`  demo clients       ${counts['demo clients'].n}   <- @example.com or a 555-01xx phone`);
  console.log(`  demo leads         ${counts['demo leads'].n}`);
  console.log(`  clients being KEPT ${counts['kept clients'].n}`);
  console.log(`  leads being KEPT   ${counts['kept leads'].n}`);

  // Labor costs sitting on jobs that are NOT demo jobs are worth calling out:
  // removing them changes what a real job cost, which is a real edit even when
  // the labor was never real.
  const { rows: realJobImpact } = await client.query(
    `select j.ref, j.client_name, count(*)::int as entries, sum(k.amount)::float as amount
       from costs k join jobs j on j.id = k.job_id
      where k.account_id = $1 and k.crew_id = any($2::uuid[]) and j.ref not like 'J-DEMO-%'
      group by j.ref, j.client_name order by sum(k.amount) desc`,
    [ACCOUNT, crewIds],
  );
  if (realJobImpact.length > 0) {
    console.log(`\nThese are NOT demo jobs — their costs will drop when the demo labor goes:`);
    for (const row of realJobImpact) console.log(`  ${row.ref} · ${row.client_name} · ${row.entries} entries · ${money(row.amount)}`);
  }

  if (!APPLY) {
    console.log('\nNothing was changed. Re-run with --apply to delete the above.');
    process.exit(0);
  }

  await client.query('begin');

  const del = async (label, sql, params) => {
    const result = await client.query(sql, params);
    console.log(`  deleted ${result.rowCount} ${label}`);
    return result.rowCount;
  };

  // 1. Payroll evidence first — crew_pay_entries.crew_id is RESTRICT.
  await del('pay entry lines', `delete from crew_pay_entry_lines l using crew_pay_entries e
     where l.pay_entry_id = e.id and l.account_id = $1 and e.crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  await del('pay history events', `delete from crew_pay_events where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  await del('pay entries', `delete from crew_pay_entries where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);
  // Periods only once nothing is left in them — a period holding a real crew
  // member's payment has to survive.
  await del('empty pay periods', `delete from crew_pay_periods p where p.account_id = $1
     and not exists (select 1 from crew_pay_entries e where e.period_id = p.id)`, [ACCOUNT]);

  // 2. Labor costs BEFORE the crew, or SET NULL orphans them onto real jobs.
  await del('labor costs', `delete from costs where account_id = $1 and crew_id = any($2::uuid[])`, [ACCOUNT, crewIds]);

  // 3. The crew themselves. Assignments, prefs, push subs, sms events and time
  //    entries all cascade.
  await del('crew members', `delete from crew where account_id = $1 and id = any($2::uuid[])`, [ACCOUNT, crewIds]);

  // 4. Demo jobs — independent of the crew, and cascades widely: their invoices,
  //    payments and customer links all go with them.
  await del('demo jobs', `delete from jobs where account_id = $1 and ref like 'J-DEMO-%'`, [ACCOUNT]);

  // 5. Seeded customers. Leads first — leads.client_id is SET NULL, so removing
  //    the client first would leave a lead on the board with no customer behind
  //    it rather than removing the pair.
  await del('demo leads', `delete from leads t where t.account_id = $1 and ${CUSTOMER_MATCH}`, [ACCOUNT]);
  //    Clients LAST of everything: jobs.client_id is SET NULL too, so a real job
  //    pointing at one of these would silently lose its customer instead of
  //    raising. By here the demo jobs are already gone, so nothing real can.
  await del('demo clients', `delete from clients t where t.account_id = $1 and ${CUSTOMER_MATCH}`, [ACCOUNT]);

  if (REHEARSE) {
    await client.query('rollback');
    console.log('\nRehearsal complete — rolled back, nothing was deleted. The order above works.');
  } else {
    await client.query('commit');
    console.log('\nDone. Committed.');
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('\nFailed — rolled back, nothing was deleted.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
