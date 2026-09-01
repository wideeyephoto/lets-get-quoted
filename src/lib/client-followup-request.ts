import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { resolveJobAccess } from '@/lib/change-order-client';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { loadBusinessName } from '@/lib/business-name';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

/** Up to 2,000 characters — detailed enough for photos/notes, concise enough for email. */
const MAX_FOLLOWUP_LENGTH = 2000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export type FollowupCategory = 'followup' | 'warranty' | 'more_work';

export type FollowupRequestInput = {
  category?: FollowupCategory;
  description: string;
  files?: File[];
};

export type FollowupResult = { ok: true; photoUrls?: string[] } | { ok: false; message: string };

async function uploadFollowupFiles(accountId: string, files: File[]): Promise<string[]> {
  const admin = createAdminClient();
  const paths: string[] = [];

  for (const file of files.slice(0, 3)) {
    if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) continue;
    if (!ALLOWED_MIME.has(file.type)) continue;

    const extension = file.type.includes('/') ? file.type.split('/')[1].replace('quicktime', 'mov') : 'jpg';
    const path = `${accountId}/${randomUUID()}.${extension}`;

    const { error } = await admin.storage
      .from('job-photos')
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'image/jpeg',
        cacheControl: '31536000',
        upsert: false,
      });

    if (!error) {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Handle a post-service follow-up, warranty help, or more-work inquiry from a client.
 *
 * Logs the request into the client-visible job feed so both sides see a shared
 * timeline, saves any attached evidence photos, and emails the contractor immediately.
 */
export async function requestJobFollowup(token: string, input: FollowupRequestInput): Promise<FollowupResult> {
  const text = (input.description ?? '').toString().trim().slice(0, MAX_FOLLOWUP_LENGTH);
  if (!text) return { ok: false, message: 'Please describe what you need help with.' };

  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Please call your contractor directly.' };

  const admin = createAdminClient();
  const { data: job } = await admin
    .from('jobs')
    .select('ref, client_name, scope')
    .eq('account_id', access.accountId)
    .eq('id', access.jobId)
    .maybeSingle();

  const clientName = (job?.client_name as string) || 'The customer';
  const category = input.category ?? 'followup';

  const isMoreWork = category === 'more_work';
  const isWarranty = category === 'warranty';

  const feedKind = isMoreWork ? 'rebook_requested' : 'client_followup';
  const feedTitle = isMoreWork
    ? `${clientName} requested more work`
    : isWarranty
      ? `${clientName} requested warranty service`
      : `${clientName} requested a follow-up`;

  const photoPaths = input.files && input.files.length > 0 ? await uploadFollowupFiles(access.accountId, input.files) : [];

  await createJobFeedEvent(admin, access.accountId, access.jobId, {
    kind: feedKind,
    title: feedTitle,
    body: text,
    visibility: 'client',
    meta: photoPaths.length > 0 ? { photo_paths: photoPaths } : null,
  });

  try {
    const ownerEmail = await getAccountOwnerEmail(admin, access.accountId);
    if (ownerEmail) {
      const businessName = await loadBusinessName(admin, access.accountId);
      const subject = isMoreWork
        ? `New project request from ${clientName} (${job?.ref ?? 'past job'})`
        : isWarranty
          ? `Warranty request from ${clientName} on ${job?.ref ?? 'job'}`
          : `Follow-up request from ${clientName} on ${job?.ref ?? 'job'}`;

      const heading = isMoreWork
        ? `${clientName} would like to book more work`
        : isWarranty
          ? `${clientName} requested warranty service`
          : `${clientName} requested a follow-up`;

      const noteLine = isMoreWork
        ? 'A past customer wants to hire you for another project. Reach out to discuss the scope.'
        : isWarranty
          ? 'Submitted from their job dashboard regarding warranty or service coverage.'
          : 'Submitted from their job dashboard. Reply directly or open the job to coordinate.';

      const bodyLines = [text, noteLine];
      if (photoPaths.length > 0) {
        bodyLines.push(`Attached ${photoPaths.length} photo/video attachment${photoPaths.length === 1 ? '' : 's'}.`);
      }

      await sendContractorAlertEmail({
        accountId: access.accountId,
        recipientEmail: ownerEmail,
        businessName,
        subject,
        heading,
        bodyLines,
        ctaLabel: 'Open the job',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs/${access.jobId}`,
        tone: isWarranty ? 'warning' : 'info',
      });
    }
  } catch (error) {
    console.error(`Could not email owner about follow-up request on job ${access.jobId}:`, error instanceof Error ? error.message : error);
  }

  return { ok: true };
}
