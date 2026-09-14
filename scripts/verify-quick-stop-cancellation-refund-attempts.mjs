import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyCancellationRefundAttempts(db,other,root,passed){
  await db.query('reset role');await db.query('alter table owner_event_notices drop constraint test_reject_refund');
  const migration=readFileSync(join(root,'migrations/20260914190341_quick_stop_cancellation_refund_attempts.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const make=async()=>{
    const payment=(await db.query("insert into payments(account_id,status,stripe_payment_intent) values($1,'paid','pi_cancel_refund') returning id",[account])).rows[0].id;
    const request=(await db.query("insert into extra_stop_requests(account_id,payment_id,status,paid_at) values($1,$2,'confirmed',clock_timestamp()) returning id",[account,payment])).rows[0].id;
    await db.query("update extra_stop_requests set status='contractor_canceled',canceled_at=clock_timestamp(),cancellation_refund_requested_cents=5000 where id=$1",[request]);
    return {payment,request};
  };
  const claim=(client,request,a=account)=>client.query('select claim_quick_stop_cancellation_refund($1,$2) attempt',[a,request]).then(r=>r.rows[0].attempt);
  const first=await make();const receipt=(await db.query('select * from quick_stop_cancellation_refund_attempts where quick_stop_id=$1',[first.request])).rows[0];
  assert.equal(receipt.state,'prepared');assert.equal(Number(receipt.requested_cents),5000);
  const claims=await Promise.all([claim(db,first.request),claim(other,first.request)]);assert.equal(claims.filter(Boolean).length,1);assert.equal(await claim(db,first.request),null);
  await assert.rejects(db.query('update quick_stop_cancellation_refund_attempts set requested_cents=1 where id=$1',[receipt.id]),/immutable/);
  passed('cancellation atomically records immutable refund intent before one-winner submission; abandoned claims cannot automatically resend');
  const observe=(id,status,amount=5000,provider='re_'+id.replaceAll('-',''))=>db.query('select observe_quick_stop_cancellation_refund($1,$2,$3,$4,$5,$6,$7) ok',[account,id,provider,status,'pi_cancel_refund',amount,'usd']).then(r=>r.rows[0].ok);
  const finish=(id,done)=>db.query('select finish_quick_stop_cancellation_refund($1,$2,$3) ok',[account,id,done]).then(r=>r.rows[0].ok);
  assert.equal(await observe(receipt.id,'succeeded',5001),false);assert.equal(await observe(receipt.id,'pending'),true);assert.equal(await finish(receipt.id,true),false);
  assert.equal(await finish(receipt.id,false),true);assert.equal(await claim(db,first.request),null);
  assert.equal((await db.query('select provider_status from quick_stop_cancellation_refund_attempts where id=$1',[receipt.id])).rows[0].provider_status,'pending');
  passed('provider amount and identity are bound; pending and uncertain outcomes stay visible without completion or another submission');
  const second=await make();const a=await claim(db,second.request);assert.equal(await observe(a.id,'succeeded'),true);assert.equal(await finish(a.id,true),false);
  await db.query('update payments set refunded_amount=50,refund_notice_event_id=$2 where id=$1',[second.payment,randomUUID()]);
  assert.equal(await finish(a.id,true),true);assert.equal((await db.query('select refund_cents from extra_stop_requests where id=$1',[second.request])).rows[0].refund_cents,5000);
  assert.equal((await db.query('select state from quick_stop_cancellation_refund_attempts where id=$1',[a.id])).rows[0].state,'accounted');
  const third=await make();await db.query('update payments set refunded_amount=20 where id=$1',[third.payment]);assert.equal(await claim(db,third.request),null);
  assert.equal(await claim(db,third.request,randomUUID()),null);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'claim_quick_stop_cancellation_refund(uuid,uuid)','execute') ok",[role])).rows[0].ok,false);
  passed('completion requires matching settled accounting; changed balances and wrong accounts cannot submit a saved attempt');
  const sharedPayment=(await db.query("insert into payments(account_id,status,stripe_payment_intent) values($1,'paid','pi_shared_refund') returning id",[account])).rows[0].id;
  const sharedRequests=[];
  for(let i=0;i<2;i++){
    const q=(await db.query("insert into extra_stop_requests(account_id,payment_id,status) values($1,$2,'confirmed') returning id",[account,sharedPayment])).rows[0].id;
    await db.query("update extra_stop_requests set status='contractor_canceled',canceled_at=clock_timestamp(),cancellation_refund_requested_cents=5000 where id=$1",[q]);sharedRequests.push(q);
  }
  assert.equal((await Promise.all([claim(db,sharedRequests[0]),claim(other,sharedRequests[1])])).filter(Boolean).length,1);
  const deleted=await make();await db.query('delete from extra_stop_requests where id=$1',[deleted.request]);assert.equal(await claim(db,deleted.request),null);
  assert.equal((await db.query('select state from quick_stop_cancellation_refund_attempts where quick_stop_id=$1',[deleted.request])).rows[0].state,'manual_review');
  passed('two Quick Stops sharing one payment cannot submit competing refunds and deleted requests retain reviewable attempts');
  const rollback=(await db.query("insert into extra_stop_requests(account_id,payment_id,status) values($1,$2,'confirmed') returning id",[account,first.payment])).rows[0].id;
  await db.query('reset role');await db.query('alter table quick_stop_cancellation_refund_attempts add constraint test_reject_attempt check(requested_cents<>6000) not valid');await db.query('set role service_role');
  await assert.rejects(db.query("update extra_stop_requests set status='contractor_canceled',canceled_at=clock_timestamp(),cancellation_refund_requested_cents=6000 where id=$1",[rollback]),/test_reject_attempt/);
  assert.equal((await db.query('select status from extra_stop_requests where id=$1',[rollback])).rows[0].status,'confirmed');
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[rollback])).rows[0].c,0);
  passed('an attempt write failure rolls back cancellation and its owner notice before any provider call');
}
