// Static, fully-fictional dataset that powers the logged-out "/demo" section —
// a read-only replica of the real dashboard showing what an established lawn &
// landscape business looks like inside the product. No Supabase calls happen
// anywhere in this module; everything here is hardcoded so the demo works
// instantly with zero auth and zero backend cost.
import { computeMargin, type Cost, type Job, type JobStatus } from '@/lib/jobs';
import type { CrewMember } from '@/lib/crew';
import type { Lead, LeadSource, LeadStatus } from '@/lib/leads';
import type { CashEvent } from '@/lib/cash-forecast';
import type { ScheduledPayment } from '@/lib/cash-forecast-data';

export const DEMO_ACCOUNT_ID = 'demo-account';
export const DEMO_COMPANY_NAME = 'Evergreen Lawn & Landscape';
export const DEMO_OWNER_NAME = 'Dana Whitfield';
export const DEMO_SITE_HOST = 'evergreenlawn.letsgetquoted.com';
export const DEMO_SERVICE_AREA = 'Royal Oak & Metro Detroit';
// Trailing 12-month PAID volume — distinct from quoted job values, same as the
// real dashboard, where it only counts money actually collected. Declared here
// but DERIVED at the bottom of this file from the completed jobs, because it
// drives the fee-tier card and a hardcoded figure would start contradicting the
// job list the moment either one moved.

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

