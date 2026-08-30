import type { SupabaseClient } from '@supabase/supabase-js';
import { createJob, deleteJob, getJob, parseQuoteItems, type Job, type QuoteItem } from '@/lib/jobs';
import { findOrCreateClientId } from '@/lib/clients';
import { normalizeClientChannelPreference } from '@/lib/client-channel';
import { applyTestRecordFilter, type TestRecordOptions } from '@/lib/test-records';
import type { LeadVisualAnalysis } from '@/lib/lead-photo-ai';
import { sanitizeAttribution, type LeadAttribution } from '@/lib/attribution';
export { formatLeadAttribution, type LeadAttribution } from '@/lib/attribution';

export type LeadSource = 'website_form' | 'missed_call' | 'manual' | 'referral' | 'ai_voice';
export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

export type LeadScore = 'hot' | 'warm' | 'low';

// Lead-quality record written at intake (flags + score) and edited by the
// owner's triage actions (snooze / archive / decline). Stored in leads.triage.
// A single logged touchpoint with the homeowner (call, text, voicemail…),
// with an optional freeform note. Appended to triage.contactLog.
export type LeadContactEntry = {
  at: string;
  label: string;
  note?: string;
};

export type LeadTriage = {
  score: LeadScore;
  // 'out_of_area' | 'excluded_work' | 'below_minimum' | 'just_researching'
  // | 'while_booked' | 'repeat' | 'phone_verified'
  // | 'phone_verification_unavailable'
  flags: string[];
  timeline?: string;
  /**
   * The SECOND window an online booking asked for, when they named one.
   *
   * Kept out of `timeline` on purpose: that field is a chip on the leads board
   * and reads best as one short phrase. Two windows in it turns a chip into a
   * sentence on every row, including the rows that only ever have one.
   */
  timelineAlt?: string;
  location?: string;
  estimate?: { min: number; max: number } | null;
  permit?: {
    required: boolean;
    authorityName: string;
    estimatedFee: number | null;
  };
  /** Structured visual intelligence extracted from lead photos (equipment, damage, pick-list). */
  visualAnalysis?: LeadVisualAnalysis | null;
  // 'text_only' = the homeowner asked not to be called — text first.
  //
  // A VOICE preference, and only that: it is about picking up the phone, and it
  // is the homeowner's own answer on the inquiry form. Not to be confused with
  // messageChannel below, which is the contractor's decision about automatic
  // messages. Someone can be "don't call me" and still be on email-only.
  contactPreference?: 'any' | 'text_only';
  /**
   * How automatic messages may reach this person — see @/lib/client-channel.
   *
   * Absent means 'auto', which is what every lead created before this existed
   * meant: text if there's a mobile, email if not. Handed to the job at
   * conversion (convertLeadToJob), because that is where the automations look.
   */
  messageChannel?: 'auto' | 'sms' | 'email' | 'off';
  snoozedUntil?: string | null;
  archived?: boolean;
  declinedReason?: string | null;
  contactLog?: LeadContactEntry[];
  /** Marketing campaign, social source, or ad click attribution */
  attribution?: LeadAttribution | null;
  /**
   * The quote as it was last sent, so undoing it is an edit rather than a
   * retype. See LeadQuoteDraft.
   */
  quoteDraft?: LeadQuoteDraft | null;
};

/**
 * WHAT THE OWNER TYPED, KEPT AFTER THE JOB IT MADE IS DELETED.
 *
 * "Undo sent quote" deletes the job — it has to, because the job is what the
 * customer was sent a link to, and leaving a half-real one behind is worse than
 * removing it. But the quote was ten line items, a deposit percentage and a
 * payment schedule, and all of it lived on that job. Undoing to fix one price
 * meant typing the other nine again, so the safe correction was the expensive
 * one and the cheap one was to leave a wrong quote out there.
 *
 * So the draft lives on the LEAD, which survives. It is written at send time
 * (the form fields, which exist nowhere else afterwards) and refreshed from the
 * job at undo time (the line items and hours, which may have been edited on the
 * job since). Nothing here is ever shown to a customer: it is the form's
 * opening state, and every value is re-validated on the next send.
 *
 * Stored inside `triage`, which is already a JSONB blob on the row, rather than
 * in a column of its own — the column would have to land in a migration before
 * any deploy could read it, and this needs no new schema at all.
 */
