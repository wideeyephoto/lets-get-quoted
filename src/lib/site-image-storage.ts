import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';
import type { SiteImage } from '@/lib/site-images';

const SITE_IMAGES_BUCKET = 'site-images';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

async function ensureSiteImagesBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(SITE_IMAGES_BUCKET);

  if (!data) {
    const { error } = await admin.storage.createBucket(SITE_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: [...ALLOWED_IMAGE_TYPES],
    });

    if (error && !error.message.toLowerCase().includes('already exists')) {
      throw error;
    }
  }
}

function imageAltFromName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/^[0-9a-f-]{36}-/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Contractor project image';
}

export async function listUploadedSiteImages(accountId: string): Promise<SiteImage[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(SITE_IMAGES_BUCKET)
    .list(accountId, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) {
    if (error.message.toLowerCase().includes('bucket not found')) {
      return [];
    }
    throw error;
  }

  return (data || [])
    .filter((file) => file.id)
    .map((file) => {
      const storagePath = `${accountId}/${file.name}`;
      const { data: publicUrl } = admin.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(storagePath);

      return {
        id: `upload-${storagePath}`,
        url: publicUrl.publicUrl,
        alt: imageAltFromName(file.name),
        category: 'craft',
        source: 'upload',
        storagePath,
      };
    });
}

export async function uploadSiteImage(accountId: string, file: File): Promise<SiteImage> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Upload a JPG, PNG, WebP, or AVIF image.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be 10 MB or smaller.');
  }

  await assertStorageCapacity(createAdminClient(), accountId, file.size);
  await ensureSiteImagesBucket();

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const safeName = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'project-image';
  const storagePath = `${accountId}/${randomUUID()}-${safeName}.${extension}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(SITE_IMAGES_BUCKET).upload(
    storagePath,
    Buffer.from(await file.arrayBuffer()),
    { contentType: file.type, cacheControl: '31536000', upsert: false }
  );

  if (error) {
    throw error;
  }

  const { data } = admin.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(storagePath);
  return {
    id: `upload-${storagePath}`,
    url: data.publicUrl,
    alt: imageAltFromName(file.name),
    category: 'craft',
    source: 'upload',
    storagePath,
  };
}

export async function uploadGeneratedSiteImage(
  accountId: string,
  input: { bytes: Buffer; fileName: string; mimeType: 'image/png' | 'image/webp'; alt: string },
): Promise<SiteImage> {
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('The generated logo is too large to save. Try generating it again.');
  }

  await assertStorageCapacity(createAdminClient(), accountId, input.bytes.byteLength);
  await ensureSiteImagesBucket();

  const extension = input.mimeType === 'image/webp' ? 'webp' : 'png';
  const safeName = input.fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'ai-logo';
  const storagePath = `${accountId}/${randomUUID()}-${safeName}.${extension}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(SITE_IMAGES_BUCKET).upload(
    storagePath,
    input.bytes,
    { contentType: input.mimeType, cacheControl: '31536000', upsert: false }
  );

  if (error) throw error;

  const { data } = admin.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(storagePath);
  return {
    id: `upload-${storagePath}`,
    url: data.publicUrl,
    alt: input.alt,
    category: 'craft',
    source: 'upload',
    storagePath,
  };
}

export async function importJobPhotoAsSiteImage(accountId: string, jobPhotoPath: string, alt: string): Promise<SiteImage> {
  if (!jobPhotoPath.startsWith(`${accountId}/`)) {
    throw new Error('Photo does not belong to this account.');
  }

  await ensureSiteImagesBucket();

  const admin = createAdminClient();
  const { data: fileData, error: downloadError } = await admin.storage.from('job-photos').download(jobPhotoPath);
  if (downloadError || !fileData) {
    throw downloadError ?? new Error('Unable to import this job photo.');
  }

  // An import is a COPY, not a move -- the job photo stays where it is -- so it
  // costs the workspace the file's size a second time. Checked after the
  // download because that is the first moment the size is known, and before the
  // upload so the second copy is never written.
  await assertStorageCapacity(admin, accountId, fileData.size);

  const extension = jobPhotoPath.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const safeName = alt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'job-photo';
  const storagePath = `${accountId}/${randomUUID()}-${safeName}.${extension}`;
  const { error: uploadError } = await admin.storage.from(SITE_IMAGES_BUCKET).upload(
    storagePath,
    Buffer.from(await fileData.arrayBuffer()),
    { contentType: fileData.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`, cacheControl: '31536000', upsert: false }
  );

  if (uploadError) {
    throw uploadError;
  }

  const { data } = admin.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(storagePath);
  return {
    id: `upload-${storagePath}`,
    url: data.publicUrl,
    alt,
    category: 'craft',
    source: 'upload',
    storagePath,
  };
}

export async function deleteSiteImage(accountId: string, storagePath: string) {
  if (!storagePath.startsWith(`${accountId}/`)) {
    throw new Error('Image does not belong to this account.');
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(SITE_IMAGES_BUCKET).remove([storagePath]);
  if (error) {
    throw error;
  }
}