export function dateKeyFromNow(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const DEMO_CREW: CrewMember[] = [
  { id: 'crew-1', account_id: DEMO_ACCOUNT_ID, name: 'Mike Torres', phone: '(248) 555-0142', email: null, role_label: 'Crew Lead', hourly_rate: 30, photo_path: null, user_id: null, active: true, deleted_at: null, created_at: daysAgo(700) },
  { id: 'crew-2', account_id: DEMO_ACCOUNT_ID, name: 'Jamal Reed', phone: '(248) 555-0198', email: null, role_label: 'Landscaper', hourly_rate: 24, photo_path: null, user_id: null, active: true, deleted_at: null, created_at: daysAgo(620) },
  { id: 'crew-3', account_id: DEMO_ACCOUNT_ID, name: 'Sam Whitaker', phone: '(248) 555-0163', email: null, role_label: 'Mow Technician', hourly_rate: 20, photo_path: null, user_id: null, active: true, deleted_at: null, created_at: daysAgo(500) },
  { id: 'crew-4', account_id: DEMO_ACCOUNT_ID, name: 'Elena Ruiz', phone: '(248) 555-0177', email: null, role_label: 'Operations Manager', hourly_rate: 28, photo_path: null, user_id: null, active: true, deleted_at: null, created_at: daysAgo(400) },
  { id: 'crew-5', account_id: DEMO_ACCOUNT_ID, name: 'Danny Cole', phone: '(248) 555-0119', email: null, role_label: 'Irrigation Tech (Sub)', hourly_rate: 40, photo_path: null, user_id: null, active: false, deleted_at: null, created_at: daysAgo(300) },
];

type JobSeed = {
  id: string;
  ref: string;
  client_name: string;
  client_phone: string;
  address: string;
  scope: string;
  status: JobStatus;
  quoted_amount: number;
  estimated_hours: number | null;
  scheduledOffset: number | null; // days from today; null = unscheduled
  scheduledTime?: string | null;
  createdDaysAgo: number;
  hasCosts: boolean;
};

const JOB_SEEDS: JobSeed[] = [
  { id: 'job-1', ref: 'J-1001', client_name: 'Karen Whitfield', client_phone: '(248) 555-0110', address: '1418 Maplewood Ave, Royal Oak, MI', scope: 'Paver patio (380 sq ft) with fire pit and seat wall.', status: 'complete', quoted_amount: 14800, estimated_hours: 46, scheduledOffset: -95, scheduledTime: '08:00', createdDaysAgo: 112, hasCosts: true },
  { id: 'job-2', ref: 'J-1002', client_name: 'Marcus Delgado', client_phone: '(248) 555-0121', address: '922 Birchcrest Dr, Ferndale, MI', scope: 'Full landscape design & install — beds, plantings, mulch, edging.', status: 'complete', quoted_amount: 9600, estimated_hours: 40, scheduledOffset: -78, scheduledTime: '08:30', createdDaysAgo: 96, hasCosts: true },
  { id: 'job-3', ref: 'J-1003', client_name: 'Isabel Reyes', client_phone: '(248) 555-0132', address: '77 Lakeview Ct, Berkley, MI', scope: 'Segmental block retaining wall (60 ft) with drainage.', status: 'complete', quoted_amount: 11400, estimated_hours: 52, scheduledOffset: -63, scheduledTime: '07:30', createdDaysAgo: 82, hasCosts: true },
  { id: 'job-4', ref: 'J-1004', client_name: 'Tom Carmichael', client_phone: '(248) 555-0143', address: '350 Elmwood St, Clawson, MI', scope: 'Sod replacement, front & back (4,200 sq ft) with grading.', status: 'complete', quoted_amount: 6200, estimated_hours: 28, scheduledOffset: -49, scheduledTime: '08:00', createdDaysAgo: 66, hasCosts: true },
  { id: 'job-5', ref: 'J-1005', client_name: 'Yuki Nakamura', client_phone: '(248) 555-0154', address: '48 Hollow Rd, Troy, MI', scope: '6-zone irrigation system install with smart controller.', status: 'complete', quoted_amount: 5800, estimated_hours: 30, scheduledOffset: -38, scheduledTime: '09:00', createdDaysAgo: 58, hasCosts: true },
  { id: 'job-6', ref: 'J-1006', client_name: "Brian O'Malley", client_phone: '(248) 555-0165', address: '210 Sunridge Ln, Royal Oak, MI', scope: 'Tree & shrub planting package with mulched beds.', status: 'complete', quoted_amount: 4300, estimated_hours: 18, scheduledOffset: -29, scheduledTime: '08:30', createdDaysAgo: 44, hasCosts: true },
  { id: 'job-7', ref: 'J-1007', client_name: 'Grace Foster', client_phone: '(248) 555-0176', address: '65 Windemere Ave, Ferndale, MI', scope: 'French drain install and regrade to fix backyard drainage.', status: 'complete', quoted_amount: 7900, estimated_hours: 34, scheduledOffset: -19, scheduledTime: '07:30', createdDaysAgo: 33, hasCosts: true },
  { id: 'job-8', ref: 'J-1008', client_name: 'Paul Grant', client_phone: '(248) 555-0187', address: '19 Featherstone Rd, Troy, MI', scope: 'Low-voltage outdoor lighting — path, uplights & patio.', status: 'complete', quoted_amount: 4900, estimated_hours: 20, scheduledOffset: -9, scheduledTime: '09:30', createdDaysAgo: 24, hasCosts: true },
  { id: 'job-9', ref: 'J-1009', client_name: 'Renee Patterson', client_phone: '(248) 555-0198', address: '5 Rosewood Ct, Berkley, MI', scope: 'Backyard makeover — patio expansion, plantings & new sod.', status: 'in_progress', quoted_amount: 16400, estimated_hours: 58, scheduledOffset: 0, scheduledTime: '07:30', createdDaysAgo: 14, hasCosts: true },
  { id: 'job-10', ref: 'J-1010', client_name: 'Diego Alvarez', client_phone: '(248) 555-0109', address: '88 Cloverdale Dr, Clawson, MI', scope: 'Flagstone walkway and front-yard bed redesign.', status: 'in_progress', quoted_amount: 8700, estimated_hours: 36, scheduledOffset: 2, scheduledTime: '08:00', createdDaysAgo: 10, hasCosts: true },
  { id: 'job-11', ref: 'J-1011', client_name: 'Holly Sutton', client_phone: '(248) 555-0120', address: '140 Brookfield Ave, Royal Oak, MI', scope: 'New lawn: grading, topsoil, hydroseed (6,000 sq ft).', status: 'in_progress', quoted_amount: 3600, estimated_hours: 16, scheduledOffset: 5, scheduledTime: '08:00', createdDaysAgo: 7, hasCosts: true },
  { id: 'job-12', ref: 'J-1012', client_name: 'Owen Bishop', client_phone: '(248) 555-0131', address: '27 Ashgrove Ln, Ferndale, MI', scope: 'Paver walkway and garden bed refresh with boulders.', status: 'new_lead', quoted_amount: 5400, estimated_hours: 22, scheduledOffset: null, createdDaysAgo: 3, hasCosts: false },
  { id: 'job-13', ref: 'J-1013', client_name: 'Nina Harmon', client_phone: '(248) 555-0142', address: '9 Timberline Dr, Troy, MI', scope: 'Full backyard landscape design with patio & pergola.', status: 'new_lead', quoted_amount: 22800, estimated_hours: 76, scheduledOffset: null, createdDaysAgo: 1, hasCosts: false },
];

// --- The rest of the quarter --------------------------------------------------
// The thirteen seeds above carry the story the other pages reference by name —
// the Patterson patio, the Harmon deposit, the Sutton payment plan. On their own
// they are about a fortnight of a business: eight finished jobs behind and three
// days of work ahead. A prospect who paged the calendar forward found it empty,
// the 90-day forecast ran out of events around day 45, and "Repeat" never
// appeared on the client list because nobody had come back yet.
//
// So this fills the 90 days either side around them, and it is DETERMINISTIC on
// purpose: a seeded generator rather than Math.random, because these jobs are
// read on eight different pages and a demo whose pages quietly disagree with
// each other is worse than one with less in it. Same seed, same book of work,
// every render — which is also what keeps server and client markup identical.
function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function weekdayFromNow(offsetDays: number): number {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getDay();
}

/** Customers for the filler book. Some appear twice on purpose — see below. */
const FILL_CLIENTS: { name: string; phone: string; address: string }[] = [
  { name: 'Lorraine Alcott', phone: '(248) 555-0301', address: '312 Kenwood Ave, Royal Oak, MI' },
  { name: 'Devon Marsh', phone: '(248) 555-0302', address: '78 Larchmont Rd, Ferndale, MI' },
  { name: 'Priscilla Vance', phone: '(248) 555-0303', address: '25 Stratford Ct, Berkley, MI' },
  { name: 'Hector Salinas', phone: '(248) 555-0304', address: '901 Woodcrest Dr, Troy, MI' },
  { name: 'Bethany Kroll', phone: '(248) 555-0305', address: '44 Sherwood Ln, Clawson, MI' },
  { name: 'Arthur Nwosu', phone: '(248) 555-0306', address: '156 Greenfield Ave, Royal Oak, MI' },
  { name: 'Marisol Tejeda', phone: '(248) 555-0307', address: '67 Aldridge St, Ferndale, MI' },
  { name: 'Colin Petrakis', phone: '(248) 555-0308', address: '283 Havenhurst Dr, Troy, MI' },
  { name: 'Wanda Freel', phone: '(248) 555-0309', address: '12 Bramblewood Ct, Berkley, MI' },
  { name: 'Sanjay Kulkarni', phone: '(248) 555-0310', address: '540 Ridgemont Rd, Royal Oak, MI' },
  { name: 'Frances Odum', phone: '(248) 555-0311', address: '89 Crestline Ave, Clawson, MI' },
  { name: 'Bruce Hallowell', phone: '(248) 555-0312', address: '731 Pinecrest Dr, Troy, MI' },
  { name: 'Amara Boateng', phone: '(248) 555-0313', address: '38 Wexford Ln, Ferndale, MI' },
  { name: 'Trevor Lindqvist', phone: '(248) 555-0314', address: '205 Fairbanks St, Royal Oak, MI' },
  { name: 'Dolores Ybarra', phone: '(248) 555-0315', address: '16 Chandler Ct, Berkley, MI' },
  { name: 'Nathan Ojeda', phone: '(248) 555-0316', address: '412 Rockhill Dr, Troy, MI' },
  { name: 'Simone Bertrand', phone: '(248) 555-0317', address: '95 Oakhaven Ave, Clawson, MI' },
  { name: 'Gil Ferraro', phone: '(248) 555-0318', address: '620 Thornhill Rd, Royal Oak, MI' },
  { name: 'Kendra Whitlow', phone: '(248) 555-0319', address: '51 Marigold Ln, Ferndale, MI' },
  { name: 'Aziz Rahimi', phone: '(248) 555-0320', address: '187 Sedgefield Dr, Troy, MI' },
  { name: 'Camille Osterberg', phone: '(248) 555-0321', address: '73 Lynnhaven Ct, Berkley, MI' },
  { name: 'Rudy Castellanos', phone: '(248) 555-0322', address: '344 Beechmont Ave, Royal Oak, MI' },
  { name: 'Opal Sandoval', phone: '(248) 555-0323', address: '28 Harvest Ln, Clawson, MI' },
  { name: 'Miles Etheridge', phone: '(248) 555-0324', address: '802 Glenhurst Dr, Troy, MI' },
];

// The work a lawn & landscape shop actually sells, with its own price band and
// how often it comes up. The weights matter twice over, and both times because
// of how the rest of the app reads this data:
//
//   The CALENDAR spans a job across as many days as its hours need
//   (expandScheduledJobs at 8h/day), so a 46-hour patio occupies six cells. An
//   even mix put ten concurrent jobs on every August day for a four-person crew.
//
//   The TIER CARD reads trailing volume. Unweighted, the average job came out
//   near $5.5k, which annualises past $750k and puts Evergreen in the top fee
//   tier — where there is no next tier, so the progress bar that card is built
//   around disappears.
//
// Weighted toward the bread and butter (cleanups, repairs, bed work) with the
// big installs rare, both land where a real four-crew shop sits.
const FILL_WORK: { scope: string; low: number; high: number; hours: number; weight: number }[] = [
  { scope: 'Spring cleanup — bed edging, cutback and fresh mulch.', low: 900, high: 1900, hours: 8, weight: 4 },
  { scope: 'Fall cleanup — leaf removal, bed cutback and winterizing.', low: 850, high: 1700, hours: 7, weight: 4 },
  { scope: 'Irrigation repair and backflow test.', low: 380, high: 1250, hours: 5, weight: 4 },
  { scope: 'Garden bed refresh with boulders and perennials.', low: 1800, high: 4600, hours: 14, weight: 3 },
  { scope: 'Hydroseed a new lawn with grading and topsoil.', low: 2400, high: 5600, hours: 16, weight: 2 },
  { scope: 'Tree and shrub planting package with mulched beds.', low: 2600, high: 6400, hours: 18, weight: 2 },
  { scope: 'Low-voltage landscape lighting — path and uplights.', low: 3200, high: 6900, hours: 20, weight: 2 },
  { scope: 'Deck-side planting and privacy screen install.', low: 3100, high: 7200, hours: 22, weight: 2 },
  { scope: 'Sod replacement with grading and topsoil.', low: 3400, high: 8200, hours: 26, weight: 2 },
  { scope: 'Irrigation install — 6 zones with smart controller.', low: 4600, high: 7800, hours: 28, weight: 2 },
  { scope: 'Flagstone walkway and front-bed redesign.', low: 4200, high: 9400, hours: 30, weight: 1 },
  { scope: 'French drain and regrade to fix standing water.', low: 5400, high: 11200, hours: 34, weight: 1 },
  { scope: 'Segmental retaining wall with drainage.', low: 7800, high: 15200, hours: 48, weight: 1 },
  { scope: 'Paver patio with seat wall and fire pit.', low: 9200, high: 18500, hours: 46, weight: 1 },
];

/** Flattened once so a pick is a single index into it rather than a scan. */
const FILL_WORK_POOL = FILL_WORK.flatMap((work) => Array<typeof work>(work.weight).fill(work));

const FILL_TIMES = ['07:30', '08:00', '08:30', '09:00', '13:00'];

function buildFillJobs(): JobSeed[] {
  const rand = seededRandom(20_260_802);
  const seeds: JobSeed[] = [];
  // Customers already used, so some of them can come back. Repeat business is
  // the whole argument for the Clients page, and with thirteen one-off jobs it
  // had nothing to show — every profile read "1 job" and the Repeat badge that
  // page is built around never rendered once.
  const used: number[] = [];
  let counter = 0;

  for (let offset = -90; offset <= 90; offset++) {
    const weekday = weekdayFromNow(offset);
    if (weekday === 0) continue; // nobody lays pavers on a Sunday
    if (weekday === 6 && rand() > 0.3) continue; // the occasional Saturday
    // One START per day at most, and not every day — jobs SPAN, so the calendar
    // fills from the days already running rather than from new ones. Thinning
    // toward the horizon on top of that: the far side of a quarter is booked,
    // not packed, and a calendar as full ninety days out as it is tomorrow is a
    // calendar nobody believes.
    const density = offset > 45 ? 0.34 : offset > 20 ? 0.5 : 0.62;
    if (rand() > density) continue;

    counter += 1;
    const repeat = used.length > 6 && rand() < 0.3;
    const clientIndex = repeat
      ? used[Math.floor(rand() * used.length)]
      : Math.floor(rand() * FILL_CLIENTS.length);
    if (!repeat) used.push(clientIndex);
    const client = FILL_CLIENTS[clientIndex];
    const work = FILL_WORK_POOL[Math.floor(rand() * FILL_WORK_POOL.length)];
    const amount = Math.round((work.low + rand() * (work.high - work.low)) / 50) * 50;
    // Sold before it is worked, by a week or three — which is what gives the
    // Insights funnel a sales cycle instead of same-day conversions.
    const soldLeadDays = 6 + Math.floor(rand() * 22);

    // Complete only once the LAST day of it is behind us. A job is scheduled by
    // its start, but the calendar spans it across as many days as its hours
    // need — so a 46-hour patio that started three days ago is still open, and
    // marking it complete painted a finished job onto next Tuesday's cells.
    const spanDays = Math.max(1, Math.ceil(work.hours / 8));
    const lastDay = offset + spanDays - 1;

    seeds.push({
      id: `job-f${counter}`,
      ref: `J-2${String(100 + counter).padStart(3, '0')}`,
      client_name: client.name,
      client_phone: client.phone,
      address: client.address,
      scope: work.scope,
      status: lastDay < 0 ? 'complete' : 'in_progress',
      quoted_amount: amount,
      estimated_hours: work.hours,
      scheduledOffset: offset,
      scheduledTime: FILL_TIMES[Math.floor(rand() * FILL_TIMES.length)],
      createdDaysAgo: Math.max(0, -offset + soldLeadDays),
      hasCosts: true,
    });
  }

  return seeds;
}

const ALL_JOB_SEEDS: JobSeed[] = [...JOB_SEEDS, ...buildFillJobs()];

export const DEMO_JOBS: Job[] = ALL_JOB_SEEDS.map((seed) => ({
  id: seed.id,
  account_id: DEMO_ACCOUNT_ID,
  ref: seed.ref,
  client_name: seed.client_name,
  client_phone: seed.client_phone,
  client_email: null,
  address: seed.address,
  scope: seed.scope,
  status: seed.status,
  scheduled_for: seed.scheduledOffset === null ? null : dateKeyFromNow(seed.scheduledOffset),
  scheduled_time: seed.scheduledOffset === null ? null : seed.scheduledTime ?? null,
  estimated_hours: seed.estimated_hours,
  quoted_amount: seed.quoted_amount,
  deposit_gate: null,
  quote_items: null,
  client_id: null,
  photo_paths: [],
  created_at: daysAgo(seed.createdDaysAgo),
}));

function buildCosts(job: Job): Cost[] {
  const revenue = job.quoted_amount;
  const materials = Math.round(revenue * 0.34);
  const laborAmount = Math.round(revenue * 0.26);
  const laborHours = Math.round(laborAmount / 26);
  const subAmount = Math.round(revenue * 0.08);

  return [
    {
      id: `${job.id}-cost-materials`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, type: 'material',
      category: 'Materials', description: 'Plants, sod, mulch, pavers & stone', amount: materials,
      supplier: 'Green Valley Landscape Supply', receipt_url: null, client_charge_payment_id: null, client_charge_requested_at: null, crew_id: null, crew_name: null, crew_role_label: null, hours: null, rate: null, created_at: job.created_at,
    },
    {
      id: `${job.id}-cost-labor`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, type: 'labor',
      category: 'Labor', description: 'Crew labor', amount: laborAmount,
      supplier: null, receipt_url: null, client_charge_payment_id: null, client_charge_requested_at: null, crew_id: DEMO_CREW[0].id, crew_name: DEMO_CREW[0].name, crew_role_label: DEMO_CREW[0].role_label, hours: laborHours, rate: 26, created_at: job.created_at,
    },
    {
      id: `${job.id}-cost-sub`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, type: 'sub',
      category: 'Subcontractor', description: 'Irrigation subcontractor', amount: subAmount,
      supplier: 'AquaFlow Irrigation', receipt_url: null, client_charge_payment_id: null, client_charge_requested_at: null, crew_id: null, crew_name: null, crew_role_label: null, hours: null, rate: null, created_at: job.created_at,
    },
  ];
}

const JOB_SEED_BY_ID = new Map(ALL_JOB_SEEDS.map((seed) => [seed.id, seed]));

export const DEMO_COSTS: Record<string, Cost[]> = Object.fromEntries(
  DEMO_JOBS.filter((job) => JOB_SEED_BY_ID.get(job.id)?.hasCosts).map((job) => [job.id, buildCosts(job)])
);

// Collected over the quarter this file seeds, scaled to a year. Only completed
// work counts, which is what the real figure means.
//
// The multiplier is 2.3, not 365/90. Landscaping in Michigan is seasonal: the
// quarter seeded here is peak season, and four of those in a row is not a year
// Evergreen could ever have. Straight annualisation put trailing volume near
// $1M, which is both wrong for a four-person crew and worse as a demo — it
// lands in the top fee tier, where there is no next tier, so the progress bar
// the tier card is built around vanishes and a prospect never sees how the
// pricing actually works.
const DEMO_PEAK_QUARTERS_PER_YEAR = 2.3;
const DEMO_COLLECTED_IN_WINDOW = DEMO_JOBS.filter((job) => job.status === 'complete').reduce(
  (sum, job) => sum + job.quoted_amount,
  0,
);
export const DEMO_TRAILING_VOLUME =
  Math.round((DEMO_COLLECTED_IN_WINDOW * DEMO_PEAK_QUARTERS_PER_YEAR) / 500) * 500;

export function getDemoJob(id: string): Job | null {
  return DEMO_JOBS.find((job) => job.id === id) ?? null;
}

export function getDemoCosts(jobId: string): Cost[] {
  return DEMO_COSTS[jobId] ?? [];
}

export function getDemoMargin(job: Job) {
  return computeMargin(job, getDemoCosts(job.id));
}

// -- Lightweight payment summary (display-only, not the real Payment shape) --
export type DemoPaymentSummary = { label: string; amount: number; paid: boolean };

export function getDemoPayments(job: Job): DemoPaymentSummary[] {
  if (job.status === 'new_lead') return [];
  const deposit = Math.round(job.quoted_amount * 0.3);
  const final = job.quoted_amount - deposit;
  return [
    { label: 'Deposit', amount: deposit, paid: true },
    { label: 'Final payment', amount: final, paid: job.status === 'complete' },
  ];
}

type LeadSeed = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string;
  project_type: string;
  estimated_hours: number | null;
  message: string;
  status: LeadStatus;
  source: LeadSource;
  createdDaysAgo?: number;
  createdHoursAgo?: number;
  respondedHoursAfter?: number;
  convertedJob?: string;
};

