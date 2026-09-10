import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSettlement, reconcileRows } from './reconcile-submitted-overage-settlements.mjs';

const row={id:'settlement',account_id:'workspace',stripe_customer_id:'cus_customer123',stripe_account_id:'acct_scope',
  chargeable_cents:100,livemode:false,revision:4};
const scope={accountId:'acct_scope',livemode:false};
const item={id:'ii_original123',customer:row.stripe_customer_id,amount:100,currency:'usd',livemode:false,
  metadata:{lgq_settlement_id:row.id,lgq_account_id:row.account_id},invoice:'in_attached'};
const stripeWithPages=(pages)=>({invoiceItems:{list:async()=>pages.shift(),retrieve:async()=>item}});

test('follows pagination beyond twenty items and includes attached invoice items',async()=>{
  const pages=[{data:Array.from({length:100},(_,i)=>({id:`ii_other${i}`,metadata:{}})),has_more:true},{data:[item],has_more:false}];
  assert.equal((await inspectSettlement(stripeWithPages(pages),row,scope)).status,'matched');
  assert.equal(pages.length,0);
});
test('duplicate matching objects are held',async()=>{
  const result=await inspectSettlement(stripeWithPages([{data:[item,{...item,id:'ii_duplicate123'}],has_more:false}]),row,scope);
  assert.equal(result.reason,'duplicate_items');
});
test('no match never enables retry',async()=>{
  const result=await inspectSettlement(stripeWithPages([{data:[],has_more:false}]),row,scope);
  assert.equal(result.status,'unresolved');
  assert.equal(result.reason,'no_matching_item');
});
test('incomplete scans never authorize an apply',async()=>{
  const result=await inspectSettlement(stripeWithPages([{data:[item],has_more:true}]),row,scope,1);
  assert.equal(result.reason,'incomplete_pagination');
});
test('missing configuration and wrong mode remain unresolved',async()=>{
  assert.equal((await inspectSettlement(null,row,scope)).status,'unresolved');
  assert.equal((await inspectSettlement(stripeWithPages([]),row,{...scope,livemode:true})).status,'unresolved');
});
for (const changed of [{amount:101},{customer:'cus_wrong123'},{currency:'eur'},{livemode:true}]) {
  test(`rejects mismatched evidence ${JSON.stringify(changed)}`,async()=>{
    assert.equal((await inspectSettlement(stripeWithPages([{data:[{...item,...changed}],has_more:false}]),row,scope)).reason,'item_mismatch');
  });
}
test('lookup exceptions increment errors without any database write',async()=>{
  const db={query:async()=>assert.fail('must not mutate')};
  const report=await reconcileRows({rows:[row],stripe:{invoiceItems:{list:async()=>{throw Error('outage');}}},db,scope,apply:true});
  assert.equal(report.errors,1); assert.equal(report.applied,0);
});
test('dry run never writes',async()=>{
  const report=await reconcileRows({rows:[row],stripe:stripeWithPages([{data:[item],has_more:false}]),
    db:{query:async()=>assert.fail('dry run write')},scope});
  assert.equal(report.matched,1); assert.equal(report.applied,0);
});
test('apply is revision checked and rejects concurrent state changes',async()=>{
  const report=await reconcileRows({rows:[row],stripe:stripeWithPages([{data:[item],has_more:false}]),
    db:{query:async(sql,args)=>{assert.match(sql,/reconcile_overage_invoice_item/);assert.equal(args[1],4);return{rows:[{applied:false}]};}},scope,apply:true});
  assert.equal(report.unresolved,1);assert.equal(report.entries[0].reason,'concurrent_change');
});
test('active leases are left untouched',async()=>{
  const report=await reconcileRows({rows:[{...row,lease_expires_at:new Date(Date.now()+60000).toISOString()}],
    stripe:stripeWithPages([]),db:{query:async()=>assert.fail('active lease mutation')},scope,apply:true});
  assert.equal(report.entries[0].reason,'active_lease');
});
