import {
  DEMO_ACCOUNT_ID,
  DEMO_BOOKING,
  DEMO_COMPANY_NAME,
  DEMO_COSTS,
  DEMO_CREW,
  DEMO_JOBS,
  DEMO_LEADS,
  DEMO_QUICK_STOPS,
  DEMO_SERVICE_AREA,
  DEMO_SITE_HOST,
  dateKeyFromNow,
} from '@/lib/demo-data';
import { createDemoSupabase, type DemoRow, type DemoTables } from '@/lib/demo-supabase';
import { normalizeUsPhone } from '@/lib/phone';

/**
 * The demo account, in the shape the database would hold it.
 *
 * demo-data.ts models the demo as the app's own TYPES — a Job, a Lead, a
 * CrewMember — which is what the hand-drawn demo pages needed. The real page
 * builders read ROWS: payments with a paid_at, invoices with line items, feed
 * events with a kind. This file is the bridge, and it derives everything from
 * the same seed so a figure cannot disagree with itself across two screens.
 *
 * Everything here is DERIVED, never independently invented. The invoices are
 * the jobs' own quoted amounts; the payments are those invoices; the feed
 * events are the moments those jobs actually reached. That is the property that
 * matters: Insights adds these up and has to arrive at the numbers the Jobs
 * page shows, because a demo whose revenue card contradicts its job list is
 * worse than no demo.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function daysAgoFrom(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

/** Stable pseudo-random in [0,1) from a string, so the demo never flickers. */
function seeded(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

// --- Clients ------------------------------------------------------------------
// One per distinct name on a job. The demo's Job rows carry client_id: null
// (they predate the clients table); the rows below re-link them, which is what
// makes repeat-customer and inactivity figures mean anything at all.

const CLIENT_ID_BY_NAME = new Map<string, string>();
for (const job of DEMO_JOBS) {
  if (!CLIENT_ID_BY_NAME.has(job.client_name)) {
    CLIENT_ID_BY_NAME.set(job.client_name, `demo-client-${CLIENT_ID_BY_NAME.size + 1}`);
  }
}

/** "Dana Whitfield" -> "dana.whitfield@example.com". */
function demoEmail(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.');
  // example.com is reserved by RFC 2606 precisely so it can appear in
  // documentation and never reach a real inbox.
  return `${slug}@example.com`;
}

export const DEMO_CLIENT_ROWS: DemoRow[] = [...CLIENT_ID_BY_NAME.entries()].map(([name, id], index) => {
  const firstJob = DEMO_JOBS.find((job) => job.client_name === name)!;
  return {
    id,
    account_id: DEMO_ACCOUNT_ID,
    name,
    phone: firstJob.client_phone,
    // Most of the book is emailable and a few are not, because that is what a
    // real list looks like and it is what the campaign composer's reach counts
    // exist to show. A demo where every audience is 100% reachable makes the
    // composer's whole "who can you actually reach" panel look like decoration.
    email: index % 7 === 3 ? null : demoEmail(name),
    address: firstJob.address,
    notes: null,
    created_at: firstJob.created_at,
  };
});

// Texting consent. Opt-in is per phone number and the campaign sender checks it
// before every SMS, so without these rows the demo's SMS reach is zero and the
// channel picker looks broken rather than conservative.
// phone_number and status='opted_in' are the column names loadOptedInPhones
// actually filters on, and the number is normalised the same way loadRecipients
// normalises the client's — a consent row that does not match byte-for-byte is
// a consent row that silently grants nothing.
export const DEMO_SMS_CONSENT_ROWS: DemoRow[] = DEMO_CLIENT_ROWS
  .filter((_, index) => index % 3 !== 2)
  .map((client, index) => ({
    id: `demo-consent-${index + 1}`,
    account_id: DEMO_ACCOUNT_ID,
    phone_number: normalizeUsPhone(String(client.phone ?? '')),
    status: 'opted_in',
    opted_in_at: daysAgo(200 - index),
    opted_out_at: null,
  }))
  .filter((row) => row.phone_number);

// --- Jobs ---------------------------------------------------------------------
// The demo Jobs, plus the two columns the row-readers need that the display
// type does not carry: which client they belong to, and where the work came
// from. lead_source is spread across the channels so the "where work comes
// from" breakdown has something truthful to divide.

const LEAD_SOURCES = ['website_form', 'referral', 'missed_call', 'manual'] as const;

// Approximate town centres in Evergreen's patch. Jobs are scattered around the
// one their address names, deterministically, so the client map and the route
// maps have something real to draw — a book of customers with no coordinates
// renders an empty map, which reads as broken rather than as unseeded.
//
// Deliberately jittered rather than exact: these are invented addresses, and
// pinning them to a genuine rooftop would be a worse kind of fiction.
const TOWN_CENTRES: Record<string, { lat: number; lng: number }> = {
  'royal oak': { lat: 42.4895, lng: -83.1446 },
  berkley: { lat: 42.5031, lng: -83.1838 },
  ferndale: { lat: 42.4606, lng: -83.1346 },
  birmingham: { lat: 42.5467, lng: -83.2113 },
  'madison heights': { lat: 42.4859, lng: -83.1054 },
  warren: { lat: 42.4775, lng: -83.0277 },
  'pleasant ridge': { lat: 42.4708, lng: -83.1424 },
  huntington: { lat: 42.4867, lng: -83.1631 },
  troy: { lat: 42.6064, lng: -83.1498 },
};

function coordsFor(address: string | null, seed: string): { lat: number; lng: number } | null {
  const haystack = (address ?? '').toLowerCase();
  const town = Object.keys(TOWN_CENTRES).find((name) => haystack.includes(name));
  if (!town) return null;
  const centre = TOWN_CENTRES[town]!;
  // ±~1.2km, stable per job.
  return {
    lat: Number((centre.lat + (seeded(`lat${seed}`) - 0.5) * 0.022).toFixed(6)),
    lng: Number((centre.lng + (seeded(`lng${seed}`) - 0.5) * 0.028).toFixed(6)),
  };
}

export const DEMO_JOB_ROWS: DemoRow[] = DEMO_JOBS.map((job) => {
  const point = coordsFor(job.address, job.id);
  return {
    ...job,
    client_id: CLIENT_ID_BY_NAME.get(job.client_name) ?? null,
    lead_source: LEAD_SOURCES[Math.floor(seeded(`src${job.id}`) * LEAD_SOURCES.length)],
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    geocoded_at: point ? job.created_at : null,
  };
});

// --- Invoices & line items ----------------------------------------------------
// One invoice per job that got past being a request. Status follows the job:
// finished work is paid, live work is signed, and a quote that has gone out but
// not come back is sent. invoice_items are pre-nested because the real query
// embeds them (`invoices.select('… invoice_items(description, amount)')`) and
// the demo client returns rows whole rather than parsing projections.

function invoiceStatus(status: string): string | null {
  if (status === 'complete') return 'paid';
  if (status === 'in_progress') return 'signed';
  if (status === 'new_lead') return 'sent';
  return null; // archived — no money story worth telling
}

export const DEMO_INVOICE_ROWS: DemoRow[] = DEMO_JOBS.flatMap((job) => {
  const status = invoiceStatus(job.status);
  if (!status || job.quoted_amount <= 0) return [];
  // The service line is the first clause of the scope — which is how an owner
  // would have written the line item, and what Revenue by service groups on.
  const service = (job.scope || 'Landscaping').split(/[,.—-]/)[0]!.trim().slice(0, 40) || 'Landscaping';
  return [
    {
      id: `${job.id}-inv`,
      account_id: DEMO_ACCOUNT_ID,
      job_id: job.id,
      total: job.quoted_amount,
      status,
      created_at: daysAgoFrom(job.created_at, 2),
      invoice_items: [{ description: service, amount: job.quoted_amount }],
    },
  ];
});

// --- Payments -----------------------------------------------------------------
// A 30% deposit and a balance, which is how the demo's own job detail already
// presents them. Completed work has both; live work has the deposit only. The
// balance lands DEMO_CASH paymentLagDays after it was asked for, so "typically
// paid in N days" has a real number to report rather than a placeholder.

const DEPOSIT_SHARE = 0.3;
const PAYMENT_LAG_DAYS = 6;

export const DEMO_PAYMENT_ROWS: DemoRow[] = DEMO_JOBS.flatMap((job) => {
  if (job.status === 'new_lead' || job.status === 'archived' || job.quoted_amount <= 0) return [];
  const deposit = Math.round(job.quoted_amount * DEPOSIT_SHARE);
  const balance = job.quoted_amount - deposit;
  const requestedAt = daysAgoFrom(job.created_at, 2);

  const rows: DemoRow[] = [
    {
      id: `${job.id}-pay-deposit`,
      account_id: DEMO_ACCOUNT_ID,
      job_id: job.id,
      amount: deposit,
      refunded_amount: 0,
      status: 'paid',
      requested_at: requestedAt,
      paid_at: daysAgoFrom(requestedAt, 1),
    },
  ];

  if (job.status === 'complete') {
    const balanceRequestedAt = daysAgoFrom(job.created_at, 9);
    rows.push({
      id: `${job.id}-pay-balance`,
      account_id: DEMO_ACCOUNT_ID,
      job_id: job.id,
      amount: balance,
      refunded_amount: 0,
      status: 'paid',
      requested_at: balanceRequestedAt,
      paid_at: daysAgoFrom(balanceRequestedAt, PAYMENT_LAG_DAYS),
    });
  }

  return rows;
});

// One card that bounced. Payment Health's whole purpose is to surface these, and
// a demo where that card is permanently empty teaches a prospect nothing about
// what the card is for.
const FAILED_JOB = DEMO_JOBS.find((job) => job.status === 'in_progress');
if (FAILED_JOB) {
  DEMO_PAYMENT_ROWS.push({
    id: `${FAILED_JOB.id}-pay-failed`,
    account_id: DEMO_ACCOUNT_ID,
    job_id: FAILED_JOB.id,
    amount: Math.round(FAILED_JOB.quoted_amount * 0.7),
    refunded_amount: 0,
    status: 'failed',
    requested_at: daysAgo(4),
    paid_at: null,
  });
}

// --- Job feed -----------------------------------------------------------------
// The four moments the funnel is measured between. A job has no completed_at or
// scheduled_at column — those exist only as feed events — so without these the
// funnel reads zero at every stage below "quoted".

export const DEMO_JOB_FEED_ROWS: DemoRow[] = DEMO_JOBS.flatMap((job) => {
  if (job.quoted_amount <= 0) return [];
  const rows: DemoRow[] = [
    { id: `${job.id}-fe-link`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, kind: 'client_link_created', amount: job.quoted_amount, created_at: daysAgoFrom(job.created_at, 1) },
  ];
  if (job.status !== 'new_lead') {
    rows.push({ id: `${job.id}-fe-approved`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, kind: 'quote_approved', amount: job.quoted_amount, created_at: daysAgoFrom(job.created_at, 2) });
  }
  if (job.scheduled_for) {
    rows.push({ id: `${job.id}-fe-sched`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, kind: 'job_scheduled', amount: null, created_at: daysAgoFrom(job.created_at, 3) });
  }
  if (job.status === 'complete') {
    rows.push({ id: `${job.id}-fe-done`, account_id: DEMO_ACCOUNT_ID, job_id: job.id, kind: 'job_completed', amount: null, created_at: daysAgoFrom(job.created_at, 8) });
  }
  return rows;
});

// --- Crew assignments ---------------------------------------------------------
// Two of the active crew on each scheduled job, chosen deterministically. The
// calendar's initials badge and Crew & Labor's hours both read this.

const ACTIVE_CREW = DEMO_CREW.filter((member) => member.active);

export const DEMO_CREW_ASSIGNMENT_ROWS: DemoRow[] = DEMO_JOBS.flatMap((job) => {
  if (!job.scheduled_for) return [];
  const first = Math.floor(seeded(`c1${job.id}`) * ACTIVE_CREW.length);
  const second = (first + 1 + Math.floor(seeded(`c2${job.id}`) * (ACTIVE_CREW.length - 1))) % ACTIVE_CREW.length;
  const ids = job.quoted_amount > 2000 ? [first, second] : [first];
  return ids.map((index) => ({
    id: `${job.id}-asg-${index}`,
    account_id: DEMO_ACCOUNT_ID,
    job_id: job.id,
    crew_id: ACTIVE_CREW[index]!.id,
  }));
});

// --- Recurring plans ----------------------------------------------------------
// Weekly mowing is the backbone of a landscaping book, so the demo has real
// agreements rather than an empty "Recurring / mo" figure.

// The full row shape, not just the three columns the cash figures needed —
// the Recurring page projects visits from these, so a plan without a cadence
// and a next_run_date produces an empty calendar and a $0 book.
//
// Deliberately mixed: one paused, one on autopay with no card (which is the
// specific problem the attention banner exists for), and one nearing the end of
// a fixed term. A book where every plan is healthy makes half of that page's
// states unreachable, and those states are most of what it is FOR.
const PLAN_TITLES = ['Weekly mowing', 'Biweekly mow & edge', 'Monthly bed maintenance', 'Weekly mowing', 'Seasonal cleanup plan', 'Biweekly mowing'];

export const DEMO_RECURRING_ROWS: DemoRow[] = DEMO_CLIENT_ROWS.slice(0, 6).map((client, index) => {
  const frequency = index % 3 === 0 ? 'biweekly' : index === 2 ? 'monthly' : 'weekly';
  const autoCharge = index !== 1 && index !== 4;
  // Plan 4 has autopay on and no card — the one the banner names.
  const hasCard = autoCharge && index !== 3;
  return {
    id: `demo-plan-${index + 1}`,
    account_id: DEMO_ACCOUNT_ID,
    client_id: client.id,
    title: PLAN_TITLES[index] ?? 'Recurring service',
    scope: null,
    client_name: client.name,
    client_phone: client.phone,
    client_email: client.email,
    address: client.address,
    amount: [180, 220, 145, 260, 195, 240][index] ?? 200,
    frequency,
    next_run_date: dateKeyFromNow([2, 5, 9, 3, 14, 6][index] ?? 7),
    active: index !== 5,
    auto_charge: autoCharge,
    remaining_cycles: index === 4 ? 3 : null,
    anchor_day: frequency === 'monthly' ? 12 : null,
    stripe_customer_id: hasCard ? `cus_demo${index}` : null,
    stripe_payment_method_id: hasCard ? `pm_demo${index}` : null,
    card_brand: hasCard ? 'visa' : null,
    card_last4: hasCard ? ['4242', '1881', '5556', null, '9021', '3310'][index] ?? null : null,
    last_job_id: null,
    last_run_at: daysAgo(14 - index),
    created_at: daysAgo(120 - index * 9),
    updated_at: daysAgo(14 - index),
  };
});

// --- Campaigns ----------------------------------------------------------------
// Marketing Performance reads these. Sent counts sit below recipient counts on
// purpose — an unsubscribe and a bounce are normal, and a demo showing a
// flawless 100% delivery every time misrepresents what the card is for.

// beat_id links a send back to the seasonal topic it came from, which is what
// strikes that topic through on the calendar. Two of the four carry one, so the
// demo's calendar shows both states — done recently, and still to do.
export const DEMO_CAMPAIGN_ROWS: DemoRow[] = [
  { id: 'demo-camp-1', account_id: DEMO_ACCOUNT_ID, channel: 'email', audience: 'past', beat_id: 'gutter-clear', subject: 'Gutters before the leaves drop', recipient_count: 212, email_sent: 205, sms_sent: 0, failed_count: 4, skipped_count: 3, created_at: daysAgo(9) },
  { id: 'demo-camp-2', account_id: DEMO_ACCOUNT_ID, channel: 'sms', audience: 'lapsed', beat_id: null, subject: null, recipient_count: 88, email_sent: 0, sms_sent: 86, failed_count: 2, skipped_count: 0, created_at: daysAgo(24) },
  { id: 'demo-camp-3', account_id: DEMO_ACCOUNT_ID, channel: 'email', audience: 'all', beat_id: 'storm-season', subject: 'Storm season is close', recipient_count: 341, email_sent: 330, sms_sent: 0, failed_count: 6, skipped_count: 5, created_at: daysAgo(41) },
  { id: 'demo-camp-4', account_id: DEMO_ACCOUNT_ID, channel: 'email', audience: 'repeat', beat_id: null, subject: 'Your spring slot is open', recipient_count: 64, email_sent: 63, sms_sent: 0, failed_count: 1, skipped_count: 0, created_at: daysAgo(58) },
];

// --- Clocked time in the CURRENT pay period -----------------------------------
// The labor costs in demo-data are dated to their job's creation, which is
// months back for most of the book — so every pay period the Crew & Labor page
// can actually open reads as empty, and the roster shows 0 hours against
// everyone. These are the shifts logged in the last fortnight, on the jobs that
// are scheduled now, which is what makes that page worth looking at.
//
// Written as `costs` rows of type 'labor' because that is where clocked time
// lands — see listLaborEntries.
const RECENT_SHIFT_DAYS = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];

