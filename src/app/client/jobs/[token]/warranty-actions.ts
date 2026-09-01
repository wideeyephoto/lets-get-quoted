'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { resolveJobAccess } from '@/lib/change-order-client';
import { raiseClaim } from '@/lib/warranties-data';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

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
  const photoPaths: string[] = [];
  for (const entry of rawFiles.slice(0, 3)) {
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
    const [ownerEmail, businessName] = await Promise.all([
      getAccountOwnerEmail(admin, access.accountId),
      loadBusinessName(admin, access.accountId),
    ]);
    if (ownerEmail) {
      const bodyLines = [
        claim.description,
        claim.inWarrantyAtClaim
          ? 'This was inside the warranty on the day they reported it.'
          : 'Their cover had already ended when they reported this. Still worth a look — it is your call, and they asked you first.',
      ];
      if (photoPaths.length > 0) {
        bodyLines.push(`Attached ${photoPaths.length} photo/video file${photoPaths.length === 1 ? '' : 's'}.`);
      }

      await sendContractorAlertEmail({
        accountId: access.accountId,
        recipientEmail: ownerEmail,
        businessName,
        subject: claim.inWarrantyAtClaim ? 'Warranty request — in warranty' : 'Warranty request — cover has ended',
        heading: 'A past customer has asked for help',
        bodyLines,
        ctaLabel: 'Open the job',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs/${access.jobId}`,
        tone: claim.inWarrantyAtClaim ? 'warning' : 'info',
      });
    }
  } catch (error) {
    console.error('Warranty claim owner alert failed:', error instanceof Error ? error.message : error);
  }

  revalidatePath(`/client/jobs/${token}`);
  return { ok: true };
}
