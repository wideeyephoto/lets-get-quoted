/** Run the bounded Quick Stop sweep against a real, disposable PostgreSQL 17. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// The Windows sandbox can deny the profile lookup used by embedded-postgres.
// Match the existing verification harness fallback; no database identity changes.
try { os.userInfo(); } catch (error) {
  if (process.platform !== 'win32' || error?.code !== 'ERR_SYSTEM_ERROR') throw error;
  os.userInfo = () => ({ uid:-1,gid:-1,username:process.env.USERNAME || 'windows-user',homedir:process.env.USERPROFILE || '',shell:null });
  syncBuiltinESMExports();
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const platform of ['windows-x64', 'linux-x64', 'darwin-arm64']) {
  process.env.PATH = `${join(repo, 'node_modules', '@embedded-postgres', platform, 'native', 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}
const databaseDir = mkdtempSync(join(tmpdir(), 'lgq-quick-stop-sweep-'));
assert(resolve(databaseDir).startsWith(`${resolve(tmpdir())}${sep}lgq-quick-stop-sweep-`));
const postgres = new EmbeddedPostgres({
  databaseDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_QUICK_STOP_SWEEP_PORT || 54424),
  persistent: true, onLog() {}, onError() {},
});
let client;
let other;
let checks = 0;
const account = '10000000-0000-4000-8000-000000000001';
const otherAccount = '10000000-0000-4000-8000-000000000002';
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('quick_stop_sweep');
  client = postgres.getPgClient('quick_stop_sweep');
  other = postgres.getPgClient('quick_stop_sweep');
  await client.connect();
  await other.connect();
  const q = (sql, values) => client.query(sql, values);
  await q(`
    create role anon; create role authenticated; create role service_role;
    create table public.accounts(id uuid primary key, timezone text);
    create table public.jobs(id uuid primary key, account_id uuid, status text);
    create table public.payments(id uuid primary key, account_id uuid, status text, paid_at timestamptz, failed_at timestamptz);
    create table public.extra_stop_requests(
      id uuid primary key, account_id uuid, client_name text default 'Homeowner',
      status text, payment_id uuid, job_id uuid, paid_at timestamptz,
      arrival_date date, arrival_start time, arrival_end time,
      response_deadline_at timestamptz, payment_deadline_at timestamptz,
      hold_expires_at timestamptz, no_show_reported_at timestamptz,
      completed_at timestamptz, arrived_at timestamptz, updated_at timestamptz,
      refund_cents integer default 0,refund_due_cents integer,refund_state text default 'none',no_show_confirmed_at timestamptz,
      fee_cents integer,diagnostic_fee_cents integer
    );
    create table public.extra_stop_events(
      account_id uuid,request_id uuid,actor text,from_status text,to_status text,meta jsonb
    );
    grant select,insert,update on all tables in schema public to service_role;
  `);
  await q(readFileSync(join(repo, 'migrations/20260914145752_quick_stop_atomic_sweep.sql'), 'utf8'));
  await q(readFileSync(join(repo, 'migrations/20260914145757_quick_stop_lifecycle_guard.sql'), 'utf8'));
  await q('insert into public.accounts values ($1,\'UTC\'),($2,\'America/Los_Angeles\')', [account, otherAccount]);
  const sweep = (limit = 50, scope = account) => q('select * from public.sweep_quick_stop_requests($1,$2)', [scope, limit]);
  const reset = () => q('truncate public.extra_stop_events,public.extra_stop_requests,public.payments,public.jobs');
  const seed = async (n, kind, accountId = account, extra = {}) => {
    const requestId = id(n);
    const status = kind === 'payment' ? 'awaiting_customer_payment' : kind === 'response' ? 'awaiting_contractor' : 'confirmed';
    const paid = kind === 'completed';
    await q(`insert into public.jobs values ($1,$2,'in_progress');
      `, [requestId, accountId]);
    await q(`insert into public.payments values($1,$2,$3,case when $4 then now()-interval '3 days' end,null)`, [requestId, accountId, paid ? 'paid' : 'requested', paid]);
    await q(`insert into public.extra_stop_requests(
      id,account_id,status,payment_id,job_id,paid_at,arrival_date,arrival_start,arrival_end,
      response_deadline_at,payment_deadline_at,hold_expires_at
    ) values($1,$2,$3,$1,$1,case when $4 then now()-interval '3 days' end,
      (now() at time zone 'UTC')::date-2,'14:00','15:00',now()-interval '1 day',now()-interval '1 day',now()-interval '1 day')`,
    [requestId, accountId, status, paid]);
    for (const [column, value] of Object.entries(extra)) {
      assert(['no_show_reported_at','arrival_end','paid_at','arrival_date'].includes(column));
      await q(`update public.extra_stop_requests set ${column}=$2 where id=$1`, [requestId, value]);
    }
    return requestId;
  };

  for (const hostZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    await q('select set_config(\'TimeZone\',$1,false)', [hostZone]);
    for (const [day, time, zone, expected] of [
      ['2026-09-14','15:00','America/Los_Angeles','2026-09-14T22:00:00.000Z'],
      ['2026-03-08','03:30','America/New_York','2026-03-08T07:30:00.000Z'],
      ['2026-03-08','02:30','America/New_York',null],
      ['2026-11-01','01:30','America/New_York','2026-11-01T06:30:00.000Z'],
      ['2026-04-05','01:45','Australia/Lord_Howe','2026-04-04T15:15:00.000Z'],
      ['2026-10-04','02:15','Australia/Lord_Howe',null],
      ['2011-12-30','12:00','Pacific/Apia',null],
      ['2026-09-14','00:15','Pacific/Kiritimati','2026-09-13T10:15:00.000Z'],
      ['2026-09-14','15:00','Unknown/Zone',null],
      ['2026-09-14','24:00','UTC',null],
    ]) {
      const result = (await q('select public.quick_stop_window_instant($1,$2,$3) as instant', [day,time,zone])).rows[0].instant;
      assert.equal(result?.toISOString() ?? null, expected, `${hostZone}: ${day} ${time} ${zone}`);
      checks++;
    }
  }

  await q("set timezone='UTC'");
  for (let n=1;n<=3;n++) {
    await seed(n,'payment'); await seed(n+10,'response'); await seed(n+20,'completed');
  }
  await seed(99,'payment',otherAccount);
  const first = (await sweep(2)).rows;
  assert.equal(first.length,6);
  assert.deepEqual(first.map((row) => row.kind).sort(),['auto_completed','auto_completed','payment_expired','payment_expired','response_expired','response_expired']);
  assert.equal((await sweep(2)).rows.length,3);
  assert.equal((await sweep(2)).rows.length,0);
  assert.equal((await q('select count(*)::integer n from public.extra_stop_events')).rows[0].n,9);
  assert.equal((await q('select status from public.extra_stop_requests where id=$1',[id(99)])).rows[0].status,'awaiting_customer_payment');
  assert.equal((await q("select count(*)::integer n from public.jobs where account_id=$1 and status='archived'",[account])).rows[0].n,6);
  assert.equal((await q("select count(*)::integer n from public.payments where account_id=$1 and status='failed'",[account])).rows[0].n,6);
  checks+=7;

  await reset();
  // Rows with earlier IDs and malformed/future schedules do not consume LIMIT.
  for (let n=1;n<=60;n++) await seed(n,'completed',account,{arrival_end:null});
  await seed(61,'completed',account,{no_show_reported_at:new Date().toISOString()});
  await seed(62,'completed',account,{paid_at:null});
  await seed(63,'completed',account,{arrival_date:'2099-01-01'});
  await seed(80,'completed');
  assert.deepEqual((await sweep(1)).rows.map((row)=>row.request_id),[id(80)]);
  assert.equal((await q("select count(*)::integer n from public.extra_stop_requests where status='completed'")).rows[0].n,1);
  checks+=2;

  await reset();
  await seed(1,'completed');
  await other.query('begin');
  await other.query('update public.extra_stop_requests set no_show_reported_at=now() where id=$1',[id(1)]);
  assert.equal((await sweep()).rows.length,0);
  await other.query('commit');
  assert.equal((await sweep()).rows.length,0);
  assert.equal((await q('select status from public.jobs where id=$1',[id(1)])).rows[0].status,'in_progress');
  checks+=3;

  await reset();
  await seed(1,'completed');
  await other.query('begin');
  await other.query("update public.extra_stop_requests set status='arrived',arrived_at=now() where id=$1",[id(1)]);
  assert.equal((await sweep()).rows.length,0);
  await other.query('commit');
  assert.equal((await sweep()).rows.length,1);
  assert((await q('select arrived_at from public.extra_stop_requests where id=$1',[id(1)])).rows[0].arrived_at);
  await assert.rejects(q("update public.extra_stop_requests set status='confirmed' where id=$1",[id(1)]),/Quick Stop cannot move from completed to confirmed/);
  checks+=4;

  await reset();
  // A paid payment cannot be expired even when request confirmation is delayed.
  await seed(1,'payment');
  await q("update public.payments set status='paid',paid_at=now() where id=$1",[id(1)]);
  assert.equal((await sweep()).rows.length,0);
  assert.equal((await q('select status from public.jobs where id=$1',[id(1)])).rows[0].status,'in_progress');
  checks+=2;

  await reset();
  // Two workers skip each other's locks and never produce duplicate audit rows.
  for (let n=1;n<=5;n++) await seed(n,'payment');
  await q('begin');
  assert.equal((await sweep(2)).rows.length,2);
  const concurrent = await other.query('select * from public.sweep_quick_stop_requests($1,4)',[account]);
  assert.equal(concurrent.rows.length,2);
  await q('commit');
  assert.equal((await sweep(2)).rows.length,1);
  assert.equal((await q('select count(*)::integer n from public.extra_stop_events')).rows[0].n,5);
  checks+=4;

  await reset();
  await seed(1,'payment');
  await other.query('begin');
  await other.query("update public.payments set status='paid',paid_at=now() where id=$1",[id(1)]);
  assert.equal((await sweep()).rows.length,0);
  await other.query('commit');
  assert.equal((await sweep()).rows.length,0);
  checks+=2;

  await reset();
  await seed(1,'payment');
  await q(`create function public.fail_archive() returns trigger language plpgsql as $$ begin raise exception 'archive unavailable'; end $$;
    create trigger fail_archive before update on public.jobs for each row execute function public.fail_archive();`);
  await assert.rejects(sweep(),/archive unavailable/);
  assert.equal((await q('select status from public.extra_stop_requests where id=$1',[id(1)])).rows[0].status,'awaiting_customer_payment');
  assert.equal((await q('select status from public.payments where id=$1',[id(1)])).rows[0].status,'requested');
  assert.equal((await q('select count(*)::integer n from public.extra_stop_events')).rows[0].n,0);
  await q('drop trigger fail_archive on public.jobs');
  checks+=4;

  for (const role of ['anon','authenticated']) {
    assert.equal((await q("select has_function_privilege($1,'public.sweep_quick_stop_requests(uuid,integer)','execute') as allowed",[role])).rows[0].allowed,false);
    checks++;
  }
  await q('set role service_role');
  assert.equal((await sweep()).rows.length,1);
  await q('reset role');
  await assert.rejects(sweep(0),/Invalid Quick Stop sweep batch size/);
  await assert.rejects(sweep(null),/Invalid Quick Stop sweep batch size/);
  checks+=3;

  await reset(); await seed(1,'completed');
  await q('grant select,insert,update on public.extra_stop_requests to authenticated');
  await q('set role authenticated');
  await assert.rejects(q('update public.extra_stop_requests set fee_cents=5000 where id=$1',[id(1)]),/server managed/);
  await assert.rejects(q("update public.extra_stop_requests set arrival_end='18:00' where id=$1",[id(1)]),/server managed/);
  await assert.rejects(q("update public.extra_stop_requests set status='no_show_confirmed',no_show_confirmed_at=now() where id=$1",[id(1)]),/server managed/);
  await assert.rejects(q("insert into public.extra_stop_requests(id,account_id,status,payment_id,paid_at) values($1,$2,'confirmed',$1,now())",[id(2),account]),/server managed/);
  await q("update public.extra_stop_requests set status='en_route' where id=$1",[id(1)]);
  assert.equal((await q('select status from public.extra_stop_requests where id=$1',[id(1)])).rows[0].status,'en_route');
  await q('reset role');
  await q("update public.extra_stop_requests set status='disputed' where id=$1",[id(1)]);
  await q('set role authenticated');
  await assert.rejects(q("update public.extra_stop_requests set status='completed' where id=$1",[id(1)]),/server managed/);
  await q("insert into public.extra_stop_requests(id,account_id,status) values($1,$2,'awaiting_contractor')",[id(2),account]);
  assert.equal((await q('select status from public.extra_stop_requests where id=$1',[id(2)])).rows[0].status,'awaiting_contractor');
  await q('reset role');
  checks+=7;
  console.log(`Quick Stop atomic sweep: ${checks} PostgreSQL assertions passed.`);
} finally {
  await other?.query('rollback').catch(()=>{});
  await client?.query('rollback').catch(()=>{});
  await other?.end().catch(()=>{});
  await client?.end().catch(()=>{});
  if (process.platform === 'win32' && postgres.process?.exitCode === null) {
    // embedded-postgres uses taskkill on Windows; pg_ctl gives the cluster a
    // bounded, graceful shutdown and does not leave the script waiting on it.
    await promisify(execFile)(join(repo,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
      ['stop','-D',databaseDir,'-m','fast','-w','-t','8'],{windowsHide:true,timeout:10_000});
    postgres.process = undefined;
  } else {
    await postgres.stop().catch(()=>{});
  }
  // Windows can retain a transient filesystem lock after postgres exits.
  try { rmSync(databaseDir,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
  catch { console.warn(`Temporary PostgreSQL files remain at ${databaseDir}`); }
}
