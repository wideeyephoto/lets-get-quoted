import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';

const LEAD_PHOTOS_BUCKET = 'lead-photos';
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

async function ensureLeadPhotosBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(LEAD_PHOTOS_BUCKET);
  if (data) return;

  const { error } = await admin.storage.createBucket(LEAD_PHOTOS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_PHOTO_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });
  if (error && !error.message.toLowerCase().includes('already exists')) throw error;
}

/**
 * WHO IS UPLOADING. Required, not defaulted, because getting it wrong is silent
 * and expensive in one direction.
 *
 * `workspace` is the contractor or their staff adding a photo to a lead from the
 * dashboard. The storage allowance applies: it is their file, their workspace,
 * their bill.
 *
 * `public_visitor` is a HOMEOWNER attaching photos to a quote request on the
 * contractor's public site or Quick Stop booking form. The allowance must NOT
 * apply. This bucket is the one upload path in the app whose caller is usually
 * not the customer being billed, and the public lead intake treats ANY upload
 * failure as a failed submission -- it deletes the partial upload and returns a
 * 500 (api/public/leads/route.ts) -- so enforcing here would silently destroy
 * inbound work: the homeowner sees "unable to send your request right now" and
 * the contractor never learns the enquiry existed. A storage cap that costs a
 * contractor their leads is worse than one that costs us disk.
 *
 * The bytes still count either way. The sweep measures the bucket, not the code
 * path that filled it, so a workspace still sees and pays for these.
 *
 * No default value on purpose: a new call site has to say which it is, and a
 * default would quietly make the next public path enforce.
 */
export type LeadPhotoUploader = 'workspace' | 'public_visitor';

export async function uploadLeadPhoto(
  accountId: string,
  file: File,
  uploader: LeadPhotoUploader,
): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Photos must be JPG, PNG, WebP, or AVIF.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Each photo must be 6 MB or smaller.');
  if (uploader === 'workspace') {
    await assertStorageCapacity(createAdminClient(), accountId, file.size);
  }
  await ensureLeadPhotosBucket();

  const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${accountId}/${randomUUID()}.${extension}`;
  const { error } = await createAdminClient().storage
    .from(LEAD_PHOTOS_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function createLeadPhotoUrls(accountId: string, paths: string[]): Promise<string[]> {
  return (await createLeadPhotoLinks(accountId, paths)).map((link) => link.url);
}

/**
 * Signed URLs paired with the path they belong to.
 *
 * createLeadPhotoUrls drops two kinds of entry — paths owned by another account,
 * and paths the storage API declined to sign — so the array it returns is often
 * SHORTER than the one passed in. Zipping it back against the original paths by
 * index silently shifts every photo after the first gap onto the wrong URL, so
 * pair them off here and remove the chance to get it wrong. (Same fix as
 * createJobPhotoLinks; leads carried the identical hazard.)
 */
export async function createLeadPhotoLinks(
  accountId: string,
  paths: string[],
): Promise<Array<{ path: string; url: string }>> {
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return [];
  const { data, error } = await createAdminClient().storage
    .from(LEAD_PHOTOS_BUCKET)
    .createSignedUrls(ownedPaths, 60 * 60);
  if (error) throw error;
  // createSignedUrls returns one entry per requested path, in order, each
  // carrying its own path — so pair off that rather than off the index.
  return (data ?? [])
    .map((item, index) => ({ path: item.path ?? ownedPaths[index], url: item.signedUrl }))
    .filter((link): link is { path: string; url: string } => Boolean(link.path && link.url));
}

export async function deleteLeadPhotos(accountId: string, paths: string[]) {
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return;
  await createAdminClient().storage.from(LEAD_PHOTOS_BUCKET).remove(ownedPaths);
}