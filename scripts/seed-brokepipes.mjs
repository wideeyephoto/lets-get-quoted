import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

// Reset all jobs on BrokePipes and seed 300 demo customers with realistic
// addresses in Royal Oak, Michigan and plumbing services across all 9 workflow stages.
//
// TARGET ACCOUNT: BrokePipes (subdomain: 'brokepipes', account: 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6')
//
// Usage:
//   node scripts/seed-brokepipes.mjs               (Plan / dry-run summary only)
//   node scripts/seed-brokepipes.mjs --rehearse   (Runs full teardown + insert inside transaction, then rolls back)
//   node scripts/seed-brokepipes.mjs --apply      (Applies and commits all changes)

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

const COUNT = Number(arg('count') ?? 300);
const SEED = String(arg('seed') ?? 'brokepipes-royal-oak');
const REHEARSE = process.argv.includes('--rehearse');
const APPLY = process.argv.includes('--apply');
const TEST_MARKER = 'seed-customers';
const TARGET_ACCOUNT_ID = 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6';

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
  'Marcus', 'Danielle', 'Terrence', 'Priya', 'Colton', 'Yesenia', 'Nathan', 'Imani', 'Garrett', 'Rosa',
  'Devon', 'Kaitlyn', 'Ibrahim', 'Shannon', 'Luis', 'Meredith', 'Tyrell', 'Anneke', 'Brandon', 'Xiomara',
  'Wesley', 'Lorna', 'Andre', 'Bridget', 'Hector', 'Simone', 'Curtis', 'Naomi', 'Rafael', 'Delia',
  'Grant', 'Tanisha', 'Oscar', 'Bethany', 'Malik', 'Josefina', 'Clay', 'Renata', 'Preston', 'Ayanna',
  'Dominic', 'Marguerite', 'Elias', 'Sondra', 'Trevor', 'Camille', 'Roland', 'Elise', 'Jamal', 'Vera',
  'Zachary', 'Brooke', 'Mitchell', 'Carmen', 'Julian', 'Kendra', 'Derrick', 'Alana', 'Russell', 'Kira',
  'Lance', 'Gretchen', 'Trevin', 'Sloane', 'Victor', 'Nadia', 'Bryce', 'Selena', 'Corbin', 'Jenna',
];

const LAST = [
  'Whitfield', 'Okonkwo', 'Delgado', 'Brennan', 'Ferraro', 'Nakamura', 'Voss', 'Ellington', 'Rios', 'Bianchi',
  'Kowalski', 'Adeyemi', 'Sandoval', 'Kirkpatrick', 'Petrov', 'Ashworth', 'Guerrero', 'Lindqvist', 'Mbeki', 'Calloway',
  'Rosales', 'Thorne', 'Nguyen', 'Amherst', 'Salinas', 'Beaumont', 'Iverson', 'Duarte', 'Fairbanks', 'Osei',
  'Quintero', 'Hallowell', 'Marchetti', 'Bowers', 'Estrada', 'Vandergriff', 'Cortez', 'Winslow', 'Abara', 'Prescott',
  'Novak', 'Chambers', 'Gallagher', 'Mercer', 'Kearney', 'Davenport', 'MacDonald', 'Sinclair', 'Carlson', 'Villanueva',
  'Stafford', 'Castillo', 'Monroe', 'Holbrook', 'Vance', 'Livingston', 'Fletcher', 'Bradford', 'Kaufman', 'Serrano',
];

