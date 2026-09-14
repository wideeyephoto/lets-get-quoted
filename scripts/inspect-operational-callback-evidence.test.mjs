import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {callbackReviewFetch,inspectCallbackEvidence,main} from './inspect-operational-callback-evidence.mjs';
const origin='https://synthetic.supabase.co';
const event=(id,reason='hard_bounce')=>({provider_id:id,recipient:`${id}@ops.test`,reason,event_id:`event-${id}`,occurred_at:'2026-09-14T12:00:00Z',recorded_at:'2026-09-14T12:01:00Z'});
function fixture({events=[],cap=100,delivery={},blocks={},failTable=null,repeat=false}={}){
 const requests=[];
 const fetcher=callbackReviewFetch(origin,async request=>{
  const url=new URL(request.url);const table=url.pathname.split('/').pop();requests.push(url);
  assert.equal(request.method,'GET');assert.equal(request.redirect,'error');
  assert.ok(request.signal instanceof AbortSignal);
  if(table===failTable)return Response.json({message:'private service error'},{status:403});
  if(table==='operational_callback_evidence'){
   const cursor=url.searchParams.get('provider_id')?.slice(3)??'';
   assert.equal(url.searchParams.get('order'),'provider_id.asc');
   return Response.json(events.filter(row=>repeat||row.provider_id>cursor).slice(0,cap));
  }
  if(table==='operational_alert_deliveries'){
   assert.equal(url.searchParams.get('select'),'id,provider_id,saved_to:payload->to,saved_cc:payload->cc,saved_bcc:payload->bcc,saved_tags:payload->tags');
   const id=url.searchParams.get('provider_id').slice(3);
   return Response.json(delivery[id]?[delivery[id]]:[]);
  }
  assert.equal(table,'platform_email_suppression');
  const address=url.searchParams.get('email').slice(3);
  return Response.json(blocks[address]?[{email:address,reason:blocks[address]}]:[]);
 });
 return {admin:createClient(origin,'synthetic',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}}),requests};
}
const saved=id=>({id:`delivery-${id}`,provider_id:id,saved_to:[`${id}@ops.test`],saved_cc:null,saved_bcc:null,saved_tags:null});
test('reports every disposition while omitting recipient addresses and message bodies',async()=>{
 const f=fixture({events:['a','b','c','d','e'].map(id=>event(id)),cap:2,
  delivery:{b:{...saved('b'),saved_to:['wrong@ops.test']},c:saved('c'),d:saved('d'),e:saved('e')},
  blocks:{'d@ops.test':'provider_suppressed','e@ops.test':'complaint'}});
 const report=await inspectCallbackEvidence(f.admin);
 assert.equal(report.complete,true);assert.equal(report.records,5);
 assert.deepEqual(report.counts,{unmatched_provider:1,recipient_binding_mismatch:1,block_missing:1,block_weaker:1,block_present:1});
 assert.doesNotMatch(JSON.stringify(report),/@ops.test|saved_to|saved_tags/);
 assert.equal(f.requests.filter(url=>url.pathname.endsWith('operational_callback_evidence')).length,4);
});
test('empty data produces a complete empty observation',async()=>{
 const f=fixture();const report=await inspectCallbackEvidence(f.admin);assert.equal(report.records,0);assert.equal(f.requests.length,1);
});
test('continues past a lower API cap until explicit empty page',async()=>{
 const f=fixture({events:['a','b','c'].map(id=>event(id)),cap:1});
 assert.equal((await inspectCallbackEvidence(f.admin)).records,3);
 assert.equal(f.requests.filter(url=>url.pathname.endsWith('operational_callback_evidence')).length,4);
});
test('over-budget and repeated pages cannot report complete',async()=>{
 await assert.rejects(inspectCallbackEvidence(fixture({events:[event('a'),event('b')]}).admin,{maxRecords:1}),/budget/);
 await assert.rejects(inspectCallbackEvidence(fixture({events:[event('a')],repeat:true}).admin),/repeated/);
});
for(const table of ['operational_callback_evidence','operational_alert_deliveries','platform_email_suppression']){
 test(`${table} read failures abort the report`,async()=>{
  const f=fixture({events:[event('a')],delivery:{a:saved('a')},failTable:table});
  await assert.rejects(inspectCallbackEvidence(f.admin),/unavailable/);
 });
}
for(const row of [{...event('a'),reason:'unknown'},{...event('a'),recorded_at:'not-a-date'},{...event('a'),recipient:'not-address'}]){
 test(`invalid evidence ${JSON.stringify(row)} fails closed`,async()=>{
  await assert.rejects(inspectCallbackEvidence(fixture({events:[row]}).admin),/invalid/);
 });
}
for(const patch of [{saved_cc:['hidden@ops.test']},{saved_bcc:'hidden@ops.test'},{saved_tags:{account_id:'tenant'}},{saved_tags:[{name:'account_id',value:'tenant'}]}]){
 test('extra recipients or tenant tags remain binding conflicts',async()=>{
  const f=fixture({events:[event('a')],delivery:{a:{...saved('a'),...patch}}});
  assert.equal((await inspectCallbackEvidence(f.admin)).counts.recipient_binding_mismatch,1);
  assert.ok(!f.requests.some(url=>url.pathname.endsWith('platform_email_suppression')));
 });
}
test('request guard blocks writes, RPCs and unrelated origins/tables before network access',async()=>{
 let calls=0;const fetcher=callbackReviewFetch(origin,async()=>{calls++;return Response.json([]);});
 for(const [url,method] of [[`${origin}/rest/v1/operational_callback_evidence`,'POST'],[`${origin}/rest/v1/operational_alert_deliveries`,'PATCH'],
  [`${origin}/rest/v1/rpc/reconcile_operational_callback`,'GET'],[`${origin}/rest/v1/rpc/operational_callback_evidence`,'GET'],
  [`${origin}/rest/v1/accounts`,'GET'],['https://api.resend.com/emails','POST'],['https://other.supabase.co/rest/v1/operational_callback_evidence','GET']]){
  await assert.rejects(fetcher(url,{method}),/blocked/);
 }
 assert.equal(calls,0);
});
test('requires an explicitly matching environment before constructing the client',async()=>{
 await assert.rejects(main([],{}),/Specify/);
 await assert.rejects(main(['--project-host=wrong.supabase.co'],{NEXT_PUBLIC_SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'synthetic'}),/does not match/);
 await assert.rejects(main(['--project-host=synthetic.supabase.co'],{NEXT_PUBLIC_SUPABASE_URL:origin}),/credentials/);
});
