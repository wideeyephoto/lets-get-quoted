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
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return [];
  const { data, error } = await createAdminClient().storage
    .from(JOB_PHOTOS_BUCKET)
    .createSignedUrls(ownedPaths, 60 * 60);
  if (error) throw error;
  return data.map((item) => item.signedUrl).filter((url): url is string => Boolean(url));
}

export async function deleteJobPhotos(accountId: string, paths: string[]) {
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return;
  await createAdminClient().storage.from(JOB_PHOTOS_BUCKET).remove(ownedPaths);
}