export type LeadQuoteDraft = {
  items: QuoteItem[];
  estimatedHours: number | null;
  showHoursToClient: boolean;
  paymentTerms: 'full' | 'deposit' | 'plan';
  depositValue: number | null;
  depositUnit: 'percent' | 'fixed';
  depositTiming: 'before_schedule' | 'before_work';
  planDepositPercent: number | null;
  planInstallments: number | null;
  planFrequency: 'weekly' | 'biweekly' | 'monthly';
  planFirstDate: string | null;
  planAllowPayInFull: boolean;
  /** When the quote this came from was sent. Shown to the owner, not stored for logic. */
  sentAt: string;
};

/** The shape a form-less caller gets: pay in full, nothing else assumed. */
export const EMPTY_QUOTE_DRAFT: Omit<LeadQuoteDraft, 'items' | 'sentAt'> = {
  estimatedHours: null,
  showHoursToClient: false,
  paymentTerms: 'full',
  depositValue: null,
  depositUnit: 'percent',
  depositTiming: 'before_schedule',
  planDepositPercent: null,
  planInstallments: null,
  planFrequency: 'monthly',
  planFirstDate: null,
  planAllowPayInFull: true,
};

export const LEAD_PRUNE_FLAGS = new Set(['out_of_area', 'excluded_work', 'below_minimum', 'just_researching']);

// Cookie that remembers each user's chosen Lead Details action layout.
export const LEAD_LAYOUT_COOKIE = 'lgq_lead_layout';

// The Leads view enum moved to @/lib/dashboard-views, which is the client-safe
// home every other view cookie already uses. It has to be reachable from a
// 'use client' component — the view picker — and THIS module imports
// @/lib/jobs and @/lib/clients, so importing a value from here into a browser
// bundle fails the build with "Can't resolve 'fs'".
//
// Re-exported so the server files that already read them from here keep
// working unchanged.
export {
  LEADS_VIEW_COOKIE,
  LEADS_VIEWS,
  DEFAULT_LEADS_VIEW,
  normalizeLeadsView,
  type LeadsView,
} from '@/lib/dashboard-views';

// One-tap decline templates — the key is stored on triage.declinedReason and
// the value is woven into the polite close-out text.
export const LEAD_DECLINE_REASONS: Record<string, string> = {
  out_of_area: "we don't currently serve your area",
  excluded_work: "this isn't a type of work we take on",
  below_minimum: 'this job is below our minimum job size',
  fully_booked: "we're fully booked right now",
};

export const LEAD_FLAG_LABELS: Record<string, string> = {
  out_of_area: 'Out of area',
  excluded_work: "Work they don't do",
  below_minimum: 'Below minimum',
  just_researching: 'Just researching',
  while_booked: 'Came in while booked',
  repeat: 'Repeat request',
  phone_verified: 'Phone verified',
  // Deliberately NOT filtered out of the chip list the way phone_verified is.
  // The owner turned verification on; this says it did not run, so the number
  // on this lead is unproven. An unflagged lead and an unverifiable one looked
  // identical before, which is the failure this names.
  phone_verification_unavailable: 'Phone not verified — texting unavailable',
  junk_email: 'Email looks fake',
};

