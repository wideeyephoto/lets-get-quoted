import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALLOWED_TYPES } from '@/lib/lead-photo-types';

export class QuickStopRequestChangedError extends Error {
  constructor() { super('This request was already saved with different details. Refresh the page to start a new request.'); }
}

export async function quickStopRequestHash(intent: Record<string, unknown>, files: File[]): Promise<string> {
  if (files.length > 6) throw new Error('Attach no more than six files.');
  const attachments: { name: string; type: string; digest: string }[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type) || file.size > 35 * 1024 * 1024) throw new Error('Invalid attachment.');
    attachments.push({name:file.name,type:file.type,digest:createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')});
  }
  return createHash('sha256').update(JSON.stringify({intent,attachments})).digest('hex');
}

export async function findQuickStopReceipt(admin: SupabaseClient, accountId: string, requestId: string, hash: string) {
  const {data,error}=await admin.from('quick_stop_request_receipts').select('payload_hash,quick_stop_id')
    .eq('account_id',accountId).eq('request_id',requestId).maybeSingle();
  if(error)throw new Error('Request receipt unavailable.');
  if(data && data.payload_hash!==hash)throw new QuickStopRequestChangedError();
  return data as {payload_hash:string;quick_stop_id:string|null}|null;
}