const LEAD_SEEDS: LeadSeed[] = [
  { id: 'lead-1', name: 'Taylor Brooks', phone: '(248) 555-0212', email: 'taylor.brooks@example.com', address: '14 Pinehurst Dr, Royal Oak, MI', project_type: 'Paver patio', estimated_hours: 44, message: 'Would love a paver patio with a fire pit this summer — ballpark $12–16k.', status: 'new', source: 'website_form', createdHoursAgo: 2 },
  { id: 'lead-2', name: 'Priya Shah', phone: '(248) 555-0223', email: 'priya.shah@example.com', address: '6 Willowbrook Ln, Ferndale, MI', project_type: 'Landscape design', estimated_hours: 40, message: 'Want to redo our whole front yard — new beds, plantings, and mulch.', status: 'new', source: 'website_form', createdHoursAgo: 7 },
  { id: 'lead-3', name: 'Andre Coleman', phone: '(248) 555-0234', email: null, address: '81 Fairview Ave, Clawson, MI', project_type: 'Irrigation repair', estimated_hours: 4, message: 'Missed call — a sprinkler zone stopped working, has a leak.', status: 'contacted', source: 'missed_call', createdDaysAgo: 5, respondedHoursAfter: 3 },
  { id: 'lead-4', name: 'Megan Ostrowski', phone: '(248) 555-0245', email: 'megan.o@example.com', address: '33 Hartford Rd, Berkley, MI', project_type: 'Retaining wall', estimated_hours: 50, message: 'Referred by a past client — needs a retaining wall like the one you built.', status: 'contacted', source: 'referral', createdDaysAgo: 6, respondedHoursAfter: 5 },
  { id: 'lead-5', name: 'Chris Bellamy', phone: '(248) 555-0256', email: 'chris.bellamy@example.com', address: '58 Northgate Dr, Troy, MI', project_type: 'Full backyard makeover', estimated_hours: 72, message: 'Sent a quote for a patio, plantings, and new sod in the backyard.', status: 'quoted', source: 'website_form', createdDaysAgo: 12, respondedHoursAfter: 8 },
  { id: 'lead-6', name: 'Karen Whitfield', phone: '(248) 555-0110', email: 'karen.whitfield@example.com', address: '1418 Maplewood Ave, Royal Oak, MI', project_type: 'Paver patio', estimated_hours: 46, message: 'Signed and scheduled — converted to job J-1001.', status: 'won', source: 'website_form', createdDaysAgo: 112, respondedHoursAfter: 6, convertedJob: 'job-1' },
  { id: 'lead-7', name: 'Grace Foster', phone: '(248) 555-0176', email: 'grace.foster@example.com', address: '65 Windemere Ave, Ferndale, MI', project_type: 'Drainage / French drain', estimated_hours: 34, message: 'Signed and scheduled — converted to job J-1007.', status: 'won', source: 'referral', createdDaysAgo: 35, respondedHoursAfter: 4, convertedJob: 'job-7' },
  { id: 'lead-8', name: 'Ronald Speer', phone: '(248) 555-0267', email: null, address: '4 Cresswell Ct, Clawson, MI', project_type: 'Spring cleanup', estimated_hours: 6, message: 'Went with a lower-cost provider for a one-time cleanup.', status: 'lost', source: 'manual', createdDaysAgo: 20, respondedHoursAfter: 12 },
];