export const DEMO_RECENT_LABOR_ROWS: DemoRow[] = DEMO_JOBS
  .filter((job) => job.scheduled_for && job.status !== 'archived')
  .slice(0, 10)
  .flatMap((job, jobIndex) => {
    const crewOnJob = ACTIVE_CREW[jobIndex % ACTIVE_CREW.length]!;
    const second = ACTIVE_CREW[(jobIndex + 1) % ACTIVE_CREW.length]!;
    const members = job.quoted_amount > 2000 ? [crewOnJob, second] : [crewOnJob];
    return members.map((member, memberIndex) => {
      const dayBack = RECENT_SHIFT_DAYS[(jobIndex + memberIndex) % RECENT_SHIFT_DAYS.length]!;
      // Whole and half days, which is what a landscaping timesheet looks like.
      const hours = [8, 6, 7.5, 4, 8][(jobIndex + memberIndex) % 5]!;
      const rate = Number(member.hourly_rate) || 24;
      return {
        id: `${job.id}-shift-${member.id}`,
        account_id: DEMO_ACCOUNT_ID,
        job_id: job.id,
        type: 'labor',
        category: 'Labor',
        description: job.scope?.split(/[,.]/)[0]?.trim() || 'Crew labor',
        amount: Math.round(hours * rate),
        supplier: null,
        receipt_url: null,
        client_charge_payment_id: null,
        client_charge_requested_at: null,
        crew_id: member.id,
        crew_name: member.name,
        crew_role_label: member.role_label,
        hours,
        rate,
        burden_amount: Math.round(hours * rate * 0.22),
        cost_source: 'clocked',
        created_at: daysAgo(dayBack),
      };
    });
  });

