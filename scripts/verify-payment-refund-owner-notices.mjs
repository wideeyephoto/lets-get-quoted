import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyPaymentRefundNotices(db,other,root,passed){
  await db.query('reset role');
  await db.query("alter table payments add column amount numeric default 100,add column refunded_amount numeric default 0,add column stripe_payment_intent text,add column charge_model text default 'destination'");
  const migration=readFileSync(join(root,'migrations/20260914185901_payment_refund_owner_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const make=async()=> (await db.query("insert into payments(account_id,status,stripe_payment_intent) values($1,'paid','pi_refund_test') returning id",[account])).rows[0].id;
  const id=await make();
  const update=(client,total,event=randomUUID())=>client.query('update payments set refunded_amount=$2,refund_notice_event_id=$3 where id=$1 and refunded_amount<$2 returning id',[id,total,event]);
  const results=await Promise.all([update(db,25),update(other,25)]);assert.equal(results.reduce((n,r)=>n+r.rowCount,0),1);
  let notices=(await db.query("select * from owner_event_notices where account_id=$1 and source_type='payment_refund' order by created_at",[account])).rows;
  assert.equal(notices.length,1);assert.equal(notices[0].source_payload.refund_amount,25);assert.equal(notices[0].source_payload.refunded_total,25);
  assert.ok(notices[0].source_payload.body.includes('$25.00'));
  assert.equal((await update(db,25)).rowCount,0);await update(db,50);
  notices=(await db.query("select * from owner_event_notices where account_id=$1 and source_type='payment_refund' order by created_at",[account])).rows;
  assert.equal(notices.length,2);assert.equal(notices[1].source_payload.refund_amount,25);assert.equal(notices[1].source_payload.refunded_total,50);
  for(const n of notices)assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[n.id])).rows[0].ok,true);
  passed('concurrent refund accounting saves one owner notice and later partial refunds keep separate immutable amounts');
  await db.query("update payments set stripe_payment_intent='pi_changed' where id=$1",[id]);
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[notices[0].source_id,account])).rowCount,0);
  assert.equal((await db.query('select state from owner_event_notices where id=$1',[notices[0].id])).rows[0].state,'cancelled');
  const unmarked=await make();await db.query('update payments set refunded_amount=10 where id=$1',[unmarked]);
  assert.equal((await db.query("select count(*)::int c from owner_event_notices where source_payload->>'payment_id'=$1",[unmarked])).rows[0].c,0);
  for(const bad of ["status='requested'","charge_model='direct'","refunded_amount=101","stripe_payment_intent='pi_other'"]){
    const item=await make();await assert.rejects(db.query('update payments set '+(bad.startsWith('refunded_amount=')?'':'refunded_amount=20,')+'refund_notice_event_id=$2,'+bad+' where id=$1',[item,randomUUID()]));
  }
  passed('only marked verified refund writes enqueue, and changed source identity cancels pending notices');
  const rollback=await make();await db.query('reset role');await db.query("alter table owner_event_notices add constraint test_reject_refund check(event_kind<>'payment_refund_recorded') not valid");await db.query('set role service_role');
  await assert.rejects(db.query('update payments set refunded_amount=20,refund_notice_event_id=$2 where id=$1',[rollback,randomUUID()]),/test_reject_refund/);
  assert.equal(Number((await db.query('select refunded_amount from payments where id=$1',[rollback])).rows[0].refunded_amount),0);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'record_payment_refund_owner_notice()','execute') ok",[role])).rows[0].ok,false);
  passed('failed owner notice insertion rolls back refund accounting and the trigger is not publicly callable');
}
