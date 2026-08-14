import { geocodeAddress } from '@/lib/geocode';
import { costingRate, normalizePayType, type PayType } from '@/lib/pay-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CrewMember = {
  id: string;
  account_id: string;
  name: string;
  phone: string;
  email: string | null;
  role_label: string;
  hourly_rate: number;
  photo_path: string | null;
  user_id: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  // Where this person's day starts. Plan my day anchors their route here instead
  // of the shop when the day is filtered to them. Optional in the type because
  // these columns arrive with 2026-07-31-route-stops.sql and a pre-migration read
  // returns rows without them.
  start_address?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  // How they're actually paid. Optional in the type for the same reason as
  // above — a pre-migration read returns rows without these. `hourly_rate`
  // stays populated for everyone: for a non-hourly person it stops being what
  // they're paid and becomes what an hour of their time costs a job.
  pay_type?: string | null;
  annual_salary?: number | null;
  day_rate?: number | null;
  // This person's id in the payroll provider (ADP File #, Gusto Employee ID).
  // Providers match on their own id, not on a name — and two crew rows aimed at
  // one payroll employee is a double payment, which a partial unique index
  // refuses.
  payroll_id?: string | null;
  // What this person may do around an arrival. Optional for the same
  // pre-migration reason; arrivalPermissionsFromCrew() resolves an absent
  // column to the behavior that shipped before permissions existed.
  can_send_arrival?: boolean | null;
  can_share_location?: boolean | null;
  can_view_client_contact?: boolean | null;
  can_reschedule?: boolean | null;
  // Where they are in the field-app invitation. Optional for the same
  // pre-migration reason; lib/crew-invite resolves absent columns to exactly
  // the three states the roster could describe before they existed.
  invited_at?: string | null;
  invite_expires_at?: string | null;
  invite_count?: number | null;
  last_signed_in_at?: string | null;
  access_revoked_at?: string | null;
};

export type CrewInput = {
  name: string;
  phone: string;
  email?: string | null;
  roleLabel?: string;
  hourlyRate?: number;
  photoPath?: string | null;
  payType?: PayType;
  annualSalary?: number | null;
  dayRate?: number | null;
  payrollId?: string | null;
};

/**
 * The pay columns to write, with hourly_rate derived for non-hourly types.
 *
 * Derived rather than asked for twice: moving somebody onto a salary should not
 * leave every job they touch costed at the hourly rate they used to have, and
 * making the owner keep two numbers in step by hand guarantees they drift.
 * Only the amount belonging to the chosen type is stored — a stale salary left
 * on somebody switched back to hourly would be invisible and wrong.
 */
function payColumns(input: CrewInput): Record<string, unknown> {
  const payType = normalizePayType(input.payType);
  const annualSalary = payType === 'salary' ? input.annualSalary ?? null : null;
  const dayRate = payType === 'day_rate' ? input.dayRate ?? null : null;
  const basis = { payType, hourlyRate: input.hourlyRate ?? 0, annualSalary, dayRate };
  return {
    pay_type: payType,
    annual_salary: annualSalary,
    day_rate: dayRate,
    hourly_rate: costingRate(basis),
    payroll_id: (input.payrollId ?? '').trim() || null,
  };
}

/**
 * Write the pay columns, and fall back to hourly-only if they don't exist yet.
 *
 * Pre-migration, `pay_type` is an unknown column and PostgREST rejects the
 * whole write — which would mean an owner cannot save a crew member's NAME
 * until the migration has run. Losing the pay type is recoverable; losing the
 * edit is not.
 */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

function cleanEmail(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  return value || null;
}

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

// Where a crew member's day starts, for Plan my day.
//
// Precise-only, like every other coordinate this app stores: a city-level
// geocode would put their start point miles from their driveway and quietly
// change every leg of the route. A vague or unresolvable address keeps the text
// (so they can see what they typed and fix it) and stores no coordinates, which
// makes the planner fall back to the business address.
export async function saveCrewStartAddress(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  address: string | null,
): Promise<void> {
  const clean = (address ?? '').trim() || null;
  const geo = clean ? await geocodeAddress(clean) : null;
  const coords = geo?.precise ? { start_lat: geo.lat, start_lng: geo.lng } : { start_lat: null, start_lng: null };

  const { error } = await supabase
    .from('crew')
    .update({ start_address: clean, ...coords })
    .eq('id', crewId)
    .eq('account_id', accountId);

  // Pre-migration the columns don't exist. Losing a start address is a missing
  // convenience; failing the whole crew save over it would lose their name.
  if (error && error.code !== '42703' && error.code !== 'PGRST204') throw error;
}

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
  // Roster order: active members first, then case-insensitive A→Z by name
  // (created_at is only the DB tiebreaker). Reads like a roster rather than
  // signup order, and keeps archived crew from floating to the top.
  return ((data ?? []) as CrewMember[]).sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export async function createCrewMember(
  supabase: SupabaseClient,
  accountId: string,
  input: CrewInput
): Promise<CrewMember> {
  const base = {
    account_id: accountId,
    name: input.name,
    phone: input.phone,
    email: cleanEmail(input.email),
    role_label: input.roleLabel?.trim() || 'Laborer',
    photo_path: input.photoPath ?? null,
  };

  const { data, error } = await supabase
    .from('crew')
    .insert({ ...base, ...payColumns(input) })
    .select('*')
    .single();

  if (!error && data) return data as CrewMember;
  if (!isMissingColumn(error)) throw error ?? new Error('Unable to add crew member');

  const retry = await supabase
    .from('crew')
    .insert({ ...base, hourly_rate: input.hourlyRate ?? 0 })
    .select('*')
    .single();
  if (retry.error || !retry.data) throw retry.error ?? new Error('Unable to add crew member');
  return retry.data as CrewMember;
}

