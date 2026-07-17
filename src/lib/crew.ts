import type { SupabaseClient } from '@supabase/supabase-js';

export type CrewMember = {
  id: string;
  account_id: string;
  name: string;
  phone: string;
  role_label: string;
  hourly_rate: number;
  user_id: string | null;
  active: boolean;
  created_at: string;
};

export type CrewInput = {
  name: string;
  phone: string;
  roleLabel?: string;
  hourlyRate?: number;
};

export async function listCrew(
  supabase: SupabaseClient,
  accountId: string,
  options?: { activeOnly?: boolean }
): Promise<CrewMember[]> {
  let query = supabase
    .from('crew')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (options?.activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CrewMember[];
}

export async function createCrewMember(
  supabase: SupabaseClient,
  accountId: string,
  input: CrewInput
): Promise<CrewMember> {
  const { data, error } = await supabase
    .from('crew')
    .insert({
      account_id: accountId,
      name: input.name,
      phone: input.phone,
      role_label: input.roleLabel?.trim() || 'Laborer',
      hourly_rate: input.hourlyRate ?? 0,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to add crew member');
  return data as CrewMember;
}

export async function setCrewActive(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  active: boolean
): Promise<void> {
  const { error } = await supabase.from('crew').update({ active }).eq('account_id', accountId).eq('id', crewId);
  if (error) throw error;
}

// -- Job <-> crew assignment ------------------------------------------------

export async function listCrewIdsForJob(supabase: SupabaseClient, accountId: string, jobId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('crew_assignments')
    .select('crew_id')
    .eq('account_id', accountId)
    .eq('job_id', jobId);

  if (error) throw error;
  return (data ?? []).map((row) => row.crew_id as string);
}

// Replaces the full assignment set for a job to match `crewIds`, and returns
// the ids that are newly assigned (weren't assigned before this call) so the
// caller can notify only the crew members who are actually new to the job.
export async function setJobCrewAssignments(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  crewIds: string[]
): Promise<{ added: string[]; removed: string[] }> {
  const existing = await listCrewIdsForJob(supabase, accountId, jobId);
  const existingSet = new Set(existing);
  const nextSet = new Set(crewIds);

  const added = crewIds.filter((id) => !existingSet.has(id));
  const removed = existing.filter((id) => !nextSet.has(id));

  if (removed.length > 0) {
    const { error } = await supabase
      .from('crew_assignments')
      .delete()
      .eq('account_id', accountId)
      .eq('job_id', jobId)
      .in('crew_id', removed);
    if (error) throw error;
  }

  if (added.length > 0) {
    const { error } = await supabase
      .from('crew_assignments')
      .insert(added.map((crewId) => ({ account_id: accountId, job_id: jobId, crew_id: crewId })));
    if (error) throw error;
  }

  return { added, removed };
}
