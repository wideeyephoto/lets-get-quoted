import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

// Reset all jobs on Chelsea's Cleaning Service and seed demo customers with realistic
// addresses in Nashville, TN and cleaning services across all 9 workflow stages.
//
// TARGET ACCOUNT: Chelsea's Cleaning Service (subdomain: 'chelsea-cleans', account: '831ab32c-84b7-4b7a-8249-2a2221789fbb')
//
// Usage:
//   node scripts/seed-chelsea.mjs               (Plan / dry-run summary only)
//   node scripts/seed-chelsea.mjs --rehearse   (Runs full teardown + insert inside transaction, then rolls back)
//   node scripts/seed-chelsea.mjs --apply      (Applies and commits all changes)

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

const COUNT = Number(arg('count') ?? 200);
const SEED = String(arg('seed') ?? 'chelsea-cleans-nashville');
const REHEARSE = process.argv.includes('--rehearse');
const APPLY = process.argv.includes('--apply');
const TARGET_ACCOUNT_ID = '831ab32c-84b7-4b7a-8249-2a2221789fbb';

// --- Deterministic Randomness ------------------------------------------------
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

// --- Names -------------------------------------------------------------------
const FIRST = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'William',
  'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia', 'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander',
  'Abigail', 'Michael', 'Emily', 'Daniel', 'Elizabeth', 'Matthew', 'Mila', 'Aiden', 'Ella', 'Jackson',
  'Avery', 'David', 'Sofia', 'Joseph', 'Camila', 'Samuel', 'Aria', 'Sebastian', 'Scarlett', 'Carter',
  'Victoria', 'Wyatt', 'Madison', 'Jayden', 'Luna', 'John', 'Grace', 'Owen', 'Chloe', 'Dylan'
];

const LAST = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
];

// --- Geographic Pool: Nashville, TN & Surrounding Metro -----------------------
const CITIES = [
  { city: 'Nashville', state: 'TN', zips: ['37203', '37206', '37212', '37215', '37209', '37216', '37211'], lat: 36.1627, lng: -86.7816, weight: 12 },
  { city: 'Brentwood', state: 'TN', zips: ['37027'], lat: 36.0331, lng: -86.7828, weight: 4 },
  { city: 'Franklin', state: 'TN', zips: ['37064', '37067'], lat: 35.9251, lng: -86.8689, weight: 4 },
  { city: 'Hermitage', state: 'TN', zips: ['37076'], lat: 36.1778, lng: -86.6197, weight: 3 },
  { city: 'Mt. Juliet', state: 'TN', zips: ['37122'], lat: 36.2001, lng: -86.5186, weight: 3 },
  { city: 'Murfreesboro', state: 'TN', zips: ['37128', '37129'], lat: 35.8456, lng: -86.3903, weight: 3 },
  { city: 'Hendersonville', state: 'TN', zips: ['37075'], lat: 36.3048, lng: -86.6200, weight: 2 },
];
const CITY_POOL = CITIES.flatMap((entry) => Array.from({ length: entry.weight }, () => entry));

const STREETS = [
  'West End Ave', '12th Ave S', '21st Ave S', 'Belmont Blvd', 'Woodmont Blvd',
  'Franklin Pike', 'Hillsboro Pike', 'Charlotte Ave', 'Riverside Dr', 'Porter Rd',
  'Main St', 'Maryland Way', 'Concord Rd', 'Old Hickory Blvd', 'Lebanon Pike',
  'Murfreesboro Pike', 'Granny White Pike', 'Ensworth Ave', 'Music Row', 'Division St',
  'Fatherland St', 'Shelby Ave', 'Gallatin Pike', 'White Bridge Rd', 'Blakemore Ave',
  'Church St', 'McFerrin Ave', 'Green Hills Way', 'Mallory Ln', 'Carothers Pkwy'
];