// --- Review invites -----------------------------------------------------------
// One ask per completed job, with about two thirds answered — which is a good
// response rate for a trade and still leaves the "N of M asked responded" figure
// meaning something. Ratings skew high because finished landscaping usually does,
// but not unanimously: a book with no 3-star in it looks curated.
//
// Both routes are represented, because the page's whole argument is that every
// customer is offered a public review AND a private word, and a demo where
// everyone went to Google would quietly undercut it.
const PRIVATE_NOTES = [
  'Crew was great. Only thing — the side gate was left open and the dog got into the front yard. No harm done.',
  'Beautiful work on the beds. Invoice came through a day before the job finished, which threw me for a second.',
  'Third year with you and the first time anyone has edged the driveway properly. Thank you.',
];

export const DEMO_REVIEW_INVITE_ROWS: DemoRow[] = DEMO_JOBS.filter((job) => job.status === 'complete').map((job, index) => {
  const responded = index % 3 !== 2;
  const rating = responded ? [5, 5, 4, 5, 3, 5, 4][index % 7]! : null;
  // High ratings mostly go public; a middling one mostly comes back privately.
  const wentPublic = responded && rating !== null && rating >= 4 && index % 4 !== 3;
  const leftPrivate = responded && (!wentPublic || index % 5 === 0);
  const respondedAt = responded ? daysAgoFrom(job.created_at, 11) : null;

  return {
    id: `${job.id}-review`,
    account_id: DEMO_ACCOUNT_ID,
    job_id: job.id,
    client_name: job.client_name,
    rating,
    feedback: leftPrivate ? PRIVATE_NOTES[index % PRIVATE_NOTES.length] : null,
    routed_to: wentPublic ? 'google' : leftPrivate ? 'private' : null,
    google_clicked_at: wentPublic ? respondedAt : null,
    feedback_at: leftPrivate ? respondedAt : null,
    responded_at: respondedAt,
    created_at: daysAgoFrom(job.created_at, 9),
  };
});

