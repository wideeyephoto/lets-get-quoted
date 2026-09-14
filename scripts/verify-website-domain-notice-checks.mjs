import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyWebsiteDomainNotices(db, other, root, passed) {
  await db.query('reset role'); await other.query('reset role');
  await db.query(`create table sites(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id) on delete cascade,
    custom_domain text,custom_domain_verified_at timestamptz); alter table sites enable row level security;
    grant select,insert,update,delete on sites to service_role;`);
  const migration = readFileSync(join(root,'migrations/20260914171633_website_domain_connection_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);
  const signatures = ['claim_website_domain_connection_notices(integer)', 'prepare_website_domain_connection_notice(uuid,uuid,timestamptz,text)',
    'finish_website_domain_connection_notice(uuid,uuid,timestamptz,text,text)', 'resolve_website_domain_connection_notice(uuid,uuid,text,text)'];
  for (const role of ['anon','authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'website_domain_connection_notices','select,insert,update,delete') ok",[role])).rows[0].ok,false);
    for (const fn of signatures) assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,fn])).rows[0].ok,false);
  }
  for (const fn of [...signatures,'record_website_domain_connection_notice()']) {
    const r = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[fn])).rows[0];
    assert.equal(r.prosecdef,false); assert.ok(r.proconfig.includes('search_path=""'));
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='website_domain_connection_notices'::regclass")).rows[0].relrowsecurity,true);
  passed('website notice migration matches fresh schema, uses private RLS and invoker functions');
  await db.query('set role service_role'); await other.query('set role service_role');
  const site = async () => {
    const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
    return (await db.query('insert into sites(account_id,custom_domain) values($1,$2) returning *',[account,`${account}.test`])).rows[0];
  };
  const promote = (client,s) => client.query("update sites set custom_domain_verified_at=statement_timestamp(),custom_domain_notice_requested_at=statement_timestamp() where id=$1 and account_id=$2 and custom_domain=$3 and custom_domain_verified_at is null returning id",[s.id,s.account_id,s.custom_domain]);
  const notice = s => db.query('select *,attempted_at::text claim_time from website_domain_connection_notices where site_id=$1 order by created_at desc',[s.id]).then(r=>r.rows[0]);
  const claim = client => client.query('select * from claim_website_domain_connection_notices(10)');
  const prepare = (n,recipient='owner@example.test',account=n.account_id) => db.query('select prepare_website_domain_connection_notice($1,$2,$3,$4) ok',[n.id,account,n.claim_time,recipient]).then(r=>r.rows[0].ok);
  const finish = (n,provider=null,error='send_failed_or_outcome_unknown') => db.query('select finish_website_domain_connection_notice($1,$2,$3,$4,$5) ok',[n.id,n.account_id,n.claim_time,provider,error]).then(r=>r.rows[0].ok);
  let s = await site();
  await db.query('update sites set custom_domain_verified_at=clock_timestamp() where id=$1',[s.id]);
  assert.equal(await notice(s),undefined);
  passed('legacy and interactive verification do not enqueue duplicate unsolicited notices');
  s = await site();
  await db.query('reset role'); await db.query('revoke insert on website_domain_connection_notices from service_role'); await db.query('set role service_role');
  await assert.rejects(promote(db,s),/permission denied/);
  assert.equal((await db.query('select custom_domain_verified_at from sites where id=$1',[s.id])).rows[0].custom_domain_verified_at,null);
  await db.query('reset role'); await db.query('grant insert on website_domain_connection_notices to service_role'); await db.query('set role service_role');
  passed('failed notice creation rolls back the connection stamp');
  const promotions = await Promise.all([promote(db,s),promote(other,s)]);
  assert.equal(promotions.reduce((sum,r)=>sum+r.rowCount,0),1);
  assert.equal((await db.query('select count(*)::int n from website_domain_connection_notices')).rows[0].n,1);
  const claims = await Promise.all([claim(db),claim(other)]);
  assert.equal(claims.flatMap(r=>r.rows).length,1);
  let n = await notice(s);
  assert.equal(await prepare(n,'owner@example.test','00000000-0000-0000-0000-000000000000'),false);
  assert.equal(await prepare(n,'owner@example.test,other@example.test'),false);
  assert.equal(await prepare(n),true); assert.equal(await prepare(n),false);
  passed('concurrent promotion and claims have one winner; recipient preparation is owned and one-time');
  assert.equal(await finish(n,'website-provider-1',null),true);
  assert.equal(await finish(n,'website-provider-1',null),true);
  assert.equal(await finish(n,'website-provider-2',null),false);
  assert.equal((await notice(s)).state,'accepted');
  await db.query("update website_domain_connection_notices set accepted_at=now()-interval '31 minutes' where id=$1",[n.id]);
  await claim(db); assert.equal((await notice(s)).last_error,'delivery_unconfirmed');
  assert.equal((await claim(db)).rowCount,0);
  passed('acceptance is saved separately from delivery and overdue evidence becomes review without resending');
  const retrySite = await site(); await promote(db,retrySite); await claim(db);
  const retry = await notice(retrySite); await prepare(retry);
  await db.query("update website_domain_connection_notices set attempted_at=now()-interval '6 minutes' where id=$1",[retry.id]);
  await claim(db); assert.equal((await notice(retrySite)).state,'manual_review');
  assert.equal((await notice(retrySite)).last_error,'send_outcome_unknown');
  await claim(db); assert.equal((await notice(retrySite)).state,'manual_review');
  passed('a crash after recipient preparation or submission is retained and never blindly retried');
  for (const condition of ['replacement','disconnected','deleted']) {
    const changed = await site(); await promote(db,changed);
    const queued = await notice(changed);
    if (condition==='deleted') await db.query('delete from sites where id=$1',[changed.id]);
    else await db.query('update sites set custom_domain=$2,custom_domain_verified_at=null where id=$1',[changed.id,condition==='replacement'?'replacement.test':null]);
    await claim(db);
    assert.equal((await db.query('select state from website_domain_connection_notices where id=$1',[queued.id])).rows[0].state,'cancelled');
  }
  const changedAfterClaim = await site(); await promote(db,changedAfterClaim); await claim(db); const stale = await notice(changedAfterClaim);
  await db.query('update sites set custom_domain_verified_at=null where id=$1',[changedAfterClaim.id]);
  assert.equal(await prepare(stale),false);
  passed('obsolete website connections cancel before claim and cannot prepare after a concurrent change');
  await db.query('update sites set custom_domain_verified_at=null where id=$1',[s.id]); await promote(db,s);
  assert.equal((await db.query('select count(*)::int n from website_domain_connection_notices where site_id=$1',[s.id])).rows[0].n,2);
  n = await notice(s); assert.notEqual(n.id,retry.id);
  passed('a genuinely new connection creates a separate notice while retaining earlier incidents');
  await assert.rejects(db.query("select resolve_website_domain_connection_notice($1,$2,'operator','done')",[retry.id,retry.account_id]),/evidence/);
  assert.equal((await db.query("select resolve_website_domain_connection_notice($1,$2,'operator','Verified owner receipt and provider history') ok",[retry.id,s.account_id])).rows[0].ok,false);
  assert.equal((await db.query("select resolve_website_domain_connection_notice($1,$2,'operator','Verified owner receipt and provider history') ok",[retry.id,retry.account_id])).rows[0].ok,true);
  await db.query('delete from accounts where id=$1',[s.account_id]);
  assert.equal((await db.query('select count(*)::int n from website_domain_connection_notices where account_id=$1',[s.account_id])).rows[0].n,0);
  assert.equal((await notice(retrySite)).state,'resolved');
  passed('operator closeout requires evidence and account cleanup leaves other workspaces intact');
}
