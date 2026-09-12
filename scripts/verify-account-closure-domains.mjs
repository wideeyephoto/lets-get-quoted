// Disposable PostgreSQL only: no provider requests, hosted credentials or mail.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
try { os.userInfo(); } catch { os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null }); syncBuiltinESMExports(); }
const root = resolve(import.meta.dirname, '..');
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
process.env.PATH = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-closure-domains-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54420, persistent: true, onLog: () => {}, onError: () => {} });
let db, other, checks = 0;
const passed = name => { checks++; console.log(`PASS ${name}`); };
const source = name => readFileSync(join(root, 'migrations', name), 'utf8');
const section = (sql, start, end) => {
  const a = sql.indexOf(start), b = sql.indexOf(end, a);
  assert(a >= 0 && b > a, 'Migration section anchors must resolve');
  return sql.slice(a, b);
};
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('closure_domains');
  db = pg.getPgClient('closure_domains'); await db.connect();
  other = pg.getPgClient('closure_domains'); await other.connect();
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create table accounts(id uuid primary key default gen_random_uuid(), legal_hold boolean not null default false, suspended_at timestamptz, suspended_reason text, suspended_by text);
    create table memberships(account_id uuid, user_id uuid, deactivated_at timestamptz);
    create table sites(id uuid primary key default gen_random_uuid(), account_id uuid references accounts(id), custom_domain text, custom_domain_verified_at timestamptz, subdomain text, published boolean default false);
    create table sms_events(id uuid, account_id uuid, status text, error_reason text, cancelled_at timestamptz, updated_at timestamptz);
    create table sms_delivery_tasks(sms_event_id uuid, task_state text, claim_token uuid, lease_expires_at timestamptz, last_error_code text, cancelled_at timestamptz, updated_at timestamptz);
    create function public.office_can(uuid,text) returns boolean language sql as 'select false';
    create function public.record_tenant_audit_event_atomic(p_account_id uuid,p_entity_type text,p_entity_id text,p_action text,p_actor jsonb default '{}',p_source text default 'web',p_request_id text default null,p_delete_operation_id uuid default null,p_reason text default null,p_changed_fields text[] default '{}',p_before_state jsonb default null,p_after_state jsonb default null) returns uuid language sql as 'select gen_random_uuid()';
    grant usage on schema public to anon,authenticated,service_role;`);
  const initial = source('20260830160000_enterprise_closure_and_rls_hardening.sql');
  const grace = source('20260901050000_soft_deletion_and_tenant_audit_ledger.sql');
  await db.query(section(initial, 'create table if not exists public.account_closure_jobs', '-- 3. Hardened RLS'));
  await db.query(section(grace, 'alter table public.account_closure_jobs', '-- 5. Stored Procedures'));
  await db.query(section(grace, 'create or replace function public.request_account_closure_atomic', '-- 5.5 Cancel Account'));
  await db.query(section(grace, 'create or replace function public.claim_account_closure_job', '-- 5.7 Claim Recoverable'));
  await db.query(source('20260907180000_email_sending_domains.sql'));
  const legacyAccount = (await db.query('insert into accounts default values returning id')).rows[0].id;
  const legacy = (await db.query("insert into account_closure_jobs(closure_subject_id,account_id,requested_by_role,recoverable_until) values($1,$1,'admin',now()+interval '30 days') returning id", [legacyAccount])).rows[0].id;
  await db.query(source('20260910133921_account_closure_domain_cleanup.sql'));
  await db.query(source('20260910140253_account_closure_request_contract.sql'));
  await db.query(source('20260910140758_account_closure_actor_type.sql'));
  const actorRepair = source('20260912085100_account_closure_actor_drift_repair.sql');
  const actorDefinition = async () => (await db.query("select pg_get_functiondef('public.request_account_closure_atomic(uuid,uuid,text,text,boolean,boolean,boolean)'::regprocedure) definition")).rows[0].definition;
  const correctDefinition = await actorDefinition();
  await db.query(actorRepair);
  await db.query(actorRepair);
  assert.equal(await actorDefinition(), correctDefinition, 'Already-correct closure logic must remain unchanged');
  await db.query(correctDefinition.replace('then p_requested_by_user_id::text else suspended_by end', 'then p_requested_by_user_id else suspended_by end'));
  const driftAccount = (await db.query('insert into accounts default values returning id')).rows[0].id;
  const driftActor = randomUUID();
  await assert.rejects(db.query("select request_account_closure_atomic($1,$2,'admin',null,false,false,false)", [driftAccount, driftActor]), /CASE types text and uuid cannot be matched/);
  assert.equal((await db.query('select suspended_at from accounts where id=$1', [driftAccount])).rows[0].suspended_at, null);
  assert.equal((await db.query('select id from account_closure_jobs where account_id=$1', [driftAccount])).rowCount, 0);
  await db.query(actorRepair);
  await db.query("select request_account_closure_atomic($1,$2,'admin',null,false,false,false)", [driftAccount, driftActor]);
  assert.equal((await db.query('select suspended_by from accounts where id=$1', [driftAccount])).rows[0].suspended_by, driftActor);
  assert.equal((await db.query('select cancel_account_closure_atomic($1) result', [driftAccount])).rows[0].result.success, true);
  passed('reapplied old actor definition fails atomically; repair restores UUID actor handling and is idempotent');
  const state = async id => (await db.query('select * from account_closure_jobs where id=$1', [id])).rows[0];
  assert.equal((await state(legacy)).domain_cleanup_state, 'operator_review');
  passed('actual closure schema, grace RPCs and new migration apply; old unfinished jobs require review');

  for (const role of ['anon', 'authenticated']) {
    await db.query(`set role ${role}`);
    await assert.rejects(db.query('select domain_cleanup_targets from account_closure_jobs'), /permission denied/);
    await assert.rejects(db.query('select prepare_closure_domain_cleanup($1,$2,1)', [legacy, randomUUID()]), /permission denied/);
    await assert.rejects(db.query('select cancel_account_closure_atomic($1)', [legacyAccount]), /permission denied/);
    await assert.rejects(db.query("select update_closure_job_stage($1,$2,1,'domain_cleanup','success')", [legacy, randomUUID()]), /permission denied/);
    await db.query('reset role');
  }
  passed('browser roles cannot read provider targets or execute cleanup transitions');

  for (const suspended of [false, true]) {
    const recoveryAccount = (await db.query("insert into accounts(suspended_at,suspended_reason) values(case when $1 then now() else null end,case when $1 then 'staff-enforcement' else null end) returning id", [suspended])).rows[0].id;
    const activeUser = randomUUID(), inactiveUser = randomUUID();
    await db.query("insert into memberships(account_id,user_id,deactivated_at) values($1,$2,null),($1,$3,now()-interval '1 day')", [recoveryAccount, activeUser, inactiveUser]);
    const recoveryJob = (await db.query("select request_account_closure_atomic($1,null,'admin',null,false,false,false) id", [recoveryAccount])).rows[0].id;
    assert.equal((await db.query("select request_account_closure_atomic($1,null,'admin',null,false,false,false) id", [recoveryAccount])).rows[0].id, recoveryJob);
    const restored = (await db.query('select cancel_account_closure_atomic($1) result', [recoveryAccount])).rows[0].result;
    assert.equal(restored.success, true);
    const acct = (await db.query('select * from accounts where id=$1', [recoveryAccount])).rows[0];
    assert.equal(Boolean(acct.suspended_at), suspended);
    const members = (await db.query('select * from memberships where account_id=$1', [recoveryAccount])).rows;
    assert.equal(members.find(m => m.user_id === activeUser).deactivated_at, null);
    assert(members.find(m => m.user_id === inactiveUser).deactivated_at);
  }
  passed('recovery uses the real account schema, is idempotent, and preserves staff suspension and previously inactive members');

  const account = (await db.query('insert into accounts default values returning id')).rows[0].id;
  const neighbor = (await db.query('insert into accounts default values returning id')).rows[0].id;
  const site = (await db.query("insert into sites(account_id,custom_domain,subdomain,published,custom_domain_verified_at) values($1,'fixture.contractor.com','fixture',true,now()) returning id", [account])).rows[0].id;
  const emailId = (await db.query("insert into email_sending_domains(account_id,domain,provider_domain_id) values($1,'contractor.com','provider-1') returning id", [account])).rows[0].id;
  await db.query("insert into sites(account_id,custom_domain,published,custom_domain_verified_at) values($1,'untouched.contractor.com',true,now())", [neighbor]);
  const job = (await db.query("select request_account_closure_atomic($1,null,'admin',null,false,false,false) id", [account])).rows[0].id;
  let row = await state(job);
  assert.equal(row.domain_cleanup_state, 'pending');
  assert.equal(row.domain_cleanup_targets.length, 2);
  assert(row.domain_cleanup_targets.some(t => t.providerId === 'provider-1' && t.bindingId === emailId));
  assert(row.recoverable_until.getTime() > Date.now() + 29 * 86400_000);
  await db.query('delete from email_sending_domains where account_id=$1', [account]);
  assert.deepEqual((await state(job)).domain_cleanup_targets, row.domain_cleanup_targets);
  passed('real closure request snapshots both bindings atomically before local email deletion and preserves 30-day grace');

  await assert.rejects(db.query("insert into sites(account_id,custom_domain) values($1,'new.contractor.com')", [account]), /closing account/);
  await assert.rejects(db.query("insert into email_sending_domains(account_id,domain,provider_domain_id) values($1,'contractor.com','provider-new')", [neighbor]), /pending account-closure cleanup/);
  assert.equal((await db.query('select * from claim_account_closure_job($1,300)', [randomUUID()])).rowCount, 0);
  passed('closing accounts cannot add domains; captured email names cannot be reassigned; grace jobs cannot be claimed');

  await db.query("update account_closure_jobs set recoverable_until=now()-interval '1 minute',purge_eligible_at=now()-interval '1 minute' where id=$1", [job]);
  const lease = randomUUID();
  row = (await db.query('select * from claim_account_closure_job($1,300)', [lease])).rows[0];
  assert.equal(row.id, job);
  let version = row.version;
  assert.equal((await db.query('select cancel_account_closure_atomic($1) result', [account])).rows[0].result.success, false);
  const prepare = () => db.query('select prepare_closure_domain_cleanup($1,$2,$3) targets', [job, lease, version]);
  const complete = async () => (await db.query("select complete_closure_job($1,$2,$3,'{}') ok", [job, lease, version])).rows[0].ok;
  await assert.rejects(prepare(), /eligibility is invalid/);
  assert.equal(await complete(), false);
  await db.query("update account_closure_jobs set local_disposal_state='completed',auth_cleanup_state='success' where id=$1", [job]);
  for (const [sql, undo] of [
    ["update accounts set legal_hold=true where id=$1", "update accounts set legal_hold=false where id=$1"],
  ]) {
    await db.query(sql, [account]); await assert.rejects(prepare(), /legal hold/); await db.query(undo, [account]);
  }
  await assert.rejects(db.query('select prepare_closure_domain_cleanup($1,$2,$3)', [job, randomUUID(), version]), /eligibility is invalid/);
  await assert.rejects(db.query('select prepare_closure_domain_cleanup($1,$2,$3)', [job, lease, version - 1]), /eligibility is invalid/);
  await db.query("update account_closure_jobs set lease_expires_at=now()-interval '1 second' where id=$1", [job]);
  await assert.rejects(prepare(), /eligibility is invalid/);
  assert.equal(await complete(), false);
  await db.query("update account_closure_jobs set lease_expires_at=now()+interval '5 minutes' where id=$1", [job]);
  passed('disposal, legal hold, expired lease, wrong worker and stale version all block release or completion');

  const targets = (await prepare()).rows[0].targets;
  assert.equal(targets.length, 2);
  const closedSite = (await db.query('select * from sites where id=$1', [site])).rows[0];
  assert.equal(closedSite.custom_domain, null); assert.equal(closedSite.custom_domain_verified_at, null); assert.equal(closedSite.published, false);
  const otherSite = (await db.query('select * from sites where account_id=$1', [neighbor])).rows[0];
  assert.equal(otherSite.custom_domain, 'untouched.contractor.com'); assert.equal(otherSite.published, true); assert(otherSite.custom_domain_verified_at);
  assert.equal(await complete(), false);
  await assert.rejects(db.query("insert into sites(account_id,custom_domain) values($1,'fixture.contractor.com')", [neighbor]), /pending account-closure cleanup/);
  passed('prepare removes only the closed site route; target reservations survive and prevent premature completion');

  assert.equal((await db.query("select update_closure_job_stage($1,$2,$3,'domain_cleanup','retry','provider unavailable') ok", [job, lease, version])).rows[0].ok, true); version++;
  assert.deepEqual((await state(job)).domain_cleanup_targets, targets);
  await prepare();
  assert.equal((await db.query("select update_closure_job_stage($1,$2,$3,'domain_cleanup','success') ok", [job, lease, version])).rows[0].ok, true); version++;
  assert.equal(await complete(), true);
  await assert.rejects(prepare(), /eligibility is invalid/);
  await assert.rejects(db.query("insert into sites(account_id,custom_domain) values($1,'fixture.contractor.com')", [neighbor]), /pending account-closure cleanup/);
  await db.query("update account_closure_jobs set domains_reusable_after=now()-interval '1 second' where id=$1", [job]);
  await db.query("insert into sites(account_id,custom_domain) values($1,'fixture.contractor.com')", [neighbor]);
  passed('retry retains targets; only confirmed domain cleanup completes closure; reuse waits until the previous lease expires');

  // Real concurrent transaction: a binding writer waits for the closing account
  // lock and must see the newly committed closure snapshot before proceeding.
  const racing = (await db.query('insert into accounts default values returning id')).rows[0].id;
  await db.query('begin');
  await db.query("select request_account_closure_atomic($1,null,'admin',null,false,false,false)", [racing]);
  const blockedInsert = assert.rejects(other.query("insert into sites(account_id,custom_domain) values($1,'racing.contractor.com')", [racing]), /closing account/);
  const otherPid = other.processID;
  let observedLock = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const activity = (await db.query('select wait_event_type from pg_stat_activity where pid=$1', [otherPid])).rows[0];
    if (activity?.wait_event_type === 'Lock') { observedLock = true; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert(observedLock, 'The second connection must actually wait on the account lock');
  await db.query('commit'); await blockedInsert;
  passed('concurrent domain enrollment cannot cross the atomic closure snapshot');
  console.log(`${checks}/${checks} checks passed`);
} finally {
  if (other) await other.end(); if (db) await db.end();
  if (process.platform === 'win32' && pg.process) {
    execFileSync(join(root, 'node_modules/@embedded-postgres', platform, 'native/bin/pg_ctl.exe'), ['-D', dataDir, 'stop', '-m', 'fast', '-w'], { windowsHide: true, stdio: 'ignore', timeout: 15000 });
    pg.process = undefined;
  } else await pg.stop();
  const target = resolve(dataDir), allowed = resolve(os.tmpdir()) + sep;
  if (!target.startsWith(allowed) || !target.split(/[\\/]/).pop().startsWith('lgq-closure-domains-')) throw new Error('Unsafe disposable cleanup path');
  rmSync(target, { recursive: true, force: true });
}