function leadCreatedAt(seed: LeadSeed): string {
  return seed.createdHoursAgo === undefined ? daysAgo(seed.createdDaysAgo ?? 0) : hoursAgo(seed.createdHoursAgo);
}

function leadUpdatedAt(seed: LeadSeed): string {
  const createdAt = new Date(leadCreatedAt(seed));
  if (seed.respondedHoursAfter === undefined) return createdAt.toISOString();
  createdAt.setHours(createdAt.getHours() + seed.respondedHoursAfter);
  return createdAt.toISOString();
}

// The same argument as the job filler: eight leads is not a funnel. Insights
// divides quoted-by-total and won-by-quoted, and on eight rows one lead moves
// the conversion rate by twelve points — so the chart a prospect is being asked
// to trust was really showing rounding. These are the closed ones from the same
// quarter, so the rate settles where a good landscape shop's actually sits.
function buildFillLeads(): LeadSeed[] {
  const rand = seededRandom(778_112);
  const seeds: LeadSeed[] = [];
  const sources: LeadSource[] = ['website_form', 'website_form', 'website_form', 'referral', 'missed_call', 'manual'];

  for (let i = 0; i < 46; i++) {
    const client = FILL_CLIENTS[Math.floor(rand() * FILL_CLIENTS.length)];
    const work = FILL_WORK[Math.floor(rand() * FILL_WORK.length)];
    const roll = rand();
    // Roughly half of what came in turned into work, a third was quoted and
    // went quiet, the rest went elsewhere. Every one of them got a reply.
    const status: LeadStatus = roll < 0.46 ? 'won' : roll < 0.78 ? 'lost' : 'quoted';
    seeds.push({
      id: `lead-f${i + 1}`,
      name: client.name,
      phone: client.phone,
      email: null,
      address: client.address,
      project_type: work.scope.split(' — ')[0].replace(/\.$/, ''),
      estimated_hours: work.hours,
      message: work.scope,
      status,
      source: sources[Math.floor(rand() * sources.length)],
      createdDaysAgo: 8 + Math.floor(rand() * 82),
      respondedHoursAfter: 1 + Math.floor(rand() * 9),
    });
  }
  return seeds;
}