// --- Geographic Pool: Royal Oak, Michigan & Oakland County --------------------
const CITIES = [
  { city: 'Royal Oak', state: 'MI', zips: ['48067', '48073'], lat: 42.4895, lng: -83.1446, weight: 14 },
  { city: 'Berkley', state: 'MI', zips: ['48072'], lat: 42.5034, lng: -83.1835, weight: 3 },
  { city: 'Ferndale', state: 'MI', zips: ['48220'], lat: 42.4606, lng: -83.1346, weight: 3 },
  { city: 'Birmingham', state: 'MI', zips: ['48009'], lat: 42.5467, lng: -83.2113, weight: 2 },
  { city: 'Clawson', state: 'MI', zips: ['48017'], lat: 42.5334, lng: -83.1463, weight: 2 },
  { city: 'Huntington Woods', state: 'MI', zips: ['48070'], lat: 42.4831, lng: -83.1702, weight: 1 },
  { city: 'Troy', state: 'MI', zips: ['48084'], lat: 42.5803, lng: -83.1499, weight: 2 },
];
const CITY_POOL = CITIES.flatMap((entry) => Array.from({ length: entry.weight }, () => entry));

const STREETS = [
  'S Washington Ave', 'N Main St', 'S Center St', 'N Lafayette Ave', 'Crooks Rd',
  'Woodward Ave', '11 Mile Rd', '12 Mile Rd', '13 Mile Rd', '14 Mile Rd',
  'Rochester Rd', 'Campbell Rd', 'S Blair Ave', 'E 4th St', 'E Lincoln Ave',
  'W 6th St', 'Catalpa Dr', 'Gardenia Ave', 'Vinsetta Blvd', 'Hendrie Blvd',
  'Kenwood Ave', 'Normandy Rd', 'Webster Rd', 'Knowles St', 'Pingree Ave',
  'Marais Ave', 'Gainsborough Ave', 'Batavia Ave', 'Morse Ave', 'Helene Ave',
  'Parent Ave', 'Parkdale Ave', 'S Rembrandt Ave', 'E Farnum Ave', 'W Hudson Ave',
  'E University Ave', 'N West St', 'S Kenwood Ave', 'Clawson Dr', 'E 5th St',
  'W 10 Mile Rd', 'Coolidge Hwy', 'Greenfield Rd'
];

