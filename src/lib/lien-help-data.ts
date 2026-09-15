import { SupabaseClient } from '@supabase/supabase-js';

export type LienHelpCase = {
  id: string;
  account_id: string;
  job_id: string;
  purpose: string | null;
  lifecycle: 'preparing' | 'ready' | 'filed' | 'closed';
  revision: number;
  reviewed_data: Record<string, any>;
  provider_name: string | null;
  provider_ref: string | null;
  next_action_date: string | null;
  next_action_text: string | null;
  next_action_source: string | null;
  closure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export async function getLienHelpCase(supabase: SupabaseClient, accountId: string, jobId: string) {
  const { data, error } = await supabase
    .from('lien_help_cases')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) throw error;
  return data as LienHelpCase | null;
}

export async function createLienHelpCase(supabase: SupabaseClient, accountId: string, jobId: string) {
  const { data, error } = await supabase
    .from('lien_help_cases')
    .insert({
      account_id: accountId,
      job_id: jobId,
      lifecycle: 'preparing',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as LienHelpCase;
}

export async function updateLienHelpCase(
  supabase: SupabaseClient,
  accountId: string,
  caseId: string,
  updates: Partial<LienHelpCase>
) {
  const { data, error } = await supabase
    .from('lien_help_cases')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', caseId)
    .eq('account_id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as LienHelpCase;
}
