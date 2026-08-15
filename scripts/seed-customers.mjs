import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Fill an account with customers spread across the whole pipeline.
//
// WHY THIS EXISTS. Every screen in this app is a different answer to "what is
// happening right now", and with six jobs on the account most of them have
// nothing to say: the funnel is a flat line, the map has three pins, Insights
// compares a period to an empty one, and no card that depends on a customer
// being at a PARTICULAR stage ever renders. You cannot judge a dashboard whose
// data never leaves the first column.
//
// DRY RUN BY DEFAULT, like remove-demo-data.mjs. It prints the whole plan — the
// stage distribution, the money, a sample of rows — and writes nothing without
// --apply. One transaction, so a failure halfway leaves no half-seeded account.
//
// REMOVABLE, AND IT SAYS SO. Every client, lead, job, invoice and payment
// written here carries test_marker = 'seed-customers'. That is the one marker
// an invoice or a payment can hold at all — they have no name, no email and no
// phone to guess from — so it is what the owner-facing filters key on.
//
// The descriptive markers stay alongside it: jobs carry the J-DEMO- ref prefix
// and people carry @example.com emails and 555-01xx phones, which is what
// remove-demo-data.mjs matches and the only thing that can classify the rows
// seeded before the column existed. 555-01xx is the range reserved for fiction,
// so a seeded number cannot collide with a real customer's, and it cannot be
// dialed or texted by accident either.
//
// NOTHING HERE CAN SEND ANYTHING. Seeding customers into a live account means
// creating exactly the rows the automation sweeps look for, so this was checked
// rather than assumed:
//   * quote follow-ups and appointment reminders are per-account opt-ins, and
//     the sweeps read them before anything else — see runStalledQuoteFollowups
//     and runAppointmentReminders. Both are re-checked below and the run REFUSES
//     if either is on, because a scheduled_for in the future plus an email
//     address is all a reminder needs.
//   * the morning arrival sweep is gated on arrival_morning_confirmation, also
//     checked below.
//   * every SMS path resolves consent from sms_consent, and this script never
//     writes a consent row, so no seeded number is textable by any code path.
//   * dunning reads failed payments; no payment here is written as failed.
//   * lat/lng are stamped from a city table rather than left null, so the
//     geocode backfill has nothing to look up and Google is never called for a
//     hundred invented addresses.
//
// Run:
//   node scripts/seed-customers.mjs --subdomain hotmess               (plan only)
//   node scripts/seed-customers.mjs --subdomain hotmess --apply
//   node scripts/seed-customers.mjs --account <uuid> --count 40 --apply

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

const ACCOUNT_ARG = arg('account');
const SUBDOMAIN = arg('subdomain');
const COUNT = Number(arg('count') ?? 100);
const SEED = String(arg('seed') ?? 'lgq-pipeline');
const APPLY = process.argv.includes('--apply');

// Stamped onto every row this script writes, including the invoices and
// payments that no name/email/phone heuristic can see. NULL means real, so
// nothing that already exists is touched by this being here. Requires
// migrations/2026-08-24-test-record-marker.sql.
const TEST_MARKER = 'seed-customers';

if ((!ACCOUNT_ARG && !SUBDOMAIN) || !Number.isFinite(COUNT) || COUNT < 1) {
  console.error('Usage: node scripts/seed-customers.mjs (--account <uuid> | --subdomain <name>) [--count 100] [--seed <string>] [--apply]');
  console.error('Without --apply this only prints the plan. Never defaults to an account.');
  process.exit(1);
}

// --- deterministic randomness -------------------------------------------------
// Seeded so two runs of the same command produce the same people. A re-run after
// a teardown then rebuilds the account you were looking at rather than a
// different one, which matters when the thing you are testing is a screenshot.
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let hash = 2166136261;
for (const char of SEED) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
const rand = mulberry32(hash);

const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + rand() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const round = (value, step) => Math.round(value / step) * step;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const dateKey = (msFromNow) => new Date(NOW + msFromNow).toISOString().slice(0, 10);