export function getLeadTriage(lead: Pick<Lead, 'triage'>): LeadTriage {
  const triage = lead.triage;
  if (!triage || typeof triage !== 'object') return { score: 'warm', flags: [] };
  return {
    score: triage.score === 'hot' || triage.score === 'low' ? triage.score : 'warm',
    flags: Array.isArray(triage.flags) ? triage.flags.filter((flag): flag is string => typeof flag === 'string') : [],
    timeline: typeof triage.timeline === 'string' ? triage.timeline : undefined,
    timelineAlt: typeof triage.timelineAlt === 'string' ? triage.timelineAlt : undefined,
    location: typeof triage.location === 'string' ? triage.location : undefined,
    estimate: triage.estimate && typeof triage.estimate === 'object' ? triage.estimate : null,
    contactPreference: triage.contactPreference === 'text_only' ? 'text_only' : 'any',
    messageChannel: normalizeClientChannelPreference(triage.messageChannel),
    snoozedUntil: typeof triage.snoozedUntil === 'string' ? triage.snoozedUntil : null,
    archived: triage.archived === true,
    declinedReason: typeof triage.declinedReason === 'string' ? triage.declinedReason : null,
    contactLog: Array.isArray(triage.contactLog)
      ? triage.contactLog
          .filter((entry): entry is LeadContactEntry => Boolean(entry) && typeof entry === 'object' && typeof entry.at === 'string' && typeof entry.label === 'string')
          .map((entry) => ({ at: entry.at, label: entry.label, ...(typeof entry.note === 'string' && entry.note ? { note: entry.note } : {}) }))
      : undefined,
    attribution: sanitizeAttribution(triage.attribution) || undefined,
    /* PARSED HERE OR LOST EVERYWHERE.
       This function does not read the blob, it rebuilds it — and every triage
       write in the app is `{ ...getLeadTriage(lead), ...change }`. A field this
       does not know about therefore survives exactly until the next snooze,
       archive, decline or logged call, and then vanishes with no error. The
       draft was written and read back empty for exactly that reason. */
    quoteDraft: parseQuoteDraft(triage.quoteDraft),
  };
}

/**
 * The stored draft, validated rather than trusted.
 *
 * It seeds a form the owner is about to send to a customer, so a malformed blob
 * must degrade to "no draft" rather than to a half-filled quote — and every
 * value is re-validated by convertLeadAction on the next send regardless.
 */
function parseQuoteDraft(raw: unknown): LeadQuoteDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const draft = raw as Record<string, unknown>;
  const items = parseQuoteItems(Array.isArray(draft.items) ? draft.items : []);
  if (!items.length) return null;

  const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const terms = draft.paymentTerms;
  return {
    items,
    estimatedHours: num(draft.estimatedHours),
    showHoursToClient: draft.showHoursToClient === true,
    paymentTerms: terms === 'deposit' || terms === 'plan' ? terms : 'full',
    depositValue: num(draft.depositValue),
    depositUnit: draft.depositUnit === 'fixed' ? 'fixed' : 'percent',
    depositTiming: draft.depositTiming === 'before_work' ? 'before_work' : 'before_schedule',
    planDepositPercent: num(draft.planDepositPercent),
    planInstallments: num(draft.planInstallments),
    planFrequency: draft.planFrequency === 'weekly' || draft.planFrequency === 'biweekly' ? draft.planFrequency : 'monthly',
    planFirstDate: typeof draft.planFirstDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(draft.planFirstDate) ? draft.planFirstDate : null,
    planAllowPayInFull: draft.planAllowPayInFull !== false,
    sentAt: typeof draft.sentAt === 'string' ? draft.sentAt : new Date().toISOString(),
  };
}

// True while a snooze is active (snoozed leads collapse out of the board).
export function isLeadSnoozed(triage: LeadTriage, now = new Date()): boolean {
  if (!triage.snoozedUntil) return false;
  const until = new Date(triage.snoozedUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

export type LeadQuoteVisit = {
  scheduledFor: string;
  scheduledTime: string;
  durationMinutes: number;
  notes: string | null;
  confirmationTextSentAt: string | null;
  scheduledAt: string;
};

export type Lead = {
  id: string;
  account_id: string;
  source: LeadSource;
  status: LeadStatus;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  project_type: string | null;
  estimated_hours: number | null;
  quote_visit: LeadQuoteVisit | null;
  message: string | null;
  photo_paths: string[];
  source_page: string | null;
  source_voice_event_id?: string | null;
  converted_job: string | null;
  client_id: string | null;
  triage: LeadTriage | null;
  lat: number | null;
  lng: number | null;
  geocoded_at: string | null;
  updated_at: string;
  created_at: string;
};

export type LeadInput = {
  source?: LeadSource;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  projectType?: string | null;
  estimatedHours?: number | null;
  message?: string | null;
  photoPaths?: string[];
  sourcePage?: string | null;
  /** Stable receipt identity used only by the AI Voice settlement replay. */
  sourceVoiceEventId?: string | null;
  triage?: LeadTriage | null;
};

export function formatLeadSource(source: LeadSource): string {
  if (source === 'website_form') return 'Website form';
  if (source === 'missed_call') return 'Missed call';
  if (source === 'referral') return 'Referral';
  if (source === 'ai_voice') return 'AI receptionist';
  return 'Manual';
}

/**
 * How long ago, in the largest unit that still means something.
 *
 * It stopped at hours and never rolled over, so an eleven-day-old lead was
 * badged "Received 265h ago" — a number nobody converts in their head, next to
 * a card urging them to act "before this lead cools off". Nobody reads 265h as
 * a week and a half; they read it as a big number and move on.
 */
export function formatElapsedTime(from: string, to = new Date()): string {
  const start = new Date(from).getTime();
  const end = to.getTime();
  if (!Number.isFinite(start)) return 'Unknown';
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} days`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks`;
}

/**
 * URGENCY AND RECENCY ARE NOT THE SAME FACT, and the page was showing one badge
 * for both. "🔥 Hot" is a claim about the JOB — the homeowner said ASAP, the
 * estimate is high, the water is still running. Whether anybody has answered
 * them is a claim about US. An eleven-day-old lead can be both genuinely urgent
 * and badly overdue, and reading "Hot" as "fresh" is how it ends up looking
 * like neither.
 *
 * Returns null on the ordinary case: a lead somebody has already replied to, or
 * one that arrived this morning. A badge on every record for "nothing wrong
 * here" trains people to stop reading badges.
 */
export function leadOverdueLabel(lead: Pick<Lead, 'status' | 'created_at'>, now = new Date()): string | null {
  // Only 'new' means nobody has logged a reply. Every other status is somebody
  // having done something about it, whatever the age.
  if (lead.status !== 'new') return null;
  const created = new Date(lead.created_at).getTime();
  if (!Number.isFinite(created)) return null;
  const hours = (now.getTime() - created) / 3_600_000;
  if (hours < 24) return null;
  return `Overdue — no reply logged in ${formatElapsedTime(lead.created_at, now)}`;
}

export function getRequestResponseMs(lead: Lead): number | null {
  const createdAt = new Date(lead.created_at).getTime();
  if (!Number.isFinite(createdAt)) return null;

  // updated_at also moves for score edits, photos and other bookkeeping. A
  // response metric must come from an actual logged contact, or say there was
  // no response rather than crediting an unrelated edit.
  const firstContactAt = (getLeadTriage(lead).contactLog ?? [])
    .map((entry) => new Date(entry.at).getTime())
    .filter((at) => Number.isFinite(at) && at > createdAt)
    .sort((a, b) => a - b)[0];
  return firstContactAt === undefined ? null : firstContactAt - createdAt;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return 'No responses yet';
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function getAverageRequestResponseMs(leads: Lead[]): number | null {
  const responseTimes = leads
    .map(getRequestResponseMs)
    .filter((time): time is number => time !== null);
  if (responseTimes.length === 0) return null;
  return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
}

export async function createLead(
  supabase: SupabaseClient,
  accountId: string,
  input: LeadInput
): Promise<Lead> {
  const values = {
    account_id: accountId,
    source: input.source ?? 'website_form',
    status: 'new',
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    address: input.address?.trim() || null,
    project_type: input.projectType?.trim() || null,
    estimated_hours: input.estimatedHours ?? null,
    message: input.message?.trim() || null,
    photo_paths: input.photoPaths ?? [],
    source_page: input.sourcePage?.trim() || null,
    triage: input.triage ?? null,
    ...(input.sourceVoiceEventId
      ? { source_voice_event_id: input.sourceVoiceEventId }
      : {}),
  };
  let lead: Lead;
  if (input.sourceVoiceEventId) {
    // Receipt work can be replayed after either a worker failure or a lost HTTP
    // response. Conflict-do-nothing is essential here: an ordinary UPSERT
    // would put a lead that staff already progressed back into `new` and replace
    // the caller's original intake fields on a late provider retry.
    let result: { data: unknown; error: unknown };
    try {
      result = await supabase
        .from('leads')
        .upsert(values, {
          onConflict: 'source_voice_event_id',
          ignoreDuplicates: true,
        })
        .select('*')
        .maybeSingle();
    } catch (error) {
      return recoverExistingVoiceLead(
        supabase, accountId, input.sourceVoiceEventId, error,
      );
    }

    if (result.error || !result.data) {
      return recoverExistingVoiceLead(
        supabase,
        accountId,
        input.sourceVoiceEventId,
        result.error ?? new Error('Unable to create voice lead.'),
      );
    }
    lead = result.data as Lead;
  } else {
    // Every ordinary form/manual lead keeps the original insert-only behavior.
    const { data, error } = await supabase
      .from('leads')
      .insert(values)
      .select('*')
      .single();
    if (error || !data) throw error ?? new Error('Unable to create lead.');
    lead = data as Lead;
  }

  // Link (or create) the unified client profile from intake. Best-effort — a
  // failure must never fail lead creation; the lead just stays unlinked.
  try {
    const clientId = await findOrCreateClientId(supabase, accountId, {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
    });
    if (clientId) {
      await supabase.from('leads').update({ client_id: clientId }).eq('id', lead.id);
      lead.client_id = clientId;
    }
  } catch (clientError) {
    console.error(`Client link failed for lead ${lead.id}:`, clientError instanceof Error ? clientError.message : clientError);
  }

  // Geocode the address for the dashboard map (leads/jobs/schedule pins) and
  // route-density anchoring. Best-effort + precise-only (see geocode.ts); an
  // imprecise or failed result leaves coords null. Dynamically imported so the
  // server-only geocoder never lands in a client bundle. Never fails the lead.
  if (lead.address) {
    try {
      const { geocodeColumns } = await import('@/lib/geocode');
      const geo = await geocodeColumns(lead.address);
      if (geo && geo.lat != null && geo.lng != null) {
        await supabase.from('leads').update({ lat: geo.lat, lng: geo.lng, geocoded_at: geo.geocoded_at }).eq('id', lead.id);
        lead.lat = geo.lat;
        lead.lng = geo.lng;
        lead.geocoded_at = geo.geocoded_at;
      }
    } catch (geoError) {
      console.error(`Geocode failed for lead ${lead.id}:`, geoError instanceof Error ? geoError.message : geoError);
    }
  }

  return lead;
}

/**
 * Resolve an ambiguous/conflicting AI Voice insert without mutating its winner.
 *
 * The service client reads by both immutable event id and owning account. If no
 * winner exists, the original insert/transport error is preserved so the inbox
 * processor retries. Returning here deliberately skips client-link/geocoding:
 * those best-effort enrichments must not modify a progressed existing lead.
 */
async function recoverExistingVoiceLead(
  supabase: SupabaseClient,
  accountId: string,
  voiceEventId: string,
  originalError: unknown,
): Promise<Lead> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('source_voice_event_id', voiceEventId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!error && data) return data as Lead;
  } catch {
    // Preserve the causal insert/transport failure below. A later receipt retry
    // repeats this exact lookup after the ambiguous write has become visible.
  }
  throw originalError;
}

