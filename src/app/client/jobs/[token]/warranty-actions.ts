'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { createJobFeedEvent } from '@/lib/job-feed';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import { resolveJobAccess } from '@/lib/change-order-client';
import { saveWarrantyRequest } from '@/lib/warranty-client-requests';


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

  let request: Awaited<ReturnType<typeof saveWarrantyRequest>>;
  try {
    request = await saveWarrantyRequest(admin, { ...access, warrantyId,
      requestId: String(formData.get('request_id') ?? ''), description: String(formData.get('description') ?? ''),
      files: formData.getAll('photos').filter((entry): entry is File => entry instanceof File),
    });
  } catch {
    return { ok: false, message: 'Request or photos could not be saved. Retry the same form, or reopen it to submit without photos.' };
  }
  if (!request.claimId) return { ok: true };
  const claim = { id: request.claimId, description: request.description };
  const photoPaths = request.photoPaths;

  try {
    if (!request.replayed) await createJobFeedEvent(admin, access.accountId, access.jobId, {
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