// --- Plumbing Services & Scopes for BrokePipes --------------------------------
const SERVICES = [
  {
    name: 'Emergency Burst Pipe Repair',
    scope: 'Emergency repair of copper supply line burst in basement ceiling; replace damaged section with Type L copper, brass couplings, and full system pressure test.',
    itemLabel: 'Emergency burst copper pipe repair & pressure testing',
    min: 350,
    max: 1200,
    hours: [2, 5]
  },
  {
    name: 'Whole-House PEX Repiping',
    scope: 'Full whole-home repiping: replace old galvanized pipes with Uponor PEX-A, new main brass ball valve, new fixture shutoffs, and water hammer arrestors.',
    itemLabel: 'Whole-house Uponor PEX-A repipe & master shutoff replacement',
    min: 5200,
    max: 13500,
    hours: [24, 50]
  },
  {
    name: 'Main Sewer Hydro-Jetting',
    scope: 'High-pressure sewer hydro-jetting to blast clear heavy tree root intrusions, sludge, and mineral scale from cleanout to city municipal main.',
    itemLabel: 'High-pressure main sewer hydro-jetting & root clearing',
    min: 275,
    max: 750,
    hours: [2, 4]
  },
  {
    name: 'Tankless Water Heater Installation',
    scope: 'Remove old storage heater; install Navien NPE-240A2 condensing tankless water heater, gas line upgrade, venting, and scale prevention filter.',
    itemLabel: 'Navien premium condensing tankless water heater system',
    min: 2600,
    max: 4900,
    hours: [6, 12]
  },
  {
    name: 'Standard Water Heater Replacement',
    scope: 'Haul away failing unit; install Rheem Professional 50-gallon gas water heater, thermal expansion tank, brass ball valve, and new flue transition.',
    itemLabel: 'Rheem 50-gallon gas water heater replacement & expansion tank',
    min: 1400,
    max: 2600,
    hours: [4, 7]
  },
  {
    name: 'Main Water Service Line Replacement',
    scope: 'Trenchless pull of new 1-inch seamless K-copper water service line from city curb stop box to indoor water meter, including new meter valve.',
    itemLabel: 'Trenchless 1" K-copper main water service line replacement',
    min: 3200,
    max: 6800,
    hours: [12, 24]
  },
  {
    name: 'Trenchless Sewer Pipe Relining',
    scope: 'Cured-in-place pipe (CIPP) structural epoxy lining for 60ft lateral sewer pipe without digging up front lawn or driveway.',
    itemLabel: 'CIPP trenchless structural sewer pipe relining',
    min: 4200,
    max: 11500,
    hours: [16, 36]
  },
  {
    name: 'Sump Pump & Dual Battery Backup',
    scope: 'Install Zoeller M53 primary submersible sump pump with Wayne battery backup system, check valve, and high-water audible alarm.',
    itemLabel: 'Zoeller primary sump pump & Wayne smart battery backup system',
    min: 850,
    max: 2200,
    hours: [3, 6]
  },
  {
    name: 'HD Sewer Camera Inspection',
    scope: 'Digital HD color camera inspection of sewer lateral with sonde radio-frequency depth locator to pinpoint offsets, root intrusion, and low belly spots.',
    itemLabel: 'Digital HD sewer camera inspection & video survey',
    min: 225,
    max: 550,
    hours: [1.5, 3]
  },
  {
    name: 'Bathroom Plumbing Rough-In',
    scope: 'Full bathroom rough-in and finish plumbing: shower mixing valve with integral stops, double vanity rough-ins, toilet waste line, and vent tie-in.',
    itemLabel: 'Complete bathroom remodel rough-in & trim plumbing',
    min: 1800,
    max: 4600,
    hours: [10, 22]
  },
  {
    name: 'Frozen Pipe Thaw & Freeze Shield',
    scope: 'Emergency thermal thawing of frozen exterior wall water pipes, repair fractured elbows, and install commercial closed-cell foam insulation.',
    itemLabel: 'Frozen pipe emergency thaw, repair & thermal insulation',
    min: 450,
    max: 1400,
    hours: [3, 6]
  },
  {
    name: 'Gas Line Installation & Test',
    scope: 'Extend 3/4" black iron gas supply line from basement manifold to exterior patio for kitchen/grill, install shutoff, and 24-hr pressure gauge test.',
    itemLabel: 'Exterior natural gas supply line extension & safety pressure test',
    min: 650,
    max: 2100,
    hours: [4, 9]
  },
  {
    name: 'Garbage Disposal & Trap Overhaul',
    scope: 'Install InSinkErator Pro 3/4 HP continuous-feed garbage disposal, replace corroded PVC trap and tailpiece assembly, and hook up dishwasher drain.',
    itemLabel: 'InSinkErator Pro disposal & complete kitchen sink drain overhaul',
    min: 250,
    max: 600,
    hours: [2, 4]
  },
  {
    name: 'RPZ Backflow Preventer Testing',
    scope: 'Annual certification testing of RPZ backflow preventer assembly, rebuild check valves, and submit compliance test report to local water department.',
    itemLabel: 'RPZ backflow preventer rebuild, certification & testing',
    min: 300,
    max: 950,
    hours: [2, 5]
  }
];

const LEAD_SOURCES = ['website_form', 'website_form', 'website_form', 'referral', 'missed_call', 'manual', 'ai_voice'];

