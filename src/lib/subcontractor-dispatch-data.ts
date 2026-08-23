// The reads and writes behind subcontractor dispatch.
//
// lib/subcontractor-dispatch holds the rules; this holds the database. The split
// is the same one cost-truth / cost-truth-data and estimate-offers /
// estimate-offers-data already use, and it is what lets every judgement in this
// feature — who matches, what the text says, whether a link is still good — be
// tested without a Postgres.
//
// TWO CLIENTS, TWO AUDIENCES. Everything an owner does goes through the
// session-scoped `supabase` client they were handed by requireOwnerContext, so
// RLS is the account boundary and no function here has to be trusted to remember
// `.eq('account_id', …)` (they all do it anyway — defence in depth). Everything
// the PUBLIC proposal page does goes through the service-role client, because
// there is no session: the bearer of a signed token is the authorisation, and
// the token is scoped to exactly one offer.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { createJobFeedEvent } from '@/lib/job-feed';
import { coordOf } from '@/lib/distance';
import { normalizeUsPhone } from '@/lib/phone';
import { sendSubcontractorSms } from '@/lib/sms';
import { subcontractorCancelledText, subcontractorCoveredText, subcontractorWonText } from '@/lib/sms-templates';
import {
  ALREADY_CLAIMED_MESSAGE,
  CLAIMABLE_REQUEST_STATUSES,
  LIVE_OFFER_STATUSES,
  createOfferToken,
  formatPay,
  hashOfferToken,
  normalizeSelectionMode,
  offerLink,
  offerOutcome,
  personalizeOfferMessage,
  rankCandidates,
  requirementLines,
  scheduleLabel,
  type DispatchOffer,
  type DispatchRequest,
  type MatchCandidate,
  type OfferStatus,
  type PublicOfferView,
  type RequestStatus,
  type ScoredCandidate,
  type SelectionMode,
} from '@/lib/subcontractor-dispatch';
import {
  complianceFor,
  shapeSubcontractorProfile,
  subDisplayName,
  subMetrics,
  type Compliance,
  type SubMetrics,
  type SubcontractorProfile,
} from '@/lib/subcontractors';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

/** Every column on a request row, named once. */
const REQUEST_COLUMNS =
  'id, account_id, job_id, status, work_description, service_date, window_start, window_end, general_location, ' +
  'pay_amount, pay_kind, required_trade, required_skills, requires_license, requires_insurance, expires_at, ' +
  'selection_mode, document_paths, message_body, claimed_offer_id, claimed_crew_id, claimed_at, queued_at, sent_at, ' +
  'cancelled_at, reopened_at, created_at, updated_at';

const OFFER_COLUMNS =
  'id, account_id, request_id, crew_id, status, phone, body, provider_id, sms_event_id, error_reason, distance_miles, ' +
  'match_reason, queued_at, sent_at, delivered_at, viewed_at, responded_at, decline_reason, question, backup, won, created_at';

// -- shaping -------------------------------------------------------------------

type Row = Record<string, unknown>;

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
  return [];
}

export function shapeRequest(row: Row): DispatchRequest {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    status: row.status as RequestStatus,
    workDescription: (row.work_description as string) ?? '',
    serviceDate: (row.service_date as string | null) ?? null,
    windowStart: (row.window_start as string | null) ?? null,
    windowEnd: (row.window_end as string | null) ?? null,
    generalLocation: (row.general_location as string) ?? '',
    payAmount: Number(row.pay_amount) || 0,
    payKind: (row.pay_kind as DispatchRequest['payKind']) ?? 'fixed',
    requiredTrade: (row.required_trade as string) ?? '',
    requiredSkills: textList(row.required_skills),
    requiresLicense: row.requires_license === true,
    requiresInsurance: row.requires_insurance === true,
    expiresAt: row.expires_at as string,
    selectionMode: normalizeSelectionMode(row.selection_mode),
    documentPaths: textList(row.document_paths),
    messageBody: (row.message_body as string) ?? '',
    claimedOfferId: (row.claimed_offer_id as string | null) ?? null,
    claimedCrewId: (row.claimed_crew_id as string | null) ?? null,
    claimedAt: (row.claimed_at as string | null) ?? null,
    queuedAt: (row.queued_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export function shapeOffer(row: Row): DispatchOffer & { won: boolean; providerId: string | null; smsEventId: string | null; errorReason: string | null } {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    crewId: row.crew_id as string,
    status: row.status as OfferStatus,
    phone: (row.phone as string) ?? '',
    body: (row.body as string) ?? '',
    distanceMiles: row.distance_miles === null || row.distance_miles === undefined ? null : Number(row.distance_miles),
    matchReason: (row.match_reason as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    deliveredAt: (row.delivered_at as string | null) ?? null,
    viewedAt: (row.viewed_at as string | null) ?? null,
    respondedAt: (row.responded_at as string | null) ?? null,
    declineReason: (row.decline_reason as string | null) ?? null,
    question: (row.question as string | null) ?? null,
    backup: row.backup === true,
    won: row.won === true,
    providerId: (row.provider_id as string | null) ?? null,
    smsEventId: (row.sms_event_id as string | null) ?? null,
    errorReason: (row.error_reason as string | null) ?? null,
  };
}

export type OfferWithCrew = ReturnType<typeof shapeOffer> & {
  crewName: string;
  companyName: string | null;
  displayName: string;
};

export type RequestWithOffers = {
  request: DispatchRequest;
  offers: OfferWithCrew[];
  job: { id: string; ref: string; clientName: string; address: string | null } | null;
};

// -- the directory ----------------------------------------------------------------

export type SubcontractorRecord = {
  id: string;
  name: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  photoPath: string | null;
  createdAt: string;
  profile: SubcontractorProfile;
  compliance: Compliance;
  metrics: SubMetrics;
  coord: { lat: number; lng: number } | null;
};

/** Today, in the account's zone, as a plain date — what compliance compares to. */
export function todayIn(timeZone: string | null | undefined): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timeZone || 'America/New_York' });
}

/**
 * Every saved subcontractor on this account, with their record read whole.
 *
 * Three queries, never N+1: the people, every offer they have ever been sent,
 * and every private review. A twenty-firm directory used to be forty round
 * trips in the shape this replaced.
 *
 * DEFENSIVE ABOUT ITS OWN COLUMNS. A deploy that lands before the migration
 * selects `worker_type` and gets 42703 back; the fallback reads the plain crew
 * row instead, which resolves everybody to 'employee' and shows an empty
 * subcontractor list rather than a broken page.
 */
