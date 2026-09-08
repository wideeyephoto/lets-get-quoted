// Real PostgreSQL 17 checks for callback ordering and concurrent history writes.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { os.userInfo(); } catch (error) {
  if (error?.code !== 'ERR_SYSTEM_ERROR') throw error;
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user',
    homedir: process.env.USERPROFILE || '', shell: null });
  syncBuiltinESMExports();
}
const platform = process.platform === 'win32' ? 'windows-x64'
  : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
const bin = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin');
process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(tmpdir(), 'lgq-voice-transfer-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: 54390, persistent: false, onLog: () => {}, onError: () => {} });
const read = name => readFileSync(join(root, 'migrations', name), 'utf8');
let client, competing;
let checks = 0;
const check = name => { checks++; console.log(`PASS ${name}`); };
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('lgq_voice_transfer');
  client = pg.getPgClient('lgq_voice_transfer'); await client.connect();
  const q = (sql, args) => client.query(sql, args);
  const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(`create role anon; create role authenticated; create role service_role bypassrls;
    create table accounts(id uuid primary key);
    create table workspace_entitlements(account_id uuid,feature_limits jsonb,period_start timestamptz,period_end timestamptz);
    create table leads(id uuid primary key,account_id uuid,source_voice_provider_call_id text,message text);
    create table voice_call_admissions(account_id uuid,provider text,provider_call_id text,caller_number text,
      admission_state text,provider_terminal_at timestamptz,admitted_at timestamptz default now());
    create table voice_number_inventory(account_id uuid,provider text,e164_number text,lifecycle_state text);
    create table voice_calls(id uuid primary key default gen_random_uuid(),account_id uuid,provider text,provider_call_id text,
      caller_number text,started_at timestamptz,outcome text,outcome_source text,outcome_observed_at timestamptz,
      ai_seconds integer,billed_minutes integer,settlement text,is_provisional boolean default false,recording_status text default 'none',
      recording_storage_path text,recording_duration_seconds integer,recording_size_bytes bigint,
      recording_content_type text,recording_captured_at timestamptz,unique(provider,provider_call_id));
    alter table voice_calls enable row level security;
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;`);
  await q(read('20260905151055_voice_observation_and_recording_hardening.sql'));
  const migration = read('20260908163021_voice_transfer_completion_evidence.sql');
  await q(migration); await q(migration);
  check('additive migration and repeat application coexist with recording triggers');
  const account = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  await q('insert into accounts values($1),($2)', [account, other]);
  await q('set role service_role');
  const callbackSql = 'select record_voice_forwarding_usage($1,$2,null,$3,$4,$5)';
  const callback = (id, state, seconds, when) => q(callbackSql, [account, id, state, seconds, when]);
  const row = id => one('select * from voice_calls where provider_call_id=$1', [id]);
  const settleSql = `insert into voice_calls(account_id,provider,provider_call_id,outcome,outcome_source,ai_seconds,billed_minutes,settlement)
    values($1,'signalwire',$2,'transfer_attempted','swml_post_prompt',12,1,'allowance')
    on conflict(provider,provider_call_id) do update set outcome=excluded.outcome,outcome_source=excluded.outcome_source,
      ai_seconds=excluded.ai_seconds,billed_minutes=excluded.billed_minutes,settlement=excluded.settlement`;
  await q(settleSql, [account, 'answered']);
  await callback('answered','connected',null,'2026-09-08T12:00:00Z');
  assert.equal((await row('answered')).outcome,'transferred_and_answered');
  assert.equal((await row('answered')).forwarding_seconds,null);
  await callback('answered','disconnected',null,'2026-09-08T12:01:01Z');
  await q(settleSql, [account, 'answered']);
  let saved = await row('answered');
  assert.equal(saved.outcome,'transferred_and_answered'); assert.equal(saved.outcome_source,'provider_forwarding');
  assert.equal(saved.forwarding_seconds,61); assert.equal(saved.ai_seconds,12); assert.equal(saved.billed_minutes,1);
  check('answered transfer survives late AI upsert without changing AI time or debit');
  for (let i=0;i<2;i++) {
    await callback('answered','connected',null,'2026-09-08T12:00:00Z');
    await callback('answered','disconnected',null,'2026-09-08T12:01:01Z');
  }
  assert.equal((await row('answered')).forwarding_seconds,61);
  assert.equal(Number((await one("select count(*) n from voice_forwarding_usage where provider_call_id='answered'")).n),1);
  check('duplicate callbacks preserve one usage row and stable elapsed seconds');
  await callback('reversed','disconnected',null,'2026-09-08T12:01:01Z');
  assert.equal((await row('reversed')).outcome,'transfer_attempted');
  assert.equal((await row('reversed')).forwarding_seconds,null);
  await callback('reversed','connected',null,'2026-09-08T12:00:00Z');
  assert.equal((await row('reversed')).outcome,'transferred_and_answered');
  assert.equal((await row('reversed')).forwarding_seconds,61);
  check('disconnection before connection remains unknown then converges correctly');
  for (const seconds of [0,61]) {
    await callback(`cxml-${seconds}`,'completed',seconds,'2026-09-08T12:01:01Z');
    saved = await row(`cxml-${seconds}`);
    assert.equal(saved.outcome,'transferred_and_answered'); assert.equal(saved.forwarding_seconds,seconds);
    assert.equal(saved.forwarding_connected_at.toISOString(),new Date(Date.parse('2026-09-08T12:01:01Z')-seconds*1000).toISOString());
  }
  check('completed cXML evidence includes answered calls of zero and positive duration');
  await callback('missing-duration','completed',null,'2026-09-08T12:01:01Z');
  await callback('missed','no-answer',0,'2026-09-08T12:01:01Z');
  assert.equal((await row('missing-duration')).outcome,'transfer_attempted');
  assert.equal((await row('missed')).outcome,'failed');
  assert.equal((await row('missed')).forwarding_connected_at,null);
  check('missing duration and failed dialing cannot fabricate an answered transfer');
  await callback('answered','failed',0,'2026-09-08T12:01:02Z');
  assert.equal((await row('answered')).outcome,'transferred_and_answered');
  await assert.rejects(q(callbackSql,[other,'answered','connected',null,'2026-09-08T12:00:00Z']),/no rows/);
  assert.equal((await row('answered')).account_id,account);
  check('stale failures and another workspace cannot overwrite confirmed attribution');
  // Real parallel connections exercise history-row contention, not mock timing.
  competing = pg.getPgClient('lgq_voice_transfer'); await competing.connect(); await competing.query('set role service_role');
  await q(settleSql,[account,'concurrent']);
  await Promise.all([
    callback('concurrent','connected',null,'2026-09-08T12:00:00Z'),
    competing.query(settleSql,[account,'concurrent']),
  ]);
  assert.equal((await row('concurrent')).outcome,'transferred_and_answered');
  check('concurrent settlement and connected callback converge without losing outcome');
  await q('reset role');
  for (const role of ['anon','authenticated']) {
    assert.equal((await one("select has_function_privilege($1,'record_voice_forwarding_usage(uuid,text,text,text,integer,timestamptz)','execute') ok",[role])).ok,false);
    assert.equal((await one("select has_function_privilege($1,'preserve_voice_transfer_completion()','execute') ok",[role])).ok,false);
  }
  check('callback RPC and trigger remain unavailable to browser roles');
  console.log(`${checks}/${checks} PostgreSQL checks passed`);
} finally {
  await competing?.end(); await client?.end();
  let stopped = false;
  try {
    await promisify(execFile)(join(bin,process.platform==='win32'?'pg_ctl.exe':'pg_ctl'),
      ['stop','-D',dataDir,'-m','fast','-w','-t','8'],{windowsHide:true,timeout:10000});
    stopped = true;
  } finally {
    if(stopped && dirname(resolve(dataDir))===resolve(tmpdir()) && basename(dataDir).startsWith('lgq-voice-transfer-')) rmSync(dataDir,{recursive:true,force:true});
  }
}