// --- the people ---------------------------------------------------------------

const FIRST = [
  'Marcus', 'Danielle', 'Terrence', 'Priya', 'Colton', 'Yesenia', 'Nathan', 'Imani', 'Garrett', 'Rosa',
  'Devon', 'Kaitlyn', 'Ibrahim', 'Shannon', 'Luis', 'Meredith', 'Tyrell', 'Anneke', 'Brandon', 'Xiomara',
  'Wesley', 'Lorna', 'Andre', 'Bridget', 'Hector', 'Simone', 'Curtis', 'Naomi', 'Rafael', 'Delia',
  'Grant', 'Tanisha', 'Oscar', 'Bethany', 'Malik', 'Josefina', 'Clay', 'Renata', 'Preston', 'Ayanna',
  'Dominic', 'Marguerite', 'Elias', 'Sondra', 'Trevor', 'Camille', 'Roland', 'Elise', 'Jamal', 'Vera',
];
const LAST = [
  'Whitfield', 'Okonkwo', 'Delgado', 'Brennan', 'Ferraro', 'Nakamura', 'Voss', 'Ellington', 'Rios', 'Bianchi',
  'Kowalski', 'Adeyemi', 'Sandoval', 'Kirkpatrick', 'Petrov', 'Ashworth', 'Guerrero', 'Lindqvist', 'Mbeki', 'Calloway',
  'Rosales', 'Thorne', 'Nguyen', 'Amherst', 'Salinas', 'Beaumont', 'Iverson', 'Duarte', 'Fairbanks', 'Osei',
  'Quintero', 'Hallowell', 'Marchetti', 'Bowers', 'Estrada', 'Vandergriff', 'Cortez', 'Winslow', 'Abara', 'Prescott',
];

// Kansas City metro, because the account's PUBLISHED SITE says "Expert
// Landscaping in Kansas City" serving "Lee's Summit and surrounding areas" —
// which is what a customer sees and what pickBusinessName resolves to. The six
// existing jobs are addressed in Royal Oak and Troy, Michigan; that mismatch is
// pre-existing and is reported rather than propagated.
const CITIES = [
  { city: "Lee's Summit", state: 'MO', zips: ['64063', '64064', '64081', '64082'], lat: 38.9108, lng: -94.3822, weight: 5 },
  { city: 'Blue Springs', state: 'MO', zips: ['64014', '64015'], lat: 39.0169, lng: -94.2816, weight: 3 },
  { city: 'Independence', state: 'MO', zips: ['64050', '64055', '64057'], lat: 39.0911, lng: -94.4155, weight: 3 },
  { city: 'Raytown', state: 'MO', zips: ['64133', '64138'], lat: 39.0086, lng: -94.4636, weight: 2 },
  { city: 'Grandview', state: 'MO', zips: ['64030'], lat: 38.8858, lng: -94.533, weight: 2 },
  { city: 'Belton', state: 'MO', zips: ['64012'], lat: 38.8117, lng: -94.5319, weight: 1 },
  { city: 'Kansas City', state: 'MO', zips: ['64114', '64134', '64146'], lat: 39.0997, lng: -94.5786, weight: 3 },
  { city: 'Overland Park', state: 'KS', zips: ['66212', '66213'], lat: 38.9822, lng: -94.6708, weight: 2 },
  { city: 'Olathe', state: 'KS', zips: ['66062'], lat: 38.8814, lng: -94.8191, weight: 1 },
  { city: 'Lenexa', state: 'KS', zips: ['66215'], lat: 38.9536, lng: -94.7336, weight: 1 },
];
const CITY_POOL = CITIES.flatMap((entry) => Array.from({ length: entry.weight }, () => entry));