// --- Cleaning Services & Scopes for Chelsea's Cleaning Service -----------------
const SERVICES = [
  {
    name: 'Residential Deep Clean',
    scope: 'Comprehensive top-to-bottom deep clean of 4-bedroom home: detailed baseboards, crown molding, interior windows, cabinet exteriors, deep kitchen degrease, and sanitized bathrooms.',
    itemLabel: 'Whole-home deep clean & sanitization package',
    min: 280,
    max: 650,
    hours: [4, 8]
  },
  {
    name: 'Recurring Home Maintenance Clean',
    scope: 'Bi-weekly recurring house cleaning: dusting all surfaces, vacuuming carpets, mopping hardwoods, full kitchen wipe-down, sanitizing all bathrooms, and emptying trash.',
    itemLabel: 'Bi-weekly residential maintenance cleaning',
    min: 140,
    max: 290,
    hours: [2, 4]
  },
  {
    name: 'Move-In / Move-Out Turnover Clean',
    scope: 'Full vacant home turnover service: interior of all kitchen cabinets & drawers, inside oven and refrigerator, closet shelving, light fixtures, and floor scrubbing.',
    itemLabel: 'Move-in / move-out full vacancy deep detail clean',
    min: 320,
    max: 750,
    hours: [5, 9]
  },
  {
    name: 'Commercial Office & Studio Cleaning',
    scope: 'After-hours commercial office clean: conference rooms, 20 workstations, lobby glass doors, employee kitchen/breakroom sanitization, and restroom restocking.',
    itemLabel: 'Commercial office & professional workspace clean',
    min: 220,
    max: 850,
    hours: [3, 6]
  },
  {
    name: 'Airbnb / Short-Term Rental Turnover',
    scope: 'Fast turnaround rental cleaning: complete bed linen laundering and restaging, towel turnover, restock guest toiletries, kitchen reset, and damage check inspection.',
    itemLabel: 'Airbnb turnover, linen service & guest restaging',
    min: 150,
    max: 340,
    hours: [2, 4]
  },
  {
    name: 'Post-Construction Detail Cleaning',
    scope: 'Post-renovation fine drywall dust removal: vacuum all HVAC vents, wipe down walls, polish window tracks and fixtures, vacuum carpets with HEPA filtration.',
    itemLabel: 'Post-construction fine dust & residue removal',
    min: 450,
    max: 1350,
    hours: [6, 14]
  },
  {
    name: 'Kitchen Appliance Deep Clean Package',
    scope: 'Detailed appliance renewal: non-toxic deep soak and scrub of oven interior, racks, range hood degreasing, refrigerator shelving removal and wipe-down.',
    itemLabel: 'Deep kitchen appliance detailing (oven, fridge, hood)',
    min: 160,
    max: 360,
    hours: [2, 4]
  },
  {
    name: 'Carpet & Upholstery Hot Water Extraction',
    scope: 'Deep steam extraction cleaning of 3 bedrooms, hallway, and living room sectional sofa with pet stain enzyme pre-treatment and deodorizer.',
    itemLabel: 'Hot water steam carpet & upholstery extraction',
    min: 220,
    max: 580,
    hours: [3, 6]
  },
  {
    name: 'Interior & Exterior Window Washing',
    scope: 'Streak-free cleaning of all interior and exterior glass panes, sills, tracks, and screen wash for 2-story residence.',
    itemLabel: 'Complete interior/exterior window & screen wash',
    min: 180,
    max: 440,
    hours: [2, 5]
  },
  {
    name: 'Eco-Friendly Green Housekeeping',
    scope: '100% plant-based organic cleaning products throughout: allergen-reducing microfiber dusting, essential oil aromatherapy finish, child/pet-safe sanitizing.',
    itemLabel: 'Eco-friendly organic home cleaning & aromatherapy',
    min: 175,
    max: 380,
    hours: [3, 5]
  }
];

const LEAD_SOURCES = ['website_form', 'website_form', 'website_form', 'referral', 'missed_call', 'manual', 'ai_voice'];

