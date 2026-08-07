import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';

// Staff-uploaded files on an account (contracts, ID scans, correspondence —
// whatever a case needs attached). Generalizes insurance-storage.ts's single
// certificate-per-account model to any number of files, same path convention
// and ownership guard: `${accountId}/${uuid}.${ext}`, re-checked against the
// account's own prefix before a signed URL is ever minted.

const ATTACHMENTS_BUCKET = 'account-attachments';
const MAX_BYTES = 20 * 1024 * 1024;

async function ensureBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(ATTACHMENTS_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
  });
  if (error && !error.message.toLowerCase().includes('already exists')) throw error;
}

/** An empty file input still submits, so size is the real test of "did they pick one". */
export function isAttachmentFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export type AccountAttachment = {
  id: string;
  account_id: string;
  path: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
};

const ATTACHMENT_COLUMNS = 'id, account_id, path, filename, content_type, size_bytes, uploaded_by, created_at';

export async function listAccountAttachments(admin: SupabaseClient, accountId: string): Promise<AccountAttachment[]> {
  const { data, error } = await admin
    .from('account_attachments')
    .select(ATTACHMENT_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listAccountAttachments failed:', error);
    return [];
  }
  return (data ?? []) as AccountAttachment[];
}

export async function uploadAccountAttachment(
  admin: SupabaseClient,
  accountId: string,
  uploadedBy: string,
  file: File,
): Promise<AccountAttachment> {
  if (file.size > MAX_BYTES) throw new Error('That file is over 20 MB.');
  await ensureBucket();

  const extension = file.name.includes('.') ? file.name.split('.').pop()!.slice(0, 10) : 'bin';
  const path = `${accountId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await createAdminClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await admin
    .from('account_attachments')
    .insert({
      account_id: accountId,
      path,
      filename: file.name.slice(0, 200) || 'attachment',
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: uploadedBy,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`uploadAccountAttachment failed: ${error?.message ?? 'no row returned'}`);
  return data as AccountAttachment;
}

/** A link that works for an hour — see insurance-storage.ts for why signed, not public. */
export async function accountAttachmentUrl(accountId: string, path: string): Promise<string | null> {
  if (!path.startsWith(`${accountId}/`)) return null;
  const { data, error } = await createAdminClient().storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteAccountAttachment(admin: SupabaseClient, accountId: string, attachmentId: string): Promise<void> {
  const { data } = await admin.from('account_attachments').select('path').eq('id', attachmentId).eq('account_id', accountId).maybeSingle();
  if (!data) return;
  const path = (data as { path: string }).path;
  await createAdminClient().storage.from(ATTACHMENTS_BUCKET).remove([path]);
  await admin.from('account_attachments').delete().eq('id', attachmentId).eq('account_id', accountId);
}