const STREETS = [
  'NE Chipman Rd', 'SW Pryor Rd', 'NW Blue Pkwy', 'SE Ranson Rd', 'NE Douglas St', 'SW Ward Rd',
  'E Longview Rd', 'S Noland Rd', 'NW Woods Chapel Rd', 'SE Bailey Rd', 'W Mechanic St', 'N Persimmon Dr',
  'SE Hamblen Rd', 'NE Independence Ave', 'SW Oldham Pkwy', 'E Bannister Rd', 'W 103rd St', 'S Lucy Montgomery Way',
  'NE Rice Rd', 'SW Market St', 'E Red Bridge Rd', 'N Cedar Ave', 'SE Todd George Pkwy', 'W Gregory Blvd',
];

// Landscaping, to match the published site. Price bands are the honest part:
// a seasonal cleanup and a paver patio are not the same business, and a funnel
// where every job is worth the same teaches you nothing.
const SERVICES = [
  { name: 'Seasonal cleanup', scope: 'Spring cleanup — beds cut back, leaves hauled, edging refreshed', min: 350, max: 900, hours: [3, 6] },
  { name: 'Mulch & bed refresh', scope: 'Mulch and bed refresh across front and side beds', min: 600, max: 1800, hours: [4, 9] },
  { name: 'Lawn renovation', scope: 'Aerate, overseed and topdress the back lawn', min: 750, max: 2400, hours: [5, 12] },
  { name: 'Sod installation', scope: 'Strip and re-sod the front lawn, including grading', min: 2200, max: 6500, hours: [12, 26] },
  { name: 'Tree & shrub trimming', scope: 'Trim and shape the perimeter shrubs, crown-lift two maples', min: 450, max: 1600, hours: [4, 8] },
  { name: 'Irrigation repair', scope: 'Locate and repair two broken zones, replace four heads', min: 400, max: 1500, hours: [3, 7] },
  { name: 'Irrigation installation', scope: 'New six-zone irrigation system with smart controller', min: 3800, max: 9500, hours: [20, 40] },
  { name: 'Paver patio', scope: 'Paver patio off the back door with a seating wall', min: 6500, max: 18000, hours: [40, 90] },
  { name: 'Retaining wall', scope: 'Segmental retaining wall along the north property line', min: 4200, max: 14000, hours: [30, 70] },
  { name: 'Drainage', scope: 'French drain and regrade to move water away from the foundation', min: 1800, max: 6000, hours: [12, 30] },
  { name: 'Landscape lighting', scope: 'Low-voltage path and uplighting across the front elevation', min: 1600, max: 5200, hours: [8, 20] },
  { name: 'Plant installation', scope: 'Replace the foundation planting with a four-season bed', min: 900, max: 3800, hours: [6, 16] },
  { name: 'Grading & seeding', scope: 'Regrade the side yard and seed', min: 1200, max: 4000, hours: [8, 20] },
];

const LEAD_SOURCES = ['website_form', 'website_form', 'website_form', 'referral', 'missed_call', 'manual'];

const MESSAGES = [
  'Back yard is a mess after the winter. Can someone come take a look?',
  'Looking for a price on this. No rush, but we would like it done before the holiday.',
  'Neighbour used you last year and said to call.',
  'Water pools against the house every time it rains. Need this solved.',
  'Would like a quote when you have a chance. Happy to send photos.',
  'Half the yard is dead. Not sure if it needs seed or sod.',
  'Can you do this and the front beds at the same time?',
  'Whatever you recommend, honestly. Just want it to stop looking like this.',
];

// --- the pipeline -------------------------------------------------------------
//
// Stage names from src/lib/workflow-stages.ts, and the DATA is what defines the
// stage — status, dates, invoices, payments, an active customer link — not a
// label. Whatever the badges choose to call each one is the app's business.
//
// The shape is a funnel with a fat bottom: a real account that has been running
// a while has more finished work than open quotes, and the counts are weighted
// so every stage still has enough rows to be worth looking at.
const STAGES = [
  { key: 'needs_response', label: 'Needs response', share: 0.12 },
  { key: 'contacted', label: 'Contacted', share: 0.1 },
  { key: 'quote_sent', label: 'Quote sent — awaiting approval', share: 0.14 },
  { key: 'approved', label: 'Approved — needs scheduling', share: 0.09 },
  { key: 'scheduled', label: 'Scheduled', share: 0.12 },
  { key: 'in_progress', label: 'Work in progress', share: 0.08 },
  { key: 'ready_to_invoice', label: 'Ready to invoice', share: 0.07 },
  { key: 'invoice_sent', label: 'Invoice sent — awaiting payment', share: 0.1 },
  { key: 'complete', label: 'Complete', share: 0.18 },
];