// Backfill coordinates for existing leads that have an address but no lat/lng
// (created before geocoding, or where an earlier attempt was imprecise and
// never cached). Best-effort and precise-only; safe to call on each map load —
// it only touches rows that were never successfully geocoded. Returns the count
// of leads updated. Never throws (map render must not depend on the geocoder).
export async function backfillLeadCoordinates(
  supabase: SupabaseClient,
  accountId: string,
  limit = 25
): Promise<number> {
  try {
    const { data } = await supabase
      .from('leads')
      .select('id, address')
      .eq('account_id', accountId)
      .is('geocoded_at', null)
      .not('address', 'is', null)
      .limit(limit);
    const rows = (data ?? []) as { id: string; address: string | null }[];
    if (rows.length === 0) return 0;

    const { geocodeColumns } = await import('@/lib/geocode');
    let updated = 0;
    for (const row of rows) {
      const geo = await geocodeColumns(row.address);
      if (!geo) continue; // geocoder unavailable — stop caching attempts this pass
      // Cache the attempt even when imprecise (lat/lng null) so we don't retry it forever.
      await supabase.from('leads').update({ lat: geo.lat, lng: geo.lng, geocoded_at: geo.geocoded_at }).eq('id', row.id);
      if (geo.lat != null && geo.lng != null) updated += 1;
    }
    return updated;
  } catch (error) {
    console.error('Lead coordinate backfill failed:', error instanceof Error ? error.message : error);
    return 0;
  }
}

