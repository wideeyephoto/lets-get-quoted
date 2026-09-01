import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, claimIsInWarranty, nextServiceAfter, todayKey, type ClaimStatus, type Warranty } from '@/lib/warranties';

type Row = Record<string, unknown>;

function toWarranty(row: Row): Warranty {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    clientId: (row.client_id as string | null) ?? null,
    title: (row.title as string) ?? '',
    covers: (row.covers as string) ?? '',
    excludes: (row.excludes as string) ?? '',
    startsOn: row.starts_on as string,
    endsOn: (row.ends_on as string | null) ?? null,
    documentPaths: (row.document_paths as string[] | null) ?? [],
    maintenanceNotes: (row.maintenance_notes as string) ?? '',
    serviceIntervalMonths:
      row.service_interval_months === null || row.service_interval_months === undefined ? null : Number(row.service_interval_months),
    nextServiceDue: (row.next_service_due as string | null) ?? null,
    lastServiceOn: (row.last_service_on as string | null) ?? null,
    serviceRemindedAt: (row.service_reminded_at as string | null) ?? null,
  };
}

/** Defensive: an un-migrated DB returns nothing rather than breaking the job page. */
export async function listWarranties(supabase: SupabaseClient, accountId: string, jobId: string): Promise<Warranty[]> {
  const { data, error } = await supabase
    .from('warranties')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('starts_on', { ascending: false });
  return error ? [] : (data ?? []).map(toWarranty);
}

/** Every warranty this client holds, across every job they've had done. */
export async function listClientWarranties(supabase: SupabaseClient, accountId: string, clientId: string): Promise<Warranty[]> {
  const { data, error } = await supabase
    .from('warranties')
    .select('*')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .order('starts_on', { ascending: false });
  return error ? [] : (data ?? []).map(toWarranty);
}

export type WarrantyInput = {
  title: string;
  covers?: string;
  excludes?: string;
  startsOn: string;
  /** Either an explicit end date, or a length in months from the start. */
  endsOn?: string | null;
  months?: number | null;
  maintenanceNotes?: string;
  serviceIntervalMonths?: number | null;
  documentPaths?: string[];
};

/**
 * Create a warranty on a job.
 *
 * `months` is the ergonomic input — nobody wants to work out what 18 months from
 * the 31st is — but what gets STORED is the resolved date. A duration has to be
 * recalculated by every reader and gets it wrong at a month boundary; a date is
 * a fact that everybody agrees on.
 */
export async function createWarranty(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: WarrantyInput,
): Promise<Warranty> {
  const startsOn = input.startsOn || todayKey();
  const endsOn = input.endsOn ?? (input.months && input.months > 0 ? addMonths(startsOn, input.months) : null);
  const interval = input.serviceIntervalMonths && input.serviceIntervalMonths > 0 ? input.serviceIntervalMonths : null;

  // The job's client, so a warranty can be found by "who owns it" and not only
  // by "which job produced it" — which is how a homeowner two years later thinks.
  const { data: job } = await supabase.from('jobs').select('client_id').eq('account_id', accountId).eq('id', jobId).maybeSingle();

  const { data, error } = await supabase
    .from('warranties')
    .insert({
      account_id: accountId,
      job_id: jobId,
      client_id: (job?.client_id as string | null) ?? null,
      title: input.title.trim().slice(0, 160) || 'Workmanship warranty',
      covers: (input.covers ?? '').trim().slice(0, 2000),
      excludes: (input.excludes ?? '').trim().slice(0, 2000),
      starts_on: startsOn,
      ends_on: endsOn,
      maintenance_notes: (input.maintenanceNotes ?? '').trim().slice(0, 2000),
      service_interval_months: interval,
      next_service_due: interval ? addMonths(startsOn, interval) : null,
      document_paths: input.documentPaths ?? [],
    })
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Could not create the warranty.');
  return toWarranty(data as Row);
}

export async function updateWarranty(
  supabase: SupabaseClient,
  accountId: string,
  warrantyId: string,
  input: Partial<WarrantyInput>,
): Promise<{ ok: boolean; message?: string }> {
  const patch: Row = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 160);
  if (input.covers !== undefined) patch.covers = input.covers.trim().slice(0, 2000);
  if (input.excludes !== undefined) patch.excludes = input.excludes.trim().slice(0, 2000);
  if (input.maintenanceNotes !== undefined) patch.maintenance_notes = input.maintenanceNotes.trim().slice(0, 2000);
  if (input.startsOn !== undefined) patch.starts_on = input.startsOn;
  if (input.endsOn !== undefined) patch.ends_on = input.endsOn;
  if (input.serviceIntervalMonths !== undefined) patch.service_interval_months = input.serviceIntervalMonths;

  const { error } = await supabase.from('warranties').update(patch).eq('account_id', accountId).eq('id', warrantyId);
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function deleteWarranty(supabase: SupabaseClient, accountId: string, warrantyId: string): Promise<void> {
  await supabase.from('warranties').delete().eq('account_id', accountId).eq('id', warrantyId);
}

/**
 * Record that a service happened, and schedule the next one.
 *
 * The next date is counted from the SERVICE, not from today. Counting from today
 * would let a late service quietly push the whole schedule back — a year at a
 * time, until the manufacturer's requirement is being missed by months and
 * nobody notices.
 */
