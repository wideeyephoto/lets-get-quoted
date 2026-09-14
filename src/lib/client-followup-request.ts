import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { resolveJobAccess } from '@/lib/change-order-client';
import { createJobFeedEvent } from '@/lib/job-feed';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';


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

  const accepted = files.slice(0, 3).filter((file) =>
    file.size > 0 && file.size <= MAX_ATTACHMENT_BYTES && ALLOWED_MIME.has(file.type));
  // Check the whole batch: the periodic measurement does not change between uploads.
  if (accepted.length > 0) {
    await assertStorageCapacity(admin, accountId, accepted.reduce((total, file) => total + file.size, 0));
  }

  for (const file of accepted) {

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

  let photoPaths: string[] = [];
  try {
    if (input.files?.length) photoPaths = await uploadFollowupFiles(access.accountId, input.files);
  } catch {
    return { ok: false, message: 'Attachments could not be saved. Please submit without attachments or contact your contractor.' };
  }

  const feedEvent = await createJobFeedEvent(admin, access.accountId, access.jobId, {
    kind: feedKind,
    title: feedTitle,
    body: text,
    visibility: 'client',
    meta: { owner_email_notice: 'v1', ...(photoPaths.length > 0 ? { photo_paths: photoPaths } : {}) },
  });

  try {
    await runOwnerEventNotices(admin, { sourceId: feedEvent.id, accountId: access.accountId });
  } catch (error) {
    console.error(`Could not email owner about follow-up request on job ${access.jobId}:`, error instanceof Error ? error.message : error);
  }

  return { ok: true };
}