const ALL_LEAD_SEEDS: LeadSeed[] = [...LEAD_SEEDS, ...buildFillLeads()];

export const DEMO_LEADS: Lead[] = ALL_LEAD_SEEDS.map((seed) => ({
  id: seed.id,
  account_id: DEMO_ACCOUNT_ID,
  source: seed.source,
  status: seed.status,
  name: seed.name,
  phone: seed.phone,
  email: seed.email,
  address: seed.address,
  project_type: seed.project_type,
  estimated_hours: seed.estimated_hours,
  quote_visit: null,
  message: seed.message,
  photo_paths: [],
  source_page: seed.source === 'website_form' ? '/' : null,
  converted_job: seed.convertedJob ?? null,
  client_id: null,
  triage: null,
  lat: null,
  lng: null,
  geocoded_at: null,
  updated_at: leadUpdatedAt(seed),
  created_at: leadCreatedAt(seed),
}));

// --- Sidebar attention badges -------------------------------------------------
// The live dashboard rail shows a small count beside Leads / Jobs / Schedule for
// what needs the owner's attention (see app-shell.tsx + /api/account/status).
// The demo mirrors that, computed from the same seed data these pages render so a
// badge always matches the number on the page it links to:
//   Leads    → new website leads awaiting a first response
//   Jobs     → quote requests still in the approval stage (new_lead)
//   Schedule → active jobs that still need a date (matches the schedule page's
//              "Needs a date" metric)
export const DEMO_NAV_COUNTS = {
  leads: DEMO_LEADS.filter((lead) => lead.source === 'website_form' && lead.status === 'new').length,
  jobs: DEMO_JOBS.filter((job) => job.status === 'new_lead').length,
  schedule: DEMO_JOBS.filter((job) => job.status !== 'archived' && !job.scheduled_for).length,
} as const;

