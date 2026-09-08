// Disposable PostgreSQL only; no network, provider action, or production state.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.LGQ_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
const check = async (project='project') => {
  await db.exec('set role service_role');
  try { return (await db.query('select record_voice_operational_health($1,$2) result',[project,'space'])).rows[0].result; }
  finally { await db.exec('reset role'); }
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table voice_events(id uuid default gen_random_uuid(),provider text default 'signalwire',
      account_id uuid default gen_random_uuid(),provider_project_id text default 'project',provider_space_id text default 'space',
      processing_status text,attempt_count int default 1,received_at timestamptz default now()-interval '1 hour',processing_lease_expires_at timestamptz);
    create table voice_calls(id uuid default gen_random_uuid(),provider text default 'signalwire',provider_call_id text,
      started_at timestamptz default now()-interval '1 hour',answered_at timestamptz,ended_at timestamptz,
      outcome text default 'ai_handled',forwarding_connected_at timestamptz,forwarding_ended_at timestamptz,
      ai_seconds int,billed_minutes int,measured_minutes int,absorbed_minutes int,settlement text default 'allowance',absorption_reason text);
    create table voice_call_admissions(provider text default 'signalwire',provider_call_id text,reservation_id uuid,
      provider_terminal_at timestamptz,minute_mode text);
    create table usage_reservations(id uuid default gen_random_uuid(),resource_code text default 'voice_minutes',state text,expires_at timestamptz);
    create table webhook_failures(id uuid default gen_random_uuid(),source text,event_type text,reference_id text,error_message text,
      resolved_at timestamptz,resolved_by text);
    grant select on voice_events,voice_calls,voice_call_admissions,usage_reservations to service_role;
    grant select,insert,update on webhook_failures to service_role;`);
  const sql=await readFile(new URL('../migrations/20260908210359_voice_operational_health_alerts.sql',import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  await test('healthy database reports no exceptions',async()=>assert.equal((await check()).failed,0));
  await db.exec(`insert into voice_events(processing_status) values('failed');
    insert into voice_events(processing_status,provider_project_id) values('failed','foreign');
    insert into voice_events(processing_status,received_at) values('received',now());
    insert into voice_calls(provider_call_id,outcome) values('active','in_progress');
    insert into voice_calls(provider_call_id,answered_at,ended_at) values('overrun',now()-interval '20 minutes',now()-interval '9 minutes');
    insert into usage_reservations(state,expires_at) values('reserved',now()-interval '1 minute');
    insert into voice_calls(provider_call_id,ai_seconds,settlement) values('bad',80,'unmetered'),('historical',80,'unmetered');
    insert into voice_call_admissions(provider_call_id,minute_mode) values('bad','measure'),('historical',null);
    insert into voice_calls(provider_call_id,ai_seconds,billed_minutes,measured_minutes,absorbed_minutes,settlement,absorption_reason)
      values('absorbed',80,0,2,2,'unmetered','insufficient_credit');
    insert into voice_call_admissions(provider_call_id,minute_mode) values('absorbed','measure');`);
  await test('all five issue classes alert while expected/historical/foreign cases do not',async()=>{
    const r=await check(); assert.equal(r.opened,5);assert.equal(r.active,5);assert.equal(r.failed,5);
  });
  await test('repeat runs do not duplicate the durable failures',async()=>assert.equal((await check()).opened,0));
  await test('failure messages contain actionable stages without caller data',async()=>{
    const rows=(await db.query('select error_message from webhook_failures')).rows;
    assert(rows.every(r=>!r.error_message.includes('+1')));assert(rows.every(r=>r.error_message.length>70));
  });
  await test('another receipt scope does not clear existing alerts',async()=>{
    assert.equal((await check('foreign')).opened,1);
    assert.equal((await db.query("select count(*)::int n from webhook_failures where event_type='voice_health_receipt' and resolved_at is null")).rows[0].n,2);
  });
  await db.exec(`update voice_events set processing_status='processed' where provider_project_id='project';
    update voice_calls set ended_at=now(),outcome='ai_handled' where provider_call_id='active';
    update voice_calls set ended_at=answered_at+interval '599 seconds' where provider_call_id='overrun';
    update usage_reservations set state='released';
    update voice_calls set measured_minutes=2,absorbed_minutes=2,absorption_reason='insufficient_credit' where provider_call_id='bad';`);
  await test('cleared conditions resolve only this monitor and scope',async()=>{
    const r=await check();assert.equal(r.resolved,5);assert.equal(r.active,0);
    assert.equal((await db.query("select count(*)::int n from webhook_failures where resolved_at is null")).rows[0].n,1);
  });
  await test('explicit operator classification remains resolved without duplicate alerts',async()=>{
    await db.exec("update webhook_failures set resolved_at=now(),resolved_by='operator:classified controlled probe' where resolved_at is null");
    const r=await check('foreign');assert.equal(r.opened,0);assert.equal(r.active,0);
  });
  await db.exec("insert into voice_events(processing_status) select 'failed' from generate_series(1,102)");
  await test('large queues report truncation and never look healthy',async()=>{
    const r=await check();assert.equal(r.observed,101);assert.equal(r.truncated,true);assert(r.failed>0);
  });
  await test('anonymous and browser roles cannot run the observer',async()=>{
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>db.query("select record_voice_operational_health('project','space')"),e=>e.code==='42501');
      await db.exec('reset role');
    }
  });
  await test('empty scope is rejected',async()=>await assert.rejects(()=>check(''),e=>e.code==='22023'));
  console.log(`${passed}/${passed} checks passed.`);
} finally { await db.close(); }
