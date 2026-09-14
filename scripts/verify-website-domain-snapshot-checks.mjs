import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyWebsiteSnapshots(db, other, root, passed) {
  await db.query('reset role');
  const migration = readFileSync(join(root,'migrations/20260914173129_website_domain_notice_snapshots.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);
  const fn = 'prepare_website_domain_notice_snapshot(uuid,uuid,timestamptz,jsonb,text,text)';
  for (const role of ['anon','authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'website_domain_notice_snapshots','select,insert,update,delete') ok",[role])).rows[0].ok,false);
    assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,fn])).rows[0].ok,false);
  }
  for (const signature of [fn,'guard_website_domain_notice_snapshot()','guard_website_domain_notice_identity()']) {
    const r = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
    assert.equal(r.prosecdef,false); assert.ok(r.proconfig.includes('search_path=""'));
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='website_domain_notice_snapshots'::regclass")).rows[0].relrowsecurity,true);
  passed('website snapshot migration matches fresh schema and keeps payloads private');
  await db.query('set role service_role'); await other.query('set role service_role');
  const fixture = async () => {
    const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
    const s = (await db.query('insert into sites(account_id,custom_domain,custom_domain_verified_at) values($1,$2,clock_timestamp()) returning id',[account,`${account}.test`])).rows[0];
    return (await db.query("insert into website_domain_connection_notices(account_id,site_id,domain,verified_at,state,attempted_at,recipient) select account_id,id,custom_domain,custom_domain_verified_at,'sending',clock_timestamp(),'owner@example.test' from sites where id=$1 returning *,attempted_at::text claim_time",[s.id])).rows[0];
  };
  const message = n => ({ from: "Let's Get Quoted <hello@letsgetquoted.com>", to: 'owner@example.test', reply_to: 'hello@letsgetquoted.com', subject: 'Your domain is connected', html: '<p>Original saved content and link</p>', tags: [
    { name: 'kind', value: 'custom_domain_connected' }, { name: 'account_id', value: n.account_id }, { name: 'website_domain_notice_id', value: n.id },
    { name: 'theme', value: 'studio' }, { name: 'template_version', value: '2_0' },
  ] });
  const prepare = (client,n,over={}) => client.query('select prepare_website_domain_notice_snapshot($1,$2,$3,$4,$5,$6) ok',[
    n.id,over.account ?? n.account_id,over.time ?? n.claim_time,over.payload ?? message(n),over.scope ?? 'a'.repeat(64),over.key ?? `website-domain-connected:v1:${n.id}`,
  ]).then(r=>r.rows[0].ok);
  const read = n => db.query('select * from website_domain_notice_snapshots where notice_id=$1',[n.id]).then(r=>r.rows[0]);
  let n = await fixture();
  assert.equal(await prepare(db,n,{account:'00000000-0000-0000-0000-000000000000'}),false);
  assert.equal(await prepare(db,n,{time:'2000-01-01T00:00:00Z'}),false);
  for (const p of [{ ...message(n), to: 'other@example.test' }, { ...message(n), to: ['owner@example.test'] },
    { ...message(n), bcc: 'other@example.test' }, { ...message(n), from: 'Owner <owner@builder.test>' },
    { ...message(n), tags: [] }, { ...message(n), tags: [...message(n).tags,message(n).tags[0]] },
    { ...message(n), tags: message(n).tags.map(t=>t.name==='account_id'?{...t,value:'wrong'}:t) },
    { ...message(n), tags: message(n).tags.map(t=>t.name==='website_domain_notice_id'?{...t,value:'wrong'}:t) },
  ]) await assert.rejects(prepare(db,n,{payload:p}),/Invalid website/);
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
  await assert.rejects(db.query("update website_domain_notice_snapshots set payload='{}' where notice_id=$1",[n.id]),/permission denied/);
  await assert.rejects(db.query("update website_domain_connection_notices set recipient='changed@example.test' where id=$1",[n.id]),/immutable/);
  await assert.rejects(db.query("update website_domain_connection_notices set verified_at=now() where id=$1",[n.id]),/immutable/);
  await db.query('reset role');
  await assert.rejects(db.query("update website_domain_notice_snapshots set payload='{}' where notice_id=$1",[n.id]),/immutable/);
  await db.query('set role service_role');
  passed('saved snapshots and their recipient/event identity resist direct mutation');
  const retained = n;
  for (const state of ['expired','disconnected','replaced','deleted']) {
    n = await fixture();
    if (state==='expired') n.claim_time=(await db.query("update website_domain_connection_notices set attempted_at=now()-interval '6 minutes' where id=$1 returning attempted_at::text claim_time",[n.id])).rows[0].claim_time;
    else if (state==='deleted') await db.query('delete from sites where id=$1',[n.site_id]);
    else if (state==='disconnected') await db.query('update sites set custom_domain_verified_at=null where id=$1',[n.site_id]);
    else await db.query("update sites set custom_domain='replacement.test' where id=$1",[n.site_id]);
    await assert.rejects(prepare(db,n),/eligible|obsolete/); assert.equal(await read(n),undefined);
  }
  passed('expired claims and changed website connections cannot prepare a snapshot');
  await db.query('delete from sites where id=$1',[retained.site_id]); assert.ok(await read(retained));
  await db.query('delete from accounts where id=$1',[retained.account_id]); assert.equal(await read(retained),undefined);
  passed('site deletion retains prepared evidence and account deletion follows its existing cleanup rule');
}