// --- Quick Stops --------------------------------------------------------------
// The three requests the demo already shows, as rows. Status maps onto the real
// lifecycle so the Quick Stop revenue and demand figures compute rather than
// being asserted.

export const DEMO_EXTRA_STOP_ROWS: DemoRow[] = DEMO_QUICK_STOPS.requests.map((request, index) => {
  const accepted = request.status === 'accepted';
  const createdAt = new Date(Date.now() - request.minutesAgo * 60 * 1000).toISOString();
  return {
    id: request.id,
    account_id: DEMO_ACCOUNT_ID,
    job_id: accepted ? DEMO_JOBS[index % DEMO_JOBS.length]!.id : null,
    payment_id: accepted ? `${request.id}-fee` : null,
    client_id: DEMO_CLIENT_ROWS[index % DEMO_CLIENT_ROWS.length]!.id,
    status: accepted ? 'completed' : request.status === 'waiting' ? 'offered' : 'declined',
    arrival_date: dateKeyFromNow(0),
    detour_miles: Math.round((request.detourMinutes / 2.4) * 10) / 10,
    route_extension_minutes: request.detourMinutes,
    offer_visit_minutes: 30,
    offer_sent_at: createdAt,
    paid_at: accepted ? createdAt : null,
    completed_at: accepted ? createdAt : null,
    created_at: createdAt,
  };
});

