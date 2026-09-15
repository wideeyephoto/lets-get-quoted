// Disposable PostgreSQL: failures, batching, leases, timeout recovery and RLS.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
try { os.userInfo(); } catch { os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null }); syncBuiltinESMExports(); }
const root = resolve(import.meta.dirname, '..');
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
process.env.PATH = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-ops-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54409, persistent: true, onLog: () => {}, onError: () => {} });
let db, checks = 0;
const passed = name => { checks++; console.log(`PASS ${name}`); };
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('ops'); db = pg.getPgClient('ops'); await db.connect();
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create table webhook_failures(id uuid default gen_random_uuid(), created_at timestamptz default now(), resolved_at timestamptz);
    create table billing_events(id uuid default gen_random_uuid(), processing_status text, event_scope text, attempt_count int, received_at timestamptz default now(), projection_lease_expires_at timestamptz);
    create table sms_delivery_tasks(sms_event_id uuid default gen_random_uuid(), task_state text, attempt_count int, last_error_code text, created_at timestamptz default now(), available_at timestamptz, failed_at timestamptz, indeterminate_at timestamptz, lease_expires_at timestamptz);
    create table sms_events(id uuid default gen_random_uuid(),status text,created_at timestamptz default now(),failed_at timestamptz,indeterminate_at timestamptz);
    create table payments(id uuid default gen_random_uuid(), stripe_dispute_id text, disputed_at timestamptz, requested_at timestamptz default now(), dispute_due_by timestamptz, status text, dispute_status text);
    create table cron_runs(id uuid default gen_random_uuid(), job text, started_at timestamptz default now(), ok boolean);
    create table business_effects(kind text primary key, count int); insert into business_effects values('charges',1),('credits',1),('messages',1);
    grant usage on schema public to service_role,anon,authenticated;
    grant select on webhook_failures,billing_events,sms_delivery_tasks,sms_events,payments,cron_runs to service_role;`);
  await db.query(readFileSync(join(root, 'migrations/20260909135739_operational_alert_delivery.sql'), 'utf8'));
  passed('migration applies');
  for (const role of ['anon', 'authenticated']) {
    await db.query(`set role ${role}`);
    await assert.rejects(db.query('select scan_operational_failures()'), /permission denied/);
    await assert.rejects(db.query('select * from operational_alert_deliveries'), /permission denied/);
    await db.query('reset role');
  }
  passed('anonymous and authenticated users cannot invoke scans or read notification evidence');
  await db.query(`insert into webhook_failures select gen_random_uuid(),now(),null from generate_series(1,31);
    insert into billing_events(processing_status,event_scope,attempt_count) values('failed','platform_top_up',3);
    insert into sms_delivery_tasks(task_state,attempt_count,failed_at) values('failed',2,now());
    insert into sms_events(id,status) select sms_event_id,'failed' from sms_delivery_tasks;
    insert into payments(status,disputed_at,stripe_dispute_id) values('disputed',now(),'dp_controlled');
    insert into cron_runs(job,ok) values('controlled-drill',false);`);
  const before = await db.query(`select row_to_json(x) as state from (select (select jsonb_agg(w) from webhook_failures w) w,(select jsonb_agg(b) from billing_events b) b,(select jsonb_agg(s) from sms_delivery_tasks s) s,(select jsonb_agg(p) from payments p) p) x`);
  await db.query('set role service_role');
  const crons = JSON.stringify([{ job: 'controlled-drill', max_gap_minutes: 15 }]);
  assert.equal((await db.query('select scan_operational_failures($1) n', [crons])).rows[0].n, 35);
  assert.equal((await db.query('select queue_operational_alerts($1,$2) n', ['ops@example.com', 'Ops <ops@example.com>'])).rows[0].n, 5);
  passed('real failure rows in all five classes produce five bounded digest notifications');
  await db.query('select scan_operational_failures($1)', [crons]);
  assert.equal((await db.query('select queue_operational_alerts($1,$2) n', ['ops@example.com', 'Ops <ops@example.com>'])).rows[0].n, 0);
  const claimed = (await db.query('select * from claim_operational_alerts(5)')).rows;
  assert.equal(claimed.length, 5);
  assert.equal((await db.query('select * from claim_operational_alerts(5)')).rowCount, 0);
  passed('duplicate scans and overlapping claims do not duplicate notifications');
  const first = claimed[0];
  await db.query("update operational_alert_deliveries set lease_expires_at=now()-interval '1 second' where id=$1", [first.id]);
  const retry = (await db.query('select * from claim_operational_alerts(5)')).rows[0];
  assert.equal(retry.id, first.id); assert.deepEqual(retry.payload, first.payload); assert.notEqual(retry.claim_token, first.claim_token);
  passed('crashed sender retries identical immutable payload and provider key');
  await db.query("update operational_alert_deliveries set first_attempt_at=now()-interval '24 hours',lease_expires_at=now()-interval '1 second' where id=$1", [first.id]);
  assert.equal((await db.query('select * from claim_operational_alerts(5)')).rowCount, 0);
  assert.equal((await db.query('select state from operational_alert_deliveries where id=$1',[first.id])).rows[0].state,'manual_review');
  passed('unknown outcomes stop before expired provider idempotency can cause another email');
  await db.query('reset role');
  const after = await db.query(`select row_to_json(x) as state from (select (select jsonb_agg(w) from webhook_failures w) w,(select jsonb_agg(b) from billing_events b) b,(select jsonb_agg(s) from sms_delivery_tasks s) s,(select jsonb_agg(p) from payments p) p) x`);
  assert.deepEqual(after.rows,before.rows);
  passed('alert scans, retries and recovery do not modify payment, billing, SMS or webhook source rows');
  await db.query(`update webhook_failures set resolved_at=now(); update billing_events set processing_status='processed'; update sms_delivery_tasks set task_state='completed'; update sms_events set status='delivered'; update payments set status='paid'; insert into cron_runs(job,ok,started_at) values('controlled-drill',true,now()+interval '1 second');`);
  await db.query('set role service_role');
  assert.equal((await db.query('select scan_operational_failures($1) n',[crons])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from operational_alert_findings where resolved_at is null')).rows[0].n,0);
  await db.query('select scan_operational_failures($1)',[crons]);
  assert.equal((await db.query('select queue_operational_alerts($1,$2) n',['ops@example.com','Ops <ops@example.com>'])).rows[0].n,0);
  passed('verified source resolution closes findings and repeated recovery creates no new notification');
  await db.query('reset role');
  await db.query('update webhook_failures set resolved_at=null where id=(select id from webhook_failures limit 1)');
  await db.query('set role service_role');
  await db.query('select scan_operational_failures($1)',[crons]);
  assert.equal((await db.query('select queue_operational_alerts($1,$2) n',['ops@example.com','Ops <ops@example.com>'])).rows[0].n,1);
  passed('a previously cleared failure recurring raises one new notification');
  await db.query('reset role');
  await db.query(`update webhook_failures set resolved_at=now();
    create view billing_event_operational_classifications with (security_invoker=true) as
      select b.*,true as requires_billing_action,false as requires_configuration_review,null::text as projection_result,null::text as case_key from billing_events b;
    create table workspace_overage_settlements(id uuid,account_id uuid,period_start timestamptz,closed_at timestamptz,
      resolved_at timestamptz,updated_at timestamptz,state text,recovery_reason text,last_error text,chargeable_cents int,
      lease_expires_at timestamptz,first_submitted_at timestamptz);
    create table workspace_overage_accruals(account_id uuid,period_start timestamptz,period_end timestamptz);
    create table contractor_lifecycle_sends(id uuid primary key default gen_random_uuid(),account_id uuid default gen_random_uuid(),
      step_id text default 'welcome_day0',state text default 'sending',attempts int default 1,
      first_attempt_at timestamptz default now(),lease_until timestamptz default now()+interval '5 minutes',next_retry_at timestamptz,
      payload jsonb default '{"private":"do-not-export@example.com"}');
    create table document_email_sends(like contractor_lifecycle_sends including defaults);
    alter table document_email_sends add column kind text default 'invoice',add column phase text default 'fallback';
    alter table contractor_lifecycle_sends enable row level security;
    alter table document_email_sends enable row level security;
    grant select on billing_event_operational_classifications,workspace_overage_settlements,workspace_overage_accruals,
      contractor_lifecycle_sends,document_email_sends to service_role;`);
  const recoveryMigration = readFileSync(join(root,'migrations/20260914145838_email_send_recovery_monitoring.sql'),'utf8');
  assert.ok(readFileSync(join(root,'schema.sql'),'utf8').replace(/\r\n/g,'\n').includes(recoveryMigration.replace(/\r\n/g,'\n').trim()));
  await db.query(recoveryMigration);
  for (const role of ['anon','authenticated']) {
    await db.query(`set role ${role}`);
    await assert.rejects(db.query('select * from email_send_recovery_queue()'), /permission denied/);
    await db.query('reset role');
  }
  const functionRow = (await db.query("select prosecdef,proconfig from pg_proc where oid='email_send_recovery_queue(timestamptz)'::regprocedure")).rows[0];
  assert.equal(functionRow.prosecdef,false); assert.ok(functionRow.proconfig.includes('search_path=""'));
  passed('email recovery migration matches fresh schema and keeps RPC private with invoker rights');
  await db.query(`insert into contractor_lifecycle_sends(state,first_attempt_at,lease_until,next_retry_at,attempts) values
    ('sending',now(),now()+interval '5 minutes',null,1),
    ('retry_wait',now(),null,now()+interval '5 minutes',1),
    ('accepted',now()-interval '2 days',null,null,1),
    ('cancelled',now()-interval '2 days',null,null,1),
    ('manual_review',now(),null,null,1),
    ('sending',now()-interval '24 hours',now()+interval '5 minutes',null,1),
    ('sending',now()-interval '20 minutes',now()-interval '6 minutes',null,1),
    ('retry_wait',now()-interval '20 minutes',null,now()-interval '11 minutes',1),
    ('sending',now()-interval '20 minutes',now()-interval '1 minute',null,3);
    insert into document_email_sends(state,first_attempt_at) values('manual_review',now());`);
  const sourceBefore = (await db.query('select jsonb_agg(t) rows from contractor_lifecycle_sends t')).rows;
  await db.query('set role service_role');
  const recovery = (await db.query('select * from email_send_recovery_queue()')).rows;
  assert.equal(recovery.length,6);
  assert.deepEqual([...new Set(recovery.map(r=>r.reason))].sort(), ['attempt_limit','manual_review','retry_overdue','retry_window_expired','worker_stalled']);
  assert.ok(recovery.some(r=>r.source==='document' && r.phase==='fallback'));
  assert.ok(!JSON.stringify(recovery).includes('do-not-export'));
  passed('classifies manual review, expiry, lost leases and overdue retries without exporting private payloads');
  assert.equal((await db.query('select scan_operational_failures($1) n',[crons])).rows[0].n,6);
  assert.equal((await db.query('select queue_operational_alerts($1,$2) n',['ops@example.com','Ops <ops@example.com>'])).rows[0].n,1);
  await db.query('select scan_operational_failures($1)',[crons]);
  assert.equal((await db.query('select queue_operational_alerts($1,$2) n',['ops@example.com','Ops <ops@example.com>'])).rows[0].n,0);
  const alerts = (await db.query("select * from operational_alert_findings where category='email_send'")).rows;
  assert.ok(alerts.every(a=>a.admin_path==='/admin/health#email-recovery'));
  assert.ok(!JSON.stringify(alerts).includes('do-not-export'));
  assert.deepEqual((await db.query('select jsonb_agg(t) rows from contractor_lifecycle_sends t')).rows,sourceBefore);
  passed('existing monitor queues one email-recovery digest and remains quiet on unchanged records without retrying customer mail');
  await db.query('reset role');
  await db.query("update contractor_lifecycle_sends set state='accepted'; update document_email_sends set state='cancelled';");
  await db.query('set role service_role');
  assert.equal((await db.query('select scan_operational_failures($1) n',[crons])).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from operational_alert_findings where category='email_send' and resolved_at is null")).rows[0].n,0);
  passed('verified acceptance or cancellation closes email findings without sending replacements');
  // A failed source read must roll back the entire scan, not resolve everything.
  await db.query('reset role');
  await db.query("update document_email_sends set state='manual_review';");
  await db.query('set role service_role'); await db.query('select scan_operational_failures($1)',[crons]);
  await db.query('reset role'); await db.query('revoke select on document_email_sends from service_role');
  await db.query('set role service_role'); await assert.rejects(db.query('select scan_operational_failures($1)',[crons]), /permission denied/);
  assert.equal((await db.query("select count(*)::int n from operational_alert_findings where category='email_send' and resolved_at is null")).rows[0].n,1);
  passed('a missing ledger read fails the scan without clearing existing findings');
  if (process.env.LGQ_SUPABASE_CLI) {
    await db.query('reset role');
    console.log(execFileSync(process.env.LGQ_SUPABASE_CLI,['db','advisors','--db-url','postgresql://postgres:postgres@127.0.0.1:54409/ops?sslmode=disable',
      '--type','security','--level','warn','--fail-on','none'],{ windowsHide:true,encoding:'utf8',timeout:30000 }));
  }
  console.log(`${checks}/${checks} checks passed`);
} finally {
  if (db) await db.end();
  if (process.platform === 'win32' && pg.process) {
    execFileSync(join(root, 'node_modules/@embedded-postgres', platform, 'native/bin/pg_ctl.exe'), ['-D', dataDir, 'stop', '-m', 'fast', '-w'], { windowsHide: true, stdio: 'ignore', timeout: 15000 });
    pg.process = undefined;
  } else await pg.stop();
  const target = resolve(dataDir), allowed = resolve(os.tmpdir()) + (process.platform === 'win32' ? '\\' : '/');
  if (!target.startsWith(allowed) || !target.split(/[\\/]/).pop().startsWith('lgq-ops-')) throw new Error('Unsafe disposable cleanup path');
  rmSync(target, { recursive: true, force: true });
}