export async function updateCrewMember(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  input: CrewInput
): Promise<CrewMember> {
  const base = {
    name: input.name,
    phone: input.phone,
    email: cleanEmail(input.email),
    role_label: input.roleLabel?.trim() || 'Laborer',
  };
  const { data, error } = await supabase
    .from('crew')
    .update({ ...base, ...payColumns(input) })
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (!error && data) return data as CrewMember;
  if (!isMissingColumn(error)) throw error ?? new Error('Unable to update crew member');

  const retry = await supabase
    .from('crew')
    .update({ ...base, hourly_rate: input.hourlyRate ?? 0 })
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (retry.error || !retry.data) throw retry.error ?? new Error('Unable to update crew member');
  return retry.data as CrewMember;
}

/**
 * EVERY crew record linked to a logged-in auth user — one per business.
 *
 * Admin-scoped so it works before any RLS-visible membership is in place. The
 * plural matters: one person can be on two contractors' rosters under the same
 * email, and the field app used to resolve that by silently taking the oldest
 * row. They'd open the app, see somebody else's jobs, and have no way to say
 * "not this one". See lib/field-account for how the choice is made and kept.
 *
 * Revoked rows are excluded here rather than at the call site. An owner who
 * takes the app away has made a decision that must hold everywhere, and a
 * filter that has to be remembered is a filter that gets forgotten.
 */
export async function listCrewForUser(admin: SupabaseClient, userId: string): Promise<CrewMember[]> {
  const { data, error } = await admin
    .from('crew')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('active', true)
    .order('created_at', { ascending: true });

  // Pre-migration the revocation column doesn't exist, so the filter is applied
  // in code: `.is('access_revoked_at', null)` in the query would 42703 and take
  // every crew row down with it, locking the whole field app out of a database
  // that has simply not taken the migration yet.
  if (error) return [];
  return ((data ?? []) as CrewMember[]).filter((member) => !member.access_revoked_at);
}

// The crew record for one particular business, or the only one there is.
export async function getCrewByUserId(
  admin: SupabaseClient,
  userId: string,
  accountId?: string | null,
): Promise<CrewMember | null> {
  const rows = await listCrewForUser(admin, userId);
  if (accountId) return rows.find((member) => member.account_id === accountId) ?? null;
  return rows[0] ?? null;
}

// Job ids currently assigned to a crew member — the field app's "my jobs" set.
export async function listJobIdsForCrew(supabase: SupabaseClient, accountId: string, crewId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('crew_assignments')
    .select('job_id')
    .eq('account_id', accountId)
    .eq('crew_id', crewId);
  if (error) throw error;
  return (data ?? []).map((row) => row.job_id as string);
}

export async function isJobAssignedToCrew(supabase: SupabaseClient, accountId: string, jobId: string, crewId: string): Promise<boolean> {
  const { data } = await supabase
    .from('crew_assignments')
    .select('crew_id')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('crew_id', crewId)
    .maybeSingle();
  return Boolean(data);
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

/**
 * What this person may do around an arrival.
 *
 * Written separately from updateCrewMember rather than threaded through
 * CrewInput: these columns arrive with the arrival-management migration, and a
 * database that hasn't taken it should quietly ignore the permission save
 * instead of failing the whole "save crew member" form underneath it.
 */
export async function setCrewArrivalPermissions(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string,
  permissions: { send: boolean; shareLocation: boolean; viewContact: boolean; reschedule: boolean },
): Promise<void> {
  const { error } = await supabase
    .from('crew')
    .update({
      can_send_arrival: permissions.send,
      can_share_location: permissions.shareLocation,
      can_view_client_contact: permissions.viewContact,
      can_reschedule: permissions.reschedule,
    })
    .eq('account_id', accountId)
    .eq('id', crewId)
    .is('deleted_at', null);
  if (error && !isMissingColumn(error)) throw error;
}