const MESSAGES = [
  'Looking for a deep clean before hosting family for the weekend. 3 bed, 2.5 bath in East Nashville.',
  'Need bi-weekly recurring cleaning for our home in Brentwood. 4 bedrooms and hardwood floors throughout.',
  'Moving out of our rental in the Gulch this Friday. Need a full turnover clean to get our security deposit back.',
  'Looking for commercial cleaning twice a week for our creative design studio in Wedgewood-Houston.',
  'We manage 3 Airbnb properties in 12 South and need a reliable turnover cleaner for fast turnaround days.',
  'Just finished a kitchen remodel and there is fine drywall dust everywhere. Need a post-construction clean.',
  'Would love a quote for regular monthly cleaning, plus adding on the oven and fridge deep clean for the first visit.',
  'Our sectional sofa and living room rug need deep steam cleaning to remove pet odors before an event.',
  'Need all interior and exterior windows cleaned on our 2-story home in Franklin.',
  'Looking for an eco-friendly cleaning service that uses non-toxic products safe for our newborn and golden retriever.'
];

// --- 9 Workflow Stages --------------------------------------------------------
const STAGES = [
  { key: 'needs_response', label: 'Needs response', share: 0.12 },
  { key: 'contacted', label: 'Contacted', share: 0.10 },
  { key: 'quote_sent', label: 'Quote sent — awaiting approval', share: 0.14 },
  { key: 'approved', label: 'Approved — needs scheduling', share: 0.09 },
  { key: 'scheduled', label: 'Scheduled', share: 0.12 },
  { key: 'in_progress', label: 'Work in progress', share: 0.08 },
  { key: 'ready_to_invoice', label: 'Ready to invoice', share: 0.07 },
  { key: 'invoice_sent', label: 'Invoice sent — awaiting payment', share: 0.10 },
  { key: 'complete', label: 'Complete', share: 0.18 },
];

function allocate(total) {
  const counts = STAGES.map((stage) => ({ ...stage, count: Math.floor(total * stage.share) }));
  let assigned = counts.reduce((sum, stage) => sum + stage.count, 0);
  let index = counts.length - 1;
  while (assigned < total) {
    counts[index].count += 1;
    assigned += 1;
    index = index === 0 ? counts.length - 1 : index - 1;
  }
  return counts;
}

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

const AGE_DAYS = {
  needs_response: [0, 3],
  contacted: [2, 10],
  quote_sent: [3, 18],
  approved: [5, 25],
  scheduled: [8, 35],
  in_progress: [12, 45],
  ready_to_invoice: [8, 50],
  invoice_sent: [6, 65],
  complete: [5, 120],
};

function buildPerson(index) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const place = pick(CITY_POOL);
  const zip = pick(place.zips);
  const address = `${intBetween(100, 9899)} ${pick(STREETS)}, ${place.city}, ${place.state} ${zip}`;
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}${index}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@example.com',
    phone: `(615) 555-${String(100 + (index % 900)).padStart(4, '0')}`,
    address,
    lat: Number((place.lat + between(-0.015, 0.015)).toFixed(6)),
    lng: Number((place.lng + between(-0.018, 0.018)).toFixed(6)),
  };
}