export async function loadSubcontractors(
  supabase: SupabaseClient,
  accountId: string,
  options: { today: string; includeArchived?: boolean } = { today: todayIn(null) },
): Promise<SubcontractorRecord[]> {
  const { data, error } = await supabase
    .from('crew')
    .select('*')
    .eq('account_id', accountId)
    .eq('worker_type', 'subcontractor')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // 42703 / PGRST204 — the column is not there yet. No subs can exist either.
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') return [];
    throw error;
  }

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];
  const crewIds = rows.map((row) => row.id as string);

  const [offers, reviews, completed] = await Promise.all([
    loadOfferOutcomes(supabase, accountId, crewIds),
    loadReviewScores(supabase, accountId, crewIds),
    loadCompletedJobCounts(supabase, accountId, crewIds),
  ]);

  return rows
    .map((row): SubcontractorRecord => {
      const id = row.id as string;
      const profile = shapeSubcontractorProfile(row);
      const name = row.name as string;
      return {
        id,
        name,
        displayName: subDisplayName(name, profile.companyName),
        phone: (row.phone as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        active: row.active !== false,
        photoPath: (row.photo_path as string | null) ?? null,
        createdAt: row.created_at as string,
        profile,
        compliance: complianceFor(profile, options.today),
        metrics: subMetrics({
          offers: offers.get(id) ?? [],
          reviews: reviews.get(id) ?? [],
          completedJobs: completed.get(id) ?? 0,
        }),
        coord: coordOf({ lat: row.start_lat as number | null, lng: row.start_lng as number | null }),
      };
    })
    .filter((record) => (options.includeArchived ? true : record.profile.subStatus !== 'archived' || record.active))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

async function loadOfferOutcomes(supabase: SupabaseClient, accountId: string, crewIds: string[]) {
  const map = new Map<string, { status: string; sentAt: string | null; respondedAt: string | null }[]>();
  if (crewIds.length === 0) return map;
  const { data, error } = await supabase
    .from('subcontractor_offers')
    .select('crew_id, status, sent_at, responded_at')
    .eq('account_id', accountId)
    .in('crew_id', crewIds);
  if (error) return map;
  for (const row of (data ?? []) as unknown as Row[]) {
    const key = row.crew_id as string;
    const bucket = map.get(key) ?? [];
    bucket.push({
      status: row.status as string,
      sentAt: (row.sent_at as string | null) ?? null,
      respondedAt: (row.responded_at as string | null) ?? null,
    });
    map.set(key, bucket);
  }
  return map;
}

async function loadReviewScores(supabase: SupabaseClient, accountId: string, crewIds: string[]) {
  const map = new Map<string, Array<{ workQuality: number; communication: number; onTime: number; cleanliness: number; withinPrice: boolean; hireAgain: boolean }>>();
  if (crewIds.length === 0) return map;
  const { data, error } = await supabase
    .from('subcontractor_reviews')
    .select('crew_id, work_quality, communication, on_time, cleanliness, within_price, hire_again')
    .eq('account_id', accountId)
    .in('crew_id', crewIds);
  if (error) return map;
  for (const row of (data ?? []) as unknown as Row[]) {
    const key = row.crew_id as string;
    const bucket = map.get(key) ?? [];
    bucket.push({
      workQuality: Number(row.work_quality) || 0,
      communication: Number(row.communication) || 0,
      onTime: Number(row.on_time) || 0,
      cleanliness: Number(row.cleanliness) || 0,
      withinPrice: row.within_price === true,
      hireAgain: row.hire_again === true,
    });
    map.set(key, bucket);
  }
  return map;
}

/**
 * How many finished jobs each firm has been on.
 *
 * Counted from crew_assignments against completed jobs rather than from
 * accepted offers, because a sub can be assigned by hand too — and "24 jobs
 * completed" has to mean work done, not offers taken.
 */
async function loadCompletedJobCounts(supabase: SupabaseClient, accountId: string, crewIds: string[]) {
  const map = new Map<string, number>();
  if (crewIds.length === 0) return map;
  const { data, error } = await supabase
    .from('crew_assignments')
    .select('crew_id, job:jobs!inner(status)')
    .eq('account_id', accountId)
    .in('crew_id', crewIds)
    .eq('jobs.status', 'complete');
  if (error) {
    // The embedded filter is the fragile part of this query. Fall back to two
    // plain reads rather than showing every firm zero completed jobs.
    const [{ data: assignments }, { data: jobs }] = await Promise.all([
      supabase.from('crew_assignments').select('crew_id, job_id').eq('account_id', accountId).in('crew_id', crewIds),
      supabase.from('jobs').select('id').eq('account_id', accountId).eq('status', 'complete'),
    ]);
    const completedIds = new Set(((jobs ?? []) as unknown as Row[]).map((job) => job.id as string));
    for (const row of ((assignments ?? []) as unknown as Row[])) {
      if (!completedIds.has(row.job_id as string)) continue;
      const key = row.crew_id as string;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }
  for (const row of (data ?? []) as unknown as Row[]) {
    const key = row.crew_id as string;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

// -- matching ---------------------------------------------------------------------

/**
 * Which of these firms are already booked on the request's date.
 *
 * "Already on J-1031 that day" is a warning, not a veto — see rankCandidates —
 * but an owner sending four offers deserves to know which of the four are
 * standing in somebody else's kitchen at nine on Friday.
 */
async function loadScheduleConflicts(
  supabase: SupabaseClient,
  accountId: string,
  crewIds: string[],
  serviceDate: string | null,
  excludeJobId: string | null,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!serviceDate || crewIds.length === 0) return map;

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, ref')
    .eq('account_id', accountId)
    .eq('scheduled_for', serviceDate)
    .not('status', 'in', '("complete","archived")');

  const jobRows = ((jobs ?? []) as unknown as Row[]).filter((job) => job.id !== excludeJobId);
  if (jobRows.length === 0) return map;
  const refById = new Map(jobRows.map((job) => [job.id as string, (job.ref as string) ?? 'a job']));

  const { data: assignments } = await supabase
    .from('crew_assignments')
    .select('crew_id, job_id')
    .eq('account_id', accountId)
    .in('crew_id', crewIds)
    .in('job_id', [...refById.keys()]);

  for (const row of ((assignments ?? []) as unknown as Row[])) {
    const key = row.crew_id as string;
    const ref = refById.get(row.job_id as string);
    if (!ref) continue;
    map.set(key, [...(map.get(key) ?? []), ref]);
  }
  return map;
}

export type MatchInput = {
  requiredTrade: string;
  requiredSkills: string[];
  requiresLicense: boolean;
  requiresInsurance: boolean;
  serviceDate: string | null;
  jobId: string | null;
  jobCoord: { lat: number; lng: number } | null;
};

/** Every saved subcontractor, scored against one job. Nobody is hidden. */
export async function loadMatches(
  supabase: SupabaseClient,
  accountId: string,
  input: MatchInput,
  options: { today: string },
): Promise<ScoredCandidate[]> {
  const subs = await loadSubcontractors(supabase, accountId, { today: options.today, includeArchived: true });
  const conflicts = await loadScheduleConflicts(
    supabase,
    accountId,
    subs.map((sub) => sub.id),
    input.serviceDate,
    input.jobId,
  );

  const candidates: MatchCandidate[] = subs.map((sub) => ({
    crewId: sub.id,
    name: sub.name,
    companyName: sub.profile.companyName,
    trades: sub.profile.trades,
    skills: sub.profile.skills,
    subStatus: sub.profile.subStatus,
    active: sub.active,
    emergencyAvailable: sub.profile.emergencyAvailable,
    availabilityNote: sub.profile.availabilityNote,
    travelRadiusMiles: sub.profile.travelRadiusMiles,
    coord: sub.coord,
    compliance: sub.compliance,
    metrics: sub.metrics,
    conflicts: conflicts.get(sub.id) ?? [],
    hasPhone: Boolean(sub.phone),
  }));

  return rankCandidates(candidates, {
    requiredTrade: input.requiredTrade,
    requiredSkills: input.requiredSkills,
    requiresLicense: input.requiresLicense,
    requiresInsurance: input.requiresInsurance,
    jobCoord: input.jobCoord,
  });
}

// -- requests: the owner's side ------------------------------------------------------

export type CreateRequestInput = {
  jobId: string;
  workDescription: string;
  serviceDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  generalLocation: string;
  payAmount: number;
  payKind?: 'fixed' | 'hourly' | 'day_rate';
  requiredTrade: string;
  requiredSkills: string[];
  requiresLicense: boolean;
  requiresInsurance: boolean;
  expiresAt: string;
  selectionMode: SelectionMode;
  documentPaths: string[];
  messageBody: string;
};

export async function createSubcontractorRequest(
  supabase: SupabaseClient,
  accountId: string,
  input: CreateRequestInput,
): Promise<DispatchRequest> {
  const { data, error } = await supabase
    .from('subcontractor_requests')
    .insert({
      account_id: accountId,
      job_id: input.jobId,
      status: 'draft',
      work_description: input.workDescription,
      service_date: input.serviceDate,
      window_start: input.windowStart,
      window_end: input.windowEnd,
      general_location: input.generalLocation,
      pay_amount: input.payAmount,
      pay_kind: input.payKind ?? 'fixed',
      required_trade: input.requiredTrade,
      required_skills: input.requiredSkills,
      requires_license: input.requiresLicense,
      requires_insurance: input.requiresInsurance,
      expires_at: input.expiresAt,
      selection_mode: input.selectionMode,
      document_paths: input.documentPaths,
      message_body: input.messageBody,
    })
    .select(REQUEST_COLUMNS)
    .single();

  if (error || !data) {
    // 23505 on subcontractor_requests_one_live_per_job. Worth its own sentence:
    // "duplicate key value violates unique constraint" tells an owner nothing.
    if ((error as { code?: string } | null)?.code === '23505') {
      throw new Error('This job already has an open subcontractor request. Cancel it before starting another.');
    }
    throw error ?? new Error('Unable to create that request.');
  }
  return shapeRequest(data as unknown as Row);
}

export async function listSubcontractorRequests(
  supabase: SupabaseClient,
  accountId: string,
  options: { jobId?: string; limit?: number } = {},
): Promise<RequestWithOffers[]> {
  let query = supabase
    .from('subcontractor_requests')
    .select(REQUEST_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (options.jobId) query = query.eq('job_id', options.jobId);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }
  const requests = ((data ?? []) as unknown as Row[]).map(shapeRequest);
  if (requests.length === 0) return [];

  const [offers, jobs] = await Promise.all([
    loadOffersFor(supabase, accountId, requests.map((request) => request.id)),
    loadJobSummaries(supabase, accountId, [...new Set(requests.map((request) => request.jobId))]),
  ]);

  return requests.map((request) => ({
    request,
    offers: offers.get(request.id) ?? [],
    job: jobs.get(request.jobId) ?? null,
  }));
}

async function loadJobSummaries(supabase: SupabaseClient, accountId: string, jobIds: string[]) {
  const map = new Map<string, { id: string; ref: string; clientName: string; address: string | null }>();
  if (jobIds.length === 0) return map;
  const { data } = await supabase
    .from('jobs')
    .select('id, ref, client_name, address')
    .eq('account_id', accountId)
    .in('id', jobIds);
  for (const row of ((data ?? []) as unknown as Row[])) {
    map.set(row.id as string, {
      id: row.id as string,
      ref: (row.ref as string) ?? 'Job',
      clientName: (row.client_name as string) ?? 'Client',
      address: (row.address as string | null) ?? null,
    });
  }
  return map;
}

async function loadOffersFor(supabase: SupabaseClient, accountId: string, requestIds: string[]) {
  const map = new Map<string, OfferWithCrew[]>();
  if (requestIds.length === 0) return map;

  const { data, error } = await supabase
    .from('subcontractor_offers')
    .select(OFFER_COLUMNS)
    .eq('account_id', accountId)
    .in('request_id', requestIds)
    .order('created_at', { ascending: true });
  if (error) return map;

  const rows = (data ?? []) as unknown as Row[];
  const crewIds = [...new Set(rows.map((row) => row.crew_id as string))];
  const { data: crew } = await supabase
    .from('crew')
    .select('id, name, company_name')
    .eq('account_id', accountId)
    .in('id', crewIds.length > 0 ? crewIds : ['00000000-0000-0000-0000-000000000000']);
  const crewById = new Map(((crew ?? []) as unknown as Row[]).map((row) => [row.id as string, row]));

  for (const row of rows) {
    const offer = shapeOffer(row);
    const member = crewById.get(offer.crewId);
    const name = (member?.name as string) ?? 'Subcontractor';
    const companyName = (member?.company_name as string | null) ?? null;
    const bucket = map.get(offer.requestId) ?? [];
    bucket.push({ ...offer, crewName: name, companyName, displayName: subDisplayName(name, companyName) });
    map.set(offer.requestId, bucket);
  }
  return map;
}

export async function getSubcontractorRequest(
  supabase: SupabaseClient,
  accountId: string,
  requestId: string,
): Promise<RequestWithOffers | null> {
  const { data, error } = await supabase
    .from('subcontractor_requests')
    .select(REQUEST_COLUMNS)
    .eq('account_id', accountId)
    .eq('id', requestId)
    .maybeSingle();
  if (error || !data) return null;

  const request = shapeRequest(data as unknown as Row);
  const [offers, jobs] = await Promise.all([
    loadOffersFor(supabase, accountId, [request.id]),
    loadJobSummaries(supabase, accountId, [request.jobId]),
  ]);
  return { request, offers: offers.get(request.id) ?? [], job: jobs.get(request.jobId) ?? null };
}

/** The one open request for a job, if there is one. Used by the job page. */
export async function getActiveRequestForJob(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<RequestWithOffers | null> {
  const all = await listSubcontractorRequests(supabase, accountId, { jobId, limit: 5 });
  return (
    all.find((entry) => entry.request.status !== 'cancelled' && entry.request.status !== 'expired') ?? all[0] ?? null
  );
}

// -- sending ------------------------------------------------------------------------

export type SendResult = {
  request: DispatchRequest;
  queued: number;
  failed: number;
  simulated: boolean;
  skipped: Array<{ name: string; reason: string }>;
};

/**
 * Turn a draft into offers, then put them on their way.
 *
 * THE ORDER MATTERS AND IT IS THIS:
 *
 *   1. Every recipient gets a ROW with their own token, all still 'queued'.
 *   2. The request is marked queued.
 *   3. Only then does anything leave the building.
 *
 * Rows before texts, because the link in the text has to already resolve to
 * something when the recipient taps it four seconds later — and because a
 * process that dies half way through a send leaves a complete, inspectable
 * record of who was asked rather than three texts and no evidence.
 *
 * Nothing here throws on a delivery failure. A firm whose number is wrong is a
 * 'failed' row the owner can see and re-send; taking the whole dispatch down
 * because one of five numbers was mistyped helps nobody.
 */
export async function sendSubcontractorRequest(
  supabase: SupabaseClient,
  accountId: string,
  requestId: string,
  input: { crewIds: string[]; messageBody: string; origin?: string },
): Promise<SendResult> {
  const existing = await getSubcontractorRequest(supabase, accountId, requestId);
  if (!existing) throw new Error('That request no longer exists.');
  if (existing.request.status === 'claimed') throw new Error('That request has already been claimed.');
  if (existing.request.status === 'cancelled') throw new Error('That request was cancelled. Reopen it first.');
  if (input.crewIds.length === 0) throw new Error('Pick at least one subcontractor to send this to.');

  const { data: crewRows } = await supabase
    .from('crew')
    .select('id, name, phone, company_name, start_lat, start_lng')
    .eq('account_id', accountId)
    .in('id', input.crewIds)
    .is('deleted_at', null);

  const crew = (crewRows ?? []) as unknown as Row[];
  const offerByCrew = new Map(existing.offers.map((offer) => [offer.crewId, offer]));
  const skipped: Array<{ name: string; reason: string }> = [];

  // No business name is read here on purpose: the message was composed in the
  // composer, where the owner already saw the name in it and could edit it. This
  // function sends what they approved, verbatim.
  const origin = input.origin ?? APP_ORIGIN;

  type Pending = {
    crewId: string;
    name: string;
    phone: string;
    body: string;
    /** Present when retrying an offer row whose durable SMS event was never linked. */
    offerId?: string;
    tokenHash?: string;
  };
  const pending: Pending[] = [];

  for (const member of crew) {
    const name = (member.name as string) ?? 'Subcontractor';
    const existingOffer = offerByCrew.get(member.id as string);
    if (existingOffer) {
      const canRepairQueueLink = !existingOffer.smsEventId && (existingOffer.status === 'queued' || existingOffer.status === 'failed');
      if (!canRepairQueueLink) {
        skipped.push({ name, reason: 'Already has an offer for this request' });
        continue;
      }
      // A process can die after queueAccountSms commits but before the returned
      // event id is attached to this offer. Re-run the same stable message key
      // against the stored phone/body, then repair that link. Never mint a new
      // token or silently abandon a durable event in that recovery window.
      pending.push({
        crewId: existingOffer.crewId,
        name,
        phone: existingOffer.phone,
        body: existingOffer.body,
        offerId: existingOffer.id,
      });
      continue;
    }
    const phone = normalizeUsPhone((member.phone as string) ?? '') ?? '';
    if (!phone) {
      skipped.push({ name, reason: 'No mobile number on file' });
      continue;
    }
    const { token, tokenHash } = createOfferToken();
    pending.push({
      crewId: member.id as string,
      name,
      phone,
      tokenHash,
      body: personalizeOfferMessage(input.messageBody, offerLink(token, origin)),
    });
  }

  if (pending.length === 0) {
    throw new Error(
      skipped.length > 0
        ? `Nothing to send: ${skipped.map((entry) => `${entry.name} — ${entry.reason.toLowerCase()}`).join('; ')}.`
        : 'Nothing to send.',
    );
  }

  const newOffers = pending.filter((entry) => !entry.offerId);
  const { data: inserted, error: insertError } = newOffers.length > 0
    ? await supabase
      .from('subcontractor_offers')
      .insert(
        newOffers.map((entry) => ({
          account_id: accountId,
          request_id: requestId,
          crew_id: entry.crewId,
          token_hash: entry.tokenHash!,
          status: 'queued',
          phone: entry.phone,
          body: entry.body,
        })),
      )
      .select('id, crew_id')
    : { data: [], error: null };
  if (insertError) throw insertError;

  const offerIdByCrew = new Map<string, string>(
    pending.flatMap((entry) => entry.offerId ? [[entry.crewId, entry.offerId] as const] : []),
  );
  for (const row of ((inserted ?? []) as unknown as Row[])) {
    offerIdByCrew.set(row.crew_id as string, row.id as string);
  }

  // Offer rows exist before delivery work. The request is queued here; only a
  // later provider-acceptance fact may project it to sent.
  const nowIso = new Date().toISOString();
  const { data: updated, error: requestQueueError } = await supabase
    .from('subcontractor_requests')
    .update({ status: 'queued', queued_at: existing.request.queuedAt ?? nowIso, sent_at: null, message_body: input.messageBody, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (requestQueueError || !updated) {
    throw requestQueueError ?? new Error('Unable to mark that subcontractor request queued.');
  }

  let queued = 0;
  let failed = 0;
  let simulated = false;

  for (const entry of pending) {
    const offerId = offerIdByCrew.get(entry.crewId);
    if (!offerId) continue;
    const result = await sendSubcontractorSms({
      accountId,
      crewId: entry.crewId,
      phone: entry.phone,
      eventType: 'sub_offer',
      body: entry.body,
      idempotencyKey: `subcontractor:${offerId}:offer`,
    });
    if (result.status === 'simulated') simulated = true;

    const accepted = result.status === 'queued';
    if (accepted) queued += 1;
    else if (result.status !== 'simulated') failed += 1;

    const admin = createAdminClient();
    const { data: linkedOffer, error: linkError } = await admin
      .from('subcontractor_offers')
      .update({
        status: result.status === 'queued' || result.status === 'simulated' ? 'queued' : 'failed',
        sent_at: null,
        provider_id: null,
        sms_event_id: result.smsEventId,
        error_reason:
          result.status === 'simulated'
            ? 'Simulated: this environment has no messaging provider, so nothing was delivered.'
            : result.status === 'opted_out'
              ? 'This number has replied STOP and cannot be texted.'
              : accepted ? null : result.error ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('request_id', requestId)
      .eq('crew_id', entry.crewId)
      .eq('id', offerId)
      .select('id')
      .maybeSingle();
    if (linkError || !linkedOffer) {
      // This is an integrity failure, not a carrier delivery failure. Surface it
      // so the caller can retry: the stable key above will return the same event
      // and this recovery path will attach it without sending a second text.
      throw linkError ?? new Error('Queued subcontractor SMS could not be linked to its offer.');
    }
  }

  const finalStatus: RequestStatus = queued > 0 || simulated ? 'queued' : 'delivery_failed';
  const { data: projected } = await supabase
    .from('subcontractor_requests')
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  const request = projected
    ? shapeRequest(projected as unknown as Row)
    : updated ? shapeRequest(updated as unknown as Row) : existing.request;

  await createJobFeedEvent(supabase, accountId, request.jobId, {
    kind: 'sub_request_queued',
    title: `Subcontractor offer texts queued for ${queued} ${queued === 1 ? 'firm' : 'firms'}`,
    body: `${pending.length} ${pending.length === 1 ? 'offer was' : 'offers were'} created · ${failed} failed before queue acceptance · ${request.workDescription} · ${formatPay(request.payAmount, request.payKind)}.`,
    visibility: 'internal',
    amount: request.payAmount,
    sourceTable: 'subcontractor_requests',
    sourceId: `${request.id}:${nowIso}`,
    actionUrl: `/dashboard/crew/requests/${request.id}`,
  }).catch((error) => console.error('Sub request feed event failed:', error));

  return { request, queued, failed, simulated, skipped };
}

export async function cancelSubcontractorRequest(
  supabase: SupabaseClient,
  accountId: string,
  requestId: string,
): Promise<void> {
  const existing = await getSubcontractorRequest(supabase, accountId, requestId);
  if (!existing) throw new Error('That request no longer exists.');
  if (existing.request.status === 'claimed') {
    throw new Error('That request has been claimed. Unassign the subcontractor on the job instead.');
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('subcontractor_requests')
    .update({ status: 'cancelled', cancelled_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .neq('status', 'claimed');
  if (error) throw error;

  const live = existing.offers.filter((offer) => LIVE_OFFER_STATUSES.includes(offer.status));
  if (live.length > 0) {
    await supabase
      .from('subcontractor_offers')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('account_id', accountId)
      .eq('request_id', requestId)
      .in('id', live.map((offer) => offer.id));
  }

  await createJobFeedEvent(supabase, accountId, existing.request.jobId, {
    kind: 'sub_request_cancelled',
    title: 'Subcontractor request cancelled',
    body: `${live.length} open ${live.length === 1 ? 'offer was' : 'offers were'} closed.`,
    visibility: 'internal',
    sourceTable: 'subcontractor_requests',
    sourceId: `${requestId}:cancelled:${nowIso}`,
  }).catch(() => undefined);

  // Told, not left to find out. A sub holding a link that has silently stopped
  // working will assume they lost the job to somebody else.
  const business = await loadBusinessName(supabase, accountId);
  for (const offer of live) {
    if (offer.status === 'queued') continue;
    await sendSubcontractorSms({
      accountId,
      crewId: offer.crewId,
      phone: offer.phone,
      eventType: 'sub_offer_cancelled',
      body: subcontractorCancelledText({ businessName: business, workDescription: existing.request.workDescription }),
      idempotencyKey: `subcontractor:${offer.id}:cancelled`,
    });
  }
}

/**
 * Put an unfilled request back out.
 *
 * A NEW EXPIRY IS REQUIRED, deliberately: reopening onto the old deadline
 * produces a request that is expired the moment it is reopened, which is the
 * shape of bug that gets reported as "the button does nothing".
 */
export async function reopenSubcontractorRequest(
  supabase: SupabaseClient,
  accountId: string,
  requestId: string,
  expiresAt: string,
): Promise<DispatchRequest> {
  const existing = await getSubcontractorRequest(supabase, accountId, requestId);
  if (!existing) throw new Error('That request no longer exists.');
  if (existing.request.status === 'claimed') throw new Error('That request has already been claimed.');
  if (new Date(expiresAt).getTime() <= Date.now()) throw new Error('Pick an expiration in the future.');

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('subcontractor_requests')
    .update({ status: 'reopened', expires_at: expiresAt, cancelled_at: null, reopened_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .neq('status', 'claimed')
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error || !data) throw error ?? new Error('That request could not be reopened.');

  // Offers closed by the expiry go back to where they were. Declines stay
  // declined — somebody who said no does not get quietly re-asked.
  await supabase
    .from('subcontractor_offers')
    .update({ status: 'sent', updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('request_id', requestId)
    .eq('status', 'expired');

  await createJobFeedEvent(supabase, accountId, existing.request.jobId, {
    kind: 'sub_request_reopened',
    title: 'Subcontractor request reopened',
    body: `Open again until ${new Date(expiresAt).toLocaleString('en-US')}.`,
    visibility: 'internal',
    sourceTable: 'subcontractor_requests',
    sourceId: `${requestId}:reopened:${nowIso}`,
  }).catch(() => undefined);

  return shapeRequest(data as unknown as Row);
}

// -- the public side ------------------------------------------------------------------

type ResolvedOffer = {
  offer: ReturnType<typeof shapeOffer>;
  request: DispatchRequest;
  accountId: string;
  job: Row | null;
};

/**
 * Turn a link into an offer, or nothing at all.
 *
 * The signature is checked BEFORE the database is touched (hashOfferToken
 * returns null on a bad one), so an invented URL costs a hash and no query.
 */
async function resolveOffer(admin: SupabaseClient, token: string): Promise<ResolvedOffer | null> {
  const tokenHash = hashOfferToken(token);
  if (!tokenHash) return null;

  const { data: offerRow } = await admin
    .from('subcontractor_offers')
    .select(OFFER_COLUMNS)
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!offerRow) return null;

  const offer = shapeOffer(offerRow as unknown as Row);
  const accountId = (offerRow as unknown as Row).account_id as string;

  const { data: requestRow } = await admin
    .from('subcontractor_requests')
    .select(REQUEST_COLUMNS)
    .eq('id', offer.requestId)
    .maybeSingle();
  if (!requestRow) return null;
  const request = shapeRequest(requestRow as unknown as Row);

  const { data: job } = await admin
    .from('jobs')
    .select('id, ref, client_name, client_phone, address, scope')
    .eq('account_id', accountId)
    .eq('id', request.jobId)
    .maybeSingle();

  return { offer, request, accountId, job: (job as unknown as Row) ?? null };
}

export type PublicOfferPage = {
  view: PublicOfferView;
  outcome: ReturnType<typeof offerOutcome>;
  /** For the "keep me as backup" control, which only makes sense once. */
  alreadyBackup: boolean;
  questionAsked: string | null;
};

/**
 * What the person holding this link is allowed to see.
 *
 * Viewing is recorded here — first sight only, so the owner's "2 viewed" counts
 * people, not refreshes. Best-effort: failing to record a view must never close
 * the door on one.
 */
export async function loadPublicOffer(token: string, options: { recordView?: boolean } = {}): Promise<PublicOfferPage | null> {
  const admin = createAdminClient();
  const resolved = await resolveOffer(admin, token);
  if (!resolved) return null;

  const { offer, request, accountId, job } = resolved;

  if (options.recordView !== false && !offer.viewedAt && LIVE_OFFER_STATUSES.includes(offer.status)) {
    const nowIso = new Date().toISOString();
    try {
      await admin
        .from('subcontractor_offers')
        .update({
          viewed_at: nowIso,
          // A failed text that somebody is nonetheless reading is not a failure
          // any more, but a queued one has genuinely not been sent — leave it.
          status: offer.status === 'queued' ? 'queued' : 'viewed',
          updated_at: nowIso,
        })
        .eq('id', offer.id)
        .is('viewed_at', null);
      offer.viewedAt = nowIso;
      if (offer.status !== 'queued') offer.status = 'viewed';
    } catch {
      /* a view is not worth failing a page load over */
    }
  }

  const businessName = await loadBusinessName(admin, accountId);
  const outcome = offerOutcome(offer, request);
  const isWinner = offer.won && request.claimedOfferId === offer.id;

  const view: PublicOfferView = {
    businessName,
    jobTitle: request.workDescription,
    // The job's own scope, not the customer's intake notes: request.workDescription
    // is what the owner wrote for a subcontractor, and it is the only description
    // on this page for exactly that reason.
    scope: request.workDescription,
    generalLocation: request.generalLocation,
    distanceMiles: offer.distanceMiles,
    scheduleLabel: scheduleLabel(request),
    payLabel: formatPay(request.payAmount, request.payKind),
    payKind: request.payKind,
    requirements: requirementLines(request),
    expiresAt: request.expiresAt,
    selectionMode: request.selectionMode,
    offerStatus: offer.status,
    requestStatus: request.status,
    // THE PRIVACY LINE. Everything identifying the household is inside this
    // object, and this object exists only for the firm that actually won. Not a
    // flag the template checks — the fields are not in the payload at all.
    authorized: isWinner
      ? {
          address: (job?.address as string | null) ?? null,
          clientName: (job?.client_name as string) ?? 'the customer',
          clientPhone: (job?.client_phone as string | null) ?? null,
          jobRef: (job?.ref as string) ?? '',
          ownerPhone: null,
        }
      : null,
  };

  return { view, outcome, alreadyBackup: offer.backup, questionAsked: offer.question };
}

export type AcceptOutcome =
  | { status: 'accepted'; jobRef: string; scheduleLabel: string; address: string | null; clientName: string; clientPhone: string | null }
  | { status: 'interest_recorded' }
  | { status: 'already_claimed'; message: string }
  | { status: 'expired' }
  | { status: 'cancelled' }
  | { status: 'closed' }
  | { status: 'not_found' };

/**
 * ACCEPTANCE. The one operation in this feature that must never be wrong.
 *
 * The lock is a single conditional UPDATE on the request row:
 *
 *     update subcontractor_requests
 *        set status='claimed', claimed_offer_id=…, claimed_crew_id=…, claimed_at=now()
 *      where id = …
 *        and claimed_offer_id is null
 *        and status in ('sent','viewed','partially_responded','reopened')
 *        and expires_at > now()
 *
 * That is atomic in Postgres and it is atomic for the reason that matters: two
 * concurrent statements do not both see `claimed_offer_id is null`. The second
 * one blocks on the first's row lock, and when it is released READ COMMITTED
 * re-evaluates the WHERE against the NEW version of the row — where
 * claimed_offer_id is no longer null. It matches nothing, PostgREST returns no
 * row, and this function answers 'already_claimed'. There is no window between
 * a read and a write to lose, because there is no read.
 *
 * The partial unique index subcontractor_offers_one_winner is the second line of
 * defence underneath it. Two winners cannot be stored even if this code is
 * wrong.
 *
 * EVERYTHING WITH A SIDE EFFECT HAPPENS AFTER THE CLAIM, and none of it can undo
 * it. The assignment, the covered offers, the timeline entry and the texts are
 * each idempotent and each individually retryable; a subcontractor who accepted
 * has accepted, even if the text telling the owner about it never sends.
 */
export async function acceptSubcontractorOffer(token: string): Promise<AcceptOutcome> {
  const admin = createAdminClient();
  const resolved = await resolveOffer(admin, token);
  if (!resolved) return { status: 'not_found' };

  const { offer, request, accountId, job } = resolved;
  const nowIso = new Date().toISOString();

  // 1. Is this offer itself still answerable?
  if (offer.status === 'accepted') {
    return request.selectionMode === 'collect_interest' && request.claimedOfferId !== offer.id
      ? { status: 'interest_recorded' }
      : {
          status: 'accepted',
          jobRef: (job?.ref as string) ?? '',
          scheduleLabel: scheduleLabel(request),
          address: (job?.address as string | null) ?? null,
          clientName: (job?.client_name as string) ?? 'the customer',
          clientPhone: (job?.client_phone as string | null) ?? null,
        };
  }
  if (offer.status === 'covered') return { status: 'already_claimed', message: ALREADY_CLAIMED_MESSAGE };
  if (offer.status === 'declined') return { status: 'closed' };
  if (request.status === 'cancelled') return { status: 'cancelled' };
  if (new Date(request.expiresAt).getTime() <= Date.now()) return { status: 'expired' };
  if (offer.status === 'expired') return { status: 'expired' };

  // COLLECT INTEREST: nobody wins here, so there is nothing to lock. The offer
  // is marked accepted and left un-won; the owner picks later.
  if (request.selectionMode === 'collect_interest' && request.status !== 'claimed') {
    await admin
      .from('subcontractor_offers')
      .update({ status: 'accepted', responded_at: nowIso, updated_at: nowIso })
      .eq('id', offer.id)
      .in('status', [...LIVE_OFFER_STATUSES]);
    await recordTimeline(admin, accountId, request, offer.crewId, {
      kind: 'sub_offer_interest',
      title: 'A subcontractor said they are available',
      suffix: `${nowIso}`,
    });
    await notifyOwner(admin, accountId, request, offer.crewId, 'interest');
    return { status: 'interest_recorded' };
  }

  // 2. THE LOCK.
  const { data: claimed } = await admin
    .from('subcontractor_requests')
    .update({
      status: 'claimed',
      claimed_offer_id: offer.id,
      claimed_crew_id: offer.crewId,
      claimed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', request.id)
    .is('claimed_offer_id', null)
    .in('status', [...CLAIMABLE_REQUEST_STATUSES])
    .gt('expires_at', nowIso)
    .select('id')
    .maybeSingle();

  if (!claimed) {
    // Somebody else got there first — or the window shut between the read at the
    // top of this function and this statement. Either way this offer is over,
    // and saying so is more useful than a generic failure.
    const { data: current } = await admin
      .from('subcontractor_requests')
      .select('status, claimed_offer_id, expires_at')
      .eq('id', request.id)
      .maybeSingle();
    const row = (current ?? {}) as unknown as Row;
    await admin
      .from('subcontractor_offers')
      .update({ status: 'covered', updated_at: nowIso })
      .eq('id', offer.id)
      .in('status', [...LIVE_OFFER_STATUSES]);

    if (row.status === 'cancelled') return { status: 'cancelled' };
    if (row.claimed_offer_id) return { status: 'already_claimed', message: ALREADY_CLAIMED_MESSAGE };
    return { status: 'expired' };
  }

  // 3. Assign them to the job. Ignore a duplicate — being assigned twice is not
  //    an error, and the row may already exist if a retry got this far before.
  await admin
    .from('crew_assignments')
    .insert({ account_id: accountId, job_id: request.jobId, crew_id: offer.crewId })
    .then(
      () => undefined,
      () => undefined,
    );

  // 4. Their offer is the accepted one.
  await admin
    .from('subcontractor_offers')
    .update({ status: 'accepted', won: true, responded_at: nowIso, updated_at: nowIso })
    .eq('id', offer.id);

  // 5. Everybody else is covered.
  await admin
    .from('subcontractor_offers')
    .update({ status: 'covered', updated_at: nowIso })
    .eq('request_id', request.id)
    .neq('id', offer.id)
    .in('status', [...LIVE_OFFER_STATUSES]);

  // 6. The job timeline.
  await recordTimeline(admin, accountId, request, offer.crewId, {
    kind: 'sub_offer_accepted',
    title: 'Subcontractor accepted the job',
    suffix: request.id,
  });

  // 7. Notifications. Outside everything above, best-effort, and never able to
  //    unwind an acceptance that has already happened.
  await notifyAfterClaim(admin, accountId, request, offer.id, offer.crewId, token).catch((error) =>
    console.error('Post-acceptance notifications failed:', error instanceof Error ? error.message : error),
  );

  // 8. The accepted state, with the details they are now entitled to.
  return {
    status: 'accepted',
    jobRef: (job?.ref as string) ?? '',
    scheduleLabel: scheduleLabel(request),
    address: (job?.address as string | null) ?? null,
    clientName: (job?.client_name as string) ?? 'the customer',
    clientPhone: (job?.client_phone as string | null) ?? null,
  };
}

export async function declineSubcontractorOffer(
  token: string,
  input: { reason?: string | null; backup?: boolean } = {},
): Promise<{ status: 'declined' | 'not_found' | 'closed' }> {
  const admin = createAdminClient();
  const resolved = await resolveOffer(admin, token);
  if (!resolved) return { status: 'not_found' };
  const { offer, request, accountId } = resolved;
  if (offer.status === 'accepted') return { status: 'closed' };

  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from('subcontractor_offers')
    .update({
      // A "not available" on an already-covered offer still records the answer
      // and the backup flag, but does not pretend the offer was live.
      status: LIVE_OFFER_STATUSES.includes(offer.status) ? 'declined' : offer.status,
      responded_at: nowIso,
      decline_reason: (input.reason ?? '').trim().slice(0, 300) || null,
      backup: input.backup === true || offer.backup,
      updated_at: nowIso,
    })
    .eq('id', offer.id)
    .select('id')
    .maybeSingle();
  if (!data) return { status: 'not_found' };

  await recordTimeline(admin, accountId, request, offer.crewId, {
    kind: 'sub_offer_declined',
    title: 'A subcontractor is not available',
    suffix: offer.id,
  });
  return { status: 'declined' };
}

export async function askSubcontractorQuestion(
  token: string,
  question: string,
): Promise<{ status: 'asked' | 'not_found' | 'empty' }> {
  const text = question.trim().slice(0, 500);
  if (!text) return { status: 'empty' };

  const admin = createAdminClient();
  const resolved = await resolveOffer(admin, token);
  if (!resolved) return { status: 'not_found' };
  const { offer, request, accountId } = resolved;

  const nowIso = new Date().toISOString();
  await admin
    .from('subcontractor_offers')
    .update({ question: text, updated_at: nowIso })
    .eq('id', offer.id);

  await recordTimeline(admin, accountId, request, offer.crewId, {
    kind: 'sub_offer_question',
    title: 'A subcontractor asked a question',
    body: text,
    suffix: `${offer.id}:${nowIso}`,
  });
  await notifyOwner(admin, accountId, request, offer.crewId, 'question', text);
  return { status: 'asked' };
}

/** "Keep me as backup", from somebody who arrived to find the job gone. */
export async function keepAsBackup(token: string): Promise<{ status: 'saved' | 'not_found' }> {
  const admin = createAdminClient();
  const resolved = await resolveOffer(admin, token);
  if (!resolved) return { status: 'not_found' };
  await admin
    .from('subcontractor_offers')
    .update({ backup: true, updated_at: new Date().toISOString() })
    .eq('id', resolved.offer.id);
  return { status: 'saved' };
}

// -- notifications ----------------------------------------------------------------------

async function crewNameFor(admin: SupabaseClient, accountId: string, crewId: string): Promise<string> {
  const { data } = await admin
    .from('crew')
    .select('name, company_name')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .maybeSingle();
  const row = (data ?? {}) as unknown as Row;
  return subDisplayName((row.name as string) ?? 'A subcontractor', (row.company_name as string | null) ?? null);
}

async function recordTimeline(
  admin: SupabaseClient,
  accountId: string,
  request: DispatchRequest,
  crewId: string,
  input: { kind: string; title: string; body?: string; suffix: string },
): Promise<void> {
  try {
    const who = await crewNameFor(admin, accountId, crewId);
    await createJobFeedEvent(admin, accountId, request.jobId, {
      kind: input.kind,
      title: input.title,
      body: input.body ?? `${who} — ${request.workDescription} · ${formatPay(request.payAmount, request.payKind)}.`,
      author: who,
      // INTERNAL, always. Which subcontractor a contractor uses and what they
      // are paid is between the two of them; none of this belongs on the
      // homeowner's job feed.
      visibility: 'internal',
      sourceTable: 'subcontractor_offers',
      sourceId: input.suffix,
      actionUrl: `/dashboard/crew/requests/${request.id}`,
    });
  } catch (error) {
    console.error('Subcontractor timeline event failed:', error instanceof Error ? error.message : error);
  }
}

async function notifyOwner(
  admin: SupabaseClient,
  accountId: string,
  request: DispatchRequest,
  crewId: string,
  kind: 'won' | 'interest' | 'question',
  detail?: string,
): Promise<void> {
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (!ownerEmail) return;
    const who = await crewNameFor(admin, accountId, crewId);
    const businessName = await loadBusinessName(admin, accountId);
    const heading =
      kind === 'won'
        ? `${who} accepted ${request.workDescription}`
        : kind === 'interest'
          ? `${who} is available for ${request.workDescription}`
          : `${who} asked a question`;
    await sendContractorAlertEmail({
      accountId,
      recipientEmail: ownerEmail,
      businessName,
      subject: heading,
      heading,
      bodyLines: [
        kind === 'won'
          ? `${who} claimed the job. Every other offer is now closed and they are assigned.`
          : kind === 'interest'
            ? `${who} put their hand up. Nothing is assigned until you choose.`
            : `${who} asked: “${detail ?? ''}”`,
        `${request.workDescription} · ${formatPay(request.payAmount, request.payKind)} · ${scheduleLabel(request) || 'no date set'}.`,
      ],
      ctaLabel: 'Open the request',
      ctaUrl: `${APP_ORIGIN}/dashboard/crew/requests/${request.id}`,
      // 'info' rather than the default: sendContractorAlertEmail's other tone is
      // "ACTION NEEDED" in red, which is the wrong colour for good news about a
      // job that just got covered.
      tone: 'info',
    });
  } catch (error) {
    console.error('Owner dispatch alert failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * The three messages an acceptance owes people, in the order they matter.
 *
 * The winner first, because they are about to drive somewhere. The owner next,
 * because their job is now covered. The firms who lost last — but they DO get
 * told, and that is the whole reason this function exists: a sub who is left to
 * work out for themselves that a link has stopped working is a sub who stops
 * opening them.
 */
async function notifyAfterClaim(
  admin: SupabaseClient,
  accountId: string,
  request: DispatchRequest,
  winnerOfferId: string,
  winnerCrewId: string,
  winnerToken: string,
): Promise<void> {
  const businessName = await loadBusinessName(admin, accountId);

  const { data: offers } = await admin
    .from('subcontractor_offers')
    .select('id, crew_id, phone, status')
    .eq('request_id', request.id);

  const winner = ((offers ?? []) as unknown as Row[]).find((row) => row.id === winnerOfferId);
  if (winner?.phone) {
    await sendSubcontractorSms({
      accountId,
      crewId: winnerCrewId,
      phone: winner.phone as string,
      eventType: 'sub_offer_won',
      body: subcontractorWonText({
        businessName,
        workDescription: request.workDescription,
        whenLabel: scheduleLabel(request),
        link: offerLink(winnerToken),
      }),
      idempotencyKey: `subcontractor:${winnerOfferId}:won`,
    });
  }

  await notifyOwner(admin, accountId, request, winnerCrewId, 'won');

  for (const row of ((offers ?? []) as unknown as Row[])) {
    if (row.id === winnerOfferId) continue;
    if (row.status !== 'covered') continue;
    if (!row.phone) continue;
    await sendSubcontractorSms({
      accountId,
      crewId: row.crew_id as string,
      phone: row.phone as string,
      eventType: 'sub_offer_covered',
      body: subcontractorCoveredText({
        businessName,
        workDescription: request.workDescription,
        location: request.generalLocation,
      }),
      idempotencyKey: `subcontractor:${row.id as string}:covered`,
    });
  }
}

// -- picking a winner by hand (collect-interest mode) -------------------------------------

export async function chooseSubcontractor(
  supabase: SupabaseClient,
  accountId: string,
  requestId: string,
  offerId: string,
): Promise<{ status: 'chosen' | 'already_claimed' }> {
  const nowIso = new Date().toISOString();

  const { data: offer } = await supabase
    .from('subcontractor_offers')
    .select('id, crew_id, status')
    .eq('account_id', accountId)
    .eq('request_id', requestId)
    .eq('id', offerId)
    .maybeSingle();
  if (!offer) throw new Error('That subcontractor is not on this request.');

  // The same conditional update the public path uses, for the same reason: the
  // owner may be pressing this at the exact moment somebody accepts.
  const { data: claimed } = await supabase
    .from('subcontractor_requests')
    .update({
      status: 'claimed',
      claimed_offer_id: offerId,
      claimed_crew_id: (offer as unknown as Row).crew_id as string,
      claimed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .is('claimed_offer_id', null)
    .select('id, job_id')
    .maybeSingle();
  if (!claimed) return { status: 'already_claimed' };

  await supabase
    .from('subcontractor_offers')
    .update({ status: 'accepted', won: true, responded_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', offerId);

  await supabase
    .from('subcontractor_offers')
    .update({ status: 'covered', updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('request_id', requestId)
    .neq('id', offerId)
    .in('status', [...LIVE_OFFER_STATUSES, 'accepted']);

  await supabase
    .from('crew_assignments')
    .insert({ account_id: accountId, job_id: (claimed as unknown as Row).job_id as string, crew_id: (offer as unknown as Row).crew_id as string })
    .then(
      () => undefined,
      () => undefined,
    );

  const detail = await getSubcontractorRequest(supabase, accountId, requestId);
  if (detail) {
    await recordTimeline(supabase, accountId, detail.request, (offer as unknown as Row).crew_id as string, {
      kind: 'sub_offer_accepted',
      title: 'Subcontractor chosen for the job',
      suffix: requestId,
    });
  }
  return { status: 'chosen' };
}

// -- private reviews -------------------------------------------------------------------

export type SubcontractorReviewInput = {
  jobId: string;
  crewId: string;
  requestId?: string | null;
  workQuality: number;
  communication: number;
  onTime: number;
  cleanliness: number;
  withinPrice: boolean;
  hireAgain: boolean;
  notes: string | null;
};

export async function saveSubcontractorReview(
  supabase: SupabaseClient,
  accountId: string,
  input: SubcontractorReviewInput,
  authorEmail: string | null,
): Promise<void> {
  const clamp = (value: number) => Math.min(5, Math.max(1, Math.round(Number(value) || 0) || 1));
  const { error } = await supabase.from('subcontractor_reviews').upsert(
    {
      account_id: accountId,
      job_id: input.jobId,
      crew_id: input.crewId,
      request_id: input.requestId ?? null,
      work_quality: clamp(input.workQuality),
      communication: clamp(input.communication),
      on_time: clamp(input.onTime),
      cleanliness: clamp(input.cleanliness),
      within_price: input.withinPrice,
      hire_again: input.hireAgain,
      notes: (input.notes ?? '').trim() || null,
      author_email: authorEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'job_id,crew_id' },
  );
  if (error) throw error;
}

export type SubReviewRow = {
  id: string;
  jobId: string;
  crewId: string;
  workQuality: number;
  communication: number;
  onTime: number;
  cleanliness: number;
  withinPrice: boolean;
  hireAgain: boolean;
  notes: string | null;
  createdAt: string;
};

export async function listSubcontractorReviews(
  supabase: SupabaseClient,
  accountId: string,
  options: { crewId?: string; jobId?: string } = {},
): Promise<SubReviewRow[]> {
  let query = supabase
    .from('subcontractor_reviews')
    .select('id, job_id, crew_id, work_quality, communication, on_time, cleanliness, within_price, hire_again, notes, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (options.crewId) query = query.eq('crew_id', options.crewId);
  if (options.jobId) query = query.eq('job_id', options.jobId);

  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id as string,
    jobId: row.job_id as string,
    crewId: row.crew_id as string,
    workQuality: Number(row.work_quality) || 0,
    communication: Number(row.communication) || 0,
    onTime: Number(row.on_time) || 0,
    cleanliness: Number(row.cleanliness) || 0,
    withinPrice: row.within_price === true,
    hireAgain: row.hire_again === true,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

/** Subcontractors assigned to this job, so the job page can ask for a review. */
export async function listJobSubcontractors(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<Array<{ crewId: string; displayName: string }>> {
  const { data: assignments } = await supabase
    .from('crew_assignments')
    .select('crew_id')
    .eq('account_id', accountId)
    .eq('job_id', jobId);
  const crewIds = ((assignments ?? []) as unknown as Row[]).map((row) => row.crew_id as string);
  if (crewIds.length === 0) return [];

  const { data, error } = await supabase
    .from('crew')
    .select('id, name, company_name')
    .eq('account_id', accountId)
    .eq('worker_type', 'subcontractor')
    .in('id', crewIds);
  if (error) return [];
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    crewId: row.id as string,
    displayName: subDisplayName((row.name as string) ?? 'Subcontractor', (row.company_name as string | null) ?? null),
  }));
}