// --- Cash flow ----------------------------------------------------------------
// The forecast page is handed a list of dated money movements and does the rest
// in the browser, so the demo only has to supply the list. Wherever a number can
// be DERIVED from the jobs above it is, for the same reason DEMO_NAV_COUNTS is
// derived: a demo whose pages quietly disagree with each other is worse than one
// with fewer pages.

/** Payroll for five crew across a 40-hour week, at the rates on the roster. */
const DEMO_WEEKLY_PAYROLL = Math.round(
  DEMO_CREW.filter((member) => member.active).reduce((sum, member) => sum + (member.hourly_rate ?? 0) * 38, 0),
);

export const DEMO_CASH_BILLS: ScheduledPayment[] = [
  { id: 'bill-1', label: 'Shop rent', amount: 2400, direction: 'out', category: 'bill', dueDate: dateKeyFromNow(6), recurrence: 'monthly', endsOn: null, confirmed: true, active: true, note: null },
  { id: 'bill-2', label: 'Truck & equipment loan', amount: 1180, direction: 'out', category: 'loan', dueDate: dateKeyFromNow(12), recurrence: 'monthly', endsOn: null, confirmed: true, active: true, note: '2022 F-350 and the mini skid' },
  { id: 'bill-3', label: 'General liability insurance', amount: 640, direction: 'out', category: 'bill', dueDate: dateKeyFromNow(19), recurrence: 'monthly', endsOn: null, confirmed: true, active: true, note: null },
  { id: 'bill-4', label: 'Quarterly sales tax', amount: 3150, direction: 'out', category: 'tax', dueDate: dateKeyFromNow(27), recurrence: 'once', endsOn: null, confirmed: true, active: true, note: 'Q3 filing' },
  { id: 'bill-5', label: 'Fuel & yard waste disposal', amount: 890, direction: 'out', category: 'materials', dueDate: dateKeyFromNow(9), recurrence: 'monthly', endsOn: null, confirmed: false, active: true, note: 'Averaged from the last three months' },
  { id: 'bill-6', label: 'Winter equipment storage', amount: 450, direction: 'out', category: 'bill', dueDate: dateKeyFromNow(40), recurrence: 'monthly', endsOn: null, confirmed: true, active: false, note: 'Paused until November' },
];