/**
 * The Quick Stop requests in the shape the real request card reads.
 *
 * Not a database row — QuickStopRequestCard takes a display type — so this sits
 * beside the rows rather than in DEMO_TABLES. Built from the same three requests
 * the demo already told a story about, so the card, the coverage map and the
 * demand panel are all describing one afternoon.
 */
export const DEMO_QUICK_STOP_CARDS = DEMO_QUICK_STOPS.requests.map((request) => {
  const createdAt = new Date(Date.now() - request.minutesAgo * 60 * 1000).toISOString();
  const status = request.status === 'accepted' ? 'confirmed' : request.status === 'waiting' ? 'awaiting_contractor' : 'declined';
  const [start, end] = (request.slot ?? '').split('–').map((part) => part.trim());
  return {
    id: request.id,
    status,
    client_name: request.name,
    client_phone: request.phone,
    client_email: null,
    address: request.address,
    intake: { issue: request.what, propertyType: 'Single-family home' },
    ai_summary: request.what,
    ai_visit_minutes: 30,
    ai_complexity: 'simple',
    ai_confidence: 0.82,
    availability: [],
    fee_cents: request.feeCents,
    diagnostic_fee_cents: null,
    arrival_date: request.slot ? dateKeyFromNow(0) : null,
    requested_date: dateKeyFromNow(0),
    arrival_start: start ? '15:15' : null,
    arrival_end: end ? '15:45' : null,
    // A live countdown on a public page would tick to zero and stay there, so
    // the one open request is given a deadline comfortably ahead.
    response_deadline_at: status === 'awaiting_contractor' ? new Date(Date.now() + 42 * 60 * 1000).toISOString() : null,
    proposed_arrival_date: null,
    proposed_arrival_start: null,
    proposed_arrival_end: null,
    diagnostic_conversion: null,
    diagnostic_proposed_cents: null,
    created_at: createdAt,
  };
});

