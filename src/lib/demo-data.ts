// Static, fully-fictional dataset that powers the logged-out "/demo" section —
// a read-only replica of the real dashboard showing what an established lawn &
// landscape business looks like inside the product. No Supabase calls happen
// anywhere in this module; everything here is hardcoded so the demo works
// instantly with zero auth and zero backend cost.
import { computeMargin, type Cost, type Job, type JobStatus } from '@/lib/jobs';
import type { CrewMember } from '@/lib/crew';
import type { Lead, LeadSource, LeadStatus } from '@/lib/leads';

export const DEMO_ACCOUNT_ID = 'demo-account';
export const DEMO_COMPANY_NAME = 'Evergreen Lawn & Landscape';
export const DEMO_OWNER_NAME = 'Dana Whitfield';
export const DEMO_SITE_HOST = 'evergreenlawn.letsgetquoted.com';
export const DEMO_SERVICE_AREA = 'Royal Oak & Metro Detroit';
// Trailing 12-month PAID volume — distinct from quoted job values below, same as
// the real dashboard (trailing volume only counts money actually collected). A
// lawn & landscape shop runs more, smaller jobs plus recurring maintenance.
export const DEMO_TRAILING_VOLUME = 312_500;

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

export const DEMO_JOBS: Job[] = JOB_SEEDS.map((seed) => ({
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

const JOB_SEED_BY_ID = new Map(JOB_SEEDS.map((seed) => [seed.id, seed]));

export const DEMO_COSTS: Record<string, Cost[]> = Object.fromEntries(
  DEMO_JOBS.filter((job) => JOB_SEED_BY_ID.get(job.id)?.hasCosts).map((job) => [job.id, buildCosts(job)])
);

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

export const DEMO_LEADS: Lead[] = LEAD_SEEDS.map((seed) => ({
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
