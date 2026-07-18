// Static, fully-fictional dataset that powers the logged-out "/demo" section —
// a read-only replica of the real dashboard showing what an established,
// ~$400K/yr contracting business looks like inside the product. No Supabase
// calls happen anywhere in this module; everything here is hardcoded so the
// demo works instantly with zero auth and zero backend cost.
import { computeMargin, type Cost, type Job, type JobStatus } from '@/lib/jobs';
import type { CrewMember } from '@/lib/crew';
import type { Lead, LeadSource, LeadStatus } from '@/lib/leads';

export const DEMO_ACCOUNT_ID = 'demo-account';
export const DEMO_COMPANY_NAME = 'Northline Builders';
export const DEMO_OWNER_NAME = 'Dana Whitfield';
// Trailing 12-month PAID volume — distinct from quoted job values below,
// same as the real dashboard (trailing volume only counts money collected).
export const DEMO_TRAILING_VOLUME = 406_500;

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
  { id: 'crew-1', account_id: DEMO_ACCOUNT_ID, name: 'Mike Torres', phone: '(248) 555-0142', role_label: 'Lead Carpenter', hourly_rate: 34, user_id: null, active: true, created_at: daysAgo(700) },
  { id: 'crew-2', account_id: DEMO_ACCOUNT_ID, name: 'Jamal Reed', phone: '(248) 555-0198', role_label: 'Carpenter', hourly_rate: 28, user_id: null, active: true, created_at: daysAgo(620) },
  { id: 'crew-3', account_id: DEMO_ACCOUNT_ID, name: 'Sam Whitaker', phone: '(248) 555-0163', role_label: 'Laborer', hourly_rate: 22, user_id: null, active: true, created_at: daysAgo(500) },
  { id: 'crew-4', account_id: DEMO_ACCOUNT_ID, name: 'Elena Ruiz', phone: '(248) 555-0177', role_label: 'Project Manager', hourly_rate: 30, user_id: null, active: true, created_at: daysAgo(400) },
  { id: 'crew-5', account_id: DEMO_ACCOUNT_ID, name: 'Danny Cole', phone: '(248) 555-0119', role_label: 'Electrician (Sub)', hourly_rate: 45, user_id: null, active: false, created_at: daysAgo(300) },
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
  scheduledOffset: number | null; // days from today; null = unscheduled
  scheduledTime?: string | null;
  createdDaysAgo: number;
  hasCosts: boolean;
};