function cashEvent(
  id: string,
  offset: number,
  label: string,
  detail: string,
  amount: number,
  kind: CashEvent['kind'],
  extra: Partial<Pick<CashEvent, 'confirmed' | 'slips' | 'repeating' | 'href'>> = {},
): CashEvent {
  return {
    id,
    dateKey: dateKeyFromNow(offset),
    label,
    detail,
    amount,
    kind,
    confirmed: extra.confirmed ?? true,
    slips: extra.slips ?? false,
    repeating: extra.repeating ?? false,
    href: extra.href ?? null,
  };
}

/** Payroll every second Friday, which is what DEMO_PAYROLL_MODE says happens. */
const DEMO_PAYROLL_EVENTS: CashEvent[] = [3, 17, 31, 45].map((offset, index) =>
  cashEvent(
    `payroll-${index}`,
    offset,
    'Crew payroll',
    index === 0 ? 'Approved hours · 4 crew' : 'Projected from your recent periods',
    -DEMO_WEEKLY_PAYROLL * 2,
    'payroll',
    { confirmed: index === 0, repeating: true, href: '/demo/payroll' },
  ),
);

/** Money in from the jobs already on the calendar, less the deposit collected. */
const DEMO_JOB_INCOME: CashEvent[] = DEMO_JOBS.filter(
  (job) => job.scheduled_for && (job.status === 'in_progress' || job.status === 'complete'),
)
  // The whole forward window, not the first two months of it. The page offers a
  // 90-day tab and this used to stop supplying it events at day 60, so the last
  // third of the forecast flat-lined — which reads as "no work booked", the
  // opposite of what the calendar behind it says.
  .filter((job) => {
    const offset = Math.round((new Date(job.scheduled_for as string).getTime() - Date.now()) / 86400000);
    return offset >= -2 && offset <= 90;
  })
  .map((job, index) => {
    const offset = Math.round((new Date(job.scheduled_for as string).getTime() - Date.now()) / 86400000);
    const balance = job.quoted_amount - Math.round(job.quoted_amount * 0.3);
    return cashEvent(
      `job-in-${index}`,
      offset + 9,
      `${job.client_name} — final`,
      `${job.ref} · balance after deposit`,
      balance,
      'final',
      { confirmed: false, slips: true, href: `/demo/jobs/${job.id}` },
    );
  });

export const DEMO_CASH_EVENTS: CashEvent[] = [
  ...DEMO_PAYROLL_EVENTS,
  ...DEMO_JOB_INCOME,
  cashEvent('bill-rent', 6, 'Shop rent', 'Bill · monthly', -2400, 'bill', { repeating: true }),
  cashEvent('bill-loan', 12, 'Truck & equipment loan', 'Loan · monthly', -1180, 'loan', { repeating: true }),
  cashEvent('bill-ins', 19, 'General liability insurance', 'Bill · monthly', -640, 'bill', { repeating: true }),
  cashEvent('bill-tax', 27, 'Quarterly sales tax', 'Tax · Q3 filing', -3150, 'tax'),
  cashEvent('bill-fuel', 9, 'Fuel & yard waste disposal', 'Materials · averaged', -890, 'materials', { confirmed: false, repeating: true }),
  cashEvent('mat-1', 1, 'Green Valley Landscape Supply', 'Materials · Patterson patio', -5580, 'materials'),
  cashEvent('mat-2', 8, 'Stone & paver order', 'Materials · Alvarez walkway', -2960, 'materials', { confirmed: false }),
  cashEvent('rec-1', 4, 'Maintenance plans', 'Recurring · 34 properties', 4420, 'recurring', { repeating: true, href: '/demo/recurring' }),
  cashEvent('rec-2', 18, 'Maintenance plans', 'Recurring · 34 properties', 4420, 'recurring', { repeating: true, href: '/demo/recurring' }),
  cashEvent('rec-3', 32, 'Maintenance plans', 'Recurring · 34 properties', 4420, 'recurring', { repeating: true, href: '/demo/recurring' }),
  cashEvent('dep-1', 2, 'Harmon deposit', 'J-1013 · 30% to start', 6840, 'deposit', { confirmed: false, slips: true, href: '/demo/jobs/job-13' }),
  cashEvent('dep-2', 11, 'Bishop deposit', 'J-1012 · 30% to start', 1620, 'deposit', { confirmed: false, slips: true, href: '/demo/jobs/job-12' }),
  cashEvent('inst-1', 14, 'Sutton payment plan', '2 of 3 · $1,200 each', 1200, 'installment', { repeating: true }),
  cashEvent('inst-2', 44, 'Sutton payment plan', '3 of 3 · $1,200 each', 1200, 'installment', { repeating: true }),
].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

