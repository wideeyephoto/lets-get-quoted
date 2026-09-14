import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyQuickStopReceipts(db,other,root,passed){
  await db.query('reset role');
  await db.query(`create table clients(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id));
    grant select,insert,update on clients to service_role;
    alter table extra_stop_requests add column client_id uuid,add column requested_date date,add column lat double precision,add column lng double precision,add column photo_paths jsonb,add column ai_visit_minutes int,add column ai_complexity text,add column ai_eligible boolean,add column ai_confidence double precision,add column ai_exclusions text[],add column availability jsonb;`);
  const migration=readFileSync(join(root,'migrations/20260914184145_quick_stop_request_receipts.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const account2=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const request=randomUUID(),hash='a'.repeat(64);
  const payload={client_name:'Customer',client_phone:'+12485550991',client_email:'receipt@example.test',address:'1 Main',intake:{issue:'Leaking tap'},photo_paths:[],ai_summary:'Leaking tap',ai_exclusions:[],availability:[],response_deadline_at:new Date(Date.now()+1800000).toISOString()};
  const submit=(client=db,id=request,h=hash,a=account,p=payload)=>client.query('select submit_quick_stop_request($1,$2,$3,$4) result',[a,id,h,p]).then(r=>r.rows[0].result);
  const results=await Promise.all([submit(db),submit(other)]);
  assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal(results[0].quick_stop_id,results[1].quick_stop_id);
  const id=results[0].quick_stop_id;
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[id])).rows[0].c,1);
  await assert.rejects(submit(db,request,'b'.repeat(64)),/different content/);
  passed('Quick Stop receipt serializes simultaneous identical requests and rejects changed content without another notice');
  await db.query("update extra_stop_requests set status='contractor_declined' where id=$1",[id]);
  assert.deepEqual(await submit(),{quick_stop_id:id,replayed:true});
  await db.query('delete from extra_stop_requests where id=$1',[id]);
  assert.deepEqual(await submit(),{quick_stop_id:null,replayed:true});
  assert.equal((await db.query('select count(*)::int c from extra_stop_requests where account_id=$1',[account])).rows[0].c,0);
  assert.equal((await submit(db,request,hash,account2)).replayed,false);
  passed('closed and deleted Quick Stop requests retain replay receipts while the same request UUID remains account-scoped');
  const wrongClient=(await db.query('insert into clients(account_id) values($1) returning id',[account2])).rows[0].id;
  const invalid=randomUUID();await assert.rejects(submit(db,invalid,hash,account,{...payload,client_id:wrongClient}),/Client unavailable/);
  assert.equal((await db.query('select count(*)::int c from quick_stop_request_receipts where request_id=$1',[invalid])).rows[0].c,0);
  for(const role of ['anon','authenticated']){
    assert.equal((await db.query("select has_function_privilege($1,'submit_quick_stop_request(uuid,uuid,text,jsonb)','execute') ok",[role])).rows[0].ok,false);
    assert.equal((await db.query("select has_table_privilege($1,'quick_stop_request_receipts','select') ok",[role])).rows[0].ok,false);
  }
  // A receipt write failure must undo the source and the source's queued notice.
  await db.query('reset role');await db.query("alter table quick_stop_request_receipts add constraint test_reject_receipt check(payload_hash<>'c'::text||repeat('c',63))");await db.query('set role service_role');
  const failed=randomUUID();await assert.rejects(submit(db,failed,'c'.repeat(64)),/test_reject_receipt/);
  assert.equal((await db.query('select count(*)::int c from extra_stop_requests where account_id=$1',[account])).rows[0].c,0);
  assert.equal((await db.query('select count(*)::int c from quick_stop_request_receipts where request_id=$1',[failed])).rows[0].c,0);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where account_id=$1',[account])).rows[0].c,1);
  passed('private Quick Stop receipts enforce client tenancy and failed receipt writes roll back source creation');
}