const JOB_SEEDS: JobSeed[] = [
  { id: 'job-1', ref: 'J-1001', client_name: 'Karen Whitfield', client_phone: '(248) 555-0110', address: '1418 Maplewood Ave, Royal Oak, MI', scope: 'Full roof tear-off & re-shingle, gutter replacement.', status: 'complete', quoted_amount: 38500, scheduledOffset: -95, scheduledTime: '08:30', createdDaysAgo: 112, hasCosts: true },
  { id: 'job-2', ref: 'J-1002', client_name: 'Marcus Delgado', client_phone: '(248) 555-0121', address: '922 Birchcrest Dr, Ferndale, MI', scope: 'Full kitchen remodel — cabinets, counters, island, flooring.', status: 'complete', quoted_amount: 52000, scheduledOffset: -80, scheduledTime: '09:00', createdDaysAgo: 96, hasCosts: true },
  { id: 'job-3', ref: 'J-1003', client_name: 'Isabel Reyes', client_phone: '(248) 555-0132', address: '77 Lakeview Ct, Berkley, MI', scope: 'New primary bath addition with walk-in shower.', status: 'complete', quoted_amount: 29800, scheduledOffset: -65, scheduledTime: '10:30', createdDaysAgo: 82, hasCosts: true },
  { id: 'job-4', ref: 'J-1004', client_name: 'Tom Carmichael', client_phone: '(248) 555-0143', address: '350 Elmwood St, Clawson, MI', scope: 'Tear-off and architectural shingle replacement.', status: 'complete', quoted_amount: 24200, scheduledOffset: -50, scheduledTime: '08:00', createdDaysAgo: 66, hasCosts: true },
  { id: 'job-5', ref: 'J-1005', client_name: 'Yuki Nakamura', client_phone: '(248) 555-0154', address: '48 Hollow Rd, Troy, MI', scope: 'Two-story rear addition — family room and bedroom above.', status: 'complete', quoted_amount: 61500, scheduledOffset: -40, scheduledTime: '13:00', createdDaysAgo: 58, hasCosts: true },
  { id: 'job-6', ref: 'J-1006', client_name: "Brian O'Malley", client_phone: '(248) 555-0165', address: '210 Sunridge Ln, Royal Oak, MI', scope: 'Composite deck build with paver patio and pergola.', status: 'complete', quoted_amount: 18900, scheduledOffset: -30, scheduledTime: '11:00', createdDaysAgo: 44, hasCosts: true },
  { id: 'job-7', ref: 'J-1007', client_name: 'Grace Foster', client_phone: '(248) 555-0176', address: '65 Windemere Ave, Ferndale, MI', scope: 'Full basement finish with wet bar and home theater.', status: 'complete', quoted_amount: 44300, scheduledOffset: -20, scheduledTime: '09:30', createdDaysAgo: 33, hasCosts: true },
  { id: 'job-8', ref: 'J-1008', client_name: 'Paul Grant', client_phone: '(248) 555-0187', address: '19 Featherstone Rd, Troy, MI', scope: 'Full exterior siding replacement with new trim.', status: 'complete', quoted_amount: 33700, scheduledOffset: -10, scheduledTime: '14:00', createdDaysAgo: 24, hasCosts: true },
  { id: 'job-9', ref: 'J-1009', client_name: 'Renee Patterson', client_phone: '(248) 555-0198', address: '5 Rosewood Ct, Berkley, MI', scope: 'Kitchen refresh plus guest bath remodel.', status: 'in_progress', quoted_amount: 46800, scheduledOffset: 0, scheduledTime: '08:00', createdDaysAgo: 14, hasCosts: true },
  { id: 'job-10', ref: 'J-1010', client_name: 'Diego Alvarez', client_phone: '(248) 555-0109', address: '88 Cloverdale Dr, Clawson, MI', scope: 'Ground-up two-car garage with bonus room above.', status: 'in_progress', quoted_amount: 58200, scheduledOffset: 3, scheduledTime: '10:00', createdDaysAgo: 10, hasCosts: true },
  { id: 'job-11', ref: 'J-1011', client_name: 'Holly Sutton', client_phone: '(248) 555-0120', address: '140 Brookfield Ave, Royal Oak, MI', scope: 'Roof replacement and seamless gutter install.', status: 'in_progress', quoted_amount: 22400, scheduledOffset: 6, scheduledTime: '07:30', createdDaysAgo: 7, hasCosts: true },
  { id: 'job-12', ref: 'J-1012', client_name: 'Owen Bishop', client_phone: '(248) 555-0131', address: '27 Ashgrove Ln, Ferndale, MI', scope: 'Three-season sunroom addition off the back of the house.', status: 'new_lead', quoted_amount: 19500, scheduledOffset: null, createdDaysAgo: 3, hasCosts: false },
  { id: 'job-13', ref: 'J-1013', client_name: 'Nina Harmon', client_phone: '(248) 555-0142', address: '9 Timberline Dr, Troy, MI', scope: 'Cedar privacy fence and front walkway hardscape.', status: 'new_lead', quoted_amount: 12800, scheduledOffset: null, createdDaysAgo: 1, hasCosts: false },
];

export const DEMO_JOBS: Job[] = JOB_SEEDS.map((seed) => ({
  id: seed.id,
  account_id: DEMO_ACCOUNT_ID,
  ref: seed.ref,
  client_name: seed.client_name,
  client_phone: seed.client_phone,
  address: seed.address,
  scope: seed.scope,
  status: seed.status,
  scheduled_for: seed.scheduledOffset === null ? null : dateKeyFromNow(seed.scheduledOffset),
  scheduled_time: seed.scheduledOffset === null ? null : seed.scheduledTime ?? null,
  quoted_amount: seed.quoted_amount,
  photo_paths: [],
  created_at: daysAgo(seed.createdDaysAgo),
}));