export const DEMO_CASH_SETTINGS = {
  balance: 18_400,
  buffer: 5_000,
  creditLine: 10_000,
  /** Days between sending a payment request and the money landing. */
  paymentLagDays: 6,
} as const;

// --- Instant online booking ---------------------------------------------------
export const DEMO_BOOKING = {
  enabled: true,
  weekdays: [1, 2, 3, 4, 5],
  windows: ['08:00', '11:00', '14:00'],
  maxPerDay: 3,
  leadDays: 1,
  timezone: 'America/Detroit',
  url: `https://${DEMO_SITE_HOST}/book`,
  openDayCount: 5,
  openWindowCount: 11,
  /** Value gate — small jobs still come through as a request to price. */
  instantBookMinAmount: 400,
  radiusMiles: 15,
  blocks: [
    { id: 'blk-1', dateKey: dateKeyFromNow(4), reason: 'Equipment service day' },
    { id: 'blk-2', dateKey: dateKeyFromNow(23), reason: 'Crew training' },
  ],
  pending: [
    { id: 'bk-1', name: 'Alicia Moreno', address: '212 Sheffield Ave, Royal Oak, MI', service: 'Spring cleanup & mulch', requestedFor: dateKeyFromNow(3), window: '8:00 – 10:00 AM', requestedHoursAgo: 4, estimate: 780 },
    { id: 'bk-2', name: 'Devin Walsh', address: '77 Kenwood St, Berkley, MI', service: 'Sod repair, side yard', requestedFor: dateKeyFromNow(6), window: '2:00 – 4:00 PM', requestedHoursAgo: 19, estimate: 1450 },
  ],
} as const;

// --- Quick Stops --------------------------------------------------------------
export const DEMO_QUICK_STOPS = {
  enabled: true,
  /** Cents, like the real thing — Stripe never sees a float. */
  feeCents: 4900,
  radiusMiles: 6,
  cutoffTime: '14:00',
  maxPerDay: 2,
  todayTaken: 1,
  requests: [
    {
      id: 'qs-1', name: 'Priya Shah', phone: '(248) 555-0223', address: '6 Willowbrook Ln, Ferndale, MI',
      what: 'Mower threw a belt into the hedge — need it cleared before a showing at 5.',
      status: 'accepted' as const, minutesAgo: 38, detourMinutes: 7, feeCents: 4900, slot: '3:15 – 3:45 PM',
    },
    {
      id: 'qs-2', name: 'Nathan Boyd', phone: '(248) 555-0288', address: '431 Lincoln Ave, Royal Oak, MI',
      what: 'One dead shrub replaced — same street as your Rosewood job.',
      status: 'waiting' as const, minutesAgo: 11, detourMinutes: 3, feeCents: 4900, slot: null,
    },
    {
      id: 'qs-3', name: 'Colleen Barr', phone: '(248) 555-0291', address: '18 Farnum Rd, Madison Heights, MI',
      what: 'Full backyard regrade, wants it started today.',
      status: 'declined' as const, minutesAgo: 96, detourMinutes: 21, feeCents: 4900, slot: null,
      declineReason: 'Too big for a stop — sent back as a normal quote request',
    },
  ],
  /** The two halves of the demand panel: what you screened, and what you turned away. */
  demand: {
    windowDays: 90,
    asked: 42,
    accepted: 27,
    declined: 15,
    earned: 132_300,
    refusedReasons: [
      { reason: 'Outside your radius', count: 6 },
      { reason: 'Asked after your cutoff', count: 5 },
      { reason: 'Day was already full', count: 3 },
      { reason: 'Too big for a stop', count: 1 },
    ],
  },
} as const;

// --- Plan my day --------------------------------------------------------------
export const DEMO_ROUTE = {
  dateKey: dateKeyFromNow(0),
  startAddress: '4820 Coolidge Hwy, Royal Oak, MI',
  workdayStart: '07:30',
  totalDriveMinutes: 47,
  totalMiles: 21.4,
  stops: [
    { id: 'job-9', order: 1, client: 'Renee Patterson', address: '5 Rosewood Ct, Berkley, MI', arrive: '7:30 AM', hours: 6, driveMinutes: 9, miles: 3.8, kind: 'job' as const, crew: ['Mike Torres', 'Jamal Reed'] },
    { id: 'qs-1', order: 2, client: 'Priya Shah', address: '6 Willowbrook Ln, Ferndale, MI', arrive: '3:15 PM', hours: 0.5, driveMinutes: 12, miles: 5.1, kind: 'quick-stop' as const, crew: ['Mike Torres'] },
    { id: 'supply-1', order: 3, client: 'Green Valley Landscape Supply', address: '2900 Hilton Rd, Ferndale, MI', arrive: '4:05 PM', hours: 0.4, driveMinutes: 8, miles: 3.2, kind: 'supply' as const, crew: [] },
    { id: 'job-10', order: 4, client: 'Diego Alvarez', address: '88 Cloverdale Dr, Clawson, MI', arrive: '4:45 PM', hours: 1.5, driveMinutes: 18, miles: 9.3, kind: 'job' as const, crew: ['Sam Whitaker'] },
  ],
} as const;
