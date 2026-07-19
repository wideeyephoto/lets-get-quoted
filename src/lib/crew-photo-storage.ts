import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';

const CREW_PHOTOS_BUCKET = 'crew-photos';
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

async function ensureCrewPhotosBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(CREW_PHOTOS_BUCKET);
  if (data) return;

  const { error } = await admin.storage.createBucket(CREW_PHOTOS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_PHOTO_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });
  if (error && !error.message.toLowerCase().includes('already exists')) throw error;
}

export function isCrewPhotoFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export function validateCrewPhotoFile(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Crew photos must be JPG, PNG, WebP, or AVIF.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Crew photos must be 4 MB or smaller.');
}

export async function uploadCrewPhoto(accountId: string, crewId: string, file: File): Promise<string> {
  validateCrewPhotoFile(file);
  await ensureCrewPhotosBucket();

  const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${accountId}/${crewId}/${randomUUID()}.${extension}`;
  const { error } = await createAdminClient().storage
    .from(CREW_PHOTOS_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function createCrewPhotoUrls(accountId: string, paths: string[]): Promise<Record<string, string>> {
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return {};

  const { data, error } = await createAdminClient().storage
    .from(CREW_PHOTOS_BUCKET)
    .createSignedUrls(ownedPaths, 60 * 60);
  if (error) throw error;

  const urls: Record<string, string> = {};
  data.forEach((item, index) => {
    if (item.signedUrl) urls[ownedPaths[index]] = item.signedUrl;
  });
  return urls;
}

export async function deleteCrewPhotos(accountId: string, paths: string[]) {
  const ownedPaths = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (ownedPaths.length === 0) return;
  await createAdminClient().storage.from(CREW_PHOTOS_BUCKET).remove(ownedPaths);
}