function allocate(total) {
  const counts = STAGES.map((stage) => ({ ...stage, count: Math.floor(total * stage.share) }));
  // Whatever rounding dropped goes to Complete, the stage that most wants depth.
  let assigned = counts.reduce((sum, stage) => sum + stage.count, 0);
  let index = counts.length - 1;
  while (assigned < total) {
    counts[index].count += 1;
    assigned += 1;
    index = index === 0 ? counts.length - 1 : index - 1;
  }
  return counts;
}

// A lead's status, once you know where the customer ended up.
const LEAD_STATUS = {
  needs_response: 'new',
  contacted: 'contacted',
  quote_sent: 'quoted',
  approved: 'won',
  scheduled: 'won',
  in_progress: 'won',
  ready_to_invoice: 'won',
  invoice_sent: 'won',
  complete: 'won',
};

// How old the first contact is, per stage. Older the further along, because a
// finished job started as a lead months ago and a lead that arrived this morning
// has not been anywhere yet.
// THE FLOORS MATTER AS MUCH AS THE CEILINGS. These started at complete: [35,
// 150] and invoice_sent: [25, 80], which meant no seeded job could have been
// paid within the last 30 days — the age is the whole lifetime, and payment
// happens near the end of it. Every 30-day money figure on the admin Money page
// and in Insights therefore read $0 on a freshly seeded account holding
// hundreds of thousands in completed work. Working pages looked broken, which is
// the worst failure mode for demo data: it costs you the trust you seeded it to
// build.
//
// A small job can go quote -> work -> invoice -> paid inside a week, so a floor
// of a few days is realistic as well as necessary. The ceilings still stretch
// months back, so the trend comparisons have a previous period to compare to.
const AGE_DAYS = {
  needs_response: [0, 3],
  contacted: [2, 12],
  quote_sent: [3, 20],
  approved: [6, 30],
  scheduled: [10, 45],
  in_progress: [14, 55],
  ready_to_invoice: [8, 60],
  invoice_sent: [6, 80],
  complete: [5, 150],
};

