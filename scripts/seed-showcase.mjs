import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Fill one account with a full, believable year of work, so every screen in the
// product can be looked at with real volume behind it instead of two rows.
//
// WHY THIS IS NOT scripts/remove-demo-data.mjs' TWIN. That script recognizes
// demo rows by a J-DEMO- ref prefix. This seeder deliberately does NOT use one:
// the entire point is to see what a busy account looks like, and a hundred jobs
// all reading "J-DEMO-1043" shows you the seeder, not the product. Refs here
// continue the account's real J-#### sequence (src/lib/jobs.ts:440 takes the
// highest NUMERIC ref, so the owner's next real job carries straight on).
//
// Removal is therefore EXACT rather than heuristic: every id written is recorded
// in a manifest next to this file, and --undo deletes precisely those rows. If
// the manifest is ever lost, --undo --derive falls back to a rule that is true by
// construction and invisible in the UI: every seeded job hangs off a seeded
// client, and every seeded client has an @example.com address.
//
// On top of both, every client, lead, job, invoice and payment written here
// carries test_marker = 'seed-showcase'. That is not a third removal rule — the
// manifest is still the one --undo trusts — it is what the owner-facing lists
// filter on, and the only marker an invoice or a payment can hold at all, since
// neither has a name, an email or a phone to be recognized by. It needs
// migrations/2026-08-24-test-record-marker.sql to have been applied.
//
// NOTHING HERE CAN REACH A REAL PERSON. It talks to Postgres directly and never
// to a server action, so no send path is involved at all. Belt and braces on top
// of that: every phone is on the 555 exchange (permanently unassigned, so a
// number can't be routed even by accident) and every email is @example.com
// (RFC 2606 reserved). Read scripts/remove-demo-data.mjs' header for why that
// convention exists.
//
// Money is settled the way an owner settles a cheque — status paid, paid_at set,
// no Stripe ids and no platform fee, exactly what markPaymentPaidManually
// writes (src/lib/payments.ts:548). Inventing pi_… ids would put rows in front
// of a Refund button that would then fail against Stripe, and would inflate the
// trailing-volume bracket that sets the platform fee.
//
// Run:
//   node scripts/seed-showcase.mjs --account <uuid>            (dry run: a plan, no writes)
//   node scripts/seed-showcase.mjs --account <uuid> --rehearse (writes everything, then rolls back)
//   node scripts/seed-showcase.mjs --account <uuid> --apply
//   node scripts/seed-showcase.mjs --account <uuid> --undo
//
// --rehearse exists for the same reason it does in remove-demo-data.mjs:
// counting rows proves nothing about whether they satisfy the constraints. It
// runs every insert inside the transaction, reports the real counts, and rolls
// back — so a check constraint this script gets wrong surfaces as a failed
// rehearsal instead of as a half-seeded account.

// ---------------------------------------------------------------------------
// Environment + arguments
// ---------------------------------------------------------------------------

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
  return index === -1 ? null : (process.argv[index + 1] ?? true);
}

const ACCOUNT = arg('account');
const REHEARSE = process.argv.includes('--rehearse');
const APPLY = process.argv.includes('--apply') || REHEARSE;
const UNDO = process.argv.includes('--undo');
const DERIVE = process.argv.includes('--derive');

/**
 * EXPLICIT CLIENT VOLUME.
 *
 * Without these the script seeds the shape it always has: ~72 clients and a
 * hundred jobs weighted heavily towards work already done, which is what a
 * year of trading looks like. With them, the roster is the thing being asked
 * for and the counts are exact:
 *
 *   --past N     N clients whose work is finished and behind them
 *   --future N   N clients with work on the calendar ahead
 *
 * Exact matters here. "About two hundred" is fine for a screenshot and useless
 * for the thing these numbers are usually for — checking that a list, a
 * paginator or a count badge behaves at a stated size. So in this mode the
 * whole roster is minted up front and everything else draws FROM it: the
 * recurring plans attach to clients who already exist rather than inventing
 * twelve more, and no one-off is allowed to be a repeat customer. Clients
 * created == past + future, on the nose.
 */
const PAST = Number(arg('past')) || 0;
const FUTURE = Number(arg('future')) || 0;
const EXPLICIT = PAST > 0 || FUTURE > 0;

if (!ACCOUNT || typeof ACCOUNT !== 'string') {
  console.error('Usage: node scripts/seed-showcase.mjs --account <uuid> [--rehearse | --apply | --undo]');
  console.error('Without --apply this only reports. Never defaults to an account.');
  process.exit(1);
}

const MANIFEST = new URL(`./.seed-showcase-${ACCOUNT}.json`, import.meta.url);

// Stamped onto every customer-facing row this writes. See the header.
const TEST_MARKER = 'seed-showcase';

// Anchor date. Everything else is expressed as an offset from it, so the shape
// of the year survives being seeded on a different day.
const TODAY = new Date(`${arg('today') || new Date().toISOString().slice(0, 10)}T12:00:00Z`);

// ---------------------------------------------------------------------------
// Determinism
//
// A dry run that prints one dataset and an --apply that writes a different one
// would make the dry run worthless. Same seed, same rows, every time.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260805);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (min, max) => min + rnd() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const chance = (p) => rnd() < p;
const round2 = (n) => Math.round(n * 100) / 100;

const dayOffset = (days) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};
const dateKey = (d) => d.toISOString().slice(0, 10);
const stamp = (days, hour = 9) => {
  const d = dayOffset(days);
  d.setUTCHours(hour, intBetween(0, 59), 0, 0);
  return d.toISOString();
};

