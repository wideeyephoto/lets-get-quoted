import type { SupabaseClient } from '@supabase/supabase-js';
import { createJob, deleteJob, type Job } from '@/lib/jobs';
import { findOrCreateClientId } from '@/lib/clients';

export type LeadSource = 'website_form' | 'missed_call' | 'manual' | 'referral';
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
  flags: string[];
  timeline?: string;
  location?: string;
  estimate?: { min: number; max: number } | null;
  // 'text_only' = the homeowner asked not to be called — text first.
  contactPreference?: 'any' | 'text_only';
  snoozedUntil?: string | null;
  archived?: boolean;
  declinedReason?: string | null;
  contactLog?: LeadContactEntry[];
};

export const LEAD_PRUNE_FLAGS = new Set(['out_of_area', 'excluded_work', 'below_minimum', 'just_researching']);

// Cookie that remembers each user's chosen Lead Details action layout.
export const LEAD_LAYOUT_COOKIE = 'lgq_lead_layout';

// Cookie that remembers the Leads board view (board / inbox / table / split /
// focus). Unknown values fall back to the board, so an old cookie from before a
// view existed — or a hand-edited one — never renders a blank workspace.
export const LEADS_VIEW_COOKIE = 'lgq_leads_view';
export type LeadsView = 'board' | 'inbox' | 'table' | 'split' | 'focus';
export const LEADS_VIEWS: LeadsView[] = ['board', 'inbox', 'table', 'split', 'focus'];
export function normalizeLeadsView(value: unknown): LeadsView {
  return LEADS_VIEWS.includes(value as LeadsView) ? (value as LeadsView) : 'board';
}

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
};

export function getLeadTriage(lead: Pick<Lead, 'triage'>): LeadTriage {
  const triage = lead.triage;
  if (!triage || typeof triage !== 'object') return { score: 'warm', flags: [] };
  return {
    score: triage.score === 'hot' || triage.score === 'low' ? triage.score : 'warm',
    flags: Array.isArray(triage.flags) ? triage.flags.filter((flag): flag is string => typeof flag === 'string') : [],
    timeline: typeof triage.timeline === 'string' ? triage.timeline : undefined,
    location: typeof triage.location === 'string' ? triage.location : undefined,
    estimate: triage.estimate && typeof triage.estimate === 'object' ? triage.estimate : null,
    contactPreference: triage.contactPreference === 'text_only' ? 'text_only' : 'any',
    snoozedUntil: typeof triage.snoozedUntil === 'string' ? triage.snoozedUntil : null,
    archived: triage.archived === true,
    declinedReason: typeof triage.declinedReason === 'string' ? triage.declinedReason : null,
    contactLog: Array.isArray(triage.contactLog)
      ? triage.contactLog
          .filter((entry): entry is LeadContactEntry => Boolean(entry) && typeof entry === 'object' && typeof entry.at === 'string' && typeof entry.label === 'string')
          .map((entry) => ({ at: entry.at, label: entry.label, ...(typeof entry.note === 'string' && entry.note ? { note: entry.note } : {}) }))
      : undefined,
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
  triage?: LeadTriage | null;
};

export function formatLeadSource(source: LeadSource): string {
  if (source === 'website_form') return 'Website form';
  if (source === 'missed_call') return 'Missed call';
  if (source === 'referral') return 'Referral';
  return 'Manual';
}

export function formatElapsedTime(from: string, to = new Date()): string {
  const start = new Date(from).getTime();
  const end = to.getTime();
  if (!Number.isFinite(start)) return 'Unknown';
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export function getRequestResponseMs(lead: Lead): number | null {
  if (lead.status === 'new') return null;
  const createdAt = new Date(lead.created_at).getTime();
  const updatedAt = new Date(lead.updated_at).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || updatedAt <= createdAt) return null;
  return updatedAt - createdAt;
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
  const { data, error } = await supabase
    .from('leads')
    .insert({
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
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to create lead.');
  const lead = data as Lead;

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

export async function listLeads(
  supabase: SupabaseClient,
  accountId: string,
  status?: LeadStatus
): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

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

export async function expireStaleLeads(supabase: SupabaseClient, accountId: string, days = 30): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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
export async function unconvertLeadFromJob(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string
): Promise<Lead> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  if (!lead.converted_job) throw new Error('This lead has not been converted to a job yet.');

  await deleteJob(supabase, accountId, lead.converted_job);

  const revertedStatus: LeadStatus = lead.quote_visit ? 'contacted' : 'new';
  const { data, error } = await supabase
    .from('leads')
    .update({ converted_job: null, status: revertedStatus, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to undo the sent quote.');
  return data as Lead;
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