// `excludeTestRecords` leaves out the rows a seeding or probe script stamped as
// its own — see src/lib/test-records.ts. ON now that the column is in the
// database and the rows already there have been stamped; pass it as `false` to
// see everything. This is the seam the ticker, the funnel and
// getAverageRequestResponseMs all sit behind, so this is what makes those
// numbers the owner's rather than the seeder's.
export async function listLeads(
  supabase: SupabaseClient,
  accountId: string,
  status?: LeadStatus,
  options?: TestRecordOptions
): Promise<Lead[]> {
  let query = applyTestRecordFilter(
    supabase
      .from('leads')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false }),
    options
  );

  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export async function getLead(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string
): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', leadId)
    .maybeSingle();

  if (error) throw error;
  return data as Lead | null;
}

// Reverse lookup of convertLeadToJob — used so a job created from a lead can
// link back to that lead (e.g. to undo an accidentally sent quote).
export async function getLeadByConvertedJob(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string
): Promise<Lead | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('account_id', accountId)
    .eq('converted_job', jobId)
    .maybeSingle();

  if (error) throw error;
  return data as Lead | null;
}

// Appends newly uploaded photo paths to the lead's existing attachments.
export async function addLeadPhotos(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  paths: string[]
): Promise<Lead> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  const { data, error } = await supabase
    .from('leads')
    .update({ photo_paths: [...lead.photo_paths, ...paths], updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to add lead photos.');
  return data as Lead;
}

// Removes a single photo path from the lead's attachments (storage cleanup
// is handled by the caller via deleteLeadPhotos).
export async function removeLeadPhoto(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  path: string
): Promise<Lead> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  const { data, error } = await supabase
    .from('leads')
    .update({ photo_paths: lead.photo_paths.filter((existing) => existing !== path), updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to remove lead photo.');
  return data as Lead;
}

export async function reorderLeadPhotos(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  paths: string[]
): Promise<Lead> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  const existing = lead.photo_paths;
  const sameLength = paths.length === existing.length;
  const samePhotos = sameLength && paths.every((path) => existing.includes(path)) && new Set(paths).size === paths.length;
  if (!samePhotos) throw new Error('Photo order does not match this lead.');

  const { data, error } = await supabase
    .from('leads')
    .update({ photo_paths: paths, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to reorder lead photos.');
  return data as Lead;
}

export async function updateLeadStatus(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  status: LeadStatus
): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to update lead.');
  return data as Lead;
}

export async function updateLeadDetails(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  input: Omit<LeadInput, 'source' | 'photoPaths' | 'sourcePage'>
): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .update({
      name: input.name.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      address: input.address?.trim() || null,
      project_type: input.projectType?.trim() || null,
      estimated_hours: input.estimatedHours ?? null,
      message: input.message?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to update lead details.');
  return data as Lead;
}

export async function clearLeadQuoteVisit(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string
): Promise<Lead> {
  const { data, error } = await supabase
    .from('leads')
    .update({ quote_visit: null, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to clear quote visit.');
  return data as Lead;
}

/* --- How long a lead gets before the app writes it off ----------------------
   Thirty days used to be a constant here, and it suited almost nobody exactly:
   storm-chasing trades give up in a fortnight, and a kitchen fitter is still in
   conversation at ninety days — where the old constant closed the lead
   underneath them. It is an account setting now. */

export const DEFAULT_LEAD_LOST_AFTER_DAYS = 30;
/** Auto-lost switched off. Zero rather than null — see the migration. */
export const LEAD_LOST_NEVER = 0;
export const LEAD_LOST_AFTER_CHOICES = [7, 14, 21, 30, 45, 60, 90, 180, LEAD_LOST_NEVER] as const;

export function leadLostAfterLabel(days: number): string {
  if (days === LEAD_LOST_NEVER) return 'Never — I’ll close them myself';
  if (days % 7 === 0 && days < 60) return `${days} days (${days / 7} week${days / 7 === 1 ? '' : 's'})`;
  return `${days} days`;
}

/**
 * Whatever came out of a form or a database column, as a number of days.
 *
 * Zero has to survive this, so the guard cannot be a truthiness check — `value
 * || DEFAULT` would read "never" as "thirty days" and silently start closing
 * leads for the one owner who explicitly asked it not to.
 */
export function normalizeLeadLostAfterDays(value: unknown): number {
  // Absent is not zero, and Number() disagrees: Number(null) and Number('') are
  // both 0, which is the value that means "never auto-close". So a missing
  // column or an empty form field would have switched the feature OFF for the
  // account instead of leaving it at the default — the exact conflation the
  // migration chose 0-not-null to avoid, undone here in a type coercion.
  if (value === null || value === undefined || value === '') return DEFAULT_LEAD_LOST_AFTER_DAYS;
  const days = Number(value);
  if (!Number.isFinite(days)) return DEFAULT_LEAD_LOST_AFTER_DAYS;
  const whole = Math.round(days);
  if (whole < 0 || whole > 3650) return DEFAULT_LEAD_LOST_AFTER_DAYS;
  return whole;
}

/**
 * The account's setting, falling back to the old fixed 30 days.
 *
 * The fallback is doing real work: the column arrives in a migration that is run
 * by hand, so between deploy and SQL every read here fails. Catching it keeps
 * the previous behavior exactly rather than throwing on four different pages.
 */
export async function getLeadLostAfterDays(supabase: SupabaseClient, accountId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('lead_lost_after_days')
      .eq('id', accountId)
      .maybeSingle();
    if (error || !data) return DEFAULT_LEAD_LOST_AFTER_DAYS;
    return normalizeLeadLostAfterDays((data as { lead_lost_after_days?: unknown }).lead_lost_after_days);
  } catch {
    return DEFAULT_LEAD_LOST_AFTER_DAYS;
  }
}

/**
 * Mark leads lost once they are older than the account's window.
 *
 * Reads the setting itself rather than taking it as a parameter. Four different
 * page loads call this, and a default argument meant adding a setting would
 * silently apply to whichever call sites somebody remembered to update. The
 * override is still there for tests.
 */
export async function expireStaleLeads(supabase: SupabaseClient, accountId: string, days?: number): Promise<void> {
  const window = days ?? (await getLeadLostAfterDays(supabase, accountId));
  // Zero (or anything nonsensical) means the owner turned this off. Leaving
  // early is the whole feature — no cutoff, no write.
  if (!(window > 0)) return;

  const cutoff = new Date(Date.now() - window * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('leads')
    .update({ status: 'lost', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .in('status', ['new', 'contacted', 'quoted'])
    .lt('created_at', cutoff);

  if (error) throw error;
}

export async function convertLeadToJob(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  quotedAmount = 0,
  estimatedHours?: number | null
): Promise<Job> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  if (lead.converted_job) throw new Error('This lead has already been converted.');

  const scope = [lead.project_type, lead.message].filter(Boolean).join('\n\n');
  const job = await createJob(supabase, accountId, {
    clientName: lead.name || 'Website lead',
    clientPhone: lead.phone,
    clientEmail: lead.email,
    address: lead.address,
    scope: scope || null,
    status: 'new_lead',
    quotedAmount,
    estimatedHours: estimatedHours ?? lead.estimated_hours,
  });

  // THE PREFERENCE TRAVELS WITH THE WORK.
  //
  // Every automation that texts a customer starts from a job row, so a
  // "don't text this one" that stopped at the lead would be honoured for the
  // quote and forgotten by the first reminder afterwards.
  //
  // A separate best-effort update rather than a column on createJob's insert:
  // an insert naming a column that does not exist yet fails outright, and this
  // code ships ahead of its migration. Skipped entirely for 'auto', which is
  // the column default anyway — so on a pre-migration database nothing is ever
  // written, nothing throws, and every job behaves exactly as it does today.
  const channel = getLeadTriage(lead).messageChannel ?? 'auto';
  if (channel !== 'auto') {
    const { error: channelError } = await supabase
      .from('jobs')
      .update({ message_channel: channel })
      .eq('account_id', accountId)
      .eq('id', job.id);
    if (channelError) {
      console.error(`Message channel not carried to job ${job.id}:`, channelError.message);
    } else {
      job.message_channel = channel;
    }
  }

  const { error } = await supabase
    .from('leads')
    .update({ converted_job: job.id, status: 'quoted', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);

  if (error) {
    await deleteJob(supabase, accountId, job.id);
    throw error;
  }
  return job;
}

// Reverses convertLeadToJob: deletes the job that was created (cascading to
// its feed events, costs, invoices, schedule requests, etc. via FK
// constraints) and puts the lead back into a pre-conversion state so the
// quote can be redone with correct details.
//
// THE DETAILS COME BACK WITH IT. The job carried the line items and the hours,
// and deleting the job used to take them with it — so correcting one price in a
// ten-line quote meant typing the other nine again. The draft on the lead is
// refreshed from the job on the way out (the job is the current version of
// those two fields, since either can be edited there after sending) and merged
// over whatever the send stored, which is everything the form asked for that
// the job never held. See LeadQuoteDraft.
export async function unconvertLeadFromJob(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string
): Promise<Lead> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  if (!lead.converted_job) throw new Error('This lead has not been converted to a job yet.');

  const triage = getLeadTriage(lead);
  const quoteDraft = await captureQuoteDraft(supabase, accountId, lead.converted_job, triage.quoteDraft ?? null);

  await deleteJob(supabase, accountId, lead.converted_job);

  const revertedStatus: LeadStatus = lead.quote_visit ? 'contacted' : 'new';
  const { data, error } = await supabase
    .from('leads')
    .update({
      converted_job: null,
      status: revertedStatus,
      triage: { ...triage, quoteDraft },
      // Kept on the lead too, so the field is filled even for a lead whose
      // hours were only ever typed into the quote form.
      estimated_hours: quoteDraft?.estimatedHours ?? lead.estimated_hours,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to undo the sent quote.');
  return data as Lead;
}

/**
 * The quote to hand back to the form, read off the job that is about to go.
 *
 * BEST EFFORT, ALWAYS. This runs one step before an irreversible delete, and a
 * failure to read it is not a reason to strand the owner with a job they asked
 * to remove — the worst case is the form opens the way it always used to. So
 * every failure here returns what we already had rather than throwing.
 */
async function captureQuoteDraft(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  stored: LeadQuoteDraft | null,
): Promise<LeadQuoteDraft | null> {
  let job: Job | null = null;
  try {
    job = await getJob(supabase, accountId, jobId);
  } catch (error) {
    console.error(`Quote draft not captured for job ${jobId}:`, (error as Error).message);
    return stored;
  }
  if (!job) return stored;

  const items = parseQuoteItems(job.quote_items ?? []);
  // A quote with no line items at all is the legacy single-amount shape. One
  // row carrying that amount is a better starting point than an empty builder.
  const seeded: QuoteItem[] = items.length
    ? items
    : Number(job.quoted_amount) > 0
      ? [{ id: 'restored-total', label: job.scope?.split('\n')[0]?.slice(0, 80) || 'Quoted work', amount: Number(job.quoted_amount), kind: 'base', selected: true, recommended: false }]
      : (stored?.items ?? []);

  if (!seeded.length) return stored;

  return {
    ...EMPTY_QUOTE_DRAFT,
    ...(stored ?? {}),
    items: seeded,
    estimatedHours: job.estimated_hours ?? stored?.estimatedHours ?? null,
    sentAt: stored?.sentAt ?? job.created_at ?? new Date().toISOString(),
  };
}

export async function scheduleLeadQuoteVisit(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  visit: Omit<LeadQuoteVisit, 'scheduledAt'>
): Promise<Lead> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');

  const nextStatus: LeadStatus = lead.status === 'new' ? 'contacted' : lead.status;
  const { data, error } = await supabase
    .from('leads')
    .update({
      quote_visit: { ...visit, scheduledAt: new Date().toISOString() },
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to schedule quote visit.');
  return data as Lead;
}
