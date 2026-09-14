import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyQuoteOptionNotices(db,other,root,passed){
  await db.query('reset role');
  await db.query('alter table payments add column job_id uuid references jobs(id)');
  await db.query("alter table jobs add column quote_items jsonb default '[]',add column status text default 'in_progress',add column started_at timestamptz,add column scheduled_for date; alter table accounts add column client_quote_changes boolean default true,add column timezone text default 'UTC'");
  await db.query('create table payment_plans(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),job_id uuid references jobs(id),status text,authorized_at timestamptz,created_at timestamptz default now()); grant select,insert,update,delete on payment_plans to service_role; alter table payment_plans enable row level security');
  const sql=readFileSync(join(root,'migrations/20260914200123_quote_option_owner_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n').trim()));
  await db.query(sql);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const makeJob=async()=>(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const snapshot=async id=>(await db.query("select jsonb_build_object('status',status,'started_at',started_at,'scheduled_for',scheduled_for,'quote_items',quote_items,'quoted_amount',quoted_amount) s from jobs where id=$1",[id])).rows[0].s;
  const items=[{id:'addon',kind:'addon',amount:150,selected:true}];
  const save=(conn,id,expected,total=150)=>conn.query("select save_client_quote_options($1,$2,$3,$4,$5,'Changed options','Added work. Check existing invoices.') r",[account,id,expected,JSON.stringify(items),total]);
  const id=await makeJob(),expected=await snapshot(id);
  const race=await Promise.allSettled([save(db,id,expected),save(other,id,expected)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(race.map(r=>r.status==='rejected'?r.reason.message:r.value.rows)));
  assert.equal((await db.query('select count(*)::int c from job_feed where job_id=$1',[id])).rows[0].c,1);
  const notice=(await db.query('select * from owner_event_notices where account_id=$1',[account])).rows[0];
  assert.equal(notice.event_kind,'quote_options_changed');
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[notice.id])).rows[0].ok,true);
  const unchanged=await save(db,id,await snapshot(id));assert.equal(unchanged.rows[0].r.changed,false);
  passed('competing quote option changes commit one quote revision and owner notice, and unchanged retries stay silent');
  await db.query("update jobs set quote_items='[]' where id=$1",[id]);
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[notice.id])).rows[0].ok,false);
  await assert.rejects(save(db,id,expected),/Quote changed/);
  passed('stale quote snapshots cannot overwrite newer choices and changed item evidence stops pending notices');
  for(const change of ["status='complete'","started_at=now()","scheduled_for=current_date"]){
    const closed=await makeJob();await db.query(`update jobs set ${change} where id=$1`,[closed]);
    await assert.rejects(save(db,closed,await snapshot(closed)),/no longer open/);
  }
  const planned=await makeJob();await db.query("insert into payment_plans(account_id,job_id,status) values($1,$2,'active')",[account,planned]);
  await assert.rejects(save(db,planned,await snapshot(planned)),/already authorized/);
  const paid=await makeJob();await db.query("insert into payments(account_id,job_id,status,amount) values($1,$2,'paid',200)",[account,paid]);
  await assert.rejects(save(db,paid,await snapshot(paid)),/below payments/);
  passed('quote options recheck work start, schedule, authorized plans and current paid amounts in the transaction');
  const rollback=await makeJob();await db.query('reset role');await db.query("alter table owner_event_notices add constraint test_reject_options check(event_kind<>'quote_options_changed') not valid");await db.query('set role service_role');
  await assert.rejects(save(db,rollback,await snapshot(rollback)),/test_reject_options/);
  assert.equal((await snapshot(rollback)).quoted_amount,100);
  assert.equal((await db.query('select count(*)::int c from job_feed where job_id=$1',[rollback])).rows[0].c,0);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'save_client_quote_options(uuid,uuid,jsonb,jsonb,numeric,text,text)','execute') ok",[role])).rows[0].ok,false);
  await db.query('reset role');await db.query('alter table owner_event_notices drop constraint test_reject_options');await db.query('set role service_role');
  passed('notice storage failure rolls back the quote and history; the save function is service-only');
}
