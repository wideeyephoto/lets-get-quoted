import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyOwnerEventSnapshots(db, other, root, passed) {
  await db.query('reset role');
  const migration = readFileSync(join(root,'migrations/20260914175031_owner_event_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  // Applied by the owner event source checks.
  const fn = 'prepare_owner_event_notice_snapshot(uuid,uuid,timestamptz,jsonb,text,text)';
  for (const role of ['anon','authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'owner_event_notice_snapshots','select,insert,update,delete') ok",[role])).rows[0].ok,false);
    assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,fn])).rows[0].ok,false);
  }
  for (const signature of [fn,'guard_owner_event_notice_snapshot()','guard_owner_event_notice_identity()']) {
    const r = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
    assert.equal(r.prosecdef,false); assert.ok(r.proconfig.includes('search_path=""'));
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='owner_event_notice_snapshots'::regclass")).rows[0].relrowsecurity,true);
  passed('owner event snapshot migration matches fresh schema and keeps payloads private');
  await db.query('set role service_role'); await other.query('set role service_role');
  const fixture = async () => {
    const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
    const feed=(await db.query("insert into job_feed(account_id,kind,title,body) values($1,'client_question','Question','Original question') returning *",[account])).rows[0];
    return (await db.query("insert into owner_event_notices(account_id,source_id,event_kind,source_payload,state,attempted_at,recipient) values($1,$2,'client_question',$3,'sending',clock_timestamp(),'owner@example.test') returning *,attempted_at::text claim_time",[account,feed.id,{title:feed.title,body:feed.body,job_id:feed.job_id}])).rows[0];
  };
  const message = n => ({ from: "Let's Get Quoted <hello@letsgetquoted.com>", to: 'owner@example.test', reply_to: 'hello@letsgetquoted.com', subject: 'Your domain is connected', html: '<p>Original saved content and link</p>', tags: [
    { name: 'kind', value: 'contractor_alert' }, { name: 'account_id', value: n.account_id }, { name: 'owner_event_notice_id', value: n.id },
    { name: 'theme', value: 'studio' }, { name: 'template_version', value: '2_0' },
  ] });
  const prepare = (client,n,over={}) => client.query('select prepare_owner_event_notice_snapshot($1,$2,$3,$4,$5,$6) ok',[
    n.id,over.account ?? n.account_id,over.time ?? n.claim_time,over.payload ?? message(n),over.scope ?? 'a'.repeat(64),over.key ?? `owner-event:v1:${n.id}`,
  ]).then(r=>r.rows[0].ok);
  const read = n => db.query('select * from owner_event_notice_snapshots where notice_id=$1',[n.id]).then(r=>r.rows[0]);
  let n = await fixture();
  assert.equal(await prepare(db,n,{account:'00000000-0000-0000-0000-000000000000'}),false);
  assert.equal(await prepare(db,n,{time:'2000-01-01T00:00:00Z'}),false);
  for (const p of [{ ...message(n), to: 'other@example.test' }, { ...message(n), to: ['owner@example.test'] },
    { ...message(n), bcc: 'other@example.test' }, { ...message(n), from: 'Owner <owner@builder.test>' },
    { ...message(n), tags: [] }, { ...message(n), tags: [...message(n).tags,message(n).tags[0]] },
    { ...message(n), tags: message(n).tags.map(t=>t.name==='account_id'?{...t,value:'wrong'}:t) },
    { ...message(n), tags: message(n).tags.map(t=>t.name==='owner_event_notice_id'?{...t,value:'wrong'}:t) },
  ]) await assert.rejects(prepare(db,n,{payload:p}),/Invalid owner event/);
  await assert.rejects(prepare(db,n,{scope:'secret'}),/check constraint/);
  await assert.rejects(prepare(db,n,{key:'replacement'}),/check constraint/);
  assert.equal(await read(n),undefined);
  passed('snapshot preparation rejects stale claims, foreign accounts, altered recipients, tags, scopes and keys');
  const concurrent = await Promise.all([prepare(db,n),prepare(other,n)]);
  assert.deepEqual(concurrent.sort(),[false,true]);
  const saved = await read(n); assert.deepEqual(saved.payload,message(n)); assert.equal(saved.provider_fingerprint,'a'.repeat(64));
  assert.equal(await prepare(db,n,{payload:{...message(n),html:'New content'}}),false);
  assert.equal(await prepare(db,n,{scope:'b'.repeat(64)}),false);
  assert.deepEqual(await read(n),saved);
  passed('one winning preparation freezes the exact content, provider credential fingerprint and key');
  await assert.rejects(db.query("update owner_event_notice_snapshots set payload='{}' where notice_id=$1",[n.id]),/permission denied/);
  await assert.rejects(db.query("update owner_event_notices set recipient='changed@example.test' where id=$1",[n.id]),/immutable/);
  await assert.rejects(db.query("update owner_event_notices set source_payload='{}' where id=$1",[n.id]),/immutable/);
  await db.query('reset role');
  await assert.rejects(db.query("update owner_event_notice_snapshots set payload='{}' where notice_id=$1",[n.id]),/immutable/);
  await db.query('set role service_role');
  passed('saved snapshots and their recipient/event identity resist direct mutation');
  const retained = n;
  for (const state of ['expired','disconnected','replaced','deleted']) {
    n = await fixture();
    if (state==='expired') n.claim_time=(await db.query("update owner_event_notices set attempted_at=now()-interval '6 minutes' where id=$1 returning attempted_at::text claim_time",[n.id])).rows[0].claim_time;
    else if (state==='deleted') await db.query('delete from job_feed where id=$1',[n.source_id]);
    else if (state==='disconnected') await db.query('delete from job_feed where id=$1',[n.source_id]);
    else await db.query("update job_feed set kind='job_update' where id=$1",[n.source_id]);
    await assert.rejects(prepare(db,n),/eligible|obsolete/); assert.equal(await read(n),undefined);
  }
  passed('expired claims and changed owner event connections cannot prepare a snapshot');
  await db.query('delete from job_feed where id=$1',[retained.source_id]); assert.ok(await read(retained));
  await db.query('delete from accounts where id=$1',[retained.account_id]); assert.equal(await read(retained),undefined);
  passed('site deletion retains prepared evidence and account deletion follows its existing cleanup rule');
}
