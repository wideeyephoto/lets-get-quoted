import type { SupabaseClient } from '@supabase/supabase-js';
import { createJob, deleteJob, type Job } from '@/lib/jobs';

export type LeadSource = 'website_form' | 'missed_call' | 'manual' | 'referral';
export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

export type LeadScore = 'hot' | 'warm' | 'low';

// Lead-quality record written at intake (flags + score) and edited by the
// owner's triage actions (snooze / archive / decline). Stored in leads.triage.
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
};

export const LEAD_PRUNE_FLAGS = new Set(['out_of_area', 'excluded_work', 'below_minimum', 'just_researching']);

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
  triage: LeadTriage | null;
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
  return data as Lead;
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