// The Quick Stop fee, as its own payment — the real reader tells the fee apart
// from the service work by payment id, and would double-count without this.
const DEMO_QUICK_STOP_FEE_ROWS: DemoRow[] = DEMO_EXTRA_STOP_ROWS.filter((row) => row.payment_id).map((row) => ({
  id: row.payment_id as string,
  account_id: DEMO_ACCOUNT_ID,
  job_id: row.job_id,
  amount: DEMO_QUICK_STOPS.feeCents / 100,
  refunded_amount: 0,
  status: 'paid',
  requested_at: row.created_at,
  paid_at: row.paid_at,
}));

// --- Blog posts ---------------------------------------------------------------
// Spread across the four states the blog workspace filters on, plus one
// scheduled for next week, so the Marketing overview's tiles, its "Coming up"
// rail and the workspace's own chips all have something real to count. Two
// carry a beatId, which is what strikes the matching seasonal topic through on
// the calendar and turns its card's primary button into "Continue blog draft".
function blogDate(offsetDays: number): string {
  return dateKeyFromNow(offsetDays);
}

export const DEMO_BLOG_POSTS: DemoRow[] = [
  {
    id: 'demo-post-1',
    slug: 'when-to-start-spring-cleanup',
    title: 'When to start your spring cleanup in Metro Detroit',
    excerpt: 'Too early and you tear up a dormant lawn. Too late and the weeds have already won.',
    body: 'Timing a spring cleanup in southeast Michigan is mostly about soil temperature rather than the calendar…',
    coverImage: '',
    status: 'published',
    date: blogDate(-38),
    publishAt: blogDate(-38),
  },
  {
    id: 'demo-post-2',
    slug: 'mulch-depth-that-actually-works',
    title: 'How deep should mulch actually go?',
    excerpt: 'Three inches, and never against the trunk. Here is why the second half matters more.',
    body: 'Mulch volcanoes look tidy for a season and then rot the bark underneath…',
    coverImage: '',
    status: 'published',
    date: blogDate(-16),
    publishAt: blogDate(-16),
  },
  {
    id: 'demo-post-3',
    slug: 'gutters-before-the-leaves-drop',
    title: 'Clear your gutters before the leaves drop, not after',
    excerpt: 'The week everyone calls is the week nobody has an opening.',
    body: 'By the time the maples are bare, every crew in the county is booked three weeks out…',
    coverImage: '',
    // "Scheduled" is not a stored status — it is a draft whose publishAt is in
    // the future, which is what the nightly cron reads. See lib/marketing-status.
    status: 'draft',
    date: blogDate(-3),
    publishAt: blogDate(7),
    beatId: 'gutter-clear',
  },
  {
    id: 'demo-post-4',
    slug: 'storm-season-yard-check',
    title: 'A ten-minute yard check before storm season',
    excerpt: 'Most of the damage we clean up was visible a month earlier.',
    body: 'Deadwood over a driveway, a leaning fence post, a downspout pointed at the foundation…',
    coverImage: '',
    status: 'draft',
    date: blogDate(-1),
    publishAt: '',
    beatId: 'storm-season',
  },
];

// --- Account & site config ----------------------------------------------------

export const DEMO_ACCOUNT_ROW: DemoRow = {
  id: DEMO_ACCOUNT_ID,
  business_name: DEMO_COMPANY_NAME,
  // CAN-SPAM requires a physical address on marketing email, and the composer
  // blocks sending without one. A demo missing it would open on a warning
  // banner about a setting a visitor cannot reach.
  mailing_address: '4820 Coolidge Hwy, Royal Oak, MI 48073',
  arrival_updates_enabled: true,
  booking_enabled: DEMO_BOOKING.enabled,
  timezone: DEMO_BOOKING.timezone,
  booking_weekdays: DEMO_BOOKING.weekdays,
  booking_windows: DEMO_BOOKING.windows,
  booking_window_minutes: 120,
  booking_max_per_day: DEMO_BOOKING.maxPerDay,
  booking_lead_days: DEMO_BOOKING.leadDays,
  workday_start: '07:30',
  workday_end: '17:00',
  schedule_day_hours: 8,
  job_buffer_minutes: 30,
  suspended_at: null,
};

export const DEMO_SITE_ROW: DemoRow = {
  account_id: DEMO_ACCOUNT_ID,
  company_name: DEMO_COMPANY_NAME,
  published: true,
  subdomain: DEMO_SITE_HOST.split('.')[0],
  // service_area and the trade are what the seasonal calendar reads to pick a
  // climate zone and the right topics. Without them the calendar renders its
  // "we can't tell where you are" state, which is honest but is not what this
  // account looks like — Evergreen has an address and mows lawns in Michigan.
  service_area: DEMO_SERVICE_AREA,
  content: { trade: 'Lawn & landscape', blog: { enabled: true, reminderWeeks: 4, posts: DEMO_BLOG_POSTS } },
  custom_domain: null,
  id: 'demo-site',
};