const MESSAGES = [
  'Water is dripping through the ceiling below the second floor bathroom. Need an emergency plumber out today.',
  'Kitchen sink is clogged and backing up into both basins whenever the dishwasher discharges.',
  'Our 14-year-old gas water heater started leaking from the bottom tank seam this morning. Looking for a replacement quote.',
  'Water pressure in the master shower and upstairs fixtures has dropped dramatically over the past month. Old galvanized pipes.',
  'Basement floor drain backed up with sewer water during yesterday’s heavy rainstorm. Need camera inspection and line clearing.',
  'Looking to convert our standard tank water heater to a Navien tankless unit for our family in Royal Oak.',
  'Sump pump in the basement is humming loudly but not pumping out water to the exterior discharge line.',
  'Need a new natural gas line run from the basement to the back patio for an outdoor BBQ grill station.',
  'Outdoor hose bib spigot froze over the winter and burst inside the wall when turned on yesterday.',
  'Remodeling our master bathroom and need licensed plumbers for full rough-in and fixture trim installation.',
  'Toilet won’t stop running and the shutoff valve underneath is seized tight and weeping water.',
  'Looking for a quote to repipe our 1950s Royal Oak bungalow from old galvanized steel to PEX.',
  'Need a secondary battery backup sump pump installed with alarm before spring rains hit.',
  'Garbage disposal seized up with a humming motor and is leaking around the sink mounting ring.'
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
    phone: `(248) 555-${String(100 + (index % 900)).padStart(4, '0')}`,
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

  // Leads in stages 1-2 haven't converted to a priced job yet
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

  const workdayTime = () => `${String(intBetween(8, 15)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}:00`;

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
    job.startedAt = iso(startedDaysAgo * DAY + between(1, 5) * 60 * 60 * 1000);
    job.quoteSignedAt = iso((startedDaysAgo + 2) * DAY);
    job.quoteSignerName = person.name;
    job.quoteSignatureMethod = 'typed';
  } else if (stage.key === 'ready_to_invoice' || stage.key === 'invoice_sent' || stage.key === 'complete') {
    const doneDaysAgo = intBetween(3, Math.max(4, Math.floor(ageDays - 2)));
    job.scheduledFor = dateKey(-doneDaysAgo * DAY);
    job.scheduledTime = workdayTime();
    job.startedAt = iso(doneDaysAgo * DAY);
    job.quoteSignedAt = iso((doneDaysAgo + 3) * DAY);
    job.quoteSignerName = person.name;
    job.quoteSignatureMethod = 'typed';
  }

  record.job = job;

  record.link = {
    createdAt: jobCreatedAt,
    lastViewedAt: rand() < 0.7 ? iso(Math.max(0, ageDays - between(0.2, 2)) * DAY) : null,
  };

  if (stage.key === 'invoice_sent' || stage.key === 'complete') {
    const invoicedDaysAgo = Math.max(1, ageDays - between(2, 8));
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
      paidAt: stage.key === 'complete' ? iso(Math.max(0.5, invoicedDaysAgo - between(0.5, 5)) * DAY) : null,
      feeRate,
      platformFee: stage.key === 'complete' ? Number((amount * feeRate).toFixed(2)) : null,
    };
  }

  if (stage.key === 'complete' && rand() < 0.22) {
    const priorService = pick(SERVICES);
    const priorDaysAgo = ageDays + between(100, 360);
    const priorAmount = round(between(priorService.min, priorService.max), 25);
    record.priorJob = {
      service: priorService,
      amount: priorAmount,
      createdAt: iso(priorDaysAgo * DAY),
      scheduledFor: dateKey(-(priorDaysAgo - 3) * DAY),
      startedAt: iso((priorDaysAgo - 3) * DAY),
      invoiceCreatedAt: iso((priorDaysAgo - 4) * DAY),
      paidAt: iso((priorDaysAgo - 6) * DAY),
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
      `select a.id, a.business_name, s.company_name, s.subdomain,
              a.quote_followups_enabled, a.appointment_reminders_enabled, a.arrival_morning_confirmation
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
    console.log('\nAddress Sample:');
    for (const record of [records[0], records[75], records[150], records[225], records[299]]) {
      console.log(`  • ${record.person.name.padEnd(20)} ${record.stageLabel.padEnd(30)} ${record.person.address}`);
    }

    if (!APPLY && !REHEARSE) {
      console.log('\n[PLAN ONLY] Run with --rehearse to test in a rolled-back transaction, or --apply to commit.');
      process.exit(0);
    }

    console.log(REHEARSE ? '\n*** REHEARSING (Will Roll Back) ***\n' : '\n*** APPLYING CHANGES ***\n');
    await client.query('begin');

    // 1. Teardown existing data for this account
    console.log('Teardown existing BrokePipes jobs, leads, and clients...');
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

    // 2. Prepare bulk rows
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
        clientId, account.id, person.name, person.phone, person.email, person.address, record.createdAt, record.createdAt, TEST_MARKER
      ]);

      let mainJobId = null;

      // Repeat customer prior job
      if (record.priorJob) {
        const priorJobId = randomUUID();
        const priorInvoiceId = randomUUID();
        const ref = `J-DEMO-${jobSeq++}`;
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
          person.lat, person.lng, record.priorJob.createdAt, record.priorJob.createdAt, TEST_MARKER
        ]);

        const priorInvoiceRef = `INV-DEMO-${invoiceSeq++}`;
        invoiceRows.push([
          priorInvoiceId, account.id, priorJobId, priorInvoiceRef, 'paid', record.priorJob.amount,
          record.priorJob.invoiceCreatedAt, person.name, record.priorJob.invoiceCreatedAt, TEST_MARKER
        ]);

        paymentRows.push([
          account.id, priorJobId, priorInvoiceId, 'final', 'Final payment', record.priorJob.amount,
          'paid', record.priorJob.invoiceCreatedAt, record.priorJob.paidAt,
          Number((record.priorJob.amount * 0.02).toFixed(2)), 0.02, TEST_MARKER
        ]);
      }

      // Main job
      if (record.job) {
        mainJobId = randomUUID();
        const ref = `J-DEMO-${jobSeq++}`;
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
          person.lat, person.lng, record.job.createdAt, record.job.createdAt, TEST_MARKER
        ]);

        linkRows.push([
          account.id, mainJobId, randomBytes(32).toString('hex'),
          person.email, person.phone, record.link.lastViewedAt, record.link.createdAt
        ]);

        if (record.invoice) {
          const invoiceId = randomUUID();
          const invoiceRef = `INV-DEMO-${invoiceSeq++}`;

          invoiceRows.push([
            invoiceId, account.id, mainJobId, invoiceRef, record.invoice.status, record.invoice.total,
            record.invoice.signedAt, record.invoice.signerName, record.invoice.createdAt, TEST_MARKER
          ]);

          paymentRows.push([
            account.id, mainJobId, invoiceId, record.payment.kind, record.payment.label,
            record.payment.amount, record.payment.status, record.payment.requestedAt,
            record.payment.paidAt, record.payment.platformFee, record.payment.feeRate, TEST_MARKER
          ]);
        }
      }

      leadRows.push([
        account.id, clientId, record.leadSource, person.name, person.phone, person.email,
        person.address, record.message, record.service.name, record.leadStatus, mainJobId,
        person.lat, person.lng, record.createdAt, record.createdAt, record.createdAt, TEST_MARKER
      ]);
    }

    console.log('Inserting batch records...');

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
      'lat', 'lng', 'geocoded_at', 'created_at', 'updated_at', 'test_marker'
    ], leadRows);

    if (REHEARSE) {
      await client.query('rollback');
      console.log(`\nRehearsal succeeded.`);
      console.log(`  Clients:   ${clientRows.length}`);
      console.log(`  Jobs:      ${jobRows.length}`);
      console.log(`  Links:     ${linkRows.length}`);
      console.log(`  Invoices:  ${invoiceRows.length}`);
      console.log(`  Payments:  ${paymentRows.length}`);
      console.log(`  Leads:     ${leadRows.length}`);
      console.log('Transaction safely rolled back. Nothing was modified.');
    } else {
      await client.query('commit');
      console.log('\n✓ Successfully committed to database:');
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
