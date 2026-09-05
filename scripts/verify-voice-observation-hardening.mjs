import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.LGQ_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table accounts(id uuid primary key);
    create table workspace_entitlements(account_id uuid,feature_limits jsonb,period_start timestamptz,period_end timestamptz);
    create table leads(id uuid primary key,account_id uuid,source_voice_provider_call_id text,message text);
    create table voice_call_admissions(account_id uuid,provider text,provider_call_id text,caller_number text,
      admission_state text,provider_terminal_at timestamptz,admitted_at timestamptz default now());
    create table voice_number_inventory(account_id uuid,provider text,e164_number text,lifecycle_state text);
    create table voice_calls(id uuid primary key default gen_random_uuid(),account_id uuid,provider text,provider_call_id text,
      caller_number text,started_at timestamptz,outcome text,settlement text,is_provisional boolean default false,recording_status text default 'none',
      recording_storage_path text,recording_duration_seconds integer,recording_size_bytes bigint,
      recording_content_type text,recording_captured_at timestamptz,unique(provider,provider_call_id));
    grant all on all tables in schema public to service_role;
  `);
  const sql = readFileSync(new URL('../migrations/20260905151055_voice_observation_and_recording_hardening.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // repeat application must preserve observations and guards
  const account = '11111111-1111-4111-8111-111111111111';
  await db.exec(`insert into accounts values('${account}'); set role service_role;`);
  await db.query(`select apply_voice_recording_observation('early','ready','https://example.signalwire.com/api/v1/recordings/r1/download',4,99)`);
  await db.query(`insert into voice_calls(account_id,provider,provider_call_id) values($1,'signalwire','early')`, [account]);
  assert.equal((await db.query(`select recording_status from voice_calls where provider_call_id='early'`)).rows[0].recording_status, 'ready');
  await db.query(`select apply_voice_recording_observation('early','pending',null,null,null)`);
  assert.equal((await db.query(`select recording_status from voice_calls where provider_call_id='early'`)).rows[0].recording_status, 'ready');
  await db.query(`delete from voice_calls where provider_call_id='early'`);
  assert.equal((await db.query('select count(*)::int n from voice_recording_deletions')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int n from voice_recording_observations')).rows[0].n, 0);
  await db.query(`insert into voice_number_inventory values($1,'signalwire','+15551234567','active')`, [account]);
  await db.query(`select apply_voice_recording_observation('recovery','ready','https://example.signalwire.com/api/v1/recordings/r2/download',8,55,'+15551234567','+15557654321')`);
  assert.equal((await db.query(`select outcome from voice_calls where provider_call_id='recovery'`)).rows[0].outcome, 'voicemail');
  await db.query(`select record_voice_forwarding_usage($1,'forward',null,'disconnected',null,'2026-09-05T12:01:01Z')`, [account]);
  await db.query(`select record_voice_forwarding_usage($1,'forward',null,'connected',null,'2026-09-05T12:00:00Z')`, [account]);
  await db.query(`select record_voice_forwarding_usage($1,'forward',null,'completed',61,'2026-09-05T12:01:01Z')`, [account]);
  assert.equal((await db.query(`select forwarding_seconds from voice_calls where provider_call_id='forward'`)).rows[0].forwarding_seconds,61);
  await db.query(`insert into voice_call_admissions(account_id,provider,provider_call_id,caller_number,admission_state) values($1,'signalwire','tool','+15557654321','admitted')`, [account]);
  assert.equal((await db.query(`select authorize_voice_tool_invocation($1,'tool','wrong') ok`,[account])).rows[0].ok,false);
  assert.equal((await db.query(`select authorize_voice_tool_invocation($1,'tool','+15557654321') ok`,[account])).rows[0].ok,true);
  await db.query(`update voice_call_admissions set tool_invocations=100 where provider_call_id='tool'`);
  assert.equal((await db.query(`select authorize_voice_tool_invocation($1,'tool','+15557654321') ok`,[account])).rows[0].ok,false);
  await db.query(`update voice_call_admissions set tool_invocations=0,provider_terminal_at=now() where provider_call_id='tool'`);
  assert.equal((await db.query(`select authorize_voice_tool_invocation($1,'tool','+15557654321') ok`,[account])).rows[0].ok,false);
  await db.query(`insert into workspace_entitlements values($1,'{"forwarding_minutes":100}','2026-09-01','2026-10-01')`, [account]);
  await db.query(`delete from voice_calls where provider_call_id='forward'`);
  const usage = (await db.query(`select * from voice_forwarding_usage_summary($1)`, [account])).rows[0];
  assert.equal(Number(usage.minutes),2); assert.equal(usage.included_minutes,100);
  await db.query(`insert into leads values($1,$1,'appointment','Original inquiry')`,[account]);
  for (let n=0;n<2;n++) assert.equal((await db.query(`select append_voice_appointment_request($1,$1,'appointment','Cancel request') ok`,[account])).rows[0].ok,true);
  assert.equal((await db.query(`select message from leads where id=$1`,[account])).rows[0].message,'Original inquiry\nCancel request');
  assert.equal((await db.query(`select append_voice_appointment_request($1,$1,'wrong-call','Change request') ok`,[account])).rows[0].ok,false);
  await db.exec('reset role');
  for (const role of ['anon','authenticated']) {
    assert.equal((await db.query(`select has_table_privilege($1,'voice_recording_observations','select') ok`,[role])).rows[0].ok,false);
    assert.equal((await db.query(`select has_function_privilege($1,'authorize_voice_tool_invocation(uuid,text,text)','execute') ok`,[role])).rows[0].ok,false);
  }
  console.log('PASS: repeat migration, early/late recording, monotonic status, recovery attribution, deletion outbox, forwarding replay, call authorization and grants.');
} finally { await db.close(); }
