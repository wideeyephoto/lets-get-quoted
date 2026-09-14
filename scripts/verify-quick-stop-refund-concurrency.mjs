// Exercise the actual refund migration with independent PostgreSQL 17 sessions.
// The cluster is disposable and local; no provider or hosted database is used.
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
const port = Number(process.env.LGQ_QUICK_STOP_REFUND_CHECK_PORT || 54385);
const dataDir = mkdtempSync(join(tmpdir(), 'lgq-quick-stop-refund-pg17-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false, initdbFlags: ['--encoding=UTF8'] });
const clients = [];
let passed = 0;
let failure;
const check = (label) => { passed++; console.log(`PASS  ${label}`); };
const one = (result) => { assert.equal(result.rows.length, 1); return result.rows[0]; };
const settle = (promise) => promise.then((result) => ({ result }), (error) => ({ error }));

async function connect() {
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();
  await client.query("set statement_timeout='8s'; set lock_timeout='5s'");
  clients.push(client);
  return client;
}

const baseSchema = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create type public.job_status as enum ('new_lead','in_progress','complete','archived');
create type public.payment_status as enum ('requested','processing','paid','refunded','failed','disputed');
create table accounts(id uuid primary key, timezone text,extra_stop_locked_until timestamptz,extra_stop_lock_reason text);
create table jobs(id uuid primary key, account_id uuid references accounts, status job_status);
create table payments(
 id uuid primary key, account_id uuid references accounts, job_id uuid references jobs, kind text default 'deposit',
 status payment_status, paid_at timestamptz, stripe_payment_intent text, charge_model text default 'destination',
 amount numeric, platform_fee numeric default 10, refunded_amount numeric default 0,
 platform_fee_refunded numeric default 0, refunded_at timestamptz
);
create table extra_stop_requests(
 id uuid primary key, account_id uuid references accounts, job_id uuid references jobs,
 payment_id uuid unique references payments, status text, fee_cents integer, diagnostic_fee_cents integer, refund_cents integer default 0,
 paid_at timestamptz, arrived_at timestamptz, arrival_date date, arrival_start time, arrival_end time,
 canceled_at timestamptz, cancel_reason text, no_show_confirmed_at timestamptz, no_show_reported_at timestamptz,
 updated_at timestamptz default now(),payment_deadline_at timestamptz,response_deadline_at timestamptz
);
create table extra_stop_events(id uuid default gen_random_uuid(),account_id uuid,request_id uuid,
 actor text,from_status text,to_status text,meta jsonb,dedupe_key text);
create unique index on extra_stop_events(request_id,dedupe_key) where dedupe_key is not null;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
`;

try {
  await pg.initialise();
  await pg.start();
  const observer = await connect();
  const first = await connect();
  const second = await connect();
  const probe = await connect();
  await observer.query(baseSchema);
  for (const migration of [
    '20260914132411_quick_stop_refund_recovery.sql',
    '20260914132439_quick_stop_atomic_offer.sql',
    '20260914132825_quick_stop_atomic_sweep.sql',
    '20260914133059_quick_stop_lifecycle_guard.sql',
    '20260914134359_quick_stop_no_show_lock.sql',
  ]) await observer.query(readFileSync(`migrations/${migration}`, 'utf8'));
  const firstPid = one(await first.query('select pg_backend_pid() pid')).pid;
  const secondPid = one(await second.query('select pg_backend_pid() pid')).pid;

  async function fixture(status = 'confirmed') {
    const ids = { account: randomUUID(), job: randomUUID(), payment: randomUUID(), request: randomUUID() };
    await observer.query("insert into accounts(id,timezone) values($1,'America/New_York')", [ids.account]);
    await observer.query('insert into jobs values($1,$2,$3)', [ids.job, ids.account, status === 'confirmed' ? 'in_progress' : 'new_lead']);
    await observer.query(`insert into payments(id,account_id,job_id,status,paid_at,stripe_payment_intent,amount)
      values($1,$2,$3,'paid',now()-interval '30 minutes',$4,100)`, [ids.payment, ids.account, ids.job, `pi_${ids.payment.replaceAll('-', '')}`]);
    await observer.query(`insert into extra_stop_requests(id,account_id,job_id,payment_id,status,fee_cents,paid_at,arrival_date,arrival_start,arrival_end)
      values($1,$2,$3,$4,$5,10000,case when $5='confirmed' then now()-interval '30 minutes' else null end,
      (now() at time zone 'America/New_York')::date+1,'13:00','15:00')`, [ids.request, ids.account, ids.job, ids.payment, status]);
    return ids;
  }
  const cancel = (client, ids, expected = 'confirmed', pct = 75) => client.query(
    'select public.cancel_quick_stop_request($1,$2,$3,$4,$5,$6,false) claimed',
    [ids.account, ids.request, expected, 'customer_cancel', pct, 'Concurrent regression test'],
  );
  const beginManual = (client, ids, target = 2500, expectedRefunded = 0) => client.query(
    'select public.begin_quick_stop_manual_refund($1,$2,$3,$4) token',
    [ids.account, ids.payment, target, expectedRefunded],
  );
  const finishManual = (client, ids, token, ok) => client.query('select public.finish_quick_stop_manual_refund($1,$2,$3,$4) finished', [ids.account, ids.payment, token, ok]);
  const confirm = (client, ids) => client.query('select * from public.confirm_quick_stop_payment($1)', [ids.payment]);
  const claim = (client, ids) => client.query('select * from public.claim_quick_stop_refunds(1,$1,$2)', [ids.account, ids.request]);
  const state = (ids) => observer.query(`select r.status,r.refund_state,r.refund_due_cents,r.refund_cents,j.status job_status,
    t.target_cents,t.state task_state,t.last_error,m.state manual_state
    from extra_stop_requests r join jobs j on j.id=r.job_id
    left join quick_stop_refund_tasks t on t.request_id=r.id
    left join quick_stop_manual_refund_reservations m on m.payment_id=r.payment_id where r.id=$1`, [ids.request]).then(one);

  async function waitBlocked() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const row = one(await observer.query('select pg_blocking_pids($1) blockers', [secondPid]));
      if (row.blockers.includes(firstPid)) return;
      await new Promise((done) => setTimeout(done, 20));
    }
    throw new Error('Expected a real lock wait between the concurrent PostgreSQL sessions');
  }
  // Commit the first operation only after PostgreSQL confirms that the second
  // backend is waiting on its lock. This is a deterministic race, not sequential
  // calls whose promises happen to be wrapped in Promise.all.
  async function overlap(firstAction, secondAction) {
    await first.query('begin');
    const a = await firstAction();
    const pending = settle(secondAction());
    await waitBlocked();
    await first.query('commit');
    return { a, b: await pending };
  }

  for (const [name, run, initial] of [
    ['manual reservation', beginManual, 'confirmed'],
    ['cancellation', cancel, 'confirmed'],
    ['confirmation', confirm, 'awaiting_customer_payment'],
  ]) {
    const ids = await fixture(initial);
    await first.query('begin');
    await first.query('select id from payments where id=$1 for update', [ids.payment]);
    const pending = settle(run(second, ids));
    await waitBlocked();
    await probe.query('begin');
    assert.equal((await probe.query('select id from extra_stop_requests where id=$1 for update nowait', [ids.request])).rows.length, 1);
    await probe.query('rollback');
    await first.query('commit');
    const result = await pending;
    assert.equal(result.error, undefined, result.error?.message);
    check(`${name} locks the payment before the request`);
  }

  {
    const ids = await fixture();
    const race = await overlap(() => beginManual(first, ids), () => cancel(second, ids));
    assert.equal(race.b.error, undefined);
    assert.equal(one(race.b.result).claimed, true);
    const token = one(race.a).token;
    const held = await state(ids);
    assert.equal(held.status, 'customer_canceled');
    assert.equal(held.job_status, 'archived');
    assert.equal(held.task_state, 'review');
    assert.equal(held.last_error, 'manual_refund_active');
    assert.equal(held.manual_state, 'active');
    assert.equal((await claim(probe, ids)).rows.length, 0);
    check('manual reservation committed ahead of cancellation prevents an automatic provider claim');
    await finishManual(first, ids, token, false);
    const unknown = await state(ids);
    assert.equal(unknown.manual_state, 'unknown');
    assert.equal(unknown.refund_state, 'review');
    assert.equal(unknown.last_error, 'manual_provider_result_unknown');
    await observer.query("update quick_stop_manual_refund_reservations set created_at=now()-interval '1 day' where payment_id=$1", [ids.payment]);
    assert.equal((await claim(second, ids)).rows.length, 0);
    assert.equal((await state(ids)).manual_state, 'unknown');
    check('unknown manual result stays reserved and reviewed even after the original lease age');
  }

  {
    const ids = await fixture();
    const race = await overlap(() => cancel(first, ids), () => beginManual(second, ids));
    assert.equal(one(race.a).claimed, true);
    assert.match(race.b.error?.message || '', /refund in progress/);
    assert.equal((await state(ids)).manual_state, null);
    assert.equal((await claim(probe, ids)).rows.length, 1);
    check('cancellation committed ahead of manual reservation gives only the automatic worker authority');
  }

  {
    const ids = await fixture();
    const token = one(await beginManual(observer, ids)).token;
    // Simulate already-proven provider success; no Stripe calls occur here.
    await observer.query('update payments set refunded_amount=25,refunded_at=now() where id=$1', [ids.payment]);
    const race = await overlap(() => finishManual(first, ids, token, true), () => cancel(second, ids));
    assert.equal(one(race.a).finished, true);
    assert.equal(race.b.error, undefined);
    assert.equal(one(race.b.result).claimed, true);
    const current = await state(ids);
    assert.equal(current.refund_cents, 2500);
    assert.equal(current.refund_due_cents, 7500);
    assert.equal(current.target_cents, 7500);
    assert.equal(current.manual_state, null);
    assert.equal(current.task_state, 'pending');
    const claimed = one(await claim(probe, ids));
    assert.equal(claimed.target_cents, 7500);
    check('successful manual completion before cancellation preserves the cumulative target and prior refund');
  }

  {
    const ids = await fixture();
    const token = one(await beginManual(observer, ids)).token;
    // A second manual caller read zero refunded before the first provider call
    // completed. It then waits on the first writer's payment lock; its snapshot
    // must be rechecked after the first refund finishes and removes its marker.
    const race = await overlap(async () => {
      await first.query('update payments set refunded_amount=25,refunded_at=now() where id=$1', [ids.payment]);
      return finishManual(first, ids, token, true);
    }, () => beginManual(second, ids, 7500, 0));
    assert.equal(one(race.a).finished, true);
    assert.match(race.b.error?.message || '', /payment changed before the refund was reserved/);
    const current = await state(ids);
    assert.equal(current.refund_cents, 2500);
    assert.equal(current.refund_due_cents, 2500);
    assert.equal(current.manual_state, null);
    assert.equal(current.task_state, null);
    check('manual reservation rejects a stale refund snapshot after waiting for another manual completion');
    assert.ok(one(await beginManual(probe, ids, 7500, 2500)).token);
    assert.equal((await state(ids)).manual_state, 'active');
    check('a refreshed manual snapshot can reserve a subsequent cumulative refund target');
  }

  {
    const ids = await fixture('awaiting_customer_payment');
    const race = await overlap(() => cancel(first, ids, 'awaiting_customer_payment', 100), () => confirm(second, ids));
    assert.equal(one(race.a).claimed, true);
    assert.equal(race.b.error, undefined);
    assert.equal(race.b.result.rows.length, 0);
    const current = await state(ids);
    assert.equal(current.status, 'customer_canceled');
    assert.equal(current.job_status, 'archived');
    assert.equal(current.refund_due_cents, 10000);
    check('late confirmation cannot reactivate a job when concurrent cancellation wins');
  }

  {
    const ids = await fixture('awaiting_customer_payment');
    const race = await overlap(() => confirm(first, ids), () => cancel(second, ids, 'confirmed', 75));
    assert.equal(race.a.rows.length, 1);
    assert.equal(race.b.error, undefined);
    assert.equal(one(race.b.result).claimed, true);
    const current = await state(ids);
    assert.equal(current.status, 'customer_canceled');
    assert.equal(current.job_status, 'archived');
    assert.equal(current.refund_due_cents, 7500);
    assert.equal((await confirm(probe, ids)).rows.length, 0);
    check('cancellation following concurrent confirmation archives both states and survives webhook replay');
  }

  {
    const ids = await fixture('awaiting_customer_payment');
    const race = await overlap(() => confirm(first, ids), () => cancel(second, ids, 'awaiting_customer_payment', 100));
    assert.equal(race.b.error, undefined);
    assert.equal(one(race.b.result).claimed, false);
    const current = await state(ids);
    assert.equal(current.status, 'confirmed');
    assert.equal(current.job_status, 'in_progress');
    assert.equal(current.task_state, null);
    check('stale cancellation loses its status comparison without partial calendar or refund effects');
  }

  {
    const ids = await fixture();
    await beginManual(observer, ids);
    await observer.query("update quick_stop_manual_refund_reservations set created_at=now()-interval '10 minutes' where payment_id=$1", [ids.payment]);
    assert.equal((await claim(second, ids)).rows.length, 0);
    const current = await state(ids);
    assert.equal(current.manual_state, 'unknown');
    assert.equal(current.refund_state, 'review');
    check('abandoned manual reservation becomes review work instead of fresh refund authority');
  }
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  await Promise.allSettled(clients.map((client) => client.query('rollback')));
  await Promise.allSettled(clients.map((client) => client.end()));
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
console.log(`${passed} PostgreSQL refund concurrency checks passed.`);
if (failure) process.exitCode = 1;
