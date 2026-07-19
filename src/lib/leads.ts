import type { SupabaseClient } from '@supabase/supabase-js';
import { createJob, deleteJob, type Job } from '@/lib/jobs';

export type LeadSource = 'website_form' | 'missed_call' | 'manual' | 'referral';
export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

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