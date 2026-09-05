import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';

export const TOOL_PHOTOS_BUCKET = 'tool-photos';
export const MAX_TOOL_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_TOOL_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function ensureToolPhotosBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(TOOL_PHOTOS_BUCKET);
  if (data) return;

  const { error } = await admin.storage.createBucket(TOOL_PHOTOS_BUCKET, {
    public: true,
    fileSizeLimit: MAX_TOOL_PHOTO_BYTES,
    allowedMimeTypes: [...ALLOWED_TOOL_PHOTO_TYPES],
  });
  if (error && !error.message.toLowerCase().includes('already exists')) throw error;
}

export function validateToolPhotoFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TOOL_PHOTO_TYPES.has(file.type)) {
    return { valid: false, error: 'Equipment photos must be JPG, PNG, or WebP format.' };
  }
  if (file.size > MAX_TOOL_PHOTO_BYTES) {
    return { valid: false, error: 'Equipment photos must be 5 MB or smaller.' };
  }
  return { valid: true };
}

export function assertValidToolPhotoFile(file: File): void {
  const check = validateToolPhotoFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }
}

/**
 * Uploads a tool equipment photo to Supabase storage under account tenancy.
 */
export async function uploadToolPhoto(
  accountId: string,
  toolId: string,
  file: File
): Promise<string> {
  assertValidToolPhotoFile(file);
  const admin = createAdminClient();
  await assertStorageCapacity(admin, accountId, file.size);
  await ensureToolPhotosBucket();

  const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const filename = `${randomUUID()}.${extension}`;
  const path = `${accountId}/${toolId}/${filename}`;

  const { error } = await admin.storage
    .from(TOOL_PHOTOS_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: true,
    });

  if (error) throw error;

  // Retrieve public or storage URL
  const { data: publicUrlData } = admin.storage
    .from(TOOL_PHOTOS_BUCKET)
    .getPublicUrl(path);

  return publicUrlData.publicUrl || path;
}
