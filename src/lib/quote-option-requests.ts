import 'server-only';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {parseQuoteItems} from '@/lib/jobs';

export type QuoteOptionRequest = {requestId:string; revision:string};
export function quoteOptionRevision(items:unknown,total:unknown):string {
  return createHash('sha256').update(JSON.stringify([parseQuoteItems(items),Number(total)||0])).digest('hex');
}
export function quoteOptionRequestHash(jobId:string,addonIds:string[],request:QuoteOptionRequest):string {
  if(!request || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.requestId)
    || !/^[a-f0-9]{64}$/.test(request.revision)) throw new Error('Reload this quote before changing your options.');
  return createHash('sha256').update(JSON.stringify([jobId,request.revision,[...new Set(addonIds)].sort()])).digest('hex');
}
export async function findQuoteOptionReceipt(admin:SupabaseClient,accountId:string,request:QuoteOptionRequest,hash:string){
  const {data,error}=await admin.from('quote_option_request_receipts').select('payload_hash,total,event_id').eq('account_id',accountId).eq('request_id',request.requestId).maybeSingle();
  if(error) throw new Error('We could not check your saved change. Retry the same choices.');
  if(data && data.payload_hash!==hash) throw new Error('This request already saved different choices. Reload the latest quote before making another change.');
  return data;
}
