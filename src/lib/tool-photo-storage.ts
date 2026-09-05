import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';

import {
  TOOL_PHOTOS_BUCKET,
  MAX_TOOL_PHOTO_BYTES,
  ALLOWED_TOOL_PHOTO_TYPES,
  validateToolPhotoFile,
  assertValidToolPhotoFile,
} from '@/lib/tool-photo-validation';

export {
  TOOL_PHOTOS_BUCKET,
  MAX_TOOL_PHOTO_BYTES,
  ALLOWED_TOOL_PHOTO_TYPES,
  validateToolPhotoFile,
  assertValidToolPhotoFile,
};

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
