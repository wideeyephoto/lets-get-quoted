'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { createJobFeedEvent } from '@/lib/job-feed';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import { resolveJobAccess } from '@/lib/change-order-client';
import { raiseClaim } from '@/lib/warranties-data';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';


/**
 * "Something's gone wrong" — one tap from the homeowner's job page.
 *
 * Public in every sense that matters: anyone with the link can call it. Rate
 * limited, and the warranty is confirmed to belong to the job the token opens
 * before anything is written.
 */
export async function raiseWarrantyClaimAction(
  token: string,
  warrantyId: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const ip = clientIpFrom(await headers());
  if (!(await checkRateLimit(admin, `warranty-claim:ip:${ip}`, 10, 60))) {
    return { ok: false, message: 'Too many requests — wait a minute and try again.' };
  }

  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Give us a call instead.' };

  const rawFiles = formData.getAll('photos');
  const files = rawFiles.slice(0, 3).filter((entry): entry is File =>
    entry instanceof File && entry.size > 0 && entry.size <= 10 * 1024 * 1024);
  try {
    if (files.length > 0) {
      await assertStorageCapacity(admin, access.accountId, files.reduce((total, file) => total + file.size, 0));
    }
  } catch {
    return { ok: false, message: 'Photos could not be saved. Please submit without photos or contact your contractor.' };
  }
  const photoPaths: string[] = [];
  for (const entry of files) {
    if (entry instanceof File && entry.size > 0 && entry.size <= 10 * 1024 * 1024) {
      const ext = entry.type.includes('/') ? entry.type.split('/')[1].replace('quicktime', 'mov') : 'jpg';
      const path = `${access.accountId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await admin.storage.from('job-photos').upload(path, Buffer.from(await entry.arrayBuffer()), {
        contentType: entry.type || 'image/jpeg',
        cacheControl: '31536000',
        upsert: false,
      });
      if (!error) {
        photoPaths.push(path);
      }
    }
  }

  const result = await raiseClaim(admin, access.accountId, {
    warrantyId,
    jobId: access.jobId,
    description: String(formData.get('description') ?? ''),
    photoPaths,
  });
  if (!result.ok || !result.claim) return { ok: false, message: result.message };

  const claim = result.claim;

  try {
    await createJobFeedEvent(admin, access.accountId, access.jobId, {
      kind: 'warranty_claim',
      title: 'Warranty request',
      body: claim.description,
      visibility: 'client',
      sourceTable: 'warranty_claims',
      sourceId: claim.id,
      meta: photoPaths.length > 0 ? { photo_paths: photoPaths } : null,
    });
  } catch (error) {
    console.error('Warranty claim feed event failed:', error instanceof Error ? error.message : error);
  }

  try {
    await runOwnerEventNotices(admin, { sourceId: claim.id, accountId: access.accountId });
  } catch (error) {
    console.error('Warranty claim owner alert failed:', error instanceof Error ? error.message : error);
  }

  revalidatePath(`/client/jobs/${token}`);
  return { ok: true };
}
