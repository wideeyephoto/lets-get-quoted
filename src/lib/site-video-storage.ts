import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES } from '@/lib/video-source';

// Storage for contractor-uploaded website videos.
//
// The one structural difference from site-image-storage: the file never passes
// through our server. A server action's request body is capped at 4.5 MB on
// Vercel, and the smallest usable phone clip is several times that — routing a
// video through an action would fail for essentially every real upload. So the
// server only mints a short-lived signed upload URL and the browser PUTs the
// file straight to Supabase Storage.
//
// The path is minted server-side from the authenticated account id, so a signed
// URL can only ever write inside that account's folder no matter what the
// browser sends.

const SITE_VIDEOS_BUCKET = 'site-videos';

// The size cap and the allowed types come from lib/video-source, which the
// browser also reads — one ceiling, checked in both places.
const VIDEO_TYPES = new Set<string>(ALLOWED_VIDEO_TYPES);

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
};

async function ensureSiteVideosBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(SITE_VIDEOS_BUCKET);

  if (!data) {
    const { error } = await admin.storage.createBucket(SITE_VIDEOS_BUCKET, {
      public: true,
      fileSizeLimit: MAX_VIDEO_BYTES,
      allowedMimeTypes: [...VIDEO_TYPES],
    });

    if (error && !error.message.toLowerCase().includes('already exists')) {
      throw error;
    }
  }
}

export type SignedVideoUpload = {
  /** Bucket to upload into — sent along so the browser holds no magic string. */
  bucket: string;
  /** Storage path inside the bucket — pass back with the token to upload. */
  path: string;
  /** One-time token authorizing a write to exactly that path. */
  token: string;
  /** Where the file will be readable once the upload completes. */
  publicUrl: string;
};

export async function createSignedVideoUpload(
  accountId: string,
  fileName: string,
  contentType: string,
  sizeBytes: number,
): Promise<SignedVideoUpload> {
  if (!VIDEO_TYPES.has(contentType)) {
    throw new Error('Upload an MP4, MOV, WebM, or OGV video.');
  }

  // THE ONE UPLOAD WHOSE SIZE WE HAVE TO BE TOLD. Every other path weighs the
  // file on the server; this one never sees it, so the browser reports the size
  // and the allowance is checked before the signed URL is minted.
  //
  // A client could understate it. That is worth naming and worth accepting: the
  // bucket's own fileSizeLimit still caps what can physically be written, and
  // the next sweep measures what actually landed rather than what was claimed.
  // A storage allowance is a billing boundary, and the honest cost of not
  // routing videos through a server action is that this number is a claim until
  // the sweep confirms it.
  await assertStorageCapacity(createAdminClient(), accountId, sizeBytes);

  await ensureSiteVideosBucket();

  const extension = EXTENSION_FOR_TYPE[contentType] || 'mp4';
  const safeName = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'website-video';
  const path = `${accountId}/${randomUUID()}-${safeName}.${extension}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(SITE_VIDEOS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error('Could not start the upload. Try again.');

  const { data: publicUrl } = admin.storage.from(SITE_VIDEOS_BUCKET).getPublicUrl(path);
  return { bucket: SITE_VIDEOS_BUCKET, path, token: data.token, publicUrl: publicUrl.publicUrl };
}

export async function deleteSiteVideo(accountId: string, storagePath: string) {
  if (!storagePath.startsWith(`${accountId}/`)) {
    throw new Error('Video does not belong to this account.');
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(SITE_VIDEOS_BUCKET).remove([storagePath]);
  if (error) throw error;
}

// The storage path inside a public video URL, or null when the URL points
// somewhere we don't own (a YouTube link, a video from another account). Used to
// tell "removing this from the page should also delete the file" from "this
// isn't ours to delete".
export function siteVideoStoragePath(url: string, accountId: string): string | null {
  const marker = `/${SITE_VIDEOS_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
  return path.startsWith(`${accountId}/`) ? path : null;
}
