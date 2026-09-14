import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyQuickStopNotices(db,other,root,passed){
  await db.query('reset role');await db.query(`create table payments(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),status text);
    create table extra_stop_requests(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),status text default 'awaiting_customer_payment',payment_id uuid references payments(id),paid_at timestamptz,client_name text default 'Customer',address text,arrival_date date,arrival_start time,arrival_end time);
    grant select,insert,update,delete on payments,extra_stop_requests to service_role;`);
  const migration=readFileSync(join(root,'migrations/20260914183134_quick_stop_confirmation_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const payment=(await db.query("insert into payments(account_id,status) values($1,'paid') returning id",[account])).rows[0].id;
  const make=async()=> (await db.query("insert into extra_stop_requests(account_id,payment_id,arrival_date,arrival_start,arrival_end) values($1,$2,'2026-09-15','13:00','14:00') returning id",[account,payment])).rows[0].id;
  const confirm=(client,id)=>client.query("update extra_stop_requests set status='confirmed',paid_at=clock_timestamp() where id=$1 and status='awaiting_customer_payment' returning id",[id]);
  const id=await make();const results=await Promise.all([confirm(db,id),confirm(other,id)]);assert.equal(results.reduce((n,r)=>n+r.rowCount,0),1);
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[id])).rows[0];assert.equal(notice.event_kind,'quick_stop_confirmed');assert.ok(notice.source_payload.body.includes('01:00 PM'));
  assert.equal((await confirm(db,id)).rowCount,0);assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[id])).rows[0].c,1);
  passed('Quick Stop confirmation and notice commit together once under concurrent/repeated confirmation');
  for(const mutation of ["status='customer_canceled'","arrival_start='15:00'","address='Changed address'"]){const next=await make();await confirm(db,next);await db.query(`update extra_stop_requests set ${mutation} where id=$1`,[next]);assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[next,account])).rowCount,0);}
  await db.query("update payments set status='refunded' where id=$1",[payment]);
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[id,account])).rowCount,0);
  const invalid=await make();await assert.rejects(confirm(db,invalid),/payment is not settled/);assert.equal((await db.query('select status from extra_stop_requests where id=$1',[invalid])).rows[0].status,'awaiting_customer_payment');
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'record_quick_stop_confirmation_notice()','execute') ok",[role])).rows[0].ok,false);
  passed('changed/canceled/refunded Quick Stops cannot send stale confirmation; unsettled payment fails atomically');
}
