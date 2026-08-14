import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';

const JOB_PHOTOS_BUCKET = 'job-photos';
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

async function ensureJobPhotosBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(JOB_PHOTOS_BUCKET);
  if (data) return;

  const { error } = await admin.storage.createBucket(JOB_PHOTOS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_PHOTO_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });
  if (error && !error.message.toLowerCase().includes('already exists')) throw error;
}

/** A real, non-empty file from a multipart form — an empty file input still submits. */
export function isJobPhotoFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

/**
 * Storage paths posted back by the field app's uploader, filtered to ones this
 * account could actually have written.
 *
 * The uploader sends photos ahead of the form and hands the action a list of
 * paths, which means the action is now taking a storage key from a client. The
 * shape is fixed and account-prefixed by uploadJobPhoto — `<account>/<uuid>.jpg`
 * — so anything that doesn't match that exactly is discarded rather than
 * queried. Without this, a hand-posted path could attach another tenant's
 * photograph to a change order as evidence.
 */
export function ownedPhotoPaths(accountId: string, values: FormDataEntryValue[]): string[] {
  const shape = new RegExp(`^${accountId}/[0-9a-fA-F-]{36}\\.(jpg|png|webp|avif)$`);
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const path = value.trim();
    if (!shape.test(path) || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

export async function uploadJobPhoto(accountId: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Photos must be JPG, PNG, WebP, or AVIF.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Each photo must be 6 MB or smaller.');
  await ensureJobPhotosBucket();

  const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${accountId}/${randomUUID()}.${extension}`;
  const { error } = await createAdminClient().storage
    .from(JOB_PHOTOS_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function createJobPhotoUrls(accountId: string, paths: string[]): Promise<string[]> {
  return (await createJobPhotoLinks(accountId, paths)).map((link) => link.url);
}

/**
 * Signed URLs paired with the path they belong to.
 *
 * createJobPhotoUrls drops two kinds of entry — paths owned by another account,
 * and paths the storage API declined to sign — so the array it returns is often
 * SHORTER than the one passed in. Callers were zipping it back against the
 * original paths by index, which silently shifts every photo after the first
 * gap onto the wrong URL. Pairing them here removes the chance to get it wrong.
 */
export async function createJobPhotoLinks(
  accountId: string,
  paths: string[],
): Promise<Array<{ path: string; url: string }>> {
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return [];
  const { data, error } = await createAdminClient().storage
    .from(JOB_PHOTOS_BUCKET)
    .createSignedUrls(ownedPaths, 60 * 60);
  if (error) throw error;
  // createSignedUrls returns one entry per requested path, in order, each
  // carrying its own path — so pair off that rather than off the index.
  return (data ?? [])
    .map((item, index) => ({ path: item.path ?? ownedPaths[index], url: item.signedUrl }))
    .filter((link): link is { path: string; url: string } => Boolean(link.path && link.url));
}

export async function deleteJobPhotos(accountId: string, paths: string[]) {
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return;
  await createAdminClient().storage.from(JOB_PHOTOS_BUCKET).remove(ownedPaths);
}
