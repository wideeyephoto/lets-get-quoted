import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PortalMessageRequest = { accountId: string; clientId: string; requestId: string; body: string; jobId?: string | null };
export function portalMessagePayloadHash(input: PortalMessageRequest) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error('Refresh this page before sending your message.');
  const body=input.body.trim();
  if (!body || body.length>4000) throw new Error('Enter a message of up to 4,000 characters.');
  return createHash('sha256').update(JSON.stringify([input.clientId,input.jobId || null,body])).digest('hex');
}
export async function findPortalMessageReceipt(admin: SupabaseClient, input: PortalMessageRequest) {
  const hash=portalMessagePayloadHash(input);
  const result=await admin.from('portal_message_requests').select('id,payload_hash,job_id')
    .eq('account_id',input.accountId).eq('request_id',input.requestId).maybeSingle();
  if (result.error) throw new Error('Could not check your saved message. Please try again.');
  if (result.data && result.data.payload_hash!==hash) throw new Error('This request already contains a different message. Choose Start a new message.');
  return result.data;
}