export const DEMO_AVAILABILITY_ROWS: DemoRow[] = DEMO_BOOKING.blocks.map((block) => ({
  id: block.id,
  account_id: DEMO_ACCOUNT_ID,
  start_date: block.dateKey,
  end_date: block.dateKey,
  reason: block.reason,
}));

// --- The whole account, as one rowset -----------------------------------------

export const DEMO_TABLES: DemoTables = {
  accounts: [DEMO_ACCOUNT_ROW],
  sites: [DEMO_SITE_ROW],
  leads: DEMO_LEADS as unknown as DemoRow[],
  jobs: DEMO_JOB_ROWS,
  clients: DEMO_CLIENT_ROWS,
  crew: DEMO_CREW as unknown as DemoRow[],
  crew_assignments: DEMO_CREW_ASSIGNMENT_ROWS,
  costs: [...(Object.values(DEMO_COSTS).flat() as unknown as DemoRow[]), ...DEMO_RECENT_LABOR_ROWS],
  invoices: DEMO_INVOICE_ROWS,
  payments: [...DEMO_PAYMENT_ROWS, ...DEMO_QUICK_STOP_FEE_ROWS],
  job_feed: DEMO_JOB_FEED_ROWS,
  recurring_plans: DEMO_RECURRING_ROWS,
  campaigns: DEMO_CAMPAIGN_ROWS,
  extra_stop_requests: DEMO_EXTRA_STOP_ROWS,
  availability_blocks: DEMO_AVAILABILITY_ROWS,
  sms_consent: DEMO_SMS_CONSENT_ROWS,
  review_invites: DEMO_REVIEW_INVITE_ROWS,
  // Deliberately empty rather than absent: nobody has bounced or unsubscribed
  // in the demo, and an empty table is the accurate way to say so.
  email_suppression: [],
};

/**
 * The client every demo server page reads through.
 *
 * Built once per module load, not per request: the fixtures are immutable and
 * nothing writes, so there is no state to keep apart between visitors.
 */
export const demoSupabase = createDemoSupabase(DEMO_TABLES);