function buildCosts(job: Job): Cost[] {
  const revenue = job.quoted_amount;
  const materials = Math.round(revenue * 0.36);
  const laborAmount = Math.round(revenue * 0.22);
  const laborHours = Math.round(laborAmount / 32);
  const subAmount = Math.round(revenue * 0.09);

  return [
    {
      id: `${job.id}-cost-materials`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, type: 'material',
      category: 'Materials', description: 'Lumber, fixtures & supplies', amount: materials,
      supplier: 'Riverton Supply Co.', receipt_url: null, crew_id: null, hours: null, rate: null, created_at: job.created_at,
    },
    {
      id: `${job.id}-cost-labor`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, type: 'labor',
      category: 'Labor', description: 'Crew labor', amount: laborAmount,
      supplier: null, receipt_url: null, crew_id: DEMO_CREW[0].id, hours: laborHours, rate: 32, created_at: job.created_at,
    },
    {
      id: `${job.id}-cost-sub`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, type: 'sub',
      category: 'Subcontractor', description: 'Electrical subcontractor', amount: subAmount,
      supplier: 'Cole Electric', receipt_url: null, crew_id: null, hours: null, rate: null, created_at: job.created_at,
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
  message: string;
  status: LeadStatus;
  source: LeadSource;
  createdDaysAgo?: number;
  createdHoursAgo?: number;
  respondedHoursAfter?: number;
  convertedJob?: string;
};

const LEAD_SEEDS: LeadSeed[] = [
  { id: 'lead-1', name: 'Taylor Brooks', phone: '(248) 555-0212', email: 'taylor.brooks@example.com', address: '14 Pinehurst Dr, Royal Oak, MI', project_type: 'Kitchen remodel', message: 'Looking to remodel our kitchen this spring, ballpark budget $40-50k.', status: 'new', source: 'website_form', createdHoursAgo: 2 },
  { id: 'lead-2', name: 'Priya Shah', phone: '(248) 555-0223', email: 'priya.shah@example.com', address: '6 Willowbrook Ln, Ferndale, MI', project_type: 'Deck build', message: 'Want a composite deck, roughly 300 sq ft.', status: 'new', source: 'website_form', createdHoursAgo: 7 },
  { id: 'lead-3', name: 'Andre Coleman', phone: '(248) 555-0234', email: null, address: '81 Fairview Ave, Clawson, MI', project_type: 'Roof repair', message: 'Missed call - leak near chimney flashing.', status: 'contacted', source: 'missed_call', createdDaysAgo: 5, respondedHoursAfter: 3 },
  { id: 'lead-4', name: 'Megan Ostrowski', phone: '(248) 555-0245', email: 'megan.o@example.com', address: '33 Hartford Rd, Berkley, MI', project_type: 'Bathroom addition', message: 'Referred by a past client, wants a similar bath addition.', status: 'contacted', source: 'referral', createdDaysAgo: 6, respondedHoursAfter: 5 },
  { id: 'lead-5', name: 'Chris Bellamy', phone: '(248) 555-0256', email: 'chris.bellamy@example.com', address: '58 Northgate Dr, Troy, MI', project_type: 'Home addition', message: 'Sent a quote for a 400 sq ft rear addition.', status: 'quoted', source: 'website_form', createdDaysAgo: 12, respondedHoursAfter: 8 },
  { id: 'lead-6', name: 'Karen Whitfield', phone: '(248) 555-0110', email: 'karen.whitfield@example.com', address: '1418 Maplewood Ave, Royal Oak, MI', project_type: 'Roof replacement', message: 'Signed and scheduled - converted to job J-1001.', status: 'won', source: 'website_form', createdDaysAgo: 112, respondedHoursAfter: 6, convertedJob: 'job-1' },
  { id: 'lead-7', name: 'Grace Foster', phone: '(248) 555-0176', email: 'grace.foster@example.com', address: '65 Windemere Ave, Ferndale, MI', project_type: 'Basement finish', message: 'Signed and scheduled - converted to job J-1007.', status: 'won', source: 'referral', createdDaysAgo: 35, respondedHoursAfter: 4, convertedJob: 'job-7' },
  { id: 'lead-8', name: 'Ronald Speer', phone: '(248) 555-0267', email: null, address: '4 Cresswell Ct, Clawson, MI', project_type: 'Fence quote', message: 'Went with a lower-cost provider.', status: 'lost', source: 'manual', createdDaysAgo: 20, respondedHoursAfter: 12 },
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
  message: seed.message,
  photo_paths: [],
  source_page: seed.source === 'website_form' ? '/' : null,
  converted_job: seed.convertedJob ?? null,
  updated_at: leadUpdatedAt(seed),
  created_at: leadCreatedAt(seed),
}));
