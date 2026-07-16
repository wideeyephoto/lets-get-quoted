import type { SupabaseClient } from '@supabase/supabase-js';
import { createJob, deleteJob, type Job } from '@/lib/jobs';

export type LeadSource = 'website_form' | 'missed_call' | 'manual' | 'referral';
export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

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
  message?: string | null;
  photoPaths?: string[];
  sourcePage?: string | null;
};

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

export async function convertLeadToJob(
  supabase: SupabaseClient,
  accountId: string,
  leadId: string,
  quotedAmount = 0
): Promise<Job> {
  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) throw new Error('Lead not found.');
  if (lead.converted_job) throw new Error('This lead has already been converted.');

  const scope = [lead.project_type, lead.message].filter(Boolean).join('\n\n');
  const job = await createJob(supabase, accountId, {
    clientName: lead.name || 'Website lead',
    clientPhone: lead.phone,
    address: lead.address,
    scope: scope || null,
    status: 'new_lead',
    quotedAmount,
  });

  const { error } = await supabase
    .from('leads')
    .update({ converted_job: job.id, status: 'won', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', leadId);

  if (error) {
    await deleteJob(supabase, accountId, job.id);
    throw error;
  }
  return job;
}