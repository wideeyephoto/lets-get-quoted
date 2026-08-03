'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
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
  const ip = clientIpFrom(headers());
  if (!(await checkRateLimit(admin, `warranty-claim:ip:${ip}`, 10, 60))) {
    return { ok: false, message: 'Too many requests — wait a minute and try again.' };
  }

  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Give us a call instead.' };

  const result = await raiseClaim(admin, access.accountId, {
    warrantyId,
    jobId: access.jobId,
    description: String(formData.get('description') ?? ''),
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
    });
  } catch (error) {
    console.error('Warranty claim feed event failed:', error instanceof Error ? error.message : error);
  }

  try {
    const [ownerEmail, { data: account }] = await Promise.all([
      getAccountOwnerEmail(admin, access.accountId),
      admin.from('accounts').select('business_name').eq('id', access.accountId).maybeSingle(),
    ]);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName: account?.business_name || "Let's Get Quoted",
        subject: claim.inWarrantyAtClaim ? 'Warranty request — in warranty' : 'Warranty request — cover has ended',
        heading: 'A past customer has asked for help',
        bodyLines: [
          claim.description,
          claim.inWarrantyAtClaim
            ? 'This was inside the warranty on the day they reported it.'
            : 'Their cover had already ended when they reported this. Still worth a look — it is your call, and they asked you first.',
        ],
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
