import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export async function verifyMessagingOwnerNotices(db, root, passed) {
  await db.query('reset role');
  await db.query(`create table messaging_registration_applications(id uuid primary key default gen_random_uuid(),account_id uuid references accounts(id),status text,revision integer default 1,business_email text,authorized_contact_email text,legal_business_name text,purchased_number text,status_detail text);
    create table messaging_registration_events(id uuid primary key default gen_random_uuid(),application_id uuid references messaging_registration_applications(id),account_id uuid references accounts(id),event_type text,previous_status text,new_status text,detail text,metadata jsonb default '{}',created_at timestamptz default clock_timestamp());
    grant select,insert,update on messaging_registration_applications,messaging_registration_events to service_role;`);
  const migration=readFileSync(join(root,'migrations/20260914180733_messaging_owner_event_notices.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(migration.replace(/\r\n/g,'\n').trim()));
  await db.query(migration);
  for(const role of ['anon','authenticated']) {
    assert.equal((await db.query("select has_function_privilege($1,'owner_event_source_available(owner_event_notices)','execute') ok",[role])).rows[0].ok,false);
  }
  const helper=(await db.query("select prosecdef,proconfig from pg_proc where oid='owner_event_source_available(owner_event_notices)'::regprocedure")).rows[0];
  assert.equal(helper.prosecdef,true);assert.ok(helper.proconfig.includes('search_path=""'));
  passed('source-lock helper exposes no public execute privilege and fixes its privileged search path');
  await db.query('set role service_role');
  const account=(await db.query('insert into accounts default values returning id')).rows[0].id;
  const app=(await db.query("insert into messaging_registration_applications(account_id,status,business_email,legal_business_name) values($1,'submitted',' Contact@example.test ','Builder') returning id",[account])).rows[0].id;
  const event=async (type,previous,status,detail=null)=> (await db.query('insert into messaging_registration_events(application_id,account_id,event_type,previous_status,new_status,detail,metadata) values($1,$2,$3,$4,$5,$6,$7) returning id',[app,account,type,previous,status,detail,{secret:'not-for-notice'}])).rows[0].id;
  const first=await event('application_submitted',null,'submitted');
  const notice=(await db.query('select * from owner_event_notices where source_id=$1',[first])).rows[0];
  assert.equal(notice.source_payload.recipient_email,'contact@example.test');assert.ok(!JSON.stringify(notice.source_payload).includes('secret'));
  const claim=(await db.query('select *,attempted_at::text claim_time from claim_owner_event_notices(1,$1,$2)',[first,account])).rows[0];
  assert.equal((await db.query('select prepare_owner_event_notice($1,$2,$3,$4) ok',[claim.id,account,claim.claim_time,'wrong@example.test'])).rows[0].ok,false);
  assert.equal((await db.query('select prepare_owner_event_notice($1,$2,$3,$4) ok',[claim.id,account,claim.claim_time,'contact@example.test'])).rows[0].ok,true);
  passed('messaging source atomically saves a minimal contact snapshot and rejects a different recipient');
  await db.query("update messaging_registration_applications set status='action_required',status_detail='Fix address' where id=$1",[app]);
  const review=await event('application_reviewed','submitted','action_required','Fix address');
  const repeated=await event('application_reviewed','action_required','action_required','Fix address');
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[repeated])).rows[0].c,0);
  await db.query("update messaging_registration_applications set status_detail='Fix website' where id=$1",[app]);
  const changed=await event('application_reviewed','action_required','action_required','Fix website');
  await db.query('select * from claim_owner_event_notices(1,$1,$2)',[changed,account]);
  assert.equal((await db.query('select state from owner_event_notices where source_id=$1',[review])).rows[0].state,'cancelled');
  passed('unchanged review retries stay silent while changed notes create a new notice and cancel obsolete notes');
  await db.query("update messaging_registration_applications set status='active',purchased_number='+12485550140' where id=$1",[app]);
  const active=await event('number_assignment_checked','provisioning','active');
  const poll=await event('number_assignment_checked','active','active');
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[active])).rows[0].c,1);
  assert.equal((await db.query('select count(*)::int c from owner_event_notices where source_id=$1',[poll])).rows[0].c,0);
  await db.query('update messaging_registration_applications set revision=2 where id=$1',[app]);
  assert.equal((await db.query('select * from claim_owner_event_notices(1,$1,$2)',[active,account])).rowCount,0);
  passed('activation polls do not resend and a changed application revision cancels its pending notice');
}
