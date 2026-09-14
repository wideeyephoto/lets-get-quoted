import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/auth';
import { resolveJobAccess } from '@/lib/change-order-client';
import { clientRequestHash, findClientRequest, saveClientRequest, validClientRequestId } from '@/lib/client-owner-requests';
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
  requestId: string;
  category?: FollowupCategory;
  description: string;
  files?: File[];
};

export type FollowupResult = { ok: true; photoUrls?: string[] } | { ok: false; message: string };

async function prepareFollowupFiles(files: File[]) {
  const accepted = files.slice(0,3).filter(file => file.size>0 && file.size<=MAX_ATTACHMENT_BYTES && ALLOWED_MIME.has(file.type));
  return Promise.all(accepted.map(async file => {
    const bytes = Buffer.from(await file.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    return { file, bytes, digest };
  }));
}

async function uploadFollowupFiles(accountId: string, jobId: string, requestId: string, files: Awaited<ReturnType<typeof prepareFollowupFiles>>): Promise<string[]> {
  const admin = createAdminClient();
  if (files.length) await assertStorageCapacity(admin,accountId,files.reduce((total,item)=>total+item.bytes.length,0));
  const paths: string[] = [];
  for (const [index,item] of files.entries()) {
    const extension = item.file.type.split('/')[1].replace('quicktime','mov');
    const path = `${accountId}/requests/${jobId}/${requestId.toLowerCase()}/${index}-${item.digest}.${extension}`;
    const { error } = await admin.storage.from('job-photos').upload(path,item.bytes,{ contentType:item.file.type,cacheControl:'31536000',upsert:false });
    if (error && String((error as {statusCode?: string | number}).statusCode) !== '409') throw new Error('Attachment could not be saved.');
    paths.push(path);
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

  if (!validClientRequestId(input.requestId)) return {ok:false,message:'Refresh this page before submitting your request.'};
  if (input.category && !['followup','warranty','more_work'].includes(input.category)) return {ok:false,message:'Choose a request type.'};
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

  let feedId: string | null;
  try {
    const files = await prepareFollowupFiles(input.files ?? []);
    const hash = clientRequestHash(category,text,files.map(item=>JSON.stringify({name:item.file.name,type:item.file.type,digest:item.digest})));
    const previous = await findClientRequest(admin,access.accountId,access.jobId,input.requestId,hash);
    if (previous) feedId=previous.feed_id;
    else {
      const photoPaths=await uploadFollowupFiles(access.accountId,access.jobId,input.requestId,files);
      const receipt=await saveClientRequest(admin,{accountId:access.accountId,jobId:access.jobId,requestId:input.requestId,hash,kind:feedKind,title:feedTitle,body:text,
        meta: photoPaths.length ? {photo_paths:photoPaths} : {}});
      feedId=receipt.feed_id;
    }
  } catch { return {ok:false,message:'Request or attachments could not be saved. Retry the same form, or reopen it to submit without attachments.'}; }
  if (!feedId) return {ok:true};

  try {
    await runOwnerEventNotices(admin, { sourceId: feedId, accountId: access.accountId });
  } catch (error) {
    console.error(`Could not email owner about follow-up request on job ${access.jobId}:`, error instanceof Error ? error.message : error);
  }

  return { ok: true };
}
