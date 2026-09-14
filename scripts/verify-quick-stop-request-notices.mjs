import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyQuickStopRequests(db,other,root,passed){
  await db.query('reset role');await db.query("alter table extra_stop_requests add column client_phone text,add column client_email text,add column response_deadline_at timestamptz,add column ai_summary text,add column intake jsonb default '{}'::jsonb");
  const migration=readFileSync(join(root,'migrations/20260914183857_quick_stop_request_owner_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const create=(client,email='contact@example.test',phone='+12485550140',accountId=account)=>client.query("insert into extra_stop_requests(account_id,status,client_email,client_phone,response_deadline_at,ai_summary) values($1,'awaiting_contractor',$2,$3,clock_timestamp()+interval '30 minutes','Leaking tap') returning id",[accountId,email,phone]);
  const results=await Promise.allSettled([create(db),create(other)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='23505').length,1);
  const id=results.find(r=>r.status==='fulfilled').value.rows[0].id;
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[id])).rows[0];assert.equal(notice.event_kind,'quick_stop_requested');assert.ok(notice.source_payload.body.includes('Leaking tap'));
  await assert.rejects(create(db,' CONTACT@example.test ','+12485550141'),/already has an active/);
  await assert.rejects(create(db,'different@example.test','+12485550140'),/already has an active/);
  passed('simultaneous Quick Stop requests sharing email or phone create one request and atomic owner notice');
  const another=(await db.query('insert into accounts default values returning id')).rows[0].id;assert.equal((await create(db,'contact@example.test','+12485550140',another)).rowCount,1);
  await db.query("update extra_stop_requests set response_deadline_at=clock_timestamp()-interval '1 minute' where id=$1",[id]);
  await db.query('select * from claim_owner_event_notices(1,$1,$2)',[id,account]);assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[id])).rows[0].state,'cancelled');
  await db.query("update extra_stop_requests set status='contractor_declined' where id=$1",[id]);assert.equal((await create(db)).rowCount,1);
  passed('contact protection stays account-scoped, expired requests cancel pending mail, and a later request remains possible');
}