function buildRecord(stage, index) {
  const person = buildPerson(index);
  const service = pick(SERVICES);
  const [minAge, maxAge] = AGE_DAYS[stage.key];
  const ageDays = between(minAge, maxAge);
  const createdAt = iso(ageDays * DAY);
  const amount = round(between(service.min, service.max), 10);
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

  if (stage.key === 'needs_response' || stage.key === 'contacted') return record;

  const jobCreatedAt = iso(Math.max(0, ageDays - between(0.5, 2.5)) * DAY);
  const job = {
    createdAt: jobCreatedAt,
    status: stage.key === 'quote_sent' ? 'new_lead' : stage.key === 'complete' ? 'complete' : 'in_progress',
    quotedAmount: amount,
    scheduledFor: null,
    scheduledTime: null,
    startedAt: null,
    quoteSignedAt: null,
    quoteSignerName: null,
    quoteSignatureMethod: null,
  };

  const workdayTime = () => `${String(intBetween(8, 14)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}:00`;

  if (stage.key === 'approved') {
    job.quoteSignedAt = iso(Math.max(0.2, ageDays - between(1, 3)) * DAY);
    job.quoteSignerName = person.name;
    job.quoteSignatureMethod = 'typed';
  } else if (stage.key === 'scheduled') {
    job.scheduledFor = dateKey(intBetween(1, 21) * DAY);
    job.scheduledTime = workdayTime();
    job.quoteSignedAt = iso(Math.max(0.5, ageDays - between(1, 4)) * DAY);
    job.quoteSignerName = person.name;
    job.quoteSignatureMethod = 'typed';
  } else if (stage.key === 'in_progress') {
    const startedDaysAgo = intBetween(0, 2);
    job.scheduledFor = dateKey(-startedDaysAgo * DAY);
    job.scheduledTime = workdayTime();
    job.startedAt = iso(startedDaysAgo * DAY + between(1, 4) * 60 * 60 * 1000);
    job.quoteSignedAt = iso((startedDaysAgo + 2) * DAY);
    job.quoteSignerName = person.name;
    job.quoteSignatureMethod = 'typed';
  } else if (stage.key === 'ready_to_invoice' || stage.key === 'invoice_sent' || stage.key === 'complete') {
    const doneDaysAgo = intBetween(2, Math.max(3, Math.floor(ageDays - 2)));
    job.scheduledFor = dateKey(-doneDaysAgo * DAY);
    job.scheduledTime = workdayTime();
    job.startedAt = iso(doneDaysAgo * DAY);
    job.quoteSignedAt = iso((doneDaysAgo + 2) * DAY);
    job.quoteSignerName = person.name;
    job.quoteSignatureMethod = 'typed';
  }

  record.job = job;

  record.link = {
    createdAt: jobCreatedAt,
    lastViewedAt: rand() < 0.75 ? iso(Math.max(0, ageDays - between(0.2, 2)) * DAY) : null,
  };

  if (stage.key === 'invoice_sent' || stage.key === 'complete') {
    const invoicedDaysAgo = Math.max(1, ageDays - between(1, 6));
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
      label: 'Cleaning service payment',
      amount,
      status: stage.key === 'complete' ? 'paid' : 'requested',
      requestedAt: iso(invoicedDaysAgo * DAY),
      paidAt: stage.key === 'complete' ? iso(Math.max(0.5, invoicedDaysAgo - between(0.5, 4)) * DAY) : null,
      feeRate,
      platformFee: stage.key === 'complete' ? Number((amount * feeRate).toFixed(2)) : null,
    };
  }

  // ~25% of completed customers have a prior completed cleaning visit
  if (stage.key === 'complete' && rand() < 0.25) {
    const priorService = pick(SERVICES);
    const priorDaysAgo = ageDays + between(30, 180);
    const priorAmount = round(between(priorService.min, priorService.max), 10);
    record.priorJob = {
      service: priorService,
      amount: priorAmount,
      createdAt: iso(priorDaysAgo * DAY),
      scheduledFor: dateKey(-(priorDaysAgo - 2) * DAY),
      startedAt: iso((priorDaysAgo - 2) * DAY),
      invoiceCreatedAt: iso((priorDaysAgo - 3) * DAY),
      paidAt: iso((priorDaysAgo - 4) * DAY),
    };
  }

  return record;
}

// --- Bulk Insert Helper -------------------------------------------------------
async function bulkInsert(client, table, columns, rows) {
  if (!rows.length) return;
  const CHUNK_SIZE = 50;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders = [];
    const flatParams = [];
    let paramIdx = 1;

    for (const row of chunk) {
      const placeholders = [];
      for (const val of row) {
        placeholders.push(`$${paramIdx++}`);
        flatParams.push(val);
      }
      valuePlaceholders.push(`(${placeholders.join(', ')})`);
    }

    const query = `insert into ${table} (${columns.join(', ')}) values ${valuePlaceholders.join(', ')}`;
    await client.query(query, flatParams);
  }
}

