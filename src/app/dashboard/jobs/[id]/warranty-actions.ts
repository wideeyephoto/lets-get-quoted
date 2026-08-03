'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createJobFeedEvent } from '@/lib/job-feed';
import { todayKey } from '@/lib/warranties';
import { createWarranty, deleteWarranty, recordService, updateClaim, updateWarranty } from '@/lib/warranties-data';
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
  const { supabase, accountId } = await requireOwnerContext();

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

export async function updateWarrantyAction(jobId: string, warrantyId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  await updateWarranty(supabase, accountId, warrantyId, {
    title: String(formData.get('title') ?? ''),
    covers: String(formData.get('covers') ?? ''),
    excludes: String(formData.get('excludes') ?? ''),
    maintenanceNotes: String(formData.get('maintenanceNotes') ?? ''),
  });
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteWarrantyAction(jobId: string, warrantyId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await deleteWarranty(supabase, accountId, warrantyId);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function recordServiceAction(jobId: string, warrantyId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const servicedOn = String(formData.get('servicedOn') ?? '').trim() || todayKey();
  await recordService(supabase, accountId, warrantyId, servicedOn);
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function updateClaimAction(jobId: string, claimId: string, status: ClaimStatus, note?: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await updateClaim(supabase, accountId, claimId, { status, resolutionNote: note ?? null });
  revalidatePath(`/dashboard/jobs/${jobId}`);
  return result;
}
