import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';

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

export async function uploadLeadPhoto(accountId: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Photos must be JPG, PNG, WebP, or AVIF.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Each photo must be 6 MB or smaller.');
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