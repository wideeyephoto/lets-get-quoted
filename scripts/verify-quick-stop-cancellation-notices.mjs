import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyQuickStopCancellations(db,other,root,passed){
  await db.query('reset role');await db.query('alter table extra_stop_requests add column cancel_reason text,add column canceled_at timestamptz,add column no_show_confirmed_at timestamptz,add column refund_cents integer default 0');
  const migration=readFileSync(join(root,'migrations/20260914183419_quick_stop_cancellation_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const id=(await db.query("insert into extra_stop_requests(account_id,status) values($1,'confirmed') returning id",[account])).rows[0].id;
  const cancel=client=>client.query("update extra_stop_requests set status='customer_canceled',canceled_at=clock_timestamp(),refund_cents=10000 where id=$1 and status='confirmed' returning id",[id]);
  const results=await Promise.all([cancel(db),cancel(other)]);assert.equal(results.reduce((n,r)=>n+r.rowCount,0),1);
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[id])).rows[0];assert.equal(notice.event_kind,'quick_stop_cancellation');
  assert.ok(notice.source_payload.body.includes('does not confirm'));assert.ok(!JSON.stringify(notice.source_payload).includes('10000'));
  await db.query('update extra_stop_requests set refund_cents=0 where id=$1',[id]);
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[notice.id])).rows[0].ok,true);
  passed('cancellation and notice commit once; intended or corrected refund amounts never become refund-completion claims');
  await assert.rejects(db.query("update extra_stop_requests set status='contractor_canceled' where id=$1",[id]),/already terminal/);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[id])).rows[0].c,1);
  await db.query("update extra_stop_requests set status='refunded' where id=$1",[id]);
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[notice.id])).rows[0].ok,true);
  passed('terminal cancellation cannot be reclassified to create another notice; later refund keeps the cancellation record valid');
}
