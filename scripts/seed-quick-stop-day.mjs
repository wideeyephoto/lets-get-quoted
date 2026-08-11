import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pg from 'pg';

/**
 * A day of work near one ZIP, so the Quick Stop customer flow can be walked.
 *
 * WHY IT EXISTS. A homeowner is only offered a Quick Stop when the contractor
 * is ALREADY going to be near them: the screening measures the detour from the
 * day's route, and an account whose jobs today are 700 miles away can never
 * produce an eligible request. The Lawn & Order demo account's jobs are all in
 * Kansas City; the flow needed testing against 48067, Royal Oak, Michigan.
 *
 * SAFETY, and it is the same set the showcase seeder uses — read that file's
 * header for why the conventions exist:
 *
 *   - Talks to Postgres DIRECTLY and never to a server action, so no send path
 *     is involved at all. Nothing here can text or email a human.
 *   - Every phone is on the 555 exchange, which is permanently unassigned, so a
 *     number cannot be routed even by accident.
 *   - Every email is @example.com (RFC 2606 reserved).
 *   - Every ref carries a J-QS- prefix, so these are recognisable on sight and
 *     cannot be confused with the account's real J-#### sequence.
 *   - Every id written is recorded in a manifest beside this file, and --undo
 *     deletes precisely those rows and nothing else.
 *
 *   node scripts/seed-quick-stop-day.mjs --account <uuid>          (plan only)
 *   node scripts/seed-quick-stop-day.mjs --account <uuid> --apply
 *   node scripts/seed-quick-stop-day.mjs --account <uuid> --undo
 */

const env = await readFile('.env.local', 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? true;
};
const ACCOUNT = arg('account');
const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const MANIFEST = new URL('./.seed-quick-stop-day.json', import.meta.url);

if (!ACCOUNT) {
  console.error('Usage: node scripts/seed-quick-stop-day.mjs --account <uuid> [--apply | --undo]');
  process.exit(1);
}

/**
 * Three stops around Royal Oak, MI 48067, all inside the account's 10-mile
 * detour limit of each other and of the ZIP. Times leave a real gap in the
 * middle of the day — a route with no room in it is a route with no Quick Stop
 * in it, which would test the refusal rather than the flow.
 */
const STOPS = [
  {
    ref: 'J-QS-1',
    client: 'Dana Whitfield',
    address: '415 S Lafayette Ave, Royal Oak, MI 48067',
    lat: 42.4863,
    lng: -83.1471,
    time: '08:30',
    hours: 2,
    scope: 'Front bed cleanup and mulch — 40 ft of border.',
  },
  {
    ref: 'J-QS-2',
    client: 'Marcus Bell',
    address: '3120 Coolidge Hwy, Berkley, MI 48072',
    lat: 42.5006,
    lng: -83.1789,
    time: '11:00',
    hours: 2,
    scope: 'Hedge trimming along the drive and a hauled-away brush pile.',
  },
  {
    ref: 'J-QS-3',
    client: 'Priya Raman',
    address: '621 N Main St, Clawson, MI 48017',
    lat: 42.5405,
    lng: -83.1462,
    time: '14:30',
    hours: 2,
    scope: 'Lawn renovation quote follow-up and aeration.',
  },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

if (UNDO) {
  if (!existsSync(MANIFEST)) {
    console.error('No manifest. Nothing is deleted on a guess — re-run --apply or remove the rows by hand.');
    process.exit(1);
  }
  const written = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const res = await client.query('delete from jobs where id = any($1) and account_id = $2', [written.jobIds, written.account]);
  const cl = await client.query('delete from clients where id = any($1) and account_id = $2', [written.clientIds, written.account]);
  console.log(`deleted ${res.rowCount} jobs and ${cl.rowCount} clients`);
  await writeFile(MANIFEST, JSON.stringify({ ...written, undoneAt: new Date().toISOString() }, null, 2));
  await client.end();
  process.exit(0);
}

const { rows: acct } = await client.query(
  'select business_name, timezone, extra_stop_enabled, extra_stop_max_detour_miles, extra_stop_max_per_day from accounts where id = $1',
  [ACCOUNT],
);
if (!acct.length) {
  console.error('No such account.');
  process.exit(1);
}
console.log('account:', acct[0].business_name, '| quick stops:', acct[0].extra_stop_enabled, '| detour limit:', acct[0].extra_stop_max_detour_miles, 'mi');

const { rows: todayRow } = await client.query('select current_date::text as d');
console.log(`plan: ${STOPS.length} jobs on ${todayRow[0].d}, all within ~5 miles of 48067`);
for (const s of STOPS) console.log(`  ${s.time}  ${s.ref}  ${s.client}  ${s.address}`);

if (!APPLY) {
  console.log('\nDry run. Nothing written. Re-run with --apply.');
  await client.end();
  process.exit(0);
}

const jobIds = [];
const clientIds = [];
await client.query('begin');
try {
  for (const stop of STOPS) {
    const phone = `248555${String(1000 + STOPS.indexOf(stop)).slice(-4)}`;
    const email = `${stop.client.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;
    const { rows: c } = await client.query(
      `insert into clients (account_id, name, phone, email, address)
       values ($1,$2,$3,$4,$5) returning id`,
      [ACCOUNT, stop.client, phone, email, stop.address],
    );
    clientIds.push(c[0].id);
    const { rows: j } = await client.query(
      `insert into jobs
         (account_id, client_id, ref, client_name, client_phone, client_email, address, lat, lng,
          scope, status, scheduled_for, scheduled_time, estimated_hours, quoted_amount)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'in_progress',current_date,$11,$12,$13)
       returning id, ref`,
      [
        ACCOUNT,
        c[0].id,
        stop.ref,
        stop.client,
        phone,
        email,
        stop.address,
        stop.lat,
        stop.lng,
        stop.scope,
        stop.time,
        stop.hours,
        stop.hours * 95,
      ],
    );
    jobIds.push(j[0].id);
    console.log('wrote', j[0].ref);
  }
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  console.error('rolled back:', error.message);
  await client.end();
  process.exit(1);
}

await writeFile(
  MANIFEST,
  JSON.stringify({ account: ACCOUNT, jobIds, clientIds, writtenAt: new Date().toISOString() }, null, 2),
);
console.log(`\nwrote ${jobIds.length} jobs. Undo with:`);
console.log(`  node scripts/seed-quick-stop-day.mjs --account ${ACCOUNT} --undo`);
await client.end();