// A cleaner does not work Sundays, and half a calendar of Sunday jobs is the
// first thing that gives seeded data away.
function toWorkday(days) {
  let n = days;
  for (let i = 0; i < 7; i += 1) {
    const dow = dayOffset(n).getUTCDay();
    if (dow !== 0) return n;
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Asheville. The site's own service area says "Asheville and surrounding areas",
// so the work is placed there — the map, route density and "nearby" ranking are
// only worth looking at if the pins form real neighbourhoods.
//
// Coordinates are a neighbourhood centroid plus a few hundred yards of jitter.
// They are synthetic, like the street numbers they belong to; nothing here is
// claimed to be a geocode, and no geocoded_at is written, so the app never
// treats them as a cached lookup.
// ---------------------------------------------------------------------------

const AREAS = [
  { name: 'West Asheville', zip: '28806', lat: 35.5787, lng: -82.6157, streets: ['Haywood Rd', 'Sand Hill Rd', 'Vermont Ave', 'Michigan Ave', 'Dunwell Ave', 'State St'] },
  { name: 'Montford', zip: '28801', lat: 35.6047, lng: -82.5654, streets: ['Montford Ave', 'Cumberland Ave', 'Flint St', 'Pearson Dr', 'Watauga St'] },
  { name: 'Asheville', zip: '28801', lat: 35.5951, lng: -82.5515, streets: ['Broadway St', 'College St', 'Patton Ave', 'Lexington Ave', 'Biltmore Ave'] },
  { name: 'Asheville', zip: '28804', lat: 35.6215, lng: -82.5570, streets: ['Merrimon Ave', 'Kimberly Ave', 'Gracelyn Rd', 'Beaverdam Rd', 'Charlotte St'] },
  { name: 'Asheville', zip: '28803', lat: 35.5735, lng: -82.5378, streets: ['Kenilworth Rd', 'Caledonia Rd', 'Forest Hill Dr', 'Vanderbilt Rd', 'Stuyvesant Rd'] },
  { name: 'Asheville', zip: '28805', lat: 35.5931, lng: -82.4960, streets: ['New Haw Creek Rd', 'Bell Rd', 'Old Haw Creek Rd', 'Trinity Chapel Rd', 'Riceville Rd'] },
  { name: 'Arden', zip: '28704', lat: 35.4712, lng: -82.5182, streets: ['Long Shoals Rd', 'Glenn Bridge Rd', 'Overlook Rd', 'Airport Rd'] },
  { name: 'Fairview', zip: '28730', lat: 35.5104, lng: -82.4093, streets: ['Charlotte Hwy', 'Cane Creek Rd', 'Old Fort Rd', 'Emmas Grove Rd'] },
  { name: 'Weaverville', zip: '28787', lat: 35.6968, lng: -82.5610, streets: ['Weaver Blvd', 'Reems Creek Rd', 'Monticello Rd', 'Main St'] },
  { name: 'Black Mountain', zip: '28711', lat: 35.6182, lng: -82.3212, streets: ['State St', 'Cherry St', 'Montreat Rd', 'Blue Ridge Rd'] },
  { name: 'Candler', zip: '28715', lat: 35.5490, lng: -82.6960, streets: ['Smokey Park Hwy', 'Pisgah Hwy', 'Newfound Rd'] },
];

function newAddress() {
  const area = pick(AREAS);
  const number = intBetween(12, 1480);
  return {
    text: `${number} ${pick(area.streets)}, ${area.name}, NC ${area.zip}`,
    lat: Number((area.lat + between(-0.006, 0.006)).toFixed(6)),
    lng: Number((area.lng + between(-0.008, 0.008)).toFixed(6)),
  };
}

const FIRST = ['Amelia', 'Marcus', 'Priya', 'Dana', 'Wesley', 'Corinne', 'Malik', 'Sofia', 'Grant', 'Noelle', 'Trevor', 'Imani', 'Beau', 'Harriet', 'Desmond', 'Lena', 'Rafael', 'Bridget', 'Jonah', 'Camille', 'Otis', 'Simone', 'Callum', 'Rosalind', 'Tobias', 'Maren', 'Hollis', 'Junie', 'Everett', 'Delia', 'Sterling', 'Paloma', 'Emmett', 'Nadia', 'Cyrus', 'Frankie', 'Odette', 'Barrett', 'Winnie', 'Anders', 'Talia', 'Roscoe', 'Cleo', 'Linus', 'Marguerite', 'Silas', 'Opal', 'Dorian', 'Etta', 'Rowan'];
const LAST = ['Whitaker', 'Delgado', 'Osei', 'Kowalski', 'Barnhill', 'Nguyen', 'Fairbanks', 'Rutherford', 'Castellano', 'Ashby', 'Okonkwo', 'Ferrell', 'Lindqvist', 'Marchetti', 'Halloway', 'Trujillo', 'Beaumont', 'Sandoval', 'Pemberton', 'Ivanov', 'Cadwell', 'Moreau', 'Stackhouse', 'Villanueva', 'Ashworth', 'Rasmussen', 'Balogun', 'Thornbury', 'Quintero', 'Ellsworth', 'Haverford', 'Nakashima', 'Prescott', 'Duarte', 'Winslow', 'Amara', 'Callahan', 'Redmond', 'Sorensen', 'Tanaka'];

const usedNames = new Set();
function newPerson(index) {
  let name = `${pick(FIRST)} ${pick(LAST)}`;
  let guard = 0;
  while (usedNames.has(name) && guard < 200) {
    name = `${pick(FIRST)} ${pick(LAST)}`;
    guard += 1;
  }
  usedNames.add(name);
  const handle = name.toLowerCase().replace(/[^a-z]+/g, '.');
  return {
    name,
    // 828 is Asheville's real area code; 555-01xx is the reserved fictional
    // block inside it, so the number reads local and can never be dialled.
    phone: `+1828555${String(1000 + index).slice(-4)}`,
    email: `${handle}@example.com`,
  };
}

// ---------------------------------------------------------------------------
// The price book — what a residential cleaner actually sells.
//
// unit_cost is the direct cost of delivering one unit (supplies + the crew hours
// it takes). It is nullable in the schema on purpose — a missing cost is unknown,
// not zero — so it is only set where it is genuinely known.
// ---------------------------------------------------------------------------

const SERVICES = [
  { name: 'Standard clean — 2 bed', description: 'Kitchen, bathrooms, floors, dusting, trash. Up to 2 bed / 1 bath.', unit_price: 135, unit_cost: 58, unit: 'visit', hours: 2.5 },
  { name: 'Standard clean — 3 bed', description: 'Full standard clean, up to 3 bed / 2 bath.', unit_price: 165, unit_cost: 72, unit: 'visit', hours: 3 },
  { name: 'Standard clean — 4+ bed', description: 'Full standard clean, 4 bed and up.', unit_price: 210, unit_cost: 94, unit: 'visit', hours: 4 },
  { name: 'Deep clean', description: 'Baseboards, blinds, inside cabinets, grout, appliance exteriors.', unit_price: 325, unit_cost: 148, unit: 'visit', hours: 5.5 },
  { name: 'Move-out clean', description: 'Empty-home deep clean to lease-return standard. Inside everything.', unit_price: 395, unit_cost: 180, unit: 'visit', hours: 6.5 },
  { name: 'Move-in clean', description: 'Sanitise before the boxes land — cabinets, closets, fixtures, floors.', unit_price: 365, unit_cost: 166, unit: 'visit', hours: 6 },
  { name: 'Post-construction clean', description: 'Dust removal, sticker and paint spot removal, final polish.', unit_price: 650, unit_cost: 310, unit: 'visit', hours: 9 },
  { name: 'Office / small commercial', description: 'After-hours office clean — desks, kitchen, restrooms, floors.', unit_price: 240, unit_cost: 108, unit: 'visit', hours: 3.5 },
  { name: 'Short-term rental turnover', description: 'Guest-ready turnover: linens, restock, staging, photos on request.', unit_price: 125, unit_cost: 54, unit: 'visit', hours: 2 },
  { name: 'Interior windows', description: 'Interior glass, sills and tracks.', unit_price: 95, unit_cost: 38, unit: 'add-on', hours: 1.5 },
  { name: 'Inside refrigerator', description: 'Empty, wipe down, sanitise, replace.', unit_price: 45, unit_cost: 18, unit: 'add-on', hours: 0.75 },
  { name: 'Inside oven', description: 'Degrease racks and cavity.', unit_price: 55, unit_cost: 24, unit: 'add-on', hours: 1 },
  { name: 'Laundry & linens', description: 'Wash, dry, fold and make beds.', unit_price: 40, unit_cost: 16, unit: 'add-on', hours: 1 },
  { name: 'Carpet shampoo — per room', description: 'Hot-water extraction, one room.', unit_price: 65, unit_cost: 28, unit: 'room', hours: 1 },
  { name: 'Garage or basement clear-out', description: 'Sweep, cobweb, wipe shelving, haul-away extra.', unit_price: 185, unit_cost: 88, unit: 'visit', hours: 3 },
];

const ONE_OFF_SERVICES = SERVICES.filter((s) => s.unit === 'visit');
const ADD_ONS = SERVICES.filter((s) => s.unit === 'add-on' || s.unit === 'room');

// ---------------------------------------------------------------------------
// The crew. Three pay types on purpose — Hours & pay, payroll export and job
// costing all behave differently for hourly / salary / day-rate people, and a
// roster of five identical hourly cleaners exercises one third of that.
// ---------------------------------------------------------------------------

const CREW = [
  { name: 'Marisol Vega', role_label: 'Lead cleaner', pay_type: 'hourly', hourly_rate: 24, annual_salary: null, day_rate: null, phone: '+18285550201', email: 'marisol.vega@example.com' },
  { name: 'Tanya Brooks', role_label: 'Cleaner', pay_type: 'hourly', hourly_rate: 20, annual_salary: null, day_rate: null, phone: '+18285550202', email: 'tanya.brooks@example.com' },
  { name: 'Devon Pierce', role_label: 'Cleaner', pay_type: 'hourly', hourly_rate: 19, annual_salary: null, day_rate: null, phone: '+18285550203', email: 'devon.pierce@example.com' },
  // hourly_rate on a non-hourly person is the DERIVED cost of an hour of their
  // time (salary ÷ 2080, day rate ÷ 8), never what they are paid. See
  // src/lib/pay-types.ts — job costing reads this column for everyone.
  { name: 'Priya Raman', role_label: 'Operations lead', pay_type: 'salary', hourly_rate: round2(54000 / 2080), annual_salary: 54000, day_rate: null, phone: '+18285550204', email: 'priya.raman@example.com' },
  { name: 'Luis Ortega', role_label: 'Deep-clean specialist', pay_type: 'day_rate', hourly_rate: round2(240 / 8), annual_salary: null, day_rate: 240, phone: '+18285550205', email: 'luis.ortega@example.com' },
];

const SUPPLIES = [
  ['Bona hardwood floor cleaner', 'Ingles — Merrimon'],
  ['Microfiber cloth 24-pack', 'Costco — Asheville'],
  ['Bar Keepers Friend + Scrub Daddy', 'Ingles — Merrimon'],
  ['Mrs. Meyer’s multi-surface, 4 bottles', 'Costco — Asheville'],
  ['Vacuum bags & HEPA filter', 'Asheville Vacuum & Sewing'],
  ['Nitrile gloves, box of 100', 'Costco — Asheville'],
  ['Trash liners, contractor grade', 'Lowe’s — Airport Rd'],
  ['Grout brush set + magic erasers', 'Lowe’s — Airport Rd'],
];

const CHECKLIST = {
  standard: ['Kitchen counters & sink', 'Bathrooms — tub, toilet, mirror', 'Vacuum all carpet', 'Mop hard floors', 'Dust reachable surfaces', 'Trash out & liners replaced'],
  deep: ['Baseboards wiped', 'Blinds dusted', 'Inside cabinets', 'Shower grout scrubbed', 'Appliance exteriors polished', 'Light fixtures & fans', 'Interior windows', 'Doors & switch plates'],
  moveout: ['Inside all cabinets & drawers', 'Inside oven', 'Inside refrigerator', 'Closets & shelving', 'Baseboards & door frames', 'Windows, sills, tracks', 'Floors mopped last', 'Final walkthrough photos'],
  turnover: ['Strip & remake beds', 'Restock paper & soap', 'Dishwasher run & emptied', 'Staging photos for host', 'Check for left items'],
};

function checklistFor(serviceName) {
  if (serviceName.startsWith('Move-')) return CHECKLIST.moveout;
  if (serviceName.startsWith('Deep') || serviceName.startsWith('Post-')) return CHECKLIST.deep;
  if (serviceName.startsWith('Short-term')) return CHECKLIST.turnover;
  return CHECKLIST.standard;
}

const PROJECT_TYPES = ['Standard house clean', 'Deep clean', 'Move-out clean', 'Move-in clean', 'Recurring biweekly clean', 'Recurring weekly clean', 'Short-term rental turnover', 'Post-construction clean', 'Office clean', 'One-time spring clean', 'Windows & blinds', 'Carpet shampoo'];

const LEAD_MESSAGES = [
  'We just closed on a house off {street} and it needs a real scrub before we move furniture in. What does that run?',
  'Looking for someone reliable every other week. Two adults, one very shedding dog.',
  'Our lease is up at the end of the month and the property manager wants it "professionally cleaned". Do you do that?',
  'I have a 3 bed / 2 bath and honestly I am behind. Deep clean first, then maybe monthly?',
  'Do you handle Airbnb turnovers? I have two units and my current cleaner just quit.',
  'Contractor finished our kitchen remodel and there is drywall dust on literally everything.',
  'Small office, six desks, one bathroom. After hours only. Weekly or biweekly.',
  'My mother is moving into assisted living and the house needs to be emptied and cleaned for listing.',
  'Can you quote windows inside and out? Two storey, about 20 windows.',
  'Need a one-time before we host Thanksgiving. Mostly kitchen and the two guest bathrooms.',
  'How much for a standard clean on a 2 bedroom condo downtown? Flexible on day.',
  'We had a party and the carpet did not survive. Shampoo plus a regular clean?',
];

const LOST_REASONS = ['Went with a cheaper quote', 'Never responded after the estimate', 'Outside our service area', 'Wanted same-day, we were booked', 'Decided to keep doing it themselves', 'Price was above their budget'];

// ---------------------------------------------------------------------------
// Build the dataset. Pure — nothing below touches the database.
// ---------------------------------------------------------------------------

function build(startJobNumber, startInvoiceNumber) {
  const clients = [];
  const jobs = [];
  const leads = [];
  const plans = [];
  const assignments = [];
  const tasks = [];
  const costs = [];
  const invoices = [];
  const invoiceItems = [];
  const payments = [];
  const feed = [];
  const reviews = [];

  let personIndex = 0;
  let jobNumber = startJobNumber;
  let invoiceNumber = startInvoiceNumber;

  const newClient = (notes = null) => {
    const person = newPerson(personIndex++);
    const address = newAddress();
    const client = {
      key: `client-${clients.length}`,
      name: person.name,
      phone: person.phone,
      email: person.email,
      address: address.text,
      lat: address.lat,
      lng: address.lng,
      notes,
      created_days_ago: null,
    };
    clients.push(client);
    return client;
  };

  /**
   * The whole roster, minted before anything that needs a client asks for one.
   *
   * Order is deliberate: [0 … PAST-1] are the clients whose work is behind
   * them, [PAST … end] the ones with work ahead. The one-off loop walks it from
   * the front in exactly that order, so index position IS the past/future
   * split and no bookkeeping is needed to keep the two counts honest.
   *
   * The recurring plans take from the BACK. A client on a weekly plan has a
   * visit on the calendar next week by definition, so they belong among the
   * ones with work ahead — and taking from the back keeps them clear of the
   * completed half the front is handing out.
   */
  const POOL = EXPLICIT ? Array.from({ length: PAST + FUTURE }, () => newClient()) : null;

  // -- Recurring plans ------------------------------------------------------
  // The spine of a cleaning business. Twelve plans, and the visits they have
  // already produced become part of the hundred jobs rather than sitting on top
  // of them — that is what actually happens, and it keeps the count honest.
  const PLAN_SHAPES = [
    { frequency: 'weekly', service: 'Standard clean — 3 bed', title: 'Weekly clean' },
    { frequency: 'weekly', service: 'Short-term rental turnover', title: 'Weekly turnover — Airbnb' },
    { frequency: 'weekly', service: 'Office / small commercial', title: 'Weekly office clean' },
    { frequency: 'biweekly', service: 'Standard clean — 3 bed', title: 'Biweekly clean' },
    { frequency: 'biweekly', service: 'Standard clean — 2 bed', title: 'Biweekly clean' },
    { frequency: 'biweekly', service: 'Standard clean — 4+ bed', title: 'Biweekly clean' },
    { frequency: 'biweekly', service: 'Standard clean — 3 bed', title: 'Biweekly clean' },
    { frequency: 'biweekly', service: 'Office / small commercial', title: 'Biweekly office clean' },
    { frequency: 'monthly', service: 'Standard clean — 4+ bed', title: 'Monthly deep tidy' },
    { frequency: 'monthly', service: 'Standard clean — 3 bed', title: 'Monthly clean' },
    { frequency: 'monthly', service: 'Standard clean — 2 bed', title: 'Monthly clean' },
    { frequency: 'weekly', service: 'Short-term rental turnover', title: 'Weekly turnover — Montford cottage' },
  ];

  const cadenceDays = { weekly: 7, biweekly: 14, monthly: 30 };

  PLAN_SHAPES.forEach((shape, i) => {
    const service = SERVICES.find((s) => s.name === shape.service);
    // From the back of the roster in explicit mode — see POOL. Twelve plans
    // against a roster of hundreds cannot run off the front of it, and the
    // modulo is a guard for somebody seeding --future 4 rather than a case
    // that arises at the sizes this is used at.
    const client = POOL ? POOL[POOL.length - 1 - (i % POOL.length)] : newClient();
    const startedDaysAgo = intBetween(120, 330);
    const step = cadenceDays[shape.frequency];
    // Two of the twelve have lapsed — a plan list where everything is healthy
    // never shows anyone what the attention states look like.
    const active = i !== 4 && i !== 10;
    const autoCharge = active && chance(0.7);
    plans.push({
      key: `plan-${i}`,
      clientKey: client.key,
      title: `${shape.title} — ${client.name.split(' ')[1]}`,
      scope: service.description,
      client,
      amount: service.unit_price,
      frequency: shape.frequency,
      step,
      service,
      active,
      auto_charge: autoCharge,
      card_brand: autoCharge ? pick(['visa', 'mastercard', 'amex']) : null,
      card_last4: autoCharge ? String(intBetween(1000, 9999)) : null,
      started_days_ago: startedDaysAgo,
      created_at: stamp(-startedDaysAgo, 10),
    });
  });

  // -- Jobs -----------------------------------------------------------------
  const addJob = (spec) => {
    const ref = `J-${jobNumber++}`;
    const job = { key: `job-${jobs.length}`, ref, ...spec };
    jobs.push(job);
    return job;
  };

  // Who actually gets sent. Not a random draw: putting the day-rate deep-clean
  // specialist on a $125 turnover is a job that loses money, and forty of those
  // drag the whole account's margin down to something no cleaner would recognise.
  const CHEAP_CREW = CREW.filter((c) => c.hourly_rate <= 24);
  const SPECIALISTS = CREW.filter((c) => c.hourly_rate > 24);

  const laborFor = (job, hours) => {
    const heavy = job.estimated_hours >= 5.5 || job.serviceName.startsWith('Post-');
    const person = heavy && chance(0.7) ? pick(SPECIALISTS) : pick(CHEAP_CREW);
    const amount = round2(hours * person.hourly_rate);
    return {
      jobKey: job.key,
      type: 'labor',
      category: 'Labor',
      description: `${person.name} — ${job.serviceName.toLowerCase()}`,
      amount,
      crewName: person.name,
      crewRole: person.role_label,
      hours,
      rate: person.hourly_rate,
      // A cleaning payroll burden of ~18% — payroll taxes, workers' comp and the
      // liability policy. Held apart from `amount` because crew pay is computed
      // from `amount`; folding it in would inflate every paycheque.
      burden: round2(amount * 0.18),
      source: 'clocked',
      supplier: null,
      created_at: job.completed_at ?? job.created_at,
      crew: person,
    };
  };

  const settleJob = (job, { paid, invoiceStatus }) => {
    const ref = `INV-${invoiceNumber++}`;
    const items = [{ description: job.serviceName, amount: job.baseAmount, sort_order: 0 }];
    job.addOns.forEach((addOn, i) => items.push({ description: addOn.name, amount: addOn.unit_price, sort_order: i + 1 }));
    const invoice = {
      key: `invoice-${invoices.length}`,
      jobKey: job.key,
      ref,
      status: invoiceStatus,
      total: job.quoted_amount,
      created_at: job.completed_at ?? job.created_at,
      signed_at: paid ? job.completed_at : null,
      signer_name: paid ? job.client.name : null,
    };
    invoices.push(invoice);
    items.forEach((item) => invoiceItems.push({ invoiceKey: invoice.key, ...item }));
    return invoice;
  };

  const addFeed = (job, kind, body, visibility, extra = {}) => {
    feed.push({ jobKey: job.key, kind, body, visibility, author: extra.author ?? 'Chelsea', title: extra.title ?? null, amount: extra.amount ?? null, created_at: extra.at ?? job.created_at });
  };

  // (a) Recurring visits — 40 of the hundred.
  plans.forEach((plan) => {
    const visits = plan.frequency === 'weekly' ? 4 : 3;
    for (let v = visits; v >= 1; v -= 1) {
      // Two cadences back, so the newest visit of a live plan lands one cadence
      // AHEAD of today. A plan whose visits are all in the past looks cancelled.
      const raw = -(v * plan.step) + plan.step * 2 - (plan.active ? 0 : plan.step * 3);
      const scheduled = toWorkday(raw);
      const future = scheduled > 0;
      const service = plan.service;
      const job = addJob({
        client: plan.client,
        clientKey: plan.clientKey,
        serviceName: service.name,
        scope: `${service.name} — ${service.description}`,
        status: future ? 'in_progress' : 'complete',
        scheduled_for: dateKey(dayOffset(scheduled)),
        scheduled_time: pick(['08:00', '09:00', '10:30', '13:00', '14:30']),
        estimated_hours: service.hours,
        baseAmount: plan.amount,
        addOns: [],
        quoted_amount: plan.amount,
        lead_source: null,
        created_at: stamp(scheduled - 7, 8),
        completed_at: future ? null : stamp(scheduled, 15),
        planKey: plan.key,
        recurring_visit_date: dateKey(dayOffset(scheduled)),
        address: plan.client.address,
        lat: plan.client.lat,
        lng: plan.client.lng,
      });
      if (!future) {
        costs.push(laborFor(job, round2(service.hours + between(-0.5, 0.5))));
        if (chance(0.35)) {
          const [description, supplier] = pick(SUPPLIES);
          costs.push({ jobKey: job.key, type: 'material', category: 'Materials', description, amount: round2(between(8, 42)), crewName: null, crewRole: null, hours: null, rate: null, burden: 0, source: 'receipt', supplier, created_at: job.completed_at });
        }
        const invoice = settleJob(job, { paid: true, invoiceStatus: 'paid' });
        payments.push({ jobKey: job.key, invoiceKey: invoice.key, kind: 'final', label: `${service.name} — ${dateKey(dayOffset(scheduled))}`, amount: job.quoted_amount, status: 'paid', requested_at: job.completed_at, paid_at: job.completed_at, planKey: plan.key });
        addFeed(job, 'recurring_visit', `Visit created from the ${plan.frequency} plan.`, 'internal', { at: job.created_at });
        addFeed(job, 'job_completed', 'Visit complete.', 'client', { at: job.completed_at });
      } else {
        addFeed(job, 'recurring_visit', `Visit created from the ${plan.frequency} plan.`, 'internal', { at: job.created_at });
      }
    }
  });

  // (b) One-off jobs — the remaining 60, across every status.
  //
  // In explicit mode this becomes the roster instead: one job per client, in
  // the pool's own order, so the first PAST of them are finished and the rest
  // are on the calendar. 'upcoming' is a status of this plan, not of the jobs
  // table — there are only four of those (new_lead / in_progress / complete /
  // archived) and "booked for next Tuesday" is in_progress with a scheduled_for
  // ahead of today. It is named separately here because the existing
  // in_progress branch straddles today deliberately, and a client asked for as
  // "future" must not land in the past half of that range.
  const ONE_OFF_PLAN = EXPLICIT
    ? [
        ...Array.from({ length: PAST }, () => 'complete'),
        ...Array.from({ length: FUTURE }, () => 'upcoming'),
      ]
    : [
        ...Array.from({ length: 34 }, () => 'complete'),
        ...Array.from({ length: 10 }, () => 'in_progress'),
        ...Array.from({ length: 11 }, () => 'new_lead'),
        ...Array.from({ length: 5 }, () => 'archived'),
      ];

  ONE_OFF_PLAN.forEach((planStatus, i) => {
    // 'upcoming' is this loop's word; the row gets a real one.
    const status = planStatus === 'upcoming' ? 'in_progress' : planStatus;
    // A quarter of one-off work is a repeat customer — that is what makes the
    // client record worth having, and the "3rd job" badge worth showing. Off in
    // explicit mode: a repeat consumes a job without producing a client, and
    // the requested count would come up short by however many times it fired.
    const repeat = !EXPLICIT && clients.length > 14 && chance(0.25);
    const client = POOL ? POOL[i] : repeat ? clients[intBetween(0, clients.length - 1)] : newClient();
    const service = pick(ONE_OFF_SERVICES);
    const addOns = chance(0.4) ? [pick(ADD_ONS)] : [];
    const baseAmount = service.unit_price + (chance(0.3) ? intBetween(1, 4) * 10 : 0);
    const quoted = round2(baseAmount + addOns.reduce((sum, a) => sum + a.unit_price, 0));

    let scheduledOffset;
    let createdOffset;
    if (planStatus === 'upcoming') {
      // Strictly ahead, and spread over a quarter rather than a fortnight —
      // a hundred jobs inside two weeks is not a calendar anybody recognises.
      scheduledOffset = toWorkday(intBetween(1, 92));
      createdOffset = -intBetween(1, 24);
    } else if (status === 'complete') {
      scheduledOffset = toWorkday(-intBetween(4, 300));
      createdOffset = scheduledOffset - intBetween(3, 16);
    } else if (status === 'in_progress') {
      scheduledOffset = toWorkday(i % 3 === 0 ? intBetween(-2, 1) : intBetween(2, 26));
      createdOffset = scheduledOffset - intBetween(4, 18);
    } else if (status === 'new_lead') {
      scheduledOffset = null;
      createdOffset = -intBetween(1, 21);
    } else {
      scheduledOffset = null;
      createdOffset = -intBetween(30, 240);
    }

    const job = addJob({
      client,
      clientKey: client.key,
      serviceName: service.name,
      scope: `${service.name}. ${service.description}`,
      status,
      scheduled_for: scheduledOffset === null ? null : dateKey(dayOffset(scheduledOffset)),
      scheduled_time: scheduledOffset === null ? null : pick(['08:00', '09:00', '10:30', '13:00', '14:30']),
      estimated_hours: service.hours,
      baseAmount,
      addOns,
      quoted_amount: quoted,
      lead_source: pick(['website_form', 'referral', 'missed_call', 'manual']),
      created_at: stamp(createdOffset, 11),
      completed_at: status === 'complete' ? stamp(scheduledOffset, 16) : null,
      planKey: null,
      recurring_visit_date: null,
      address: client.address,
      lat: client.lat,
      lng: client.lng,
    });

    addFeed(job, 'job_created', `Quote sent — ${service.name}, $${quoted.toFixed(2)}.`, 'client', { at: job.created_at });

    if (status === 'complete') {
      const hours = round2(service.hours + between(-0.75, 1.25));
      costs.push(laborFor(job, hours));
      if (chance(0.55)) {
        const [description, supplier] = pick(SUPPLIES);
        costs.push({ jobKey: job.key, type: 'material', category: 'Materials', description, amount: round2(between(9, 68)), crewName: null, crewRole: null, hours: null, rate: null, burden: 0, source: 'receipt', supplier, created_at: job.completed_at });
      }
      // Five in six completed jobs are collected. The rest are the receivables
      // an owner actually has to chase, which is the only reason the Money page
      // has anything to say.
      const collected = chance(0.84);
      const invoice = settleJob(job, { paid: collected, invoiceStatus: collected ? 'paid' : 'sent' });
      payments.push({
        jobKey: job.key,
        invoiceKey: invoice.key,
        kind: 'final',
        label: service.name,
        amount: job.quoted_amount,
        status: collected ? 'paid' : 'requested',
        requested_at: job.completed_at,
        paid_at: collected ? stamp(scheduledOffset + intBetween(0, 9), 12) : null,
        planKey: null,
      });
      addFeed(job, 'job_completed', 'Job complete — before and after photos sent.', 'client', { at: job.completed_at });
      addFeed(job, collected ? 'payment_requested' : 'invoice_sent', collected ? `Payment received — $${job.quoted_amount.toFixed(2)}.` : `Invoice ${invoice.ref} sent.`, 'client_financial', { at: job.completed_at, amount: job.quoted_amount });

      if (chance(0.45)) {
        const rating = chance(0.85) ? 5 : pick([3, 4, 4]);
        reviews.push({
          jobKey: job.key,
          clientName: client.name,
          rating,
          responded_at: stamp(scheduledOffset + intBetween(1, 6), 18),
          feedback: rating >= 4 ? null : 'Good job overall, but the team ran about an hour late without calling ahead.',
          routed_to: rating >= 4 ? 'google' : 'private',
          created_at: job.completed_at,
        });
      }
    }

    if (status === 'in_progress' && scheduledOffset !== null && scheduledOffset >= 0) {
      addFeed(job, 'job_scheduled', `Scheduled for ${dateKey(dayOffset(scheduledOffset))}.`, 'client', { at: job.created_at });
      // A deposit on the bigger one-off jobs, which is where the "requested,
      // not yet paid" state on the Money page comes from.
      if (quoted >= 320 && chance(0.5)) {
        payments.push({ jobKey: job.key, invoiceKey: null, kind: 'deposit', label: 'Deposit to hold the date', amount: round2(quoted * 0.3), status: 'requested', requested_at: job.created_at, paid_at: null, planKey: null });
      }
    }

    if (status === 'archived') {
      addFeed(job, 'job_update', `Archived — ${pick(LOST_REASONS).toLowerCase()}.`, 'internal', { at: stamp(createdOffset + 12, 14) });
    }

    // Checklists on the work that has one.
    if (status === 'complete' || status === 'in_progress') {
      checklistFor(service.name).forEach((title, order) => {
        tasks.push({ jobKey: job.key, title, done: status === 'complete', done_at: status === 'complete' ? job.completed_at : null, done_by: status === 'complete' ? pick(CREW).name : null, sort_order: order });
      });
    }
  });

  // -- Crew assignments -----------------------------------------------------
  jobs.forEach((job) => {
    if (job.status === 'new_lead' || job.status === 'archived') return;
    const size = job.estimated_hours >= 5.5 ? 2 : 1;
    const chosen = new Set();
    while (chosen.size < size) chosen.add(intBetween(0, CREW.length - 1));
    chosen.forEach((index) => assignments.push({ jobKey: job.key, crewIndex: index, assigned_at: job.created_at }));
  });

  // -- Leads ----------------------------------------------------------------
  // The 24 won leads point at real completed jobs, so "won" is a link the owner
  // can follow rather than a word.
  const wonTargets = jobs.filter((j) => j.status === 'complete' && !j.planKey).slice(0, 24);
  const LEAD_PLAN = [
    ...Array.from({ length: 20 }, () => 'new'),
    ...Array.from({ length: 18 }, () => 'contacted'),
    ...Array.from({ length: 22 }, () => 'quoted'),
    ...Array.from({ length: 24 }, () => 'won'),
    ...Array.from({ length: 16 }, () => 'lost'),
  ];

  let wonCursor = 0;
  LEAD_PLAN.forEach((status, i) => {
    const won = status === 'won' && wonCursor < wonTargets.length;
    const job = won ? wonTargets[wonCursor++] : null;
    const client = job ? job.client : null;
    const person = client ? { name: client.name, phone: client.phone, email: client.email } : newPerson(personIndex++);
    const address = client ? { text: client.address, lat: client.lat, lng: client.lng } : newAddress();

    // New leads are recent; the rest fan out across five months.
    const createdOffset = status === 'new' ? -intBetween(0, 6) : status === 'contacted' ? -intBetween(2, 20) : -intBetween(5, 150);
    const projectType = job ? job.serviceName : pick(PROJECT_TYPES);
    const message = pick(LEAD_MESSAGES).replace('{street}', pick(pick(AREAS).streets));

    // Triage is scored, not guessed: a lead with a phone, an address and a
    // recognisable job type is hot; missing contact detail is what makes one low.
    const hasPhone = chance(0.86);
    const score = won ? 'hot' : !hasPhone ? 'low' : status === 'lost' ? pick(['warm', 'low']) : pick(['hot', 'warm', 'warm']);

    leads.push({
      clientKey: client ? client.key : null,
      convertedJobKey: job ? job.key : null,
      source: won ? pick(['website_form', 'referral', 'website_form']) : pick(['website_form', 'website_form', 'referral', 'missed_call', 'manual']),
      status,
      name: person.name,
      phone: hasPhone || won ? person.phone : null,
      email: chance(0.75) || !hasPhone ? person.email : null,
      address: chance(0.8) || won ? address.text : null,
      lat: chance(0.8) || won ? address.lat : null,
      lng: chance(0.8) || won ? address.lng : null,
      project_type: projectType,
      estimated_hours: chance(0.6) ? round2(between(2, 8)) : null,
      message: status === 'lost' ? `${message}` : message,
      source_page: chance(0.7) ? '/' : pick(['/services', '/contact', '/book']),
      triage: {
        score,
        flags: status === 'lost' ? ['no_reply'] : [],
        timeline: pick(['ASAP', 'Within 2 weeks', 'This month', 'Flexible']),
        location: address.text ? address.text.split(',').slice(1, 2).join('').trim() : null,
        estimate: null,
        phoneVerified: hasPhone,
        snoozedUntil: null,
        archived: false,
        declinedReason: status === 'lost' ? pick(LOST_REASONS) : null,
      },
      created_at: stamp(createdOffset, intBetween(8, 19)),
      updated_at: stamp(Math.min(0, createdOffset + intBetween(0, 4)), 12),
    });
  });

  return { clients, jobs, leads, plans, assignments, tasks, costs, invoices, invoiceItems, payments, feed, reviews };
}

// ---------------------------------------------------------------------------
// Rows that do not hang off a job
// ---------------------------------------------------------------------------

const SCHEDULED_PAYMENTS = [
  { label: 'Crew payroll', amount: 3850, direction: 'out', category: 'payroll', recurrence: 'biweekly', dueOffset: 3, confirmed: true, note: 'Five cleaners, run every other Friday.' },
  { label: 'Cleaning supplies — Costco run', amount: 420, direction: 'out', category: 'materials', recurrence: 'monthly', dueOffset: 9, confirmed: false, note: 'Varies with turnover volume.' },
  { label: 'Van payment — 2023 Transit Connect', amount: 512.4, direction: 'out', category: 'loan', recurrence: 'monthly', dueOffset: 12, confirmed: true, note: null },
  { label: 'General liability + bond', amount: 186, direction: 'out', category: 'bill', recurrence: 'monthly', dueOffset: 18, confirmed: true, note: 'Required by two of the commercial accounts.' },
  { label: 'Quarterly estimated tax', amount: 2100, direction: 'out', category: 'tax', recurrence: 'once', dueOffset: 40, confirmed: false, note: 'Q3.' },
  { label: 'Phone, software & fuel', amount: 295, direction: 'out', category: 'bill', recurrence: 'monthly', dueOffset: 6, confirmed: true, note: null },
  { label: 'Biltmore Park office contract', amount: 960, direction: 'in', category: 'other', recurrence: 'monthly', dueOffset: 14, confirmed: true, note: 'Invoiced monthly, net 15.' },
];

const MESSAGE_TEMPLATES = [
  { title: 'On our way', body: 'Hi {name} — Chelsea’s Cleaning here. We’re on our way and should be with you in about 20 minutes.' },
  { title: 'Running late', body: 'Hi {name}, the job before yours ran long. We’re about 40 minutes behind — still coming today. Sorry for the shuffle.' },
  { title: 'All done', body: 'All finished at {address}. Locked up and set the alarm. Let us know if anything needs another pass — we’ll come back.' },
  { title: 'Quote follow-up', body: 'Hi {name}, just checking you got the quote we sent. Happy to adjust the scope if the number is off.' },
  { title: 'Reschedule', body: 'Hi {name} — we need to move your clean. Would {date} at the same time work, or would another day suit better?' },
  { title: 'Card on file expired', body: 'Hi {name}, the card on your plan was declined — it looks like it expired. Here’s a link to update it: {link}' },
];

const SAVED_PLACES = [
  { label: 'Costco — Asheville', address: '250 Tunnel Rd, Asheville, NC 28805', lat: 35.5985, lng: -82.5203, kind: 'supply', minutes: 25, uses: 34 },
  { label: 'Lowe’s — Airport Rd', address: '4 Airport Park Rd, Fletcher, NC 28732', lat: 35.4368, lng: -82.5288, kind: 'supply', minutes: 20, uses: 12 },
  { label: 'Ingles — Merrimon', address: '915 Merrimon Ave, Asheville, NC 28804', lat: 35.6224, lng: -82.5566, kind: 'supply', minutes: 15, uses: 21 },
  { label: 'Buncombe County transfer station', address: '85 Panther Branch Rd, Alexander, NC 28701', lat: 35.6902, lng: -82.6303, kind: 'dump', minutes: 30, uses: 4 },
];

const CAMPAIGNS = [
  { channel: 'email', audience: 'past_clients', subject: 'Spring deep-clean slots are open', body: 'The calendar for April and May just opened up. Deep cleans book out first — reply with a week that works and we’ll hold it.', recipients: 58, emailSent: 56, smsSent: 0, failed: 2, skipped: 0, beat: 'spring-cleaning', daysAgo: 128 },
  { channel: 'sms', audience: 'recurring_clients', subject: null, body: 'Chelsea’s Cleaning: we’re closed the week of July 4th. Your visit moves to the following week, same time. Reply STOP to opt out.', recipients: 12, emailSent: 0, smsSent: 12, failed: 0, skipped: 0, beat: null, daysAgo: 36 },
  { channel: 'both', audience: 'past_clients', subject: 'Back-to-school reset — $40 off a deep clean', body: 'School starts the 18th. Book a deep clean before then and take $40 off. Two slots left the week of the 11th.', recipients: 64, emailSent: 61, smsSent: 40, failed: 3, skipped: 12, beat: 'back-to-school', daysAgo: 9 },
  { channel: 'email', audience: 'leads_no_reply', subject: 'Still thinking it over?', body: 'You asked about a clean a few weeks back. The quote still stands if the timing is better now.', recipients: 23, emailSent: 22, smsSent: 0, failed: 1, skipped: 0, beat: null, daysAgo: 20 },
];

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

await loadEnv();
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('No DATABASE_URL in .env.local — this script talks to Postgres directly so it can use a transaction.');
  process.exit(1);
}

const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await db.connect();

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

try {
  const { rows: accountRows } = await db.query('select id, business_name from accounts where id = $1', [ACCOUNT]);
  if (accountRows.length === 0) {
    console.error(`No account ${ACCOUNT}.`);
    process.exit(1);
  }
  const { rows: siteRows } = await db.query('select company_name from sites where account_id = $1 limit 1', [ACCOUNT]);
  console.log(`Account: ${siteRows[0]?.company_name ?? accountRows[0].business_name} · ${ACCOUNT}`);

  if (UNDO) {
    await undo();
  } else {
    await seed();
  }
} finally {
  await db.end();
}

// ---------------------------------------------------------------------------

async function seed() {
  // Continue the account's own numbering rather than restarting it. Both use the
  // HIGHEST numeric ref, not the newest row — an imported invoice back-dates
  // created_at, and numbering from the newest row hands out a duplicate.
  const { rows: jobRefs } = await db.query(`select ref from jobs where account_id = $1`, [ACCOUNT]);
  const { rows: invRefs } = await db.query(`select ref from invoices where account_id = $1`, [ACCOUNT]);
  const highest = (rows, prefix) =>
    rows.reduce((max, row) => {
      const m = new RegExp(`^${prefix}-(\\d+)$`).exec(row.ref ?? '');
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
  const startJob = Math.max(highest(jobRefs, 'J'), 1000) + 1;
  const startInvoice = Math.max(highest(invRefs, 'INV'), 2000) + 1;

  const data = build(startJob, startInvoice);

  const revenue = data.payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const outstanding = data.payments.filter((p) => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const laborCost = data.costs.filter((c) => c.type === 'labor').reduce((s, c) => s + c.amount + c.burden, 0);
  const materialCost = data.costs.filter((c) => c.type === 'material').reduce((s, c) => s + c.amount, 0);

  console.log(`\nJob refs ${`J-${startJob}`} … ${`J-${startJob + data.jobs.length - 1}`}   Invoice refs INV-${startInvoice} …\n`);
  console.table([
    { table: 'services', rows: SERVICES.length },
    { table: 'crew', rows: CREW.length },
    { table: 'clients', rows: data.clients.length },
    { table: 'recurring_plans', rows: data.plans.length },
    { table: 'jobs', rows: data.jobs.length },
    { table: 'leads', rows: data.leads.length },
    { table: 'crew_assignments', rows: data.assignments.length },
    { table: 'job_tasks', rows: data.tasks.length },
    { table: 'costs', rows: data.costs.length },
    { table: 'invoices', rows: data.invoices.length },
    { table: 'invoice_items', rows: data.invoiceItems.length },
    { table: 'payments', rows: data.payments.length },
    { table: 'job_feed', rows: data.feed.length },
    { table: 'review_invites', rows: data.reviews.length },
    { table: 'campaigns', rows: CAMPAIGNS.length },
    { table: 'scheduled_payments', rows: SCHEDULED_PAYMENTS.length },
    { table: 'message_templates', rows: MESSAGE_TEMPLATES.length },
    { table: 'saved_places', rows: SAVED_PLACES.length },
  ]);

  const byStatus = (rows, key = 'status') =>
    rows.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] ?? 0) + 1 }), {});
  console.log('jobs by status  ', byStatus(data.jobs));
  console.log('leads by status ', byStatus(data.leads));
  console.log('leads by source ', byStatus(data.leads, 'source'));
  console.log(`\ncollected ${money(revenue)} · outstanding ${money(outstanding)} · labour+burden ${money(laborCost)} · materials ${money(materialCost)}`);
  console.log(`gross margin on collected work: ${(((revenue - laborCost - materialCost) / revenue) * 100).toFixed(1)}%`);

  if (!APPLY) {
    console.log('\nDry run. Nothing was written. Add --rehearse to prove the inserts, or --apply to keep them.');
    return;
  }

  console.log(REHEARSE ? '\nRehearsal — every insert runs, then rolls back.\n' : '\n*** APPLYING ***\n');

  const manifest = { account: ACCOUNT, seededAt: new Date().toISOString(), today: dateKey(TODAY), tables: {} };
  const remember = (table, ids) => {
    manifest.tables[table] = (manifest.tables[table] ?? []).concat(ids);
  };

  await db.query('begin');
  try {
    // -- services
    const serviceIds = [];
    for (const [i, s] of SERVICES.entries()) {
      const { rows } = await db.query(
        `insert into services (account_id, name, description, unit_price, unit_cost, unit, active, sort_order)
         values ($1,$2,$3,$4,$5,$6,true,$7) returning id`,
        [ACCOUNT, s.name, s.description, s.unit_price, s.unit_cost, s.unit, i]
      );
      serviceIds.push(rows[0].id);
    }
    remember('services', serviceIds);

    // -- crew
    const crewIds = [];
    for (const c of CREW) {
      const { rows } = await db.query(
        `insert into crew (account_id, name, phone, email, role_label, hourly_rate, pay_type, annual_salary, day_rate, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) returning id`,
        [ACCOUNT, c.name, c.phone, c.email, c.role_label, c.hourly_rate, c.pay_type, c.annual_salary, c.day_rate]
      );
      crewIds.push(rows[0].id);
    }
    remember('crew', crewIds);

    // -- clients
    const clientId = {};
    for (const c of data.clients) {
      const { rows } = await db.query(
        `insert into clients (account_id, name, phone, email, address, notes, test_marker) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [ACCOUNT, c.name, c.phone, c.email, c.address, c.notes, TEST_MARKER]
      );
      clientId[c.key] = rows[0].id;
    }
    remember('clients', Object.values(clientId));

    // -- recurring plans (before jobs: a visit points at its plan)
    const planId = {};
    for (const p of data.plans) {
      const nextRun = dateKey(dayOffset(toWorkday(p.active ? intBetween(1, p.step) : -intBetween(20, 60))));
      const { rows } = await db.query(
        `insert into recurring_plans
           (account_id, client_id, title, scope, client_name, client_phone, client_email, address,
            amount, frequency, next_run_date, active, auto_charge, card_brand, card_last4, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) returning id`,
        [ACCOUNT, clientId[p.clientKey], p.title, p.scope, p.client.name, p.client.phone, p.client.email,
          p.client.address, p.amount, p.frequency, nextRun, p.active, p.auto_charge, p.card_brand, p.card_last4, p.created_at]
      );
      planId[p.key] = rows[0].id;
    }
    remember('recurring_plans', Object.values(planId));

    // -- jobs
    const jobId = {};
    for (const j of data.jobs) {
      const { rows } = await db.query(
        `insert into jobs
           (account_id, ref, client_id, client_name, client_phone, client_email, address, scope, status,
            lead_source, scheduled_for, scheduled_time, estimated_hours, quoted_amount,
            recurring_plan_id, recurring_visit_date, lat, lng, created_at, test_marker)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id`,
        [ACCOUNT, j.ref, clientId[j.clientKey], j.client.name, j.client.phone, j.client.email, j.address,
          j.scope, j.status, j.lead_source, j.scheduled_for, j.scheduled_time, j.estimated_hours,
          j.quoted_amount, j.planKey ? planId[j.planKey] : null, j.recurring_visit_date, j.lat, j.lng, j.created_at,
          TEST_MARKER]
      );
      jobId[j.key] = rows[0].id;
    }
    remember('jobs', Object.values(jobId));

    // -- point each plan at its most recent visit
    for (const p of data.plans) {
      const last = [...data.jobs].reverse().find((j) => j.planKey === p.key && j.status === 'complete');
      if (!last) continue;
      await db.query(`update recurring_plans set last_job_id = $1, last_run_at = $2 where id = $3`, [jobId[last.key], last.completed_at, planId[p.key]]);
    }

    // -- crew assignments
    for (const a of data.assignments) {
      await db.query(
        `insert into crew_assignments (job_id, crew_id, account_id, assigned_at) values ($1,$2,$3,$4)
         on conflict do nothing`,
        [jobId[a.jobKey], crewIds[a.crewIndex], ACCOUNT, a.assigned_at]
      );
    }

    // -- job tasks
    const taskIds = [];
    for (const t of data.tasks) {
      const { rows } = await db.query(
        `insert into job_tasks (account_id, job_id, title, done, done_at, done_by, sort_order) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [ACCOUNT, jobId[t.jobKey], t.title, t.done, t.done_at, t.done_by, t.sort_order]
      );
      taskIds.push(rows[0].id);
    }
    remember('job_tasks', taskIds);

    // -- costs
    const costIds = [];
    for (const c of data.costs) {
      const crewRow = c.crew ? crewIds[CREW.indexOf(c.crew)] : null;
      const { rows } = await db.query(
        `insert into costs (account_id, job_id, type, category, description, amount, supplier,
            crew_id, crew_name, crew_role_label, hours, rate, burden_amount, cost_source, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [ACCOUNT, jobId[c.jobKey], c.type, c.category, c.description, c.amount, c.supplier,
          crewRow, c.crewName, c.crewRole, c.hours, c.rate, c.burden, c.source, c.created_at]
      );
      costIds.push(rows[0].id);
    }
    remember('costs', costIds);

    // -- invoices + items
    const invoiceId = {};
    for (const inv of data.invoices) {
      const { rows } = await db.query(
        `insert into invoices (account_id, job_id, ref, status, total, signed_at, signer_name, created_at, test_marker)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [ACCOUNT, jobId[inv.jobKey], inv.ref, inv.status, inv.total, inv.signed_at, inv.signer_name, inv.created_at, TEST_MARKER]
      );
      invoiceId[inv.key] = rows[0].id;
    }
    remember('invoices', Object.values(invoiceId));
    for (const item of data.invoiceItems) {
      await db.query(`insert into invoice_items (invoice_id, description, amount, sort_order) values ($1,$2,$3,$4)`,
        [invoiceId[item.invoiceKey], item.description, item.amount, item.sort_order]);
    }

    // -- payments. No Stripe ids and no platform fee: see the header.
    const paymentIds = [];
    for (const p of data.payments) {
      const { rows } = await db.query(
        `insert into payments (account_id, job_id, invoice_id, kind, label, amount, status, requested_at, paid_at, recurring_plan_id, test_marker)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [ACCOUNT, jobId[p.jobKey], p.invoiceKey ? invoiceId[p.invoiceKey] : null, p.kind, p.label,
          p.amount, p.status, p.requested_at, p.paid_at, p.planKey ? planId[p.planKey] : null, TEST_MARKER]
      );
      paymentIds.push(rows[0].id);
    }
    remember('payments', paymentIds);

    // -- job feed
    const feedIds = [];
    for (const f of data.feed) {
      const { rows } = await db.query(
        `insert into job_feed (account_id, job_id, kind, body, author, title, visibility, amount, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [ACCOUNT, jobId[f.jobKey], f.kind, f.body, f.author, f.title, f.visibility, f.amount, f.created_at]
      );
      feedIds.push(rows[0].id);
    }
    remember('job_feed', feedIds);

    // -- leads
    const leadIds = [];
    for (const l of data.leads) {
      const { rows } = await db.query(
        `insert into leads (account_id, client_id, source, status, name, phone, email, address, project_type,
            estimated_hours, message, source_page, converted_job, triage, lat, lng, created_at, updated_at, test_marker)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
        [ACCOUNT, l.clientKey ? clientId[l.clientKey] : null, l.source, l.status, l.name, l.phone, l.email,
          l.address, l.project_type, l.estimated_hours, l.message, l.source_page,
          l.convertedJobKey ? jobId[l.convertedJobKey] : null, JSON.stringify(l.triage), l.lat, l.lng,
          l.created_at, l.updated_at, TEST_MARKER]
      );
      leadIds.push(rows[0].id);
    }
    remember('leads', leadIds);

    // -- review invites
    const reviewIds = [];
    for (const r of data.reviews) {
      const { rows } = await db.query(
        `insert into review_invites (account_id, job_id, token, client_name, rating, feedback, routed_to, created_at, responded_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [ACCOUNT, jobId[r.jobKey], `seed-${Math.floor(rnd() * 1e12).toString(36)}-${reviewIds.length}`,
          r.clientName, r.rating, r.feedback, r.routed_to, r.created_at, r.responded_at]
      );
      reviewIds.push(rows[0].id);
    }
    remember('review_invites', reviewIds);

    // -- campaigns
    const campaignIds = [];
    for (const c of CAMPAIGNS) {
      const { rows } = await db.query(
        `insert into campaigns (account_id, channel, audience, subject, body, recipient_count, email_sent, sms_sent, failed_count, skipped_count, beat_id, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [ACCOUNT, c.channel, c.audience, c.subject, c.body, c.recipients, c.emailSent, c.smsSent, c.failed, c.skipped, c.beat, stamp(-c.daysAgo, 10)]
      );
      campaignIds.push(rows[0].id);
    }
    remember('campaigns', campaignIds);

    // -- scheduled payments
    const scheduledIds = [];
    for (const s of SCHEDULED_PAYMENTS) {
      const { rows } = await db.query(
        `insert into scheduled_payments (account_id, label, amount, direction, category, due_date, recurrence, confirmed, active, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) returning id`,
        [ACCOUNT, s.label, s.amount, s.direction, s.category, dateKey(dayOffset(s.dueOffset)), s.recurrence, s.confirmed, s.note]
      );
      scheduledIds.push(rows[0].id);
    }
    remember('scheduled_payments', scheduledIds);

    // -- message templates
    const templateIds = [];
    for (const [i, t] of MESSAGE_TEMPLATES.entries()) {
      const { rows } = await db.query(
        `insert into message_templates (account_id, title, body, sort_order) values ($1,$2,$3,$4) returning id`,
        [ACCOUNT, t.title, t.body, i]
      );
      templateIds.push(rows[0].id);
    }
    remember('message_templates', templateIds);

    // -- saved places
    const placeIds = [];
    for (const p of SAVED_PLACES) {
      const { rows } = await db.query(
        `insert into saved_places (account_id, label, address, lat, lng, kind, default_minutes, use_count, last_used_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict do nothing returning id`,
        [ACCOUNT, p.label, p.address, p.lat, p.lng, p.kind, p.minutes, p.uses, stamp(-intBetween(2, 20), 8)]
      );
      if (rows[0]) placeIds.push(rows[0].id);
    }
    remember('saved_places', placeIds);

    // -- the two cash numbers the forecast cannot derive
    const { rows: cashBefore } = await db.query(
      `select cash_balance, cash_balance_at, cash_buffer from accounts where id = $1`, [ACCOUNT]);
    manifest.accountBefore = cashBefore[0];
    await db.query(
      `update accounts set cash_balance = $2, cash_balance_at = $3, cash_buffer = $4 where id = $1`,
      [ACCOUNT, 14280.55, stamp(-1, 8), 6000]
    );

    if (REHEARSE) {
      await db.query('rollback');
      console.log('Rehearsal complete — every insert ran and was rolled back. Nothing kept.');
    } else {
      await db.query('commit');
      await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`Committed. Manifest: ${fileURLToPath(MANIFEST)}`);
      console.log('Undo with:  node scripts/seed-showcase.mjs --account ' + ACCOUNT + ' --undo');
    }
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

// ---------------------------------------------------------------------------

async function undo() {
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    manifest = null;
  }

  if (!manifest && !DERIVE) {
    console.error(`No manifest at ${fileURLToPath(MANIFEST)}. Re-run with --derive to remove by the @example.com rule instead.`);
    process.exit(1);
  }

  // Order matters: jobs cascade their own costs, tasks, feed, invoices and
  // payments, so they go before clients (whose FK is SET NULL and would leave
  // orphans, not errors) and before crew (whose costs FK is SET NULL, which
  // would quietly strip the payee off a labour cost).
  const ORDER = ['leads', 'review_invites', 'payments', 'invoices', 'costs', 'job_feed', 'job_tasks', 'jobs',
    'recurring_plans', 'clients', 'crew', 'services', 'campaigns', 'scheduled_payments', 'message_templates', 'saved_places'];

  await db.query('begin');
  try {
    let total = 0;
    if (manifest) {
      for (const table of ORDER) {
        const ids = manifest.tables[table];
        if (!ids?.length) continue;
        const { rowCount } = await db.query(`delete from "${table}" where account_id = $1 and id = any($2::uuid[])`, [ACCOUNT, ids]);
        total += rowCount;
        console.log(`  ${table.padEnd(20)} ${rowCount}`);
      }
      if (manifest.accountBefore) {
        await db.query(`update accounts set cash_balance = $2, cash_balance_at = $3, cash_buffer = $4 where id = $1`,
          [ACCOUNT, manifest.accountBefore.cash_balance, manifest.accountBefore.cash_balance_at, manifest.accountBefore.cash_buffer]);
        console.log('  accounts             cash figures restored');
      }
    } else {
      const derived = `(select id from clients where account_id = $1 and email like '%@example.com')`;
      const steps = [
        [`delete from jobs where account_id = $1 and client_id in ${derived}`, 'jobs'],
        [`delete from leads where account_id = $1 and client_id in ${derived}`, 'leads'],
        [`delete from recurring_plans where account_id = $1 and client_id in ${derived}`, 'recurring_plans'],
        [`delete from clients where account_id = $1 and email like '%@example.com'`, 'clients'],
        [`delete from crew where account_id = $1 and email like '%@example.com'`, 'crew'],
      ];
      for (const [sql, label] of steps) {
        const { rowCount } = await db.query(sql, [ACCOUNT]);
        total += rowCount;
        console.log(`  ${label.padEnd(20)} ${rowCount}`);
      }
      console.log('  (derived mode leaves services, campaigns, templates and places — they carry no client link)');
    }
    await db.query('commit');
    console.log(`\nRemoved ${total} rows.`);
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
