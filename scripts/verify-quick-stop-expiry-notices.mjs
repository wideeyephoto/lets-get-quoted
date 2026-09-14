import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyQuickStopExpiry(db,other,root,passed){
  await db.query('reset role');await db.query('alter table extra_stop_requests add column payment_deadline_at timestamptz');
  const migration=readFileSync(join(root,'migrations/20260914183645_quick_stop_expiry_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const payment=(await db.query("insert into payments(account_id,status) values($1,'requested') returning id",[account])).rows[0].id;
  const make=async()=> (await db.query("insert into extra_stop_requests(account_id,payment_id,payment_deadline_at) values($1,$2,clock_timestamp()-interval '1 hour') returning id",[account,payment])).rows[0].id;
  const expire=(client,id)=>client.query("update extra_stop_requests set status='offer_expired' where id=$1 and status='awaiting_customer_payment' returning id",[id]);
  const id=await make();const results=await Promise.all([expire(db,id),expire(other,id)]);assert.equal(results.reduce((n,r)=>n+r.rowCount,0),1);
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[id])).rows[0];assert.equal(notice.event_kind,'quick_stop_expired');assert.ok(!notice.source_payload.body.includes('nothing was charged'));
  assert.equal((await expire(db,id)).rowCount,0);assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[id])).rows[0].c,1);
  passed('concurrent/repeated payment-window expiration saves one durable owner notice without unsupported charge claims');
  await db.query("update payments set status='paid' where id=$1",[payment]);
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[id,account])).rowCount,0);
  assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[id])).rows[0].state,'cancelled');
  const future=await make();await db.query("update extra_stop_requests set payment_deadline_at=clock_timestamp()+interval '1 hour' where id=$1",[future]);
  await assert.rejects(expire(db,future),/has not expired/);
  assert.equal((await db.query('select status from extra_stop_requests where id=$1',[future])).rows[0].status,'awaiting_customer_payment');
  const response=(await db.query("insert into extra_stop_requests(account_id,status) values($1,'awaiting_contractor') returning id",[account])).rows[0].id;
  await db.query("update extra_stop_requests set status='offer_expired' where id=$1",[response]);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[response])).rows[0].c,0);
  passed('late payment cancels pending expiry mail, extended deadlines refuse stale expiration, and response-only expiry stays silent');
}