export async function recordService(
  supabase: SupabaseClient,
  accountId: string,
  warrantyId: string,
  servicedOn: string,
): Promise<{ ok: boolean; nextDue: string | null }> {
  const { data } = await supabase
    .from('warranties')
    .select('service_interval_months')
    .eq('account_id', accountId)
    .eq('id', warrantyId)
    .maybeSingle();
  const interval = data?.service_interval_months === null || data?.service_interval_months === undefined ? null : Number(data.service_interval_months);
  const nextDue = nextServiceAfter(servicedOn, interval);

  // Zero rows is not an error, so ok was true whether or not the schedule
  // moved. A service recorded against nothing leaves next_service_due where it
  // was, which is exactly the quiet drift this file exists to prevent.
  // Named `updated`, not `data`: the interval SELECT above already holds `data`,
  // and shadowing it here would compile as a redeclaration error at best and
  // silently read the wrong row at worst.
  const { data: updated, error } = await supabase
    .from('warranties')
    .update({ last_service_on: servicedOn, next_service_due: nextDue, service_reminded_at: null, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', warrantyId)
    .select('id').maybeSingle();
  return { ok: !error && Boolean(updated), nextDue };
}

// -- Claims -------------------------------------------------------------------

export type WarrantyClaim = {
  id: string;
  warrantyId: string;
  jobId: string;
  status: ClaimStatus;
  description: string;
  photoPaths: string[];
  inWarrantyAtClaim: boolean;
  resolutionJobId: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

function toClaim(row: Row): WarrantyClaim {
  return {
    id: row.id as string,
    warrantyId: row.warranty_id as string,
    jobId: row.job_id as string,
    status: (row.status as ClaimStatus) ?? 'open',
    description: (row.description as string) ?? '',
    photoPaths: (row.photo_paths as string[] | null) ?? [],
    inWarrantyAtClaim: Boolean(row.in_warranty_at_claim),
    resolutionJobId: (row.resolution_job_id as string | null) ?? null,
    resolutionNote: (row.resolution_note as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export async function listClaims(supabase: SupabaseClient, accountId: string, jobId?: string): Promise<WarrantyClaim[]> {
  let query = supabase.from('warranty_claims').select('*').eq('account_id', accountId).order('created_at', { ascending: false });
  if (jobId) query = query.eq('job_id', jobId);
  const { data, error } = await query;
  return error ? [] : (data ?? []).map(toClaim);
}

/**
 * A homeowner reports a problem.
 *
 * Whether it was in warranty is decided HERE, from today's date, and stored on
 * the claim. It must not be recomputed later: a homeowner who reported a fault
 * two days before their cover ended is covered, even if the contractor takes a
 * fortnight to answer.
 */
export async function raiseClaim(
  admin: SupabaseClient,
  accountId: string,
  input: { warrantyId: string; jobId: string; description: string; photoPaths?: string[] },
): Promise<{ ok: boolean; claim?: WarrantyClaim; message?: string }> {
  const { data: warrantyRow } = await admin
    .from('warranties')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', input.warrantyId)
    .maybeSingle();
  if (!warrantyRow) return { ok: false, message: 'That warranty could not be found.' };

  const warranty = toWarranty(warrantyRow as Row);
  // Belongs to the job the caller says it does. A valid link for one job must
  // not raise a claim against another customer's warranty.
  if (warranty.jobId !== input.jobId) return { ok: false, message: 'That warranty is not on this job.' };

  const description = input.description.trim().slice(0, 2000);
  if (!description) return { ok: false, message: 'Tell us what went wrong so we know what to bring.' };

  const { data, error } = await admin
    .from('warranty_claims')
    .insert({
      account_id: accountId,
      warranty_id: warranty.id,
      job_id: warranty.jobId,
      description,
      photo_paths: input.photoPaths ?? [],
      in_warranty_at_claim: claimIsInWarranty(warranty),
    })
    .select('*')
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? 'Could not record that.' };
  return { ok: true, claim: toClaim(data as Row) };
}

export async function updateClaim(
  supabase: SupabaseClient,
  accountId: string,
  claimId: string,
  input: { status?: ClaimStatus; resolutionNote?: string | null; resolutionJobId?: string | null },
): Promise<{ ok: boolean; message?: string }> {
  const patch: Row = {};
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === 'resolved' || input.status === 'declined') patch.resolved_at = new Date().toISOString();
  }
  if (input.resolutionNote !== undefined) patch.resolution_note = input.resolutionNote;
  if (input.resolutionJobId !== undefined) patch.resolution_job_id = input.resolutionJobId;

  // .select() so a zero-row match is distinguishable from a successful one.
  // An UPDATE that matches nothing is not an error in PostgREST, and this
  // result is rendered by the claim panel as 'resolved' or 'declined' -- so
  // without this the screen reports an outcome the database never took, while
  // the reminder and the homeowner's view both still say the claim is open.
  const { data, error } = await supabase.from('warranty_claims').update(patch)
    .eq('account_id', accountId).eq('id', claimId)
    .select('id').maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: 'That claim could not be found — it may have been changed or removed. Reload the job.' };
  return { ok: true };
}

/**
 * Generate signed URLs for warranty manufacturer and specification documents.
 */
export async function signedWarrantyDocUrls(
  supabase: SupabaseClient,
  accountId: string,
  paths: string[],
): Promise<Array<{ name: string; url: string }>> {
  if (!paths || paths.length === 0) return [];
  const ownedPaths = paths.filter((p) => typeof p === 'string' && (p.startsWith(`${accountId}/`) || !p.includes('/')));
  if (ownedPaths.length === 0) return [];

  const results: Array<{ name: string; url: string }> = [];
  for (const path of ownedPaths) {
    try {
      const { data } = await supabase.storage.from('account-attachments').createSignedUrl(path, 60 * 60);
      if (data?.signedUrl) {
        const rawName = path.split('/').pop() || 'Document';
        // Clean uuid if prefixed
        const cleanName = rawName.replace(/^[0-9a-fA-F-]{36}\./, 'Warranty Document.');
        results.push({ name: cleanName, url: data.signedUrl });
      }
    } catch {
      // Ignore individual missing file sign errors
    }
  }
  return results;
}
