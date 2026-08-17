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
//   jobs     — test_marker, or a J-DEMO- reference prefix
//   customers— the same email/phone markers, which is what seed-customers.mjs
//              writes onto every client and lead it creates
// Anything else is treated as real. Pass --all-crew to override the crew match
// on an account you know has no real crew; it still lists what it will remove.
//
// WHY JOBS ALSO MATCH ON test_marker, since 2026-08-17. They used to match on
// the J-DEMO- prefix alone, and a review against production found that reached
// 32 of 264 seeded payments. Payments are never matched directly — they are
// removed as a cascade of the job delete — so a seeded payment on a J-1038-style
// job was untouchable, and only one of the five accounts had any J-DEMO- job at
// all. 232 seeded payments survived, $76,150 of them, 171 marked paid.
// docs/demo-data-sweep-review-2026-08-17.md has the numbers.
//
// AND WHY test_marker ALONE IS NOT ENOUGH. Widening the job match to
// `test_marker is not null` on its own would have deleted the one thing on this
// platform that must not be deleted. Payment 6e2e7689 — the real $0.50 live
// capture and refund on a cs_live_ Session — sits on job J-1038, and J-1038 is
// itself marked demo with a seeded @example.com client. Widening the job match
// deletes the job; payments.job_id is ON DELETE CASCADE; the real payment goes
// with it.
//
// So a seeded job is held back when it holds a payment that is NOT marked. That
// gives the property this file now asserts before it deletes anything:
//
//     NO UNMARKED PAYMENT IS EVER DELETED.
//
// Stated that way it protects the next real payment too, which hardcoding
// 6e2e7689 would not. If the assertion ever fails the run aborts having changed
// nothing, and the failure is the interesting news rather than the deletion.
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
//   5. leftover marked payments                — the ones on a job that SURVIVES,
//      which the cascade in 4 cannot reach
//   6. demo leads, then demo clients           — clients LAST, because
//      jobs.client_id and leads.client_id are both ON DELETE SET NULL: remove a
//      client while a REAL job still points at them and that job silently loses
//      its customer instead of failing loudly.
//
// STEP 6 USED TO BE UNSOUND, and the argument for it was the giveaway: "by here
// the demo jobs are already gone, so nothing real can" lose its customer. That
// is only true if demo clients own nothing but demo jobs. Against production, 392
// surviving jobs pointed at a client this script deletes — 228 of them holding
// payments, 3 not marked demo at all — plus 155 leads. Both FKs are SET NULL, so
// every one of those would have gone quiet rather than loud.
//
// It was invisible in the dry run for a structural reason worth remembering: the
// dry run counted clients, and never asked what pointed AT them. So the client
// delete now carries its own guard — a demo client with a surviving job or lead
// still attached is KEPT and listed — and the report prints the references, not
// just the counts. The guard is evaluated at delete time, after step 4, so a
// client whose only job was itself demo is still removed.
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
  // Missing .env.local is not an error: this repo is checked out as a worktree in
  // some places and the file only exists in the primary checkout. Fall through to
  // whatever is already in the environment and let the DATABASE_URL check below
  // produce the message, which says something useful.
  let contents;
  try {
    contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
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
// Generated for a caller-chosen alias rather than hardcoded to `t`, because the
// same match is now needed for `leads l` inside the client guard below. One
// generator keeps the original property: there is a single spelling, so the count
// and the delete cannot drift.
const customerMarkers = (alias) =>
  `coalesce(${alias}.email ilike '%@example.com' or regexp_replace(${alias}.phone, '\\D', '', 'g') ~ '555[0-9]{4}$', false)`;
const CUSTOMER_MATCH = customerMarkers('t');

// A seeded job. test_marker covers everything backfill-test-markers.mjs and the
// seeders have written; the J-DEMO- prefix covers the older rows the marker
// column could not speak for, which is the same reason
// src/lib/test-data-markers.ts keeps both. `j` is the caller's jobs alias.
const JOB_SEEDED = `(j.test_marker is not null or j.ref like 'J-DEMO-%')`;

// ...unless it holds a payment nobody marked. See the header: this is the whole
// protection for real payments sitting on seeded jobs, and it has to be spelled
// as a property of the data rather than as an exception for one row.
const JOB_HOLDS_REAL_PAYMENT = `exists (select 1 from payments p where p.job_id = j.id and p.test_marker is null)`;
const JOB_MATCH = `j.account_id = $1 and ${JOB_SEEDED} and not ${JOB_HOLDS_REAL_PAYMENT}`;

// Every payment this run intends to remove, by either route: cascaded from a job
// the line above will delete, or deleted directly because it is marked and its
// job survives. Used by the assertion, by the RESTRICT preflight and by the
// delete itself, so none of the three can be reasoning about a different set.
const DOOMED_PAYMENTS = `
  select p.id from payments p
   where p.account_id = $1
     and (p.test_marker is not null
          or exists (select 1 from jobs j where j.id = p.job_id and ${JOB_MATCH}))`;

// The ones the job cascade cannot reach, so step 5 has to.
const LEFTOVER_PAYMENTS = `
  p.account_id = $1 and p.test_marker is not null
  and not exists (select 1 from jobs j where j.id = p.job_id and ${JOB_MATCH})`;

// A demo customer still referenced by something that is going to SURVIVE. Held
// back rather than deleted, because every FK into clients.id is ON DELETE SET
// NULL and the alternative is a survivor quietly losing its customer.
//
// "by a survivor", not "by anything", and the distinction is the whole
// correctness of the report. The first version of this asked whether ANY job or
// lead pointed at the client. That is right at delete time — by then the seeded
// jobs are gone — but at report time nothing has been deleted yet, so every
// seeded client still had its seeded jobs attached and the dry run announced
// "demo clients 0" for an account where --apply would then have removed fifty of
// them. Under-reporting what dies is the same failure as under-reporting what
// survives, pointed the other way.
//
// Projecting the deletes instead makes one predicate correct in both places: at
// report time it answers the question about the state after step 4, and at delete
// time the rows it excludes are already gone, so it answers the same thing.
//
// AND THE PARENT LIST IS READ FROM THE CATALOGUE, NOT WRITTEN HERE. The second
// version enumerated jobs and leads by hand and was wrong: clients.id has FIVE
// SET NULL children — jobs, leads, recurring_plans, warranties and
// extra_stop_requests. 23 recurring plans across three accounts would have been
// silently detached from their customer, and the post-delete check, which
// enumerated the same two tables by hand, would have printed a clean bill.
// src/app/dashboard/clients/actions.ts:210 already knew this: its merge path
// repoints four of the five before deleting a duplicate.
//
// Hardcoding it is the same mistake in two places, so neither is hardcoded now.
// A table the script does not itself delete from counts as a survivor whenever
// it holds any row at all, which is the conservative reading and means a sixth
// child table added later holds clients back instead of silently losing them.
const clientReferenceGuard = (parents) =>
  `(\n  ${parents
    .map(({ child, col }) => {
      if (child === 'jobs') return `exists (select 1 from jobs j where j.client_id = t.id and not (${JOB_MATCH}))`;
      if (child === 'leads') return `exists (select 1 from leads l where l.client_id = t.id and not ${customerMarkers('l')})`;
      return `exists (select 1 from public.${child} x where x.${col} = t.id)`;
    })
    .join('\n  or ')}\n)`;

// A seeded recurring plan. Matched on the plan's own denormalised contact as
// well as on the joined client, because a plan whose client_id is already null
// still carries client_email and client_phone and is just as seeded.
//
// These are deleted rather than reported since 2026-08-17. Leaving them was the
// wrong end state: nothing else in this script or in the schema removes them
// (their only CASCADE parent is accounts), so a swept account keeps 23 live
// schedules and the recurring cron refills it within days — with fresh clients,
// because createVisitJob passes the plan's denormalised contact to
// findOrCreateClientId and a brand new @example.com row appears. A sweep whose
// result is undone by a cron job the following morning is not a sweep.
//
// `x` is the caller's recurring_plans alias; `t` is the LEFT JOINed client, so
// the whole thing has to tolerate t.id being null.
const PLAN_SEEDED = `(
  coalesce(${customerMarkers('t')}, false)
  or coalesce(x.client_email ilike '%@example.com'
              or regexp_replace(x.client_phone, '\\D', '', 'g') ~ '555[0-9]{4}$', false)
)`;

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
  // Read the SET NULL children of clients before anything else, so the guard and
  // the post-delete check are built from the same catalogue answer rather than
  // from two hand-written lists that can disagree with each other and with the
  // database.
  const { rows: clientRefParents } = await client.query(
    `select src.relname as child, att.attname as col
       from pg_constraint con
       join pg_class src on src.oid = con.conrelid
       join pg_class tgt on tgt.oid = con.confrelid
       join pg_namespace n on n.oid = src.relnamespace
       join unnest(con.conkey) with ordinality as ck(attnum, ord) on true
       join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = ck.ord
       join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ck.attnum
       join pg_attribute pat on pat.attrelid = con.confrelid and pat.attnum = fk.attnum
      where con.contype = 'f' and n.nspname = 'public'
        and tgt.relname = 'clients' and pat.attname = 'id' and con.confdeltype = 'n'
      order by src.relname`,
  );
  if (clientRefParents.length === 0) {
    console.error('ABORT: found no SET NULL children of clients. That cannot be right, and the client guard would be vacuous.');
    process.exit(1);
  }
  const CUSTOMER_STILL_REFERENCED = clientReferenceGuard(clientRefParents);

  console.log(`Account: ${accountRows[0].business_name ?? '(unnamed)'} · ${ACCOUNT}`);
  console.log(
    `Client references guarded (${clientRefParents.length} SET NULL children, read from pg_catalog): ` +
      clientRefParents.map((p) => `${p.child}.${p.col}`).join(', '),
  );
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
  await count('demo jobs', `select count(*)::int as n from jobs j where ${JOB_MATCH}`, [ACCOUNT]);
  await count('held-back jobs', `select count(*)::int as n from jobs j
     where j.account_id = $1 and ${JOB_SEEDED} and ${JOB_HOLDS_REAL_PAYMENT}`, [ACCOUNT]);
  await count('cascaded payments', `select count(*)::int as n, coalesce(sum(p.amount),0)::float as amount
     from payments p where exists (select 1 from jobs j where j.id = p.job_id and ${JOB_MATCH})`, [ACCOUNT]);
  await count('leftover payments', `select count(*)::int as n, coalesce(sum(p.amount),0)::float as amount
     from payments p where ${LEFTOVER_PAYMENTS}`, [ACCOUNT]);
  await count('payments kept', `select count(*)::int as n, coalesce(sum(p.amount),0)::float as amount
     from payments p where p.account_id = $1 and p.id not in (${DOOMED_PAYMENTS})`, [ACCOUNT]);
  await count('demo clients', `select count(*)::int as n from clients t where t.account_id = $1 and ${CUSTOMER_MATCH}
     and not ${CUSTOMER_STILL_REFERENCED}`, [ACCOUNT]);
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
  console.log('\nSeeded jobs (test_marker or a J-DEMO- ref):');
  console.log(`  jobs to delete     ${counts['demo jobs'].n}   <- cascades their own costs, feed, tasks, invoices, payments`);
  console.log(`  jobs HELD BACK     ${counts['held-back jobs'].n}   <- seeded, but holding a payment nobody marked`);
  console.log('\nPayments:');
  console.log(`  cascaded with jobs ${counts['cascaded payments'].n} (${money(counts['cascaded payments'].amount)})`);
  console.log(`  deleted directly   ${counts['leftover payments'].n} (${money(counts['leftover payments'].amount)})   <- marked, on a job that survives`);
  console.log(`  payments KEPT      ${counts['payments kept'].n} (${money(counts['payments kept'].amount)})`);
  console.log('\nSeeded customers (seed-customers.mjs):');
  console.log(`  demo clients       ${counts['demo clients'].n}   <- @example.com or a 555 phone, with nothing surviving attached`);
  console.log(`  demo leads         ${counts['demo leads'].n}`);
  console.log(`  clients being KEPT ${counts['kept clients'].n}`);
  console.log(`  leads being KEPT   ${counts['kept leads'].n}`);

  // Collateral. None of this is wrong for the sweep to do, but all of it was
  // happening without a line in the report, and the widened job match made two of
  // the three much larger than they were.
  await count('kept-crew costs on doomed jobs', `select count(*)::int as n, coalesce(sum(k.amount),0)::float as amount
     from costs k join jobs j on j.id = k.job_id
     where k.account_id = $1 and ${JOB_MATCH}
       and k.crew_id is not null and not (k.crew_id = any($2::uuid[]))`, [ACCOUNT, crewIds]);
  await count('empty pay periods', `select count(*)::int as n from crew_pay_periods p
     where p.account_id = $1 and not exists (
       select 1 from crew_pay_entries e where e.period_id = p.id and not (e.crew_id = any($2::uuid[])))`, [ACCOUNT, crewIds]);
  await count('period-cascaded events', `select count(*)::int as n from crew_pay_events v
     where v.account_id = $1 and v.period_id in (
       select p.id from crew_pay_periods p where p.account_id = $1 and not exists (
         select 1 from crew_pay_entries e where e.period_id = p.id and not (e.crew_id = any($2::uuid[]))))`, [ACCOUNT, crewIds]);
  console.log('\nCollateral (deleted, but not by a rule of its own):');
  console.log(`  KEPT crew's costs  ${counts['kept-crew costs on doomed jobs'].n} (${money(counts['kept-crew costs on doomed jobs'].amount)})   <- real crew, on a seeded job that step 4 removes`);
  console.log(`  empty pay periods  ${counts['empty pay periods'].n}   <- emptied by the crew delete above`);
  console.log(`  their pay events   ${counts['period-cascaded events'].n}   <- cascade off period_id; append-only in the app`);

  // Seeded recurring plans, deleted in step 6 — see PLAN_SEEDED for why they are
  // not merely reported. Listed in full rather than counted, because a schedule
  // that bills somebody is worth reading before it is removed, and because a plan
  // with a real saved card would be a reason to stop.
  const { rows: doomedPlans } = await client.query(
    `select x.id, x.title, x.active, x.auto_charge, x.next_run_date, x.amount, x.frequency,
            (x.stripe_payment_method_id is not null) as has_card,
            (select count(*)::int from jobs j
              where j.recurring_plan_id = x.id and not (${JOB_MATCH})) as surviving_jobs
       from recurring_plans x left join clients t on t.id = x.client_id
      where x.account_id = $1 and ${PLAN_SEEDED}
      order by x.active desc, x.next_run_date nulls last`,
    [ACCOUNT],
  );
  const plansWithCard = doomedPlans.filter((p) => p.has_card);
  if (doomedPlans.length > 0) {
    const active = doomedPlans.filter((p) => p.active).length;
    console.log(`\nSeeded recurring plans to delete (${doomedPlans.length}, ${active} active):`);
    for (const p of doomedPlans) {
      console.log(
        `  ${p.active ? 'active' : 'paused'} · ${p.title ?? '(untitled)'} · ${money(p.amount)} ${p.frequency ?? ''}` +
          `${p.auto_charge ? ' · auto_charge' : ''}${p.has_card ? ' · HAS A SAVED CARD' : ''}` +
          ` · next ${p.next_run_date ? String(p.next_run_date).slice(0, 10) : 'never'}` +
          `${p.surviving_jobs > 0 ? ` · ${p.surviving_jobs} surviving job(s) lose their plan link` : ''}`,
      );
    }
    console.log('  Left in place these re-create seeded visit jobs and fresh @example.com clients within days.');
  }
  // A plan that can actually take money is not demo data whatever its email says,
  // and deleting it would cancel real billing. Nothing on this platform has one
  // today — the seeder writes card_brand/card_last4 for display and never a
  // payment method — so this is a tripwire, not a workflow.
  if (plansWithCard.length > 0) {
    console.error(`\nABORT: ${plansWithCard.length} of those plans has a saved Stripe payment method.`);
    for (const p of plansWithCard) console.error(`  ${p.title ?? '(untitled)'} · ${money(p.amount)} ${p.frequency}`);
    console.error('\nA plan that can charge a card is not demo data. Nothing was changed.');
    process.exit(1);
  }

  // Labor costs sitting on jobs that will SURVIVE are worth calling out: removing
  // them changes what a real job cost, which is a real edit even when the labor
  // was never real.
  //
  // The filter used to be `ref not like 'J-DEMO-%'`, which meant "not a demo job"
  // only while that prefix was the whole job match. Once seeded jobs match on
  // test_marker too, that spelling lists 64 J-1xxx jobs which are themselves being
  // deleted in step 4 — warning about a cost change on a row that is about to
  // cease existing, and burying the cases that matter.
  const { rows: realJobImpact } = await client.query(
    `select j.ref, j.client_name, count(*)::int as entries, sum(k.amount)::float as amount
       from costs k join jobs j on j.id = k.job_id
      where k.account_id = $1 and k.crew_id = any($2::uuid[]) and not (${JOB_MATCH})
      group by j.ref, j.client_name order by sum(k.amount) desc`,
    [ACCOUNT, crewIds],
  );
  if (realJobImpact.length > 0) {
    console.log(`\nThese are NOT demo jobs — their costs will drop when the demo labor goes:`);
    for (const row of realJobImpact) console.log(`  ${row.ref} · ${row.client_name} · ${row.entries} entries · ${money(row.amount)}`);
  }

  // Which seeded jobs are held back, and what is holding them. A one-line
  // "1 held back" is not enough to check the protection actually caught the row
  // it was written for.
  const { rows: heldBack } = await client.query(
    `select j.ref, j.client_name,
            (select count(*)::int from payments p where p.job_id = j.id and p.test_marker is null) as unmarked,
            (select count(*)::int from payments p where p.job_id = j.id and p.test_marker is not null) as marked,
            (select string_agg(left(p.id::text, 8), ', ') from payments p where p.job_id = j.id and p.test_marker is null) as ids
       from jobs j where j.account_id = $1 and ${JOB_SEEDED} and ${JOB_HOLDS_REAL_PAYMENT}
      order by j.ref`,
    [ACCOUNT],
  );
  if (heldBack.length > 0) {
    console.log(`\nSeeded jobs HELD BACK because a payment on them is not marked (${heldBack.length}):`);
    for (const row of heldBack) {
      // The marked payments on a held-back job do NOT survive: the job escapes
      // step 4, and step 5 then deletes them directly. An earlier draft of this
      // line said "also survive on it", which was the opposite of what happens.
      const alsoDeleted = row.marked > 0 ? ` · ${row.marked} marked payment(s) on it are deleted by step 5` : '';
      console.log(`  ${row.ref} · ${row.client_name ?? '(no client)'} · unmarked payment(s) ${row.ids}${alsoDeleted}`);
    }
  }

  // The reference report. This is the thing whose absence made the orphaning
  // invisible: not how many clients match, but what still points at them.
  // The counts here have to be survivor-scoped too. The row FILTER was, but the
  // displayed numbers were not, so a client held back by one surviving job was
  // listed as "6 job(s) (J-1006, ..., J-1107)" when five of those six were about
  // to be deleted — a true reason to keep the row, told with numbers that do not
  // survive the run.
  const otherParents = clientRefParents.filter((p) => p.child !== 'jobs' && p.child !== 'leads');
  const otherCounts = otherParents.map(
    (p) => `,\n            (select count(*)::int from public.${p.child} x where x.${p.col} = t.id) as ${p.child}`,
  ).join('');
  const { rows: keptRefs } = await client.query(
    `select t.name, t.email, t.phone,
            (select count(*)::int from jobs j where j.client_id = t.id and not (${JOB_MATCH})) as jobs,
            (select count(*)::int from leads l where l.client_id = t.id and not ${customerMarkers('l')}) as leads,
            (select string_agg(j.ref, ', ' order by j.ref) from jobs j
              where j.client_id = t.id and not (${JOB_MATCH})) as refs${otherCounts}
       from clients t
      where t.account_id = $1 and ${CUSTOMER_MATCH} and ${CUSTOMER_STILL_REFERENCED}
      order by t.name`,
    [ACCOUNT],
  );
  if (keptRefs.length > 0) {
    console.log(`\nDemo clients KEPT because something surviving still points at them (${keptRefs.length}):`);
    for (const row of keptRefs) {
      const extra = otherParents.filter((p) => row[p.child] > 0).map((p) => `${row[p.child]} ${p.child}`);
      console.log(
        `  ${row.name ?? '(no name)'} · ${row.email ?? 'no email'} · ${row.jobs} surviving job(s)${row.refs ? ` (${row.refs})` : ''}` +
          ` · ${row.leads} surviving lead(s)${extra.length ? ` · ${extra.join(' · ')}` : ''}`,
      );
    }
    console.log('  Deleting these would SET NULL the customer on a row that survives.');
  }

  // THE ASSERTION. Everything above is reporting; this is the one check that
  // stops the run. If a payment nobody marked is in the doomed set then the
  // held-back rule has a hole in it, and the only safe move is to change nothing
  // and say so.
  //
  // Be honest about what this is: given the two predicates as written it cannot
  // fire, because a job only matches when no unmarked payment hangs off it, so
  // nothing unmarked can reach the doomed set by either route. It is a REGRESSION
  // guard, not a discovery — it exists so that the day somebody simplifies
  // JOB_MATCH down to `test_marker is not null`, the run stops here instead of
  // cascading a real payment out of the ledger. That edit is the likely one; it
  // is what the first draft of this change did.
  const { rows: unmarkedDoomed } = await client.query(
    `select p.id, p.status, p.amount, p.stripe_checkout_session, j.ref
       from payments p left join jobs j on j.id = p.job_id
      where p.id in (${DOOMED_PAYMENTS}) and p.test_marker is null
      order by p.amount desc nulls last`,
    [ACCOUNT],
  );
  if (unmarkedDoomed.length > 0) {
    console.error(`\nABORT: ${unmarkedDoomed.length} payment(s) with no test_marker are in the delete set.`);
    for (const row of unmarkedDoomed) {
      console.error(`  ${row.id} · ${row.status} · ${money(row.amount)} · job ${row.ref ?? '(none)'} · ${row.stripe_checkout_session ?? 'no Stripe session'}`);
    }
    console.error('\nAn unmarked payment may be real money. Nothing was changed.');
    console.error('Fix the held-back rule rather than this check — see the header.');
    process.exit(1);
  }
  console.log('\nAssertion holds: no payment without a test_marker is in the delete set.');

  // PREFLIGHT. 29 of the 35 foreign keys referencing payments are RESTRICT, and
  // RESTRICT is not NO ACTION — it fires even when the referencing row would be
  // deleted by the same statement, so it cannot be ordered around. Enumerated
  // from the catalogue rather than listed here, because the set grows: seven of
  // them landed on 2026-08-17 alone.
  const { rows: blockers } = await client.query(
    `select con.conname, src.relname as child, cat.attname as child_col, tgt.relname as target,
            case con.confdeltype when 'r' then 'RESTRICT' else 'NO ACTION' end as rule
       from pg_constraint con
       join pg_class src on src.oid = con.conrelid
       join pg_class tgt on tgt.oid = con.confrelid
       join pg_namespace n on n.oid = src.relnamespace
       join unnest(con.conkey) with ordinality as ck(attnum, ord) on true
       join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = ck.ord
       join pg_attribute cat on cat.attrelid = con.conrelid and cat.attnum = ck.attnum
       join pg_attribute pat on pat.attrelid = con.confrelid and pat.attnum = fk.attnum
      where con.contype = 'f' and n.nspname = 'public'
        and tgt.relname in ('payments', 'jobs') and pat.attname = 'id'
        and con.confdeltype in ('a', 'r')
      order by tgt.relname, src.relname`,
  );
  const doomedSet = { payments: `(${DOOMED_PAYMENTS})`, jobs: `(select j.id from jobs j where ${JOB_MATCH})` };
  const hits = [];
  for (const b of blockers) {
    const { rows } = await client.query(
      `select count(*)::int as n from public.${b.child} x where x.${b.child_col} in ${doomedSet[b.target]}`,
      [ACCOUNT],
    );
    if (rows[0].n > 0) hits.push({ ...b, n: rows[0].n });
  }
  // RESTRICT and NO ACTION are not the same thing, and the difference decides
  // whether a row in the way is fatal.
  //
  // RESTRICT fires immediately and cannot be ordered around: it complains even
  // when the referencing row would be removed by the same statement. A row here
  // WILL abort the teardown, so refuse before opening the transaction.
  //
  // NO ACTION is checked no earlier than end-of-statement, and the one such key
  // on this schema (payment_plans_payoff_payment_same_plan_fkey) is DEFERRABLE
  // INITIALLY DEFERRED, so it is not checked until COMMIT. A plan and its payoff
  // payment hanging off the same seeded job both vanish inside step 4, leaving
  // nothing to violate — treating that as fatal would refuse a run that would
  // have committed cleanly, and send the operator off to hand-edit a live billing
  // pointer for no reason. So warn, and let it be. If it does fire it fires at
  // COMMIT, and the transaction aborts with nothing written.
  //
  // Worth knowing: --rehearse cannot adjudicate a deferred key at all, because
  // rolling back means the check never runs.
  const fatal = hits.filter((h) => h.rule === 'RESTRICT');
  const deferredWarnings = hits.filter((h) => h.rule !== 'RESTRICT');
  console.log(`Preflight: ${blockers.length} RESTRICT/NO ACTION foreign keys into payments+jobs, ${hits.length} of them holding rows in the way.`);
  for (const w of deferredWarnings) {
    console.log(`  NOTE ${w.child}.${w.child_col} -> ${w.target}: ${w.n} row(s) (${w.conname}).`);
    console.log('       NO ACTION, checked at end of statement or at COMMIT, so a row the teardown itself removes is fine.');
    console.log('       Not fatal, and --rehearse cannot exercise it. If it is real, COMMIT fails and nothing is written.');
  }
  if (fatal.length > 0) {
    console.error('\nABORT: these RESTRICT keys would raise 23503 partway through the teardown:');
    for (const h of fatal) console.error(`  ${h.child}.${h.child_col} -> ${h.target}: ${h.n} row(s) (${h.conname})`);
    console.error('\nNothing was changed. Remove or re-point those rows first.');
    process.exit(1);
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

  // Baseline for the orphan check at the end. Identities, not counts: a count of
  // null client_ids would fall as seeded jobs are deleted, and a run that
  // deleted five jobs already missing a client while orphaning three survivors
  // would show a NEGATIVE delta and read as clean. So capture which rows have a
  // customer now, and afterwards ask which of those are still here without one.
  //
  // Over every SET NULL child from the catalogue, not over a hand-written pair.
  // The check is what would have to notice if the guard were wrong, so covering
  // fewer tables than the guard makes it agree with the guard by construction and
  // verify nothing.
  const withCustomer = async ({ child, col }) => {
    const { rows } = await client.query(
      `select coalesce(array_agg(x.id), '{}') as ids from public.${child} x
        where x.account_id = $1 and x.${col} is not null`,
      [ACCOUNT],
    );
    return rows[0].ids;
  };
  const baseline = new Map();
  for (const parent of clientRefParents) baseline.set(parent.child, await withCustomer(parent));

  const orphanedSince = async ({ child, col }, ids) => {
    const { rows } = await client.query(
      `select count(*)::int as n from public.${child} x
        where x.id = any($1::uuid[]) and x.${col} is null`,
      [ids],
    );
    return rows[0].n;
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

  // 4. Seeded jobs — independent of the crew, and cascades widely: their
  //    invoices, payments and customer links all go with them. Held-back jobs
  //    (a payment on them is unmarked) survive this, which is the whole point.
  await del('seeded jobs', `delete from jobs j where ${JOB_MATCH}`, [ACCOUNT]);

  // 5. Marked payments the cascade could not reach, because their job survived
  //    — either because the job was never seeded, or because it was held back.
  //    The assertion above has already established that nothing unmarked is in
  //    here; without it this statement would be the one that could take real
  //    money out of the ledger.
  await del('leftover marked payments', `delete from payments p where ${LEFTOVER_PAYMENTS}`, [ACCOUNT]);

  // 6. Seeded recurring plans, BEFORE the clients they point at. recurring_plans
  //    .client_id is SET NULL, so a plan still standing here would either hold
  //    its client back (the guard doing its job) or lose it silently (the guard
  //    not existing yet, which is what the review caught). Removing the plan
  //    first dissolves the reference, and step 7 can then take the client.
  //    Spelled as `id in (<the report's own select>)` rather than DELETE ... USING,
  //    because USING is an inner join: a plan whose client_id is already null has
  //    no clients row to join to and would be quietly skipped — exactly the plans
  //    most likely to be orphaned leftovers. This way the delete runs the same
  //    query the report printed, so the two cannot disagree.
  await del('seeded recurring plans', `delete from recurring_plans p
     where p.account_id = $1 and p.id in (
       select x.id from recurring_plans x left join clients t on t.id = x.client_id
        where x.account_id = $1 and ${PLAN_SEEDED})`, [ACCOUNT]);

  // 7. Seeded customers. Leads first — leads.client_id is SET NULL, so removing
  //    the client first would leave a lead on the board with no customer behind
  //    it rather than removing the pair.
  await del('demo leads', `delete from leads t where t.account_id = $1 and ${CUSTOMER_MATCH}`, [ACCOUNT]);
  //    Clients LAST of everything, and only those with nothing left pointing at
  //    them. jobs.client_id and leads.client_id are both SET NULL, so a survivor
  //    attached to one of these would quietly lose its customer. The guard is
  //    evaluated HERE, after 4 and after the leads above, so a client whose only
  //    job was itself seeded is still removed — the reference is already gone by
  //    the time this runs.
  await del('demo clients', `delete from clients t where t.account_id = $1 and ${CUSTOMER_MATCH}
     and not ${CUSTOMER_STILL_REFERENCED}`, [ACCOUNT]);

  // Post-delete check, inside the transaction so a rehearsal reports it too, and
  // as a DELTA against the baseline taken before the first delete — an absolute
  // count proves nothing, because rows with a null client_id predate this script.
  // A non-zero delta means the guard above has a hole and this run must not be
  // committed.
  const orphaned = [];
  for (const parent of clientRefParents) {
    const n = await orphanedSince(parent, baseline.get(parent.child));
    if (n > 0) orphaned.push({ ...parent, n });
  }
  console.log(
    `  post-check: ${orphaned.reduce((sum, o) => sum + o.n, 0)} surviving row(s) lost their customer, across ` +
      `${clientRefParents.length} checked table(s) (${clientRefParents.map((p) => p.child).join(', ')})`,
  );
  if (orphaned.length > 0) {
    await client.query('rollback');
    console.error('\nROLLED BACK: this run orphaned a survivor, which the client guard is supposed to prevent.');
    for (const o of orphaned) console.error(`  ${o.child}.${o.col}: ${o.n} row(s) now null that had a customer before`);
    process.exit(1);
  }

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
