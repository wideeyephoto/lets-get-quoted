#!/usr/bin/env node
import {createClient} from '@supabase/supabase-js';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const evidenceReasons=['provider_suppressed','hard_bounce','complaint'];
const allReasons=['unsubscribe_link','one_click_unsubscribe',...evidenceReasons];
const tables=new Set(['operational_callback_evidence','operational_alert_deliveries','platform_email_suppression']);
export function callbackReviewFetch(origin, upstream=globalThis.fetch){
 const expected=new URL(origin).origin;
 return async(input,init)=>{
  const request=new Request(input,init);const url=new URL(request.url);
  const table=url.pathname.slice('/rest/v1/'.length);
  if(request.method!=='GET'||url.origin!==expected||!url.pathname.startsWith('/rest/v1/')||!tables.has(table)) throw Error('Callback review blocked an unexpected request.');
  return upstream(new Request(request,{redirect:'error',signal:AbortSignal.timeout(10000)}));
 };
}
function single(value){
 const list=typeof value==='string'?[value]:value;
 return Array.isArray(list)&&list.length===1&&typeof list[0]==='string'&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(list[0])?list[0].toLowerCase():null;
}
function bound(row,email){
 const tags=row.saved_tags;
 const tenant=Array.isArray(tags)?tags.some(tag=>tag?.name==='account_id'):tags&&typeof tags==='object'?Object.hasOwn(tags,'account_id'):tags!=null;
 const empty=value=>value==null||(Array.isArray(value)&&!value.length);
 return single(row.saved_to)===email&&empty(row.saved_cc)&&empty(row.saved_bcc)&&!tenant;
}
export async function inspectCallbackEvidence(admin,{maxRecords=500}={}){
 if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>2000) throw Error('Review budget must be 1–2000 records.');
 const startedAt=new Date().toISOString();const rows=[];const seen=new Set();let cursor=null;
 while(true){
  let query=admin.from('operational_callback_evidence').select('provider_id,recipient,reason,event_id,occurred_at,recorded_at').order('provider_id',{ascending:true}).limit(100);
  if(cursor!==null)query=query.gt('provider_id',cursor);
  const page=await query;
  if(page.error||!Array.isArray(page.data)||page.data.length>100)throw Error('Callback evidence scan unavailable or incomplete.');
  if(!page.data.length)break;
  for(const item of page.data){
   if(rows.length>=maxRecords)throw Error('Callback evidence exceeds review budget; no complete report produced.');
   if(typeof item.provider_id!=='string'||!item.provider_id||seen.has(item.provider_id)
    ||single(item.recipient)!==item.recipient||!evidenceReasons.includes(item.reason)
    ||typeof item.event_id!=='string'||!item.event_id||!Number.isFinite(Date.parse(item.occurred_at))||!Number.isFinite(Date.parse(item.recorded_at)))throw Error('Callback evidence scan returned invalid or repeated rows.');
   seen.add(item.provider_id);
   const delivery=await admin.from('operational_alert_deliveries').select('id,provider_id,saved_to:payload->to,saved_cc:payload->cc,saved_bcc:payload->bcc,saved_tags:payload->tags').eq('provider_id',item.provider_id).maybeSingle();
   if(delivery.error||delivery.data===undefined)throw Error('Operational delivery lookup unavailable.');
   let status='unmatched_provider';let deliveryId=null;
   if(delivery.data){
    if(delivery.data.provider_id!==item.provider_id||typeof delivery.data.id!=='string')throw Error('Operational delivery lookup returned an invalid binding.');
    deliveryId=delivery.data.id;
    status='recipient_binding_mismatch';
    if(bound(delivery.data,item.recipient)){
     const block=await admin.from('platform_email_suppression').select('email,reason').eq('email',item.recipient).maybeSingle();
     if(block.error||block.data===undefined||(block.data&&(block.data.email!==item.recipient||!allReasons.includes(block.data.reason))))throw Error('Platform block lookup unavailable or invalid.');
     status=!block.data?'block_missing':allReasons.indexOf(block.data.reason)<allReasons.indexOf(item.reason)?'block_weaker':'block_present';
    }
   }
   rows.push({providerId:item.provider_id,deliveryId,eventId:item.event_id,reason:item.reason,status,occurredAt:item.occurred_at,recordedAt:item.recorded_at});
  }
  cursor=page.data.at(-1).provider_id;
 }
 const counts={unmatched_provider:0,recipient_binding_mismatch:0,block_missing:0,block_weaker:0,block_present:0};
 for(const row of rows)counts[row.status]++;
 return {complete:true,startedAt,finishedAt:new Date().toISOString(),records:rows.length,counts,rows,
  limitation:'Read-only observations across multiple queries, not an atomic snapshot or provider-wide inventory. No sending, repair or deletion performed.'};
}
export async function main(args=process.argv.slice(2),env=process.env){
 if(args.length!==1||!args[0].startsWith('--project-host='))throw Error('Specify --project-host=<exact Supabase hostname> to confirm the review environment.');
 if(!env.NEXT_PUBLIC_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Set explicit Supabase process-environment credentials; no .env file is loaded.');
 const url=new URL(env.NEXT_PUBLIC_SUPABASE_URL);
 if(url.hostname!==args[0].slice('--project-host='.length)||url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Review environment does not match the requested HTTPS host.');
 const admin=createClient(url.origin,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:callbackReviewFetch(url.origin)}});
 const report=await inspectCallbackEvidence(admin);console.log(JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main().catch(()=>{console.error('Callback evidence review unavailable or incomplete. Check environment, permissions and the 500-record budget. No complete report produced.');process.exitCode=1;});}
