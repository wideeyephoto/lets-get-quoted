import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function verifyOwnerEventNotices(db, other, root, passed) {
  await db.query('reset role');
  const migration = readFileSync(join(root,'migrations/20260914175031_owner_event_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query("create table job_feed(id uuid primary key default gen_random_uuid(),account_id uuid not null references accounts(id) on delete cascade,job_id uuid not null default gen_random_uuid(),kind text not null,title text,body text,meta jsonb)");
  await db.query('grant select,insert,update,delete on job_feed to service_role');
  await db.query(migration);
  await db.query('set role service_role');
  const signatures = ['confirm_owner_event_notice(uuid,uuid,text,text,text,timestamptz,text)',
    'finish_owner_event_notice(uuid,uuid,timestamptz,text,text)'];
  for (const fn of signatures) {
    for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok', [role,fn])).rows[0].ok, false);
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [fn])).rows[0];
    assert.equal(row.prosecdef, false); assert.ok(row.proconfig.includes('search_path=""'));
  }
  passed('owner event callback and completion RPCs remain service-only invoker functions');
  const fixture = async (prepared = true) => {
    const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
    const feed = (await db.query("insert into job_feed(account_id,kind,title,body) values($1,'client_question','Question','Original question') returning *",[account])).rows[0];
    const n = (await db.query("insert into owner_event_notices(account_id,source_id,event_kind,source_payload,state,attempted_at,recipient) values($1,$2,'client_question',$3,'sending',clock_timestamp(),'owner@example.test') returning *,attempted_at::text claim_time",[account,feed.id,{title:feed.title,body:feed.body,job_id:feed.job_id}])).rows[0];
    if (prepared) await db.query('select prepare_owner_event_notice_snapshot($1,$2,$3,$4,$5,$6)', [n.id,account,n.claim_time,
      { from: "Let's Get Quoted <hello@letsgetquoted.com>", to: 'owner@example.test', reply_to: 'hello@letsgetquoted.com', subject: 'Action needed', html: 'Original content', tags: [
        { name: 'kind', value: 'contractor_alert' }, { name: 'account_id', value: account }, { name: 'owner_event_notice_id', value: n.id },
        { name: 'theme', value: 'studio' }, { name: 'template_version', value: '2_0' },
      ] }, 'a'.repeat(64), `owner-event:v1:${n.id}`]);
    return n;
  };
  const row = n => db.query('select * from owner_event_notices where id=$1', [n.id]).then(r => r.rows[0]);
  const confirm = (client,n,status='delivered',override={}) => client.query('select confirm_owner_event_notice($1,$2,$3,$4,$5,$6,$7) result',
    [override.id ?? n.id,override.account ?? n.account_id,override.recipient ?? 'owner@example.test',override.provider ?? `provider-${n.id}`,status,override.time ?? '2026-09-14T12:00:00Z',override.event ?? `event-${status}`]).then(r => r.rows[0].result);
  const finish = (client,n,provider=`provider-${n.id}`,error=null) => client.query('select finish_owner_event_notice($1,$2,$3,$4,$5) ok',
    [n.id,n.account_id,n.claim_time,provider,error]).then(r => r.rows[0].ok);
  let n = await fixture();
  for (const override of [{ account: '00000000-0000-0000-0000-000000000000' }, { recipient: 'other@example.test' }, { provider: ' ' }]) assert.equal(await confirm(db,n,'delivered',override), 'conflict');
  assert.equal((await row(n)).provider_id, null);
  assert.equal(await confirm(db,n,'delivered',{ id: '00000000-0000-0000-0000-000000000000' }), 'missing');
  assert.equal(await confirm(db,await fixture(false)), 'unprepared');
  passed('wrong bindings never repair acceptance; missing and unprepared notices are distinguishable');
  assert.equal(await confirm(db,n), 'confirmed');
  assert.equal((await row(n)).state, 'resolved');
  assert.equal(await finish(db,n), true); assert.equal(await finish(db,n,null,'send_failed_or_outcome_unknown'), true);
  assert.equal((await row(n)).state, 'resolved');
  assert.equal(await finish(db,n,'conflicting-provider'), false);
  passed('early delivery repairs acceptance and survives delayed acknowledgement or timeout');
  assert.equal(await confirm(db,n,'sent',{ time: '2026-09-15T12:00:00Z' }), 'confirmed');
  assert.equal((await row(n)).callback_status, 'delivered');
  assert.equal(await confirm(db,n,'complained',{ time: '2026-09-13T12:00:00Z' }), 'confirmed');
  assert.equal(await confirm(db,n,'delivered',{ time: '2026-09-16T12:00:00Z' }), 'confirmed');
  assert.equal((await row(n)).state, 'manual_review'); assert.equal((await row(n)).last_error, 'delivery_complained');
  assert.equal((await row(n)).callback_event_id, 'event-complained');
  passed('stronger negative evidence survives older and newer delivery or sent callbacks');
  const another = await fixture();
  assert.equal(await confirm(db,another,'delivered',{ provider: `provider-${n.id}` }), 'conflict');
  assert.equal((await row(another)).provider_id, null);
  assert.equal(await confirm(db,n,'delivered',{ provider: 'replacement-provider' }), 'conflict');
  passed('provider IDs cannot move between incidents or replace an existing binding');
  n = await fixture();
  const race = await Promise.all([confirm(db,n,'bounced'),finish(other,n)]);
  assert.deepEqual(race,['confirmed',true]); assert.equal((await row(n)).state,'manual_review');
  const reversed = await fixture(); await finish(db,reversed); await confirm(other,reversed,'suppressed');
  assert.equal((await row(reversed)).last_error,'delivery_suppressed');
  passed('concurrent callback and acceptance bookkeeping preserve the negative result in both arrival orders');
  n = await fixture(); await finish(db,n,null,'send_failed_or_outcome_unknown'); await confirm(db,n,'delivered');
  assert.equal((await row(n)).state,'resolved'); assert.equal((await row(n)).last_error,'send_failed_or_outcome_unknown');
  n = await fixture(); await db.query("update owner_event_notices set state='manual_review',last_error='send_outcome_unknown' where id=$1", [n.id]);
  await confirm(db,n,'sent'); assert.equal((await row(n)).state,'accepted');
  await db.query('select * from claim_owner_event_notices(1,null,null)');
  assert.equal((await row(n)).state,'manual_review'); assert.equal((await row(n)).last_error,'delivery_unconfirmed');
  await confirm(db,n,'delivered'); assert.equal((await row(n)).state,'resolved');
  passed('lost acknowledgements and expired observation windows recover from bound delivery without resending');
  n = await fixture(); await finish(db,n,null,'send_failed_or_outcome_unknown');
  await db.query("select resolve_owner_event_notice($1,$2,'operator','Verified customer support recovery and provider evidence')",[n.id,n.account_id]);
  await confirm(db,n,'complained'); assert.equal((await row(n)).state,'resolved'); assert.equal((await row(n)).resolved_by,'operator');
  assert.equal((await row(n)).callback_status,'complained');
  passed('operator closeout remains intact while later callback evidence is retained');
  const snapshot = (await db.query('select * from owner_event_notice_snapshots where notice_id=$1',[n.id])).rows[0];
  await confirm(db,n,'sent');
  assert.deepEqual((await db.query('select * from owner_event_notice_snapshots where notice_id=$1',[n.id])).rows[0],snapshot);
  passed('callbacks never modify snapshots or retry keys');
  const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
  const feed = async (kind,marked=true) => (await db.query('insert into job_feed(account_id,kind,title,body,meta) values($1,$2,$3,$4,$5) returning *',[account,kind,'Saved request','Original request',marked?{owner_email_notice:'v1'}:null])).rows[0];
  const unmarked = await feed('client_question',false); const unrelated = await feed('job_update');
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=any($1)',[[unmarked.id,unrelated.id]])).rows[0].c,0);
  const event=await feed('client_followup');
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[event.id])).rows[0];
  assert.equal(notice.account_id,account); assert.equal(notice.source_payload.body,'Original request');
  assert.equal(notice.source_payload.job_id,event.job_id);
  const claims = await Promise.all([db.query('select * from claim_owner_event_notices(1,$1,$2)',[event.id,account]),other.query('select * from claim_owner_event_notices(1,$1,$2)',[event.id,account])]);
  assert.equal(claims[0].rows.length+claims[1].rows.length,1);
  await assert.rejects(db.query("update owner_event_notices set source_payload='{}' where id=$1",[notice.id]),/immutable/);
  await db.query("update job_feed set body='Updated request' where id=$1",[event.id]);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[event.id])).rows[0].c,1);
  passed('marked source events atomically save one immutable owner notice; overlapping claims have one winner');
  const second=await feed('rebook_requested');
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[second.id,'00000000-0000-0000-0000-000000000000'])).rows.length,0);
  await db.query('delete from job_feed where id=$1',[second.id]);
  await db.query('select * from claim_owner_event_notices(1,$1,$2)',[second.id,account]);
  assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[second.id])).rows[0].state,'cancelled');
  passed('inline claims cannot borrow another workspace and deleted sources cancel unsent notices');
  await db.query('reset role'); await db.query('revoke insert on owner_event_notices from service_role'); await db.query('set role service_role');
  await assert.rejects(feed('client_question'),/permission denied/);
  assert.equal((await db.query("select count(*)::int c from job_feed where account_id=$1 and kind='client_question'",[account])).rows[0].c,1);
  await db.query('reset role'); await db.query('grant insert on owner_event_notices to service_role');
  for (const role of ['anon','authenticated']) assert.equal((await db.query("select has_table_privilege($1,'owner_event_notices','select,insert,update,delete') ok",[role])).rows[0].ok,false);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='owner_event_notices'::regclass")).rows[0].relrowsecurity,true);
  await db.query('set role service_role');
  passed('a failed notice write rolls back its customer event and ledger records remain private');

}
