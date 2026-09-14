import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyClientOwnerRequests(db, other, root, passed) {
  await db.query('reset role');
  await db.query('create table jobs(id uuid primary key default gen_random_uuid(),account_id uuid not null references accounts(id) on delete cascade)');
  await db.query('grant select,insert,update,delete on jobs to service_role');
  await db.query('alter table job_feed add column visibility text, add column author text, add column published_at timestamptz');
  const migration=readFileSync(join(root,'migrations/20260914175807_client_owner_request_receipts.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);
  const signature='submit_client_owner_request(uuid,uuid,uuid,text,text,text,text,jsonb)';
  for(const role of ['anon','authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'client_owner_request_receipts','select,insert,update,delete') ok",[role])).rows[0].ok,false);
    assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,signature])).rows[0].ok,false);
  }
  const fn=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  assert.equal(fn.prosecdef,false);assert.ok(fn.proconfig.includes('search_path=""'));
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='client_owner_request_receipts'::regclass")).rows[0].relrowsecurity,true);
  await db.query('set role service_role');await other.query('set role service_role');
  passed('request receipts and submission RPC are private, invoker-only and mirrored in the schema');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const job=(await db.query('insert into jobs(account_id) values($1) returning id',[account])).rows[0].id;
  const request='11111111-1111-4111-8111-111111111111';
  const submit=(client,over={})=>client.query('select submit_client_owner_request($1,$2,$3,$4,$5,$6,$7,$8) result',
    [over.account??account,over.job??job,over.request??request,over.hash??'a'.repeat(64),over.kind??'client_question','Question','Original question',{}]).then(r=>r.rows[0].result);
  const results=await Promise.all([submit(db),submit(other)]);
  assert.equal(results[0].feed_id,results[1].feed_id);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[results[0].feed_id])).rows[0].c,1);
  assert.deepEqual(await submit(db),{feed_id:results[0].feed_id,replayed:true});
  await assert.rejects(submit(db,{hash:'b'.repeat(64)}),/different content/);
  assert.equal((await db.query('select count(*)::int c from job_feed where account_id=$1',[account])).rows[0].c,1);
  passed('concurrent and repeated requests return one event/notice; changed content cannot reuse its identity');
  await assert.rejects(submit(db,{account:'00000000-0000-0000-0000-000000000000'}),/Job not found/);
  await assert.rejects(submit(db,{kind:'job_update'}),/Invalid client request/);
  await assert.rejects(submit(db,{hash:'not-a-fingerprint'}),/Invalid client request/);
  await assert.rejects(db.query("update client_owner_request_receipts set payload_hash=$1 where account_id=$2",['b'.repeat(64),account]),/permission denied/);
  passed('foreign jobs, unsupported request kinds and direct receipt mutation are rejected');
  await db.query('delete from job_feed where id=$1',[results[0].feed_id]);
  assert.deepEqual(await submit(db),{feed_id:null,replayed:true});
  const next=await submit(db,{request:'22222222-2222-4222-8222-222222222222'});
  assert.ok(next.feed_id);assert.equal(next.replayed,false);
  passed('deleted events leave a replay tombstone while a deliberate new request remains distinct');
  await db.query('reset role');await db.query('revoke insert on owner_event_notices from service_role');await db.query('set role service_role');
  await assert.rejects(submit(db,{request:'33333333-3333-4333-8333-333333333333'}),/permission denied/);
  assert.equal((await db.query('select count(*)::int c from client_owner_request_receipts where account_id=$1',[account])).rows[0].c,2);
  assert.equal((await db.query('select count(*)::int c from job_feed where account_id=$1',[account])).rows[0].c,1);
  await db.query('reset role');await db.query('grant insert on owner_event_notices to service_role');await db.query('set role service_role');
  passed('source event, owner notice and request receipt all roll back when any required write fails');
  const foreignAccount=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const foreignJob=(await db.query('insert into jobs(account_id) values($1) returning id',[foreignAccount])).rows[0].id;
  const foreign=await submit(db,{account:foreignAccount,job:foreignJob});
  assert.ok(foreign.feed_id);assert.notEqual(foreign.feed_id,results[0].feed_id);
  await db.query('delete from accounts where id=$1',[account]);
  assert.equal((await db.query('select count(*)::int c from client_owner_request_receipts where account_id=$1',[foreignAccount])).rows[0].c,1);
  assert.equal((await db.query('select count(*)::int c from client_owner_request_receipts where account_id=$1',[account])).rows[0].c,0);
  passed('account cleanup removes only its request receipts');
}
