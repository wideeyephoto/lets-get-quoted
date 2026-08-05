import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';

/**
 * Storing and serving a certificate of insurance.
 *
 * Private bucket, signed links. A certificate is meant to be handed out, but
 * handed out is not the same as indexed — it carries the business's policy
 * number and address, and a public URL is one search away from being a document
 * anybody can quote back at them.
 */

const INSURANCE_BUCKET = 'insurance-proof';
const MAX_BYTES = 10 * 1024 * 1024;
// PDF first because that is what an agent emails. Images because what a
// contractor actually has on their phone is a photo of the paper one.
const ALLOWED_TYPES = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
]);

async function ensureBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(INSURANCE_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(INSURANCE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES.keys()],
  });
  if (error && !error.message.toLowerCase().includes('already exists')) throw error;
}

/** An empty file input still submits, so size is the real test of "did they pick one". */
export function isInsuranceFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function uploadInsuranceProof(accountId: string, file: File): Promise<{ path: string; filename: string }> {
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) throw new Error('Upload a PDF or a photo (JPG, PNG, WebP or HEIC) of your certificate.');
  if (file.size > MAX_BYTES) throw new Error('That file is over 10 MB. A scan or a photo of the certificate is plenty.');
  await ensureBucket();

  const path = `${accountId}/${randomUUID()}.${extension}`;
  const { error } = await createAdminClient().storage
    .from(INSURANCE_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      // Short, because replacing a lapsed certificate with the renewal is the
      // whole lifecycle of this file and a year-long cache would outlive it.
      cacheControl: '300',
      upsert: false,
    });
  if (error) throw error;
  return { path, filename: file.name.slice(0, 200) || `certificate.${extension}` };
}

/**
 * A link that works for an hour.
 *
 * Ownership is re-checked against the path prefix rather than trusted from the
 * caller — the same guard the job-photo helpers use, for the same reason: the
 * account id is the only thing standing between one contractor's storage and
 * another's.
 */
export async function insuranceProofUrl(accountId: string, path: string | null): Promise<string | null> {
  if (!path || !path.startsWith(`${accountId}/`)) return null;
  const { data, error } = await createAdminClient().storage
    .from(INSURANCE_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteInsuranceProof(accountId: string, path: string | null): Promise<void> {
  if (!path || !path.startsWith(`${accountId}/`)) return;
  await createAdminClient().storage.from(INSURANCE_BUCKET).remove([path]);
}