// --- Main Execution -----------------------------------------------------------
async function main() {
  await loadEnv();
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('No DATABASE_URL found in .env.local.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const money = (value) => `$${(Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  try {
    const { rows: accountRows } = await client.query(
      `select a.id, a.business_name, s.company_name, s.subdomain
         from accounts a left join sites s on s.account_id = a.id where a.id = $1`,
      [TARGET_ACCOUNT_ID]
    );

    if (accountRows.length === 0) {
      console.error(`Target account ${TARGET_ACCOUNT_ID} not found.`);
      process.exit(1);
    }

    const account = accountRows[0];
    console.log(`\nTarget Account: ${account.business_name} (${account.company_name}) · Subdomain: ${account.subdomain}`);
    console.log(`Account ID:     ${account.id}`);

    const allocation = allocate(COUNT);
    const records = [];
    let index = 0;
    for (const stage of allocation) {
      for (let n = 0; n < stage.count; n += 1) {
        records.push(buildRecord(stage, index));
        index += 1;
      }
    }

    let jobCount = 0;
    let pipelineValue = 0;
    let collected = 0;
    let outstanding = 0;

    console.log(`\nStage Breakdown for ${records.length} Customers:\n`);
    for (const stage of allocation) {
      const inStage = records.filter((r) => r.stage === stage.key);
      const val = inStage.reduce((sum, r) => sum + (r.job ? r.amount : 0), 0);
      console.log(`  ${String(inStage.length).padStart(3)}  ${stage.label.padEnd(34)} ${val ? money(val) : '—'}`);
    }

    for (const record of records) {
      if (record.job) { jobCount += 1; pipelineValue += record.amount; }
      if (record.priorJob) { jobCount += 1; collected += record.priorJob.amount; }
      if (record.payment?.status === 'paid') collected += record.amount;
      if (record.payment?.status === 'requested') outstanding += record.amount;
    }

    console.log(`\nTotals: ${jobCount} jobs · Quoted: ${money(pipelineValue)} · Collected: ${money(collected)} · Outstanding: ${money(outstanding)}`);

    if (!APPLY && !REHEARSE) {
      console.log('\n[PLAN ONLY] Run with --rehearse to test in a rolled-back transaction, or --apply to commit.');
      process.exit(0);
    }

    console.log(REHEARSE ? '\n*** REHEARSING (Will Roll Back) ***\n' : '\n*** APPLYING CHANGES ***\n');
    await client.query('begin');

    // 1. Teardown existing data for Chelsea's account
    console.log('Teardown existing Chelsea records...');
    await client.query(`delete from client_job_access where account_id = $1`, [account.id]);
    await client.query(`delete from payments where account_id = $1`, [account.id]);
    await client.query(`delete from invoices where account_id = $1`, [account.id]);
    await client.query(`delete from job_tasks where account_id = $1`, [account.id]);
    await client.query(`delete from job_feed where account_id = $1`, [account.id]);
    await client.query(`delete from time_entries where account_id = $1`, [account.id]);
    await client.query(`delete from costs where account_id = $1`, [account.id]);
    await client.query(`delete from job_tracking where account_id = $1`, [account.id]);
    await client.query(`delete from review_invites where account_id = $1`, [account.id]);
    await client.query(`delete from jobs where account_id = $1`, [account.id]);
    await client.query(`delete from leads where account_id = $1`, [account.id]);
    await client.query(`delete from clients where account_id = $1`, [account.id]);
    console.log('✓ Teardown complete.');

    // 2. Prepare bulk rows (with test_marker = null for immediate visibility)
    const clientRows = [];
    const jobRows = [];
    const linkRows = [];
    const invoiceRows = [];
    const paymentRows = [];
    const leadRows = [];

    let jobSeq = 1001;
    let invoiceSeq = 1001;

    for (const record of records) {
      const { person } = record;
      const clientId = randomUUID();

      clientRows.push([
        clientId, account.id, person.name, person.phone, person.email, person.address, record.createdAt, record.createdAt, null
      ]);

      let mainJobId = null;

      // Repeat customer prior job
      if (record.priorJob) {
        const priorJobId = randomUUID();
        const priorInvoiceId = randomUUID();
        const ref = `J-CLEAN-${jobSeq++}`;
        const priorQuoteItems = JSON.stringify([
          {
            id: `seed-item-${jobSeq}`,
            kind: 'base',
            label: record.priorJob.service.itemLabel,
            amount: record.priorJob.amount,
            selected: true,
            recommended: false
          }
        ]);

        jobRows.push([
          priorJobId, account.id, ref, clientId, person.name, person.phone, person.email, person.address,
          record.priorJob.service.scope, 'complete', 'referral', record.priorJob.amount, record.priorJob.service.hours[0],
          record.priorJob.scheduledFor, null, record.priorJob.startedAt,
          priorQuoteItems, person.name, record.priorJob.startedAt, 'typed',
          person.lat, person.lng, record.priorJob.createdAt, record.priorJob.createdAt, null
        ]);

        const priorInvoiceRef = `INV-CLEAN-${invoiceSeq++}`;
        invoiceRows.push([
          priorInvoiceId, account.id, priorJobId, priorInvoiceRef, 'paid', record.priorJob.amount,
          record.priorJob.invoiceCreatedAt, person.name, record.priorJob.invoiceCreatedAt, null
        ]);

        paymentRows.push([
          account.id, priorJobId, priorInvoiceId, 'final', 'Cleaning service payment', record.priorJob.amount,
          'paid', record.priorJob.invoiceCreatedAt, record.priorJob.paidAt,
          Number((record.priorJob.amount * 0.02).toFixed(2)), 0.02, null
        ]);
      }

      // Main job
      if (record.job) {
        mainJobId = randomUUID();
        const ref = `J-CLEAN-${jobSeq++}`;
        const quoteItems = JSON.stringify([
          {
            id: `seed-item-${jobSeq}`,
            kind: 'base',
            label: record.service.itemLabel,
            amount: record.job.quotedAmount,
            selected: true,
            recommended: false
          }
        ]);

        jobRows.push([
          mainJobId, account.id, ref, clientId, person.name, person.phone, person.email, person.address,
          record.service.scope, record.job.status, record.leadSource, record.job.quotedAmount, record.hours,
          record.job.scheduledFor, record.job.scheduledTime, record.job.startedAt,
          quoteItems, record.job.quoteSignerName, record.job.quoteSignedAt, record.job.quoteSignatureMethod,
          person.lat, person.lng, record.job.createdAt, record.job.createdAt, null
        ]);

        linkRows.push([
          account.id, mainJobId, randomBytes(32).toString('hex'),
          person.email, person.phone, record.link.lastViewedAt, record.link.createdAt
        ]);

        if (record.invoice) {
          const invoiceId = randomUUID();
          const invoiceRef = `INV-CLEAN-${invoiceSeq++}`;

          invoiceRows.push([
            invoiceId, account.id, mainJobId, invoiceRef, record.invoice.status, record.invoice.total,
            record.invoice.signedAt, record.invoice.signerName, record.invoice.createdAt, null
          ]);

          paymentRows.push([
            account.id, mainJobId, invoiceId, record.payment.kind, record.payment.label,
            record.payment.amount, record.payment.status, record.payment.requestedAt,
            record.payment.paidAt, record.payment.platformFee, record.payment.feeRate, null
          ]);
        }
      }

      const city = person.address.split(',')[1]?.trim() || 'Nashville';
      const contactLog = [];
      if (record.leadStatus === 'contacted' || record.leadStatus === 'quoted' || record.leadStatus === 'won') {
        contactLog.push({
          at: new Date(new Date(record.createdAt).getTime() + 20 * 60 * 1000).toISOString(),
          label: record.leadSource === 'ai_voice' ? 'AI Voice Inquiry Handled' : 'Initial Phone Outreach',
          note: 'Confirmed residence size, frequency preference, and entry access instructions.'
        });
      }
      if (record.leadStatus === 'quoted' || record.leadStatus === 'won') {
        contactLog.push({
          at: new Date(new Date(record.createdAt).getTime() + 45 * 60 * 1000).toISOString(),
          label: 'Cleaning Quote Link Delivered',
          note: 'Customer viewed estimate in portal.'
        });
      }

      const triage = {
        score: record.leadStatus === 'won' ? 'hot' : (record.stage === 'needs_response' ? (rand() < 0.6 ? 'hot' : 'warm') : 'warm'),
        flags: rand() < 0.4 ? ['phone_verified'] : [],
        timeline: pick(['This week', 'ASAP', 'Within 48 hours', 'Next week', 'Flexible']),
        location: `${city}, TN`,
        estimate: { min: record.service.min, max: record.service.max },
        contactPreference: rand() < 0.25 ? 'text_only' : 'any',
        messageChannel: 'auto',
        contactLog: contactLog.length > 0 ? contactLog : undefined
      };

      leadRows.push([
        account.id, clientId, record.leadSource, person.name, person.phone, person.email,
        person.address, record.message, record.service.name, record.leadStatus, mainJobId,
        person.lat, person.lng, record.createdAt, record.createdAt, record.createdAt, null, JSON.stringify(triage)
      ]);
    }

    console.log('Inserting batch records for Chelsea...');

    await bulkInsert(client, 'clients', [
      'id', 'account_id', 'name', 'phone', 'email', 'address', 'created_at', 'updated_at', 'test_marker'
    ], clientRows);

    await bulkInsert(client, 'jobs', [
      'id', 'account_id', 'ref', 'client_id', 'client_name', 'client_phone', 'client_email', 'address',
      'scope', 'status', 'lead_source', 'quoted_amount', 'estimated_hours',
      'scheduled_for', 'scheduled_time', 'started_at',
      'quote_items', 'quote_signer_name', 'quote_signed_at', 'quote_signature_method',
      'lat', 'lng', 'geocoded_at', 'created_at', 'test_marker'
    ], jobRows);

    await bulkInsert(client, 'client_job_access', [
      'account_id', 'job_id', 'token_hash', 'client_email', 'client_phone', 'last_viewed_at', 'created_at'
    ], linkRows);

    await bulkInsert(client, 'invoices', [
      'id', 'account_id', 'job_id', 'ref', 'status', 'total', 'signed_at', 'signer_name', 'created_at', 'test_marker'
    ], invoiceRows);

    await bulkInsert(client, 'payments', [
      'account_id', 'job_id', 'invoice_id', 'kind', 'label', 'amount', 'status', 'requested_at', 'paid_at', 'platform_fee', 'fee_rate', 'test_marker'
    ], paymentRows);

    await bulkInsert(client, 'leads', [
      'account_id', 'client_id', 'source', 'name', 'phone', 'email',
      'address', 'message', 'project_type', 'status', 'converted_job',
      'lat', 'lng', 'geocoded_at', 'created_at', 'updated_at', 'test_marker', 'triage'
    ], leadRows);

    if (REHEARSE) {
      await client.query('rollback');
      console.log(`\nRehearsal succeeded. Inserted ${clientRows.length} clients, ${jobRows.length} jobs, ${leadRows.length} leads.`);
      console.log('Transaction safely rolled back.');
    } else {
      await client.query('commit');
      console.log('\n✓ Successfully committed to database for Chelsea:');
      console.log(`  Clients:   ${clientRows.length}`);
      console.log(`  Jobs:      ${jobRows.length}`);
      console.log(`  Links:     ${linkRows.length}`);
      console.log(`  Invoices:  ${invoiceRows.length}`);
      console.log(`  Payments:  ${paymentRows.length}`);
      console.log(`  Leads:     ${leadRows.length}`);
    }
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error('\nFailed — rolled back, nothing was written.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(console.error);
