'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { createJobFeedEvent } from '@/lib/job-feed';
import { todayKey } from '@/lib/warranties';
import { createWarranty, deleteWarranty, recordService, updateClaim, updateWarranty } from '@/lib/warranties-data';
import { isJobPhotoFile, uploadJobPhoto } from '@/lib/job-photo-storage';
import type { ClaimStatus } from '@/lib/warranties';

function num(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Start a warranty on a job.
 *
 * The feed entry is CLIENT-VISIBLE, and that's the point. A warranty the
 * homeowner never sees is a warranty they can't rely on and won't remember —
 * which is exactly how a two-year-old customer ends up phoning somebody else.
 */
export async function createWarrantyAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');

  const title = String(formData.get('title') ?? '').trim();
  const startsOn = String(formData.get('startsOn') ?? '').trim() || todayKey();
  const months = num(formData.get('months'));

  const warranty = await createWarranty(supabase, accountId, jobId, {
    title: title || 'Workmanship warranty',
    covers: String(formData.get('covers') ?? ''),
    excludes: String(formData.get('excludes') ?? ''),
    startsOn,
    months,
    maintenanceNotes: String(formData.get('maintenanceNotes') ?? ''),
    serviceIntervalMonths: num(formData.get('serviceIntervalMonths')),
  });

  try {
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'warranty_started',
      title: warranty.title,
      body: warranty.endsOn
        ? `Covered from ${warranty.startsOn} to ${warranty.endsOn}.${warranty.covers ? ` ${warranty.covers}` : ''}`
        : `Covered from ${warranty.startsOn}, with no end date.${warranty.covers ? ` ${warranty.covers}` : ''}`,
      visibility: 'client',
      sourceTable: 'warranties',
      sourceId: warranty.id,
    });
  } catch (error) {
    console.error('Warranty feed event failed:', error instanceof Error ? error.message : error);
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

/**
 * Attach manufacturer paperwork to a warranty.
 *
 * Separate from the contractor's own labour warranty, which is what the title
 * and covers text usually describe. This is the shingle manufacturer's document
 * — the one that gets asked for years later and that nobody can ever find,
 * because it went home in a folder that went in a drawer.
 */
export async function addWarrantyDocumentAction(jobId: string, warrantyId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');

  const { data: existing } = await supabase
    .from('warranties')
    .select('document_paths')
    .eq('account_id', accountId)
    .eq('id', warrantyId)
    .maybeSingle();
  if (!existing) return;

  const paths = [...((existing.document_paths as string[] | null) ?? [])];
  for (const entry of formData.getAll('documents').slice(0, 6)) {
    if (!isJobPhotoFile(entry)) continue;
    try {
      paths.push(await uploadJobPhoto(accountId, entry));
    } catch (error) {
      // One bad upload must not lose the others.
      console.error('Warranty document upload failed:', error instanceof Error ? error.message : error);
    }
  }

  await supabase
    .from('warranties')
    .update({ document_paths: paths, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', warrantyId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function updateWarrantyAction(jobId: string, warrantyId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  await updateWarranty(supabase, accountId, warrantyId, {
    title: String(formData.get('title') ?? ''),
    covers: String(formData.get('covers') ?? ''),
    excludes: String(formData.get('excludes') ?? ''),
    maintenanceNotes: String(formData.get('maintenanceNotes') ?? ''),
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteWarrantyAction(jobId: string, warrantyId: string) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  await deleteWarranty(supabase, accountId, warrantyId);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function recordServiceAction(jobId: string, warrantyId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const servicedOn = String(formData.get('servicedOn') ?? '').trim() || todayKey();
  // The result was discarded, so a service that recorded nothing looked
  // identical to one that did. Surfaced rather than swallowed: the whole point
  // of the row is that the next reminder fires on time.
  const result = await recordService(supabase, accountId, warrantyId, servicedOn);
  revalidatePath(`/dashboard/jobs/${jobId}`);
  if (!result.ok) throw new Error('That service could not be recorded — the warranty may have been changed or removed. Reload the job.');
}

export async function updateClaimAction(jobId: string, claimId: string, status: ClaimStatus, note?: string) {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const result = await updateClaim(supabase, accountId, claimId, { status, resolutionNote: note ?? null });
  revalidatePath(`/dashboard/jobs/${jobId}`);
  return result;
}
