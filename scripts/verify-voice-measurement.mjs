// Disposable PostgreSQL 17 proof of admission snapshots, partial settlement,
// replay, failure recovery, and absorbed-usage constraints. No hosted credentials.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Windows sandbox identity lookup can fail even though the configured user is
// available. Match the existing disposable PostgreSQL harnesses.
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
const dataDir = mkdtempSync(join(tmpdir(), 'lgq-voice-measurement-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: 54389, persistent: false, onLog: () => {}, onError: () => {} });
const read = (name) => readFileSync(join(root, 'migrations', name), 'utf8').replace(/\r\n/g, '\n');
const ledger = read('20260815213142_pricing_entitlements.sql');
function table(name, source = ledger) {
  const start = source.indexOf(`create table if not exists public.${name} (`);
  assert(start >= 0, `missing table ${name}`);
  return source.slice(start, source.indexOf('\n);', start) + 3);
}
function fn(name, source = ledger) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const tag = source.slice(start).match(/\nas (\$\w*\$)\n/);
  assert(tag, `missing function body ${name}`);
  return source.slice(start, source.indexOf(`\n${tag[1]};`, start + tag.index + tag[0].length) + tag[1].length + 2);
}
let client;
let checks = 0;
const check = (name) => { checks++; console.log(`PASS ${name}`); };
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_voice_measurement');
  client = pg.getPgClient('lgq_voice_measurement');
  await client.connect();
  const q = (sql, args) => client.query(sql, args);
  const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(`create role anon; create role authenticated; create role service_role bypassrls;
    create table accounts(id uuid primary key);
    create table billing_events(id uuid primary key, account_id uuid);
    create table leads(id uuid primary key);
    create table voice_events(id uuid primary key);
    create table voice_provider_terminal_call_tombstones(provider text, provider_call_id text, expires_at timestamptz);`);
  for (const name of ['workspace_entitlements', 'usage_credit_lots', 'usage_reservations', 'usage_reservation_allocations']) await q(table(name));
  for (const name of ['grant_usage_credits', 'reserve_usage_credits', 'release_usage_reservation']) await q(fn(name));
  await q(fn('reserve_usage_credits', read('20260904160000_credits_never_expire.sql')));
  await q(read('20260819110000_commit_usage_reservation_partial.sql'));
  await q(table('voice_call_admissions', read('20260819120000_voice_event_inbox.sql')));
  await q(`alter table voice_call_admissions add admission_state text not null default 'claimed',
    add provider_terminal_at timestamptz, add overage_key text;
    alter table voice_call_admissions enable row level security;`);
  await q(table('voice_calls', read('20260819150000_voice_calls.sql')));
  await q('alter table voice_calls enable row level security');
  await q(fn('finalize_voice_call_admission', read('20260903231235_ai_voice_number_provisioning.sql')));
  await q(`grant usage on schema public to service_role;
    grant select on usage_reservations to service_role;
    grant select, insert, update on voice_call_admissions, voice_calls to service_role;`);
  await q(read('20260908160159_voice_measurement_duration_and_absorbed_usage.sql'));
  check('migration applies over the real ledger, admission, and call-history definitions');
  const finalizeSql = 'select finalize_voice_call_admission_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) as ok';
  const historySql = `insert into voice_calls(account_id,provider,provider_call_id,billed_minutes,measured_minutes,absorbed_minutes,absorption_reason)
    values($1,'signalwire',$2,$3,$4,$5,$6) on conflict(provider,provider_call_id)
    do update set billed_minutes=excluded.billed_minutes,measured_minutes=excluded.measured_minutes,
      absorbed_minutes=excluded.absorbed_minutes,absorption_reason=excluded.absorption_reason`;
  for (const balance of [0, 1, 2, 9, 10, 15]) {
    const account = randomUUID(), admission = randomUUID(), call = randomUUID();
    const held = Math.min(10, balance);
    await q('insert into accounts values($1)', [account]);
    if (balance) await q(`select grant_usage_credits(p_account_id=>$1,p_resource_code=>'voice_minutes',
      p_source_type=>'plan_period',p_idempotency_key=>$2,p_units=>$3)`, [account, `grant:${call}`, balance]);
    if (balance < 10) await assert.rejects(q(`select reserve_usage_credits($1,'voice_minutes',10,$2,'ai_voice_minute',now()+interval '90 minutes','{}')`, [account, `fail:${call}`]), /insufficient usage credits/);
    const reservation = held ? (await one(`select reserve_usage_credits($1,'voice_minutes',$2,$3,'ai_voice_minute',now()+interval '90 minutes','{}') as id`, [account, held, `ai-voice:v1:${call}`])).id : null;
    await q(`insert into voice_call_admissions(id,account_id,provider,provider_call_id) values($1,$2,'signalwire',$3)`, [admission, account, call]);
    const args = [admission, account, call, reservation, held, null, 10, 'measure', held ? null : 'exhausted_not_enforced'];
    await q('set role service_role');
    assert.equal((await one(finalizeSql, args)).ok, true);
    assert.equal((await one(finalizeSql, args)).ok, true);
    if (held === 10) assert.equal((await one(finalizeSql, [...args.slice(0, 7), 'enforce', null])).ok, false);
    else await assert.rejects(one(finalizeSql, [...args.slice(0, 7), 'enforce', null]), /duration policy is invalid/);
    await q('reset role');
    const saved = await one('select allowed_minutes, reserved_minutes, minute_mode from voice_call_admissions where id=$1', [admission]);
    assert.deepEqual(saved, { allowed_minutes: 10, reserved_minutes: held, minute_mode: 'measure' });
    let committed = 0;
    for (let retry = 0; retry < 2; retry++) {
      if (reservation) committed = Number((await one('select commit_usage_reservation_partial($1,$2,10) as n', [reservation, `ai-voice:v1:${call}:settle`])).n);
      assert.equal(committed, held);
      await q(historySql, [account, call, held ? committed : null, 10, 10 - committed,
        committed === 10 ? null : held ? 'partial_balance' : 'exhausted_not_enforced']);
    }
    assert.equal(Number((await one('select count(*) as n from voice_calls where provider_call_id=$1', [call])).n), 1);
    const totals = await one(`select coalesce(sum(consumed_units),0)::int as consumed,
      coalesce(sum(reserved_units),0)::int as reserved from usage_credit_lots where account_id=$1`, [account]);
    assert.deepEqual(totals, { consumed: held, reserved: 0 });
    check(`balance ${balance}: ten-minute admission; ${held} committed, ${10 - held} absorbed; retries preserve one hold and history`);

    await assert.rejects(q(historySql, [account, call, held, 10, 11, 'partial_balance']), /voice_calls_absorbed_usage_check/);
    check(`balance ${balance}: inconsistent accounting is rejected by PostgreSQL`);
  }
  const privileges = await one(`select has_function_privilege('anon',
    'finalize_voice_call_admission_v2(uuid,uuid,text,uuid,integer,text,integer,text,text)','EXECUTE') as anon,
    has_function_privilege('authenticated','finalize_voice_call_admission_v2(uuid,uuid,text,uuid,integer,text,integer,text,text)','EXECUTE') as authenticated,
    has_function_privilege('service_role','finalize_voice_call_admission_v2(uuid,uuid,text,uuid,integer,text,integer,text,text)','EXECUTE') as service`);
  assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });
  check('new finalizer is service-only and executes without widening table privileges');
  // These unrelated current-schema fields are needed by the operational query.
  await q('alter table voice_calls add forwarding_seconds integer; alter table voice_events add processing_status text');
  const report = await q(readFileSync(join(root, 'scripts/inspect-voice-measurement.sql'), 'utf8'));
  assert.equal(report.rowCount, 6);
  assert(report.rows.every(row => row.review_reason === null));
  check('operational inspection reconciles all six settled fixtures');
  console.log(`${checks}/${checks} PostgreSQL checks passed`);
} finally {
  await client?.end();
  let stopped = false;
  try {
    await promisify(execFile)(join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
      ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '8'], { windowsHide: true, timeout: 10000 });
    stopped = true;
  } finally {
    if (stopped && dirname(resolve(dataDir)) === resolve(tmpdir()) && basename(dataDir).startsWith('lgq-voice-measurement-')) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  }
}
