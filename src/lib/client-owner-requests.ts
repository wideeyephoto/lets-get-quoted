import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const validClientRequestId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function clientRequestHash(kind: string, body: string, files: string[] = []) {
  return createHash('sha256').update(JSON.stringify({ kind, body, files })).digest('hex');
}

export async function findClientRequest(admin: SupabaseClient, accountId: string, jobId: string, requestId: string, hash: string) {
  const { data, error } = await admin.from('client_owner_request_receipts').select('payload_hash,feed_id')
    .eq('account_id',accountId).eq('job_id',jobId).eq('request_id',requestId).maybeSingle();
  if (error) throw new Error('Request receipt could not be checked.');
  if (data && data.payload_hash !== hash) throw new Error('This request was already submitted with different content. Reopen the form to send a new request.');
  return data as { payload_hash: string; feed_id: string | null } | null;
}

export async function saveClientRequest(admin: SupabaseClient, input: {
  accountId: string; jobId: string; requestId: string; hash: string;
  kind: string; title: string; body: string; meta?: Record<string, unknown>;
}): Promise<{ feed_id: string | null; replayed: boolean }> {
  const { data, error } = await admin.rpc('submit_client_owner_request', {
    p_account_id: input.accountId, p_job_id: input.jobId, p_request_id: input.requestId,
    p_payload_hash: input.hash, p_kind: input.kind, p_title: input.title,
    p_body: input.body, p_meta: input.meta ?? {},
  });
  if (error || !data || typeof data.replayed !== 'boolean' || (data.feed_id !== null && typeof data.feed_id !== 'string')) {
    throw new Error('Request could not be saved. Retry the same form, or reopen it to send different content.');
  }
  return data;
}
