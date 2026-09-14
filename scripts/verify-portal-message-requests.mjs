import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function verifyPortalMessageRequests(db,other,root,passed){
  await db.query('reset role');
  await db.query('grant delete on clients to service_role');
  await db.query('alter table clients add column name text,add column phone text; alter table jobs add column client_id uuid,add column created_at timestamptz default now()');
  await db.query('create table sms_messages(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),phone_number text not null,direction text,body text,created_at timestamptz default now()); grant select,insert,delete on sms_messages to service_role');
  const sql=readFileSync(join(root,'migrations/20260914194628_portal_message_request_receipts.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(sql.replace(/\r\n/g,'\n').trim()));await db.query(sql);await db.query('set role service_role');await other.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const client=(await db.query("insert into clients(account_id,name,phone) values($1,'Client','(555) 123-4567') returning id",[account])).rows[0].id;
  const job=(await db.query('insert into jobs(account_id,client_id) values($1,$2) returning id',[account,client])).rows[0].id;
  const request=randomUUID();const hash='a'.repeat(64);
  const submit=(connection,requestId=request,body='Hello',payloadHash=hash,jobId=null,clientId=client,rawPhone='(555) 123-4567',phone='+15551234567')=>connection.query('select submit_portal_message_request($1,$2,$3,$4,$5,$6,$7,$8) r',[account,clientId,requestId,payloadHash,body,jobId,rawPhone,phone]);
  const results=await Promise.all([submit(db),submit(other)]);const id=results[0].rows[0].r.message_id;
  assert.equal(results[1].rows[0].r.message_id,id);assert.equal(results.filter(r=>r.rows[0].r.replayed).length,1);
  for(const table of ['portal_message_requests','job_feed','sms_messages'])assert.equal((await db.query(`select count(*)::int c from ${table} where id=$1`,[id])).rows[0].c,1);
  assert.equal((await db.query('select phone_number from sms_messages where id=$1',[id])).rows[0].phone_number,'+15551234567');
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[id])).rows[0];assert.equal(notice.source_payload.job_id,job);assert.equal(notice.source_payload.body,'Hello');
  passed('concurrent portal retries atomically save one message, inbox copy, job history and owner notice');
  await assert.rejects(submit(db,request,'Changed','b'.repeat(64)),/different content/);
  const otherClient=(await db.query("insert into clients(account_id,name) values($1,'Other') returning id",[account])).rows[0].id;
  await assert.rejects(submit(db,randomUUID(),'Hello',hash,job,otherClient,null,null),/belong to this client/);
  await assert.rejects(submit(db,randomUUID(),'Hello',hash,null,client,'old phone'),/changed/);
  passed('portal requests reject changed payloads, another client’s job and stale contact snapshots');
  const noJob=await submit(db,randomUUID(),'No job or phone',hash,null,otherClient,null,null);const noJobId=noJob.rows[0].r.message_id;
  assert.equal(noJob.rows[0].r.job_id,null);assert.equal((await db.query('select body from portal_message_requests where id=$1',[noJobId])).rows[0].body,'No job or phone');
  assert.equal((await db.query('select count(*)::int c from sms_messages where id=$1',[noJobId])).rows[0].c,0);
  assert.equal((await db.query('select source_payload from owner_event_notices where source_id=$1',[noJobId])).rows[0].source_payload.client_id,otherClient);
  passed('jobless and phoneless portal messages have a durable history and a client-linked owner notice');
  await db.query('delete from jobs where id=$1',[job]);assert.equal((await submit(db)).rows[0].r.message_id,id);
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where id=$1',[notice.id])).rows[0].ok,false);
  await db.query('delete from clients where id=$1',[otherClient]);
  assert.equal((await db.query('select owner_event_source_available(n) ok from owner_event_notices n where source_id=$1',[noJobId])).rows[0].ok,false);
  passed('deleted jobs or clients stop pending notices while receipts prevent delayed replay from recreating messages');
  await db.query('reset role');await db.query("alter table owner_event_notices add constraint test_reject_portal check(source_type<>'portal_message') not valid");await db.query('set role service_role');
  const rollback=randomUUID();await assert.rejects(submit(db,rollback),/test_reject_portal/);
  assert.equal((await db.query('select count(*)::int c from portal_message_requests where request_id=$1',[rollback])).rows[0].c,0);
  assert.equal((await db.query('select count(*)::int c from sms_messages where account_id=$1',[account])).rows[0].c,1);
  for(const role of ['anon','authenticated']){
    assert.equal((await db.query("select has_table_privilege($1,'portal_message_requests','select') ok",[role])).rows[0].ok,false);
    assert.equal((await db.query("select has_function_privilege($1,'submit_portal_message_request(uuid,uuid,uuid,text,text,uuid,text,text)','execute') ok",[role])).rows[0].ok,false);
  }
  await db.query('reset role');await db.query('alter table owner_event_notices drop constraint test_reject_portal');await db.query('set role service_role');
  passed('a failed portal notice rolls back all message storage and the transaction remains service-only');
}
