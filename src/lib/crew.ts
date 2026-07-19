import type { SupabaseClient } from '@supabase/supabase-js';

export type CrewMember = {
  id: string;
  account_id: string;
  name: string;
  phone: string;
  role_label: string;
  hourly_rate: number;
  photo_path: string | null;
  user_id: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type CrewInput = {
  name: string;
  phone: string;
  roleLabel?: string;
  hourlyRate?: number;
  photoPath?: string | null;
};

export type CrewWorkHistoryItem = {
  cost_id: string;
  job_id: string;
  job_ref: string;
  client_name: string;
  scheduled_for: string | null;
  scheduled_time: string | null;
  description: string;
  amount: number;
  hours: number | null;
  rate: number | null;
  created_at: string;
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
    .is('deleted_at', null)
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
      photo_path: input.photoPath ?? null,
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to add crew member');
  return data as CrewMember;
}

export async function updateCrewMember(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  input: CrewInput
): Promise<CrewMember> {
  const { data, error } = await supabase
    .from('crew')
    .update({
      name: input.name,
      phone: input.phone,
      role_label: input.roleLabel?.trim() || 'Laborer',
      hourly_rate: input.hourlyRate ?? 0,
    })
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to update crew member');
  return data as CrewMember;
}

export async function updateCrewPhoto(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  photoPath: string | null
): Promise<{ member: CrewMember; previousPhotoPath: string | null }> {
  const { data: existing, error: selectError } = await supabase
    .from('crew')
    .select('photo_path')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .single();

  if (selectError || !existing) throw selectError ?? new Error('Crew member not found.');

  const { data, error } = await supabase
    .from('crew')
    .update({ photo_path: photoPath })
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to update crew photo.');
  return { member: data as CrewMember, previousPhotoPath: (existing.photo_path as string | null | undefined) ?? null };
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

export async function deleteArchivedCrewMember(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string
): Promise<string | null> {
  const { data: member, error: selectError } = await supabase
    .from('crew')
    .select('id, active, photo_path')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .single();

  if (selectError || !member) throw selectError ?? new Error('Crew member not found.');
  if (member.active) throw new Error('Archive this crew member before deleting them.');

  const { error } = await supabase
    .from('crew')
    .update({ deleted_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', crewId)
    .eq('active', false);

  if (error) throw error;
  return (member.photo_path as string | null | undefined) ?? null;
}

export async function listCrewWorkHistory(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string
): Promise<CrewWorkHistoryItem[]> {
  const { data: costs, error } = await supabase
    .from('costs')
    .select('id, job_id, description, amount, hours, rate, created_at')
    .eq('account_id', accountId)
    .eq('crew_id', crewId)
    .eq('type', 'labor')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!costs || costs.length === 0) return [];

  const jobIds = [...new Set(costs.map((cost) => cost.job_id as string))];
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, ref, client_name, scheduled_for, scheduled_time')
    .eq('account_id', accountId)
    .in('id', jobIds);

  if (jobsError) throw jobsError;

  const jobsById = new Map((jobs ?? []).map((job) => [job.id as string, job]));
  return costs.map((cost) => {
    const job = jobsById.get(cost.job_id as string);
    return {
      cost_id: cost.id as string,
      job_id: cost.job_id as string,
      job_ref: (job?.ref as string | undefined) ?? 'Job',
      client_name: (job?.client_name as string | undefined) ?? 'Unknown client',
      scheduled_for: (job?.scheduled_for as string | null | undefined) ?? null,
      scheduled_time: (job?.scheduled_time as string | null | undefined) ?? null,
      description: cost.description as string,
      amount: Number(cost.amount) || 0,
      hours: cost.hours === null ? null : Number(cost.hours),
      rate: cost.rate === null ? null : Number(cost.rate),
      created_at: cost.created_at as string,
    };
  });
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

// Bulk-fetches crew assignments for many jobs at once (e.g. a month of
// scheduled jobs on the calendar) to avoid an N+1 query per job.
export async function listCrewAssignmentsForJobs(
  supabase: SupabaseClient,
  accountId: string,
  jobIds: string[]
): Promise<Record<string, string[]>> {
  if (jobIds.length === 0) return {};

  const { data, error } = await supabase
    .from('crew_assignments')
    .select('job_id, crew_id')
    .eq('account_id', accountId)
    .in('job_id', jobIds);

  if (error) throw error;

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const jobId = row.job_id as string;
    const bucket = map[jobId] ?? (map[jobId] = []);
    bucket.push(row.crew_id as string);
  }
  return map;
}

// Assigns a single crew member to a job if not already assigned, otherwise
// unassigns them. Used by the schedule calendar's quick click-to-assign UI.
export async function toggleJobCrewAssignment(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  crewId: string
): Promise<{ assigned: boolean }> {
  const { data: existing, error: selectError } = await supabase
    .from('crew_assignments')
    .select('crew_id')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('crew_id', crewId)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from('crew_assignments')
      .delete()
      .eq('account_id', accountId)
      .eq('job_id', jobId)
      .eq('crew_id', crewId);
    if (error) throw error;
    return { assigned: false };
  }

  const { error } = await supabase
    .from('crew_assignments')
    .insert({ account_id: accountId, job_id: jobId, crew_id: crewId });
  if (error) throw error;
  return { assigned: true };
}
