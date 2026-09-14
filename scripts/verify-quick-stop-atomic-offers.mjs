// Disposable local PostgreSQL 17 verification. No hosted URLs or provider calls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

try { os.userInfo(); } catch (error) {
  if (error?.code !== 'ERR_SYSTEM_ERROR') throw error;
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'local-test', homedir: process.env.USERPROFILE || '', shell: null });
  syncBuiltinESMExports();
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const { Client } = await import('pg');
const execFileAsync = promisify(execFile);
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
const bin = join(process.cwd(), 'node_modules', '@embedded-postgres', platform, 'native', 'bin');
process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
const port = Number(process.env.LGQ_QUICK_STOP_OFFER_CHECK_PORT || 54384);
const dataDir = mkdtempSync(join(tmpdir(), 'lgq-quick-stop-offer-pg17-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false, initdbFlags: ['--encoding=UTF8'] });
const connections = [];
let count = 0;
const check = (label) => { count++; console.log(`PASS  ${label}`); };
const connect = async () => {
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();
  await client.query("set statement_timeout = '10s'");
  connections.push(client);
  return client;
};
const source = readFileSync('schema.sql', 'utf8');
const requestTable = source.slice(source.indexOf('create table if not exists extra_stop_requests ('), source.indexOf('create index if not exists extra_stop_requests_account_status_idx'));
const setup = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create type public.job_status as enum ('new_lead','in_progress','complete','archived');
create type public.payment_kind as enum ('deposit','invoice');
create type public.payment_status as enum ('requested','processing','paid','failed','refunded','disputed');
create table public.accounts (
 id uuid primary key, timezone text default 'America/New_York', connect_onboarded boolean default true,
 stripe_connect_id text default 'acct_test', extra_stop_max_per_day integer default 1,
 extra_stop_weekdays text default '0,1,2,3,4,5,6', extra_stop_earliest_time text default '00:00',
 extra_stop_latest_end text default '23:59', extra_stop_payment_deadline_mins integer default 15
);
create table public.clients(id uuid primary key, account_id uuid references accounts);
create table public.jobs (
 id uuid primary key default gen_random_uuid(), account_id uuid references accounts,
 ref text not null, client_id uuid references clients, client_name text not null, client_phone text, client_email text,
 address text, scope text, status job_status, scheduled_for date, scheduled_time time, quoted_amount numeric default 0,
 estimated_hours numeric, lat numeric, lng numeric, geocoded_at timestamptz, unique(account_id,ref)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), account_id uuid references accounts, job_id uuid references jobs,
 kind payment_kind, label text, amount numeric not null check(amount>0), status payment_status,
 homeowner_phone text, sms_consent boolean, sms_consent_at timestamptz, failed_at timestamptz,
 paid_at timestamptz, refunded_amount numeric default 0
);
${requestTable}
alter table public.extra_stop_requests add proposed_arrival_date date, add proposed_arrival_start time,
 add proposed_arrival_end time, add proposed_window_at timestamptz;
create table public.extra_stop_events (
 id uuid primary key default gen_random_uuid(), account_id uuid references accounts, request_id uuid references extra_stop_requests,
 actor text, from_status text, to_status text, meta jsonb
);
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
`;
const offer = { arrival_date: '2099-09-16', arrival_start: '09:00', arrival_end: '11:00', fee_cents: 9900, visit_minutes: 30 };
const call = (client, account, request, input = offer) => client.query('select public.create_quick_stop_offer($1,$2,$3::jsonb) as result', [account, request, JSON.stringify(input)]);
let failure;
try {
  await pg.initialise();
  await pg.start();
  const db = await connect();
  const first = await connect();
  const second = await connect();
  await db.query(setup);
  const timeMigration = readFileSync('migrations/20260914132825_quick_stop_atomic_sweep.sql', 'utf8');
  await db.query(timeMigration.slice(timeMigration.indexOf('create or replace function public.quick_stop_window_instant'), timeMigration.indexOf('create or replace function public.sweep_quick_stop_requests')));
  await db.query(readFileSync('migrations/20260914132439_quick_stop_atomic_offer.sql', 'utf8'));
  await db.query(readFileSync('migrations/20260914132411_quick_stop_refund_recovery.sql', 'utf8'));
  await db.query(readFileSync('migrations/20260914133059_quick_stop_lifecycle_guard.sql', 'utf8'));
  const account = randomUUID();
  const anotherAccount = randomUUID();
  await db.query('insert into accounts(id) values($1),($2)', [account, anotherAccount]);
  const makeRequest = async (owner = account) => {
    const id = randomUUID();
    await db.query("insert into extra_stop_requests(id,account_id,client_name,status) values($1,$2,'Customer','awaiting_contractor')", [id, owner]);
    return id;
  };
  const requestA = await makeRequest();
  const requestB = await makeRequest();

  await first.query('begin');
  const initial = (await call(first, account, requestA)).rows[0].result;
  const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
  const competing = call(second, account, requestB).then(() => null, (error) => error);
  let waiting = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    waiting = (await db.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1", [secondPid])).rows[0]?.waiting === true;
    if (waiting) break;
    await new Promise((done) => setTimeout(done, 20));
  }
  assert.equal(waiting, true, 'second transaction must wait for the occupied-day reservation');
  await first.query('commit');
  assert.match((await competing)?.message || '', /limit/);
  const occupancy = (await db.query('select status,arrival_date,job_id,payment_id from extra_stop_requests where id=$1', [requestA])).rows[0];
  assert.equal(occupancy.status, 'awaiting_customer_payment');
  assert.equal(occupancy.job_id, initial.job_id);
  assert.equal(occupancy.payment_id, initial.payment_id);
  assert.equal((await db.query('select count(*)::int as n from jobs')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from payments')).rows[0].n, 1);
  check('two actual concurrent connections cannot exceed the last daily slot');
  await assert.rejects(call(db, account, requestA), /no longer be offered/);
  check('replaying a published request cannot create another job or payment');

  const wrongTenant = await makeRequest(anotherAccount);
  await assert.rejects(call(db, account, wrongTenant, { ...offer, arrival_date: '2099-09-17' }), /Request not found/);
  check('cross-account request cannot be published');
  for (const role of ['anon', 'authenticated']) {
    await db.query(`set role ${role}`);
    await assert.rejects(call(db, account, requestB), /permission denied/);
    await db.query('reset role');
  }
  check('offer RPC is not callable by public or authenticated clients');

  const before = (await db.query('select count(*)::int as n from jobs')).rows[0].n;
  await db.query(`create function public.test_payment_failure() returns trigger language plpgsql as $$
    begin if current_setting('test.fail_payment',true)='yes' then raise exception 'injected payment failure'; end if; return new; end $$;
    create trigger payment_failure before insert on payments for each row execute function public.test_payment_failure();`);
  await db.query("set test.fail_payment='yes'");
  await assert.rejects(call(db, account, requestB, { ...offer, arrival_date: '2099-09-17' }), /injected payment failure/);
  await db.query("set test.fail_payment='no'");
  assert.equal((await db.query('select count(*)::int as n from jobs')).rows[0].n, before);
  assert.equal((await db.query('select status from extra_stop_requests where id=$1', [requestB])).rows[0].status, 'awaiting_contractor');
  check('payment creation failure rolls back the placeholder and request together');

  await assert.rejects(call(db, account, requestB, { ...offer, arrival_date: '2020-01-01' }), /has not ended/);
  await assert.rejects(call(db, account, requestB, { ...offer, arrival_date: '2027-03-14', arrival_start: '02:15', arrival_end: '03:30' }), /has not ended/);
  await call(db, account, requestB, { ...offer, arrival_date: '2099-09-17' });
  check('past dates and DST gaps rejected while negotiated far-future date is accepted');

  const proposedAt = '2099-01-01T00:00:00.000Z';
  await db.query("update extra_stop_requests set status='confirmed',proposed_arrival_date='2099-09-16',proposed_arrival_start='12:00',proposed_arrival_end='13:00',proposed_window_at=$2 where id=$1", [requestB, proposedAt]);
  await assert.rejects(db.query('select public.accept_quick_stop_window($1,$2,$3)', [account, requestB, proposedAt]), /limit/);
  assert.equal((await db.query('select arrival_date::text as d from extra_stop_requests where id=$1', [requestB])).rows[0].d, '2099-09-17');
  check('accepting a revised window cannot move a visit onto a full day');
  await db.query("update extra_stop_requests set proposed_arrival_date='2099-09-18' where id=$1", [requestB]);
  assert.equal((await db.query('select public.accept_quick_stop_window($1,$2,$3) as ok', [account, requestB, '2099-01-02T00:00:00Z'])).rows[0].ok, false);
  assert.equal((await db.query('select public.accept_quick_stop_window($1,$2,$3) as ok', [account, requestB, proposedAt])).rows[0].ok, true);
  const schedule = (await db.query('select r.arrival_date::text as d,j.scheduled_for::text as job_date,r.proposed_window_at from extra_stop_requests r join jobs j on j.id=r.job_id where r.id=$1', [requestB])).rows[0];
  assert.equal(schedule.d, schedule.job_date);
  assert.equal(schedule.proposed_window_at, null);
  check('proposal version guards replay and request/job schedules update atomically');

  const staged = await makeRequest();
  const stagedJob = randomUUID();
  const orphan = randomUUID();
  await db.query("insert into jobs(id,account_id,ref,client_name,status) values($1,$2,'J-LEGACY','Customer','new_lead')", [stagedJob, account]);
  await db.query("insert into payments(id,account_id,job_id,kind,amount,status) values($1,$2,$3,'deposit',99,'requested')", [orphan, account, stagedJob]);
  await db.query("update extra_stop_requests set status='contractor_offer_sent',job_id=$2,updated_at=clock_timestamp()-interval '1 hour' where id=$1", [staged, stagedJob]);
  assert.equal((await db.query('select public.recover_stale_quick_stop_offers($1,50) as n', [account])).rows[0].n, 1);
  assert.equal((await db.query('select status from payments where id=$1', [orphan])).rows[0].status, 'failed');
  assert.equal((await db.query('select status from jobs where id=$1', [stagedJob])).rows[0].status, 'archived');
  assert.equal((await db.query('select status from extra_stop_requests where id=$1', [staged])).rows[0].status, 'offer_expired');
  assert.equal((await db.query('select public.recover_stale_quick_stop_offers($1,50) as n', [account])).rows[0].n, 0);
  check('legacy recovery finds null offer_sent_at and refuses an unlinked job payment idempotently');

  const early = await makeRequest();
  await db.query("update extra_stop_requests set status='contractor_offer_sent' where id=$1", [early]);
  assert.equal((await db.query('select public.recover_stale_quick_stop_offer($1,$2,clock_timestamp()) as ok', [account, early])).rows[0].ok, false);
  check('caller cannot override the minimum 15-minute stale threshold');

  // Verify the service-role invocation used by server actions, not just owner SQL.
  const serviceRequest = await makeRequest();
  await db.query('set role service_role');
  await call(db, account, serviceRequest, { ...offer, arrival_date: '2099-09-19' });
  await db.query('reset role');
  check('service-role invocation preserves the published offer contract');
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  await Promise.allSettled(connections.map((client) => client.end()));
  if (pg.process && pg.process.exitCode === null) {
    try {
      if (process.platform === 'win32') {
        await execFileAsync(join(bin, 'pg_ctl.exe'), ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '8'], { windowsHide: true, timeout: 12000 });
        pg.process = undefined;
      } else await pg.stop();
    } catch (error) {
      pg.process?.kill('SIGKILL');
      failure ||= error;
    }
  }
  const target = resolve(dataDir);
  if (!target.startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Refusing to remove a non-temporary PostgreSQL directory');
  rmSync(target, { recursive: true, force: true });
}
console.log(`${count} PostgreSQL checks passed.`);
if (failure) process.exitCode = 1;
