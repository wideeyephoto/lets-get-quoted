import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';

// Enrich all existing leads with full triage intelligence and generate
// 50 fresh active incoming leads for the Royal Oak, MI area.
//
// TARGET ACCOUNT: BrokePipes (subdomain: 'brokepipes', account: 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6')

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

const APPLY = process.argv.includes('--apply');
const REHEARSE = process.argv.includes('--rehearse');
const TARGET_ACCOUNT_ID = 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6';
const TEST_MARKER = 'seed-customers';

// --- Geographic Pool: Royal Oak, Michigan & Oakland County --------------------
const CITIES = [
  { city: 'Royal Oak', state: 'MI', zips: ['48067', '48073'], lat: 42.4895, lng: -83.1446, weight: 14 },
  { city: 'Berkley', state: 'MI', zips: ['48072'], lat: 42.5034, lng: -83.1835, weight: 4 },
  { city: 'Ferndale', state: 'MI', zips: ['48220'], lat: 42.4606, lng: -83.1346, weight: 4 },
  { city: 'Birmingham', state: 'MI', zips: ['48009'], lat: 42.5467, lng: -83.2113, weight: 3 },
  { city: 'Clawson', state: 'MI', zips: ['48017'], lat: 42.5334, lng: -83.1463, weight: 3 },
  { city: 'Huntington Woods', state: 'MI', zips: ['48070'], lat: 42.4831, lng: -83.1702, weight: 2 },
  { city: 'Troy', state: 'MI', zips: ['48084'], lat: 42.5803, lng: -83.1499, weight: 3 },
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

const FIRST = [
  'Aaron', 'Abigail', 'Austin', 'Brianna', 'Caleb', 'Chloe', 'Cole', 'Dakota',
  'Elena', 'Felix', 'Giselle', 'Harrison', 'Hazel', 'Ian', 'Ivy', 'Jonah',
  'Jocelyn', 'Kyle', 'Layla', 'Leo', 'Maya', 'Micah', 'Nora', 'Owen',
  'Paige', 'Quinn', 'Rowan', 'Ruby', 'Silas', 'Stella', 'Tristan', 'Violet'
];

const LAST = [
  'Armstrong', 'Beckett', 'Chen', 'Donovan', 'Emerson', 'Fitzgerald', 'Garrison',
  'Harrington', 'Jensen', 'Keller', 'Lambert', 'Mercer', 'Navarro', 'Ortega',
  'Patel', 'Ramirez', 'Sawyer', 'Townsend', 'Underwood', 'Vaughn', 'Whitaker'
];

const NEW_LEAD_SCENARIOS = [
  {
    projectType: 'Emergency Burst Pipe Repair',
    message: 'Active water spraying from copper pipe elbow above water meter in basement. Water shutoff turned off temporarily. Need immediate plumber.',
    score: 'hot',
    timeline: 'ASAP — Emergency',
    estimate: { min: 350, max: 1100 },
    permit: { required: false, authorityName: 'City of Royal Oak Building Department', estimatedFee: null },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'Tankless Water Heater Installation',
    message: 'Looking to replace an old 50-gallon Rheem tank with a Navien NPE-240A2 tankless unit. Want an estimate for install, gas line upgrade, and venting.',
    score: 'hot',
    timeline: 'This week',
    estimate: { min: 2600, max: 4800 },
    permit: { required: true, authorityName: 'City of Royal Oak Building Department', estimatedFee: 125 },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'Main Sewer Hydro-Jetting',
    message: 'Basement floor drain backing up with dark water whenever the washing machine drains. Previous plumber snaked it 6 months ago, want hydro-jetting.',
    score: 'hot',
    timeline: 'ASAP',
    estimate: { min: 300, max: 750 },
    permit: { required: false, authorityName: 'City of Royal Oak Building Department', estimatedFee: null },
    flags: ['repeat'],
    contactPreference: 'text_only'
  },
  {
    projectType: 'Whole-House PEX Repiping',
    message: '1948 Royal Oak bungalow with original galvanized iron pipes throughout. Low water pressure and brown tinted water. Need full PEX-A repipe quote.',
    score: 'warm',
    timeline: 'Within 2-3 weeks',
    estimate: { min: 5200, max: 12500 },
    permit: { required: true, authorityName: 'City of Royal Oak Building Department', estimatedFee: 220 },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'Sump Pump & Dual Battery Backup',
    message: 'Current sump pump is 9 years old and rattling loudly during rain. Want a new Zoeller cast iron pump plus battery backup system with alarm.',
    score: 'hot',
    timeline: 'This week',
    estimate: { min: 850, max: 2100 },
    permit: { required: false, authorityName: 'City of Royal Oak Building Department', estimatedFee: null },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'Bathroom Plumbing Rough-In',
    message: 'Finishing basement and adding a full 3-piece bathroom (shower, vanity, toilet). Need rough-in waste, vent, and supply lines run to existing stack.',
    score: 'warm',
    timeline: 'Next month',
    estimate: { min: 1800, max: 4500 },
    permit: { required: true, authorityName: 'City of Royal Oak Building Department', estimatedFee: 150 },
    flags: [],
    contactPreference: 'any'
  },
  {
    projectType: 'Trenchless Sewer Pipe Relining',
    message: 'Clay sewer lateral under driveway has significant tree root intrusion and cracked joint. Interested in CIPP trenchless relining to avoid digging driveway.',
    score: 'hot',
    timeline: 'Within 2 weeks',
    estimate: { min: 4200, max: 10500 },
    permit: { required: true, authorityName: 'City of Royal Oak Building Department', estimatedFee: 175 },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'Main Water Service Line Replacement',
    message: 'Low incoming municipal pressure, city confirmed lead/galvanized service line from curb box. Need new 1-inch K-copper line pulled into basement.',
    score: 'warm',
    timeline: 'This month',
    estimate: { min: 3200, max: 6500 },
    permit: { required: true, authorityName: 'City of Royal Oak Building Department', estimatedFee: 180 },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'Garbage Disposal & Trap Overhaul',
    message: 'Kitchen sink disposal jammed and leaking oily residue into the bottom cabinet. Would like it replaced with a quiet 3/4 HP model.',
    score: 'warm',
    timeline: 'Flexible (next few days)',
    estimate: { min: 250, max: 550 },
    permit: { required: false, authorityName: 'City of Royal Oak Building Department', estimatedFee: null },
    flags: [],
    contactPreference: 'text_only'
  },
  {
    projectType: 'Gas Line Installation & Test',
    message: 'Extending gas line from utility room to back patio for a new Weber natural gas barbecue grill. Approx 25 ft of 3/4" piping needed.',
    score: 'warm',
    timeline: 'Next 2 weeks',
    estimate: { min: 650, max: 1900 },
    permit: { required: true, authorityName: 'City of Royal Oak Building Department', estimatedFee: 95 },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'HD Sewer Camera Inspection',
    message: 'Buying a home in Ferndale built in 1935. Need a pre-purchase sewer camera scope inspection and recorded video survey before closing.',
    score: 'hot',
    timeline: 'This Thursday/Friday',
    estimate: { min: 225, max: 500 },
    permit: { required: false, authorityName: 'City of Royal Oak Building Department', estimatedFee: null },
    flags: ['phone_verified'],
    contactPreference: 'any'
  },
  {
    projectType: 'Frozen Pipe Thaw & Freeze Shield',
    message: 'Supply pipes running in north exterior wall froze during cold snap. Need pipes checked for hair-line cracks and commercial insulation added.',
    score: 'warm',
    timeline: 'In the next 3 days',
    estimate: { min: 450, max: 1300 },
    permit: { required: false, authorityName: 'City of Royal Oak Building Department', estimatedFee: null },
    flags: [],
    contactPreference: 'any'
  }
];

const SOURCES = ['website_form', 'website_form', 'ai_voice', 'missed_call', 'referral', 'manual'];

function pickRand(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function intRand(min, max) {
  return Math.floor(randBetween(min, max + 1));
}

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

async function main() {
  await loadEnv();
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log(`Connecting to BrokePipes account (${TARGET_ACCOUNT_ID})...`);

  await client.query('begin');

  // 1. Enrich existing 300 leads with full triage data in chunks
  console.log('Enriching existing leads with full triage intelligence...');
  const { rows: existingLeads } = await client.query(`
    select id, name, phone, email, address, source, status, project_type, message, created_at
    from leads
    where account_id = $1
  `, [TARGET_ACCOUNT_ID]);

  const updateChunks = [];
  for (const lead of existingLeads) {
    const scenario = NEW_LEAD_SCENARIOS.find(s => s.projectType === lead.project_type) || pickRand(NEW_LEAD_SCENARIOS);
    const city = lead.address ? lead.address.split(',')[1]?.trim() || 'Royal Oak' : 'Royal Oak';
    
    const contactLog = [];
    if (lead.status === 'contacted' || lead.status === 'quoted' || lead.status === 'won') {
      contactLog.push({
        at: new Date(new Date(lead.created_at).getTime() + 15 * 60 * 1000).toISOString(),
        label: lead.source === 'ai_voice' ? 'AI Voice Call Completed' : 'Initial Phone Outreach',
        note: 'Spoke with customer regarding plumbing issue, confirmed service address and scheduling window.'
      });
    }
    if (lead.status === 'quoted' || lead.status === 'won') {
      contactLog.push({
        at: new Date(new Date(lead.created_at).getTime() + 60 * 60 * 1000).toISOString(),
        label: 'Quote Link Sent via SMS & Email',
        note: 'Customer opened quote in portal.'
      });
    }

    const triage = {
      score: lead.status === 'new' ? scenario.score : (lead.status === 'won' ? 'hot' : 'warm'),
      flags: scenario.flags,
      timeline: scenario.timeline,
      location: city,
      estimate: scenario.estimate,
      permit: scenario.permit,
      contactPreference: scenario.contactPreference,
      messageChannel: 'auto',
      contactLog: contactLog.length > 0 ? contactLog : undefined
    };

    updateChunks.push([lead.id, JSON.stringify(triage)]);
  }

  // Fast batched update
  const CHUNK_SIZE = 50;
  for (let i = 0; i < updateChunks.length; i += CHUNK_SIZE) {
    const chunk = updateChunks.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, idx) => `($${idx * 2 + 1}::uuid, $${idx * 2 + 2}::jsonb)`).join(', ');
    const params = chunk.flat();
    await client.query(`
      UPDATE leads
      SET triage = c.triage
      FROM (VALUES ${placeholders}) AS c(id, triage)
      WHERE leads.id = c.id
    `, params);
  }
  console.log(`✓ Enriched ${existingLeads.length} existing leads with triage intelligence.`);

  // 2. Generate 50 brand-new fresh incoming leads in Royal Oak area
  console.log('Generating 50 fresh incoming leads for Royal Oak & surrounding area...');
  const newClientRows = [];
  const newLeadRows = [];
  const NOW = Date.now();

  for (let i = 1; i <= 50; i++) {
    const first = pickRand(FIRST);
    const last = pickRand(LAST);
    const name = `${first} ${last}`;
    const place = pickRand(CITY_POOL);
    const zip = pickRand(place.zips);
    const street = pickRand(STREETS);
    const address = `${intRand(100, 9899)} ${street}, ${place.city}, ${place.state} ${zip}`;
    const lat = Number((place.lat + randBetween(-0.015, 0.015)).toFixed(6));
    const lng = Number((place.lng + randBetween(-0.018, 0.018)).toFixed(6));
    const phone = `(248) 555-${String(600 + i).padStart(4, '0')}`;
    const email = `${first}.${last}.lead${i}`.toLowerCase() + '@example.com';
    const scenario = pickRand(NEW_LEAD_SCENARIOS);
    const source = pickRand(SOURCES);
    const minutesAgo = intRand(10, 48 * 60); // 10 minutes to 48 hours ago
    const createdAt = new Date(NOW - minutesAgo * 60 * 1000).toISOString();
    const clientId = randomUUID();

    newClientRows.push([
      clientId, TARGET_ACCOUNT_ID, name, phone, email, address, createdAt, createdAt, TEST_MARKER
    ]);

    const triage = {
      score: scenario.score,
      flags: scenario.flags,
      timeline: scenario.timeline,
      location: `${place.city}, ${place.state}`,
      estimate: scenario.estimate,
      permit: scenario.permit,
      contactPreference: scenario.contactPreference,
      messageChannel: 'auto',
      contactLog: source === 'ai_voice' ? [
        {
          at: createdAt,
          label: 'AI Inbound Voice Agent Intake',
          note: `Customer called regarding ${scenario.projectType}. Summary captured and pre-qualified.`
        }
      ] : undefined
    };

    newLeadRows.push([
      TARGET_ACCOUNT_ID, clientId, source, name, phone, email,
      address, scenario.message, scenario.projectType, 'new', null,
      lat, lng, createdAt, createdAt, createdAt, TEST_MARKER, JSON.stringify(triage)
    ]);
  }

  await bulkInsert(client, 'clients', [
    'id', 'account_id', 'name', 'phone', 'email', 'address', 'created_at', 'updated_at', 'test_marker'
  ], newClientRows);

  await bulkInsert(client, 'leads', [
    'account_id', 'client_id', 'source', 'name', 'phone', 'email',
    'address', 'message', 'project_type', 'status', 'converted_job',
    'lat', 'lng', 'geocoded_at', 'created_at', 'updated_at', 'test_marker', 'triage'
  ], newLeadRows);

  console.log(`✓ Inserted 50 new clients and 50 new fresh incoming leads.`);

  if (REHEARSE) {
    await client.query('rollback');
    console.log('\nRehearsal complete. All changes successfully tested and rolled back.');
  } else if (APPLY) {
    await client.query('commit');
    console.log('\n✓ All lead updates and new leads successfully COMMITTED.');
  } else {
    await client.query('rollback');
    console.log('\nPlan printed. Run with --apply to commit.');
  }

  await client.end();
}

main().catch(console.error);