function buildPerson(index) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const place = pick(CITY_POOL);
  const zip = pick(place.zips);
  const address = `${intBetween(100, 9899)} ${pick(STREETS)}, ${place.city}, ${place.state} ${zip}`;
  return {
    name: `${first} ${last}`,
    // @example.com is reserved by RFC 2606 and is the marker remove-demo-data
    // already matches. The index keeps it unique when two people share a name.
    email: `${first}.${last}${index}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@example.com',
    // 555-01xx: the range reserved for fiction. Cannot be dialled, cannot
    // collide with a real customer, and matches the teardown's phone pattern.
    phone: `(816) 555-${String(100 + (index % 99)).padStart(4, '0')}`,
    address,
    lat: Number((place.lat + between(-0.022, 0.022)).toFixed(6)),
    lng: Number((place.lng + between(-0.028, 0.028)).toFixed(6)),
  };
}

function buildRecord(stage, index) {
  const person = buildPerson(index);
  const service = pick(SERVICES);
  const [minAge, maxAge] = AGE_DAYS[stage.key];
  const ageDays = between(minAge, maxAge);
  const createdAt = iso(ageDays * DAY);
  const amount = round(between(service.min, service.max), 25);
  const hours = Number(between(service.hours[0], service.hours[1]).toFixed(1));

  const record = {
    stage: stage.key,
    stageLabel: stage.label,
    person,
    service,
    amount,
    hours,
    createdAt,
    leadStatus: LEAD_STATUS[stage.key],
    leadSource: pick(LEAD_SOURCES),
    message: pick(MESSAGES),
    job: null,
    link: null,
    invoice: null,
    payment: null,
    priorJob: null,
  };

  // Stages 1-2 never became a job: a lead nobody has priced yet.
  if (stage.key === 'needs_response' || stage.key === 'contacted') return record;

  // The job is created a day or two after the lead arrives.
  const jobCreatedAt = iso(Math.max(0, ageDays - between(0.5, 3)) * DAY);
  const job = {
    createdAt: jobCreatedAt,
    status: stage.key === 'quote_sent' ? 'new_lead' : stage.key === 'complete' ? 'complete' : 'in_progress',
    quotedAmount: amount,
    scheduledFor: null,
    scheduledTime: null,
    startedAt: null,
  };

  const workdayTime = () => `${String(intBetween(7, 15)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}:00`;

  if (stage.key === 'scheduled') {
    // Ahead of today, so the schedule and the map have something in the future.
    job.scheduledFor = dateKey(intBetween(1, 21) * DAY);
    job.scheduledTime = workdayTime();
  } else if (stage.key === 'in_progress') {
    // On site now: scheduled today or in the last couple of days, and started.
    const startedDaysAgo = intBetween(0, 2);
    job.scheduledFor = dateKey(-startedDaysAgo * DAY);
    job.scheduledTime = workdayTime();
    job.startedAt = iso(startedDaysAgo * DAY + between(1, 6) * 60 * 60 * 1000);
  } else if (stage.key === 'ready_to_invoice' || stage.key === 'invoice_sent' || stage.key === 'complete') {
    const doneDaysAgo = intBetween(3, Math.max(4, Math.floor(ageDays - 2)));
    job.scheduledFor = dateKey(-doneDaysAgo * DAY);
    job.scheduledTime = workdayTime();
    job.startedAt = iso(doneDaysAgo * DAY);
  }
  // 'approved' deliberately leaves scheduledFor and startedAt null — that IS the
  // stage: the customer said yes and nothing is in the diary yet.

  record.job = job;

  // An active customer link is what makes a priced job "the customer can see
  // it", which is the difference between "Send to client" and "Awaiting
  // approval" in deriveJobListBadge.
  record.link = {
    createdAt: jobCreatedAt,
    // Some quotes have been opened, some have not — the Insights read on whether
    // a quote was even looked at is otherwise uniform.
    lastViewedAt: rand() < 0.65 ? iso(Math.max(0, ageDays - between(0.2, 2)) * DAY) : null,
  };

  if (stage.key === 'invoice_sent' || stage.key === 'complete') {
    const invoicedDaysAgo = Math.max(1, ageDays - between(2, 10));
    record.invoice = {
      createdAt: iso(invoicedDaysAgo * DAY),
      status: stage.key === 'complete' ? 'paid' : pick(['sent', 'sent', 'signed']),
      total: amount,
      signedAt: stage.key === 'complete' ? iso((invoicedDaysAgo - 0.5) * DAY) : null,
      signerName: stage.key === 'complete' ? person.name : null,
    };
    const feeRate = 0.02;
    record.payment = {
      kind: 'final',
      label: 'Final payment',
      amount,
      status: stage.key === 'complete' ? 'paid' : 'requested',
      requestedAt: iso(invoicedDaysAgo * DAY),
      paidAt: stage.key === 'complete' ? iso(Math.max(0.5, invoicedDaysAgo - between(0.5, 6)) * DAY) : null,
      feeRate,
      platformFee: stage.key === 'complete' ? Number((amount * feeRate).toFixed(2)) : null,
    };
  }

  // Roughly a fifth of finished customers came back. Repeat business is a real
  // shape in this data — the Clients page bands people by it — and without it
  // every customer looks like a one-off.
  if (stage.key === 'complete' && rand() < 0.22) {
    const priorService = pick(SERVICES);
    const priorDaysAgo = ageDays + between(120, 400);
    const priorAmount = round(between(priorService.min, priorService.max), 25);
    record.priorJob = {
      service: priorService,
      amount: priorAmount,
      createdAt: iso(priorDaysAgo * DAY),
      scheduledFor: dateKey(-(priorDaysAgo - 4) * DAY),
      startedAt: iso((priorDaysAgo - 4) * DAY),
      invoiceCreatedAt: iso((priorDaysAgo - 5) * DAY),
      paidAt: iso((priorDaysAgo - 8) * DAY),
    };
  }

  return record;
}

// --- run ----------------------------------------------------------------------

await loadEnv();
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('No DATABASE_URL in .env.local — this script talks to Postgres directly so it can use a transaction.');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const money = (value) => `$${(Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

try {
  const { rows: accountRows } = await client.query(
    ACCOUNT_ARG
      ? `select a.id, a.business_name, s.company_name, s.subdomain,
                a.quote_followups_enabled, a.appointment_reminders_enabled, a.arrival_morning_confirmation
           from accounts a left join sites s on s.account_id = a.id where a.id = $1`
      : `select a.id, a.business_name, s.company_name, s.subdomain,
                a.quote_followups_enabled, a.appointment_reminders_enabled, a.arrival_morning_confirmation
           from accounts a join sites s on s.account_id = a.id where s.subdomain = $1`,
    [ACCOUNT_ARG || SUBDOMAIN],
  );
  if (accountRows.length === 0) {
    console.error(`No account matched ${ACCOUNT_ARG || SUBDOMAIN}.`);
    process.exit(1);
  }
  if (accountRows.length > 1) {
    console.error('That matched more than one account. Pass --account <uuid>.');
    process.exit(1);
  }
  const account = accountRows[0];

  console.log(`Account:  ${account.business_name ?? '(unnamed)'} · ${account.id}`);
  console.log(`Site:     ${account.company_name ?? '(no site)'} · ${account.subdomain ?? 'no subdomain'}`);
  if (account.company_name && account.business_name && account.company_name !== account.business_name) {
    console.log(`          NOTE: the site name and the account name disagree. Customers see the site name.`);
  }

  // The refusal, not a warning. Seeded jobs carry future scheduled dates and
  // email addresses, which is everything the reminder sweep needs; and seeded
  // customer links are everything the follow-up sweep needs. Both would fire
  // against invented people on the next cron tick.
  const live = [];
  if (account.quote_followups_enabled) live.push('quote follow-ups');
  if (account.appointment_reminders_enabled) live.push('appointment reminders');
  if (account.arrival_morning_confirmation) live.push('morning arrival confirmations');
  if (live.length > 0) {
    console.error(`\nREFUSING: ${live.join(' and ')} ${live.length === 1 ? 'is' : 'are'} switched on for this account.`);
    console.error('Seeded jobs would be swept and messages attempted against invented customers.');
    console.error('Turn those automations off, seed, then turn them back on.');
    process.exit(1);
  }
  console.log('Automations: follow-ups, reminders and morning confirmations are all off — nothing will be sent.');

  // Refs have to be unique per account, and this may not be the first run.
  const { rows: [{ next_job }] } = await client.query(
    `select coalesce(max(substring(ref from 'J-DEMO-([0-9]+)$')::int), 0) + 1 as next_job
       from jobs where account_id = $1 and ref ~ '^J-DEMO-[0-9]+$'`,
    [account.id],
  );
  const { rows: [{ next_invoice }] } = await client.query(
    `select coalesce(max(substring(ref from 'INV-DEMO-([0-9]+)$')::int), 0) + 1 as next_invoice
       from invoices where account_id = $1 and ref ~ '^INV-DEMO-[0-9]+$'`,
    [account.id],
  );

  const allocation = allocate(COUNT);
  const records = [];
  let index = 0;
  for (const stage of allocation) {
    for (let n = 0; n < stage.count; n += 1) {
      records.push(buildRecord(stage, index));
      index += 1;
    }
  }

  console.log(`\nPlan — ${records.length} customers:\n`);
  let jobCount = 0;
  let pipelineValue = 0;
  let collected = 0;
  let outstanding = 0;
  for (const stage of allocation) {
    const inStage = records.filter((record) => record.stage === stage.key);
    const value = inStage.reduce((sum, record) => sum + (record.job ? record.amount : 0), 0);
    console.log(`  ${String(inStage.length).padStart(3)}  ${stage.label.padEnd(32)} ${value ? money(value) : '—'}`);
  }
  for (const record of records) {
    if (record.job) { jobCount += 1; pipelineValue += record.amount; }
    if (record.priorJob) { jobCount += 1; collected += record.priorJob.amount; }
    if (record.payment?.status === 'paid') collected += record.amount;
    if (record.payment?.status === 'requested') outstanding += record.amount;
  }
  console.log(`\n  jobs ${jobCount} · quoted ${money(pipelineValue)} · collected ${money(collected)} · outstanding ${money(outstanding)}`);
  console.log(`  refs J-DEMO-${next_job}…  ·  invoices INV-DEMO-${next_invoice}…`);
  console.log('\n  Sample:');
  for (const record of [records[0], records[Math.floor(records.length / 2)], records[records.length - 1]]) {
    console.log(`    ${record.person.name.padEnd(22)} ${record.stageLabel.padEnd(32)} ${record.service.name} · ${money(record.amount)}`);
    console.log(`      ${record.person.address}`);
  }

  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to create the above.');
    process.exit(0);
  }

  console.log('\n*** APPLYING ***\n');
  await client.query('begin');

  let jobSeq = Number(next_job);
  let invoiceSeq = Number(next_invoice);
  let clientsWritten = 0;
  let leadsWritten = 0;
  let jobsWritten = 0;
  let linksWritten = 0;
  let invoicesWritten = 0;
  let paymentsWritten = 0;

  for (const record of records) {
    const { person } = record;

    const { rows: [clientRow] } = await client.query(
      `insert into clients (account_id, name, phone, email, address, created_at, updated_at, test_marker)
       values ($1, $2, $3, $4, $5, $6, $6, $7) returning id`,
      [account.id, person.name, person.phone, person.email, person.address, record.createdAt, TEST_MARKER],
    );
    clientsWritten += 1;

    let jobId = null;

    // The earlier visit first, so the current job is the most recent one.
    if (record.priorJob) {
      const ref = `J-DEMO-${jobSeq++}`;
      const { rows: [priorRow] } = await client.query(
        `insert into jobs (account_id, ref, client_id, client_name, client_phone, client_email, address, scope,
                           status, lead_source, quoted_amount, estimated_hours, scheduled_for, started_at,
                           lat, lng, geocoded_at, created_at, test_marker)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'complete','referral',$9,$10,$11,$12,$13,$14,$15,$15,$16) returning id`,
        [
          account.id, ref, clientRow.id, person.name, person.phone, person.email, person.address,
          record.priorJob.service.scope, record.priorJob.amount, record.priorJob.service.hours[0],
          record.priorJob.scheduledFor, record.priorJob.startedAt,
          person.lat, person.lng, record.priorJob.createdAt, TEST_MARKER,
        ],
      );
      jobsWritten += 1;
      const priorInvoiceRef = `INV-DEMO-${invoiceSeq++}`;
      const { rows: [priorInvoice] } = await client.query(
        `insert into invoices (account_id, job_id, ref, status, total, signed_at, signer_name, created_at, test_marker)
         values ($1,$2,$3,'paid',$4,$5,$6,$5,$7) returning id`,
        [account.id, priorRow.id, priorInvoiceRef, record.priorJob.amount, record.priorJob.invoiceCreatedAt, person.name, TEST_MARKER],
      );
      invoicesWritten += 1;
      await client.query(
        `insert into payments (account_id, job_id, invoice_id, kind, label, amount, status, requested_at, paid_at, platform_fee, fee_rate, test_marker)
         values ($1,$2,$3,'final','Final payment',$4,'paid',$5,$6,$7,0.02,$8)`,
        [
          account.id, priorRow.id, priorInvoice.id, record.priorJob.amount,
          record.priorJob.invoiceCreatedAt, record.priorJob.paidAt,
          Number((record.priorJob.amount * 0.02).toFixed(2)), TEST_MARKER,
        ],
      );
      paymentsWritten += 1;
    }

    if (record.job) {
      const ref = `J-DEMO-${jobSeq++}`;
      const { rows: [jobRow] } = await client.query(
        `insert into jobs (account_id, ref, client_id, client_name, client_phone, client_email, address, scope,
                           status, lead_source, quoted_amount, estimated_hours, scheduled_for, scheduled_time,
                           started_at, lat, lng, geocoded_at, created_at, test_marker)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,$19) returning id`,
        [
          account.id, ref, clientRow.id, person.name, person.phone, person.email, person.address,
          record.service.scope, record.job.status, record.leadSource, record.job.quotedAmount, record.hours,
          record.job.scheduledFor, record.job.scheduledTime, record.job.startedAt,
          person.lat, person.lng, record.job.createdAt, TEST_MARKER,
        ],
      );
      jobId = jobRow.id;
      jobsWritten += 1;

      // token_hash is a unique NOT NULL column and the real tokens are stored
      // hashed and unrecoverable, so a random hash is exactly as usable as a
      // real one: nobody can present a token that matches it, which is the
      // correct outcome for an invented customer.
      await client.query(
        `insert into client_job_access (account_id, job_id, token_hash, client_email, client_phone, last_viewed_at, created_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          account.id, jobId, randomBytes(32).toString('hex'),
          person.email, person.phone, record.link.lastViewedAt, record.link.createdAt,
        ],
      );
      linksWritten += 1;

      if (record.invoice) {
        const invoiceRef = `INV-DEMO-${invoiceSeq++}`;
        const { rows: [invoiceRow] } = await client.query(
          `insert into invoices (account_id, job_id, ref, status, total, signed_at, signer_name, created_at, test_marker)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [
            account.id, jobId, invoiceRef, record.invoice.status, record.invoice.total,
            record.invoice.signedAt, record.invoice.signerName, record.invoice.createdAt, TEST_MARKER,
          ],
        );
        invoicesWritten += 1;

        await client.query(
          `insert into payments (account_id, job_id, invoice_id, kind, label, amount, status, requested_at, paid_at, platform_fee, fee_rate, test_marker)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            account.id, jobId, invoiceRow.id, record.payment.kind, record.payment.label,
            record.payment.amount, record.payment.status, record.payment.requestedAt,
            record.payment.paidAt, record.payment.platformFee, record.payment.feeRate, TEST_MARKER,
          ],
        );
        paymentsWritten += 1;
      }
    }

    // Every customer arrived as a lead, including the ones now finished — that
    // is what makes the funnel add up rather than showing a stack of jobs with
    // no origin.
    await client.query(
      `insert into leads (account_id, client_id, source, name, phone, email, address, message, project_type,
                          status, converted_job, lat, lng, geocoded_at, created_at, updated_at, test_marker)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$14,$15)`,
      [
        account.id, clientRow.id, record.leadSource, person.name, person.phone, person.email,
        person.address, record.message, record.service.name, record.leadStatus, jobId,
        person.lat, person.lng, record.createdAt, TEST_MARKER,
      ],
    );
    leadsWritten += 1;
  }

  await client.query('commit');
  console.log(`  clients   ${clientsWritten}`);
  console.log(`  leads     ${leadsWritten}`);
  console.log(`  jobs      ${jobsWritten}`);
  console.log(`  links     ${linksWritten}`);
  console.log(`  invoices  ${invoicesWritten}`);
  console.log(`  payments  ${paymentsWritten}`);
  console.log('\nDone. Committed.');
  console.log('To undo: node scripts/remove-demo-data.mjs --account ' + account.id + ' --apply');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('\nFailed — rolled back, nothing was written.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
