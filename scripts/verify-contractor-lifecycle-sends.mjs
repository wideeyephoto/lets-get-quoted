// Disposable PostgreSQL 17, synthetic identities, no hosted credentials/sends.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:net';
try { os.userInfo(); } catch { os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null }); syncBuiltinESMExports(); }
const root = resolve(import.meta.dirname, '..');
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
process.env.PATH = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-lifecycle-sends-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: () => {}, onError: () => {} });
let db, other, checks = 0;
const passed = name => { checks++; console.log(`PASS ${name}`); };
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('lifecycle');
  db = pg.getPgClient('lifecycle'); await db.connect();
  other = pg.getPgClient('lifecycle'); await other.connect();
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table accounts(id uuid primary key default gen_random_uuid(),test_marker text,suspended_at timestamptz,connect_onboarded boolean default false);
    create table owners(account_id uuid references accounts(id) on delete cascade,email text);
    create table account_events(account_id uuid,kind text,meta jsonb,created_at timestamptz default now());
    create table email_suppression(account_id uuid,email text);
    create table jobs(account_id uuid,quoted_amount numeric);
    create function owner_emails_for_accounts(ids uuid[]) returns table(account_id uuid,email text)
      language sql set search_path='' as 'select account_id,email from public.owners where account_id=any(ids)';
    grant all on accounts,owners,account_events,email_suppression,jobs to service_role;`);
  const migration = readFileSync(join(root, 'migrations/20260914145808_contractor_lifecycle_send_ledger.sql'), 'utf8');
  const schema = readFileSync(join(root, 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(schema.includes(migration.replace(/\r\n/g, '\n').trim()), 'fresh schema must include the exact migration');
  await db.query(migration);
  passed('actual migration applies to PostgreSQL 17');

  const signatures = [
    'claim_contractor_lifecycle_send(uuid,text,jsonb,text)',
    'finish_contractor_lifecycle_send(uuid,uuid,uuid,text,text)',
    'confirm_contractor_lifecycle_send(uuid,uuid,text,text)',
    'resolve_contractor_lifecycle_send(uuid,uuid,text,text,text)',
  ];
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("select has_table_privilege($1,'contractor_lifecycle_sends','select,insert,update,delete') ok", [role])).rows[0].ok, false);
    for (const signature of signatures) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok', [role, signature])).rows[0].ok, false);
    await db.query(`set role ${role}`);
    await assert.rejects(db.query('select * from contractor_lifecycle_sends'), /permission denied/);
    await db.query('reset role');
    passed(`${role} cannot access ledger or any worker/operator RPC`);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='contractor_lifecycle_sends'::regclass")).rows[0].relrowsecurity, true);
  for (const signature of signatures) {
    const row = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0];
    assert.equal(row.prosecdef, false);
    assert.ok(row.proconfig.some(value => value.startsWith('search_path=')));
  }
  passed('RLS enabled, invoker rights and fixed search paths verified');
  await db.query('set role service_role'); await other.query('set role service_role');
  const account = async () => {
    const id = (await db.query('insert into accounts default values returning id')).rows[0].id;
    await db.query("insert into owners values($1,'owner@example.com')", [id]);
    return id;
  };
  const payload = subject => ({ from: 'LGQ <hello@letsgetquoted.com>', to: 'owner@example.com', subject,
    html: '<p>Original</p>', tags: [{ name: 'kind', value: 'contractor_lifecycle' }] });
  const claim = async (client, id, step = 'welcome_day0', message = payload('Welcome'), scope = 'a'.repeat(64)) =>
    (await client.query('select claim_contractor_lifecycle_send($1,$2,$3,$4) result', [id, step, message, scope])).rows[0].result;
  const finish = async (id, claim, provider = null) => (await db.query('select finish_contractor_lifecycle_send($1,$2,$3,$4,$5) ok',
    [claim.id, id, claim.token, provider, provider ? null : 'timeout'])).rows[0].ok;
  const state = async id => (await db.query('select * from contractor_lifecycle_sends where id=$1', [id])).rows[0];
  const a = await account();
  const concurrent = await Promise.all([claim(db, a), claim(other, a)]);
  assert.deepEqual(concurrent.map(row => row.action).sort(), ['busy', 'send']);
  const first = concurrent.find(row => row.action === 'send');
  assert.equal((await claim(db, a, 'nudge_zero_quotes')).action, 'blocked');
  const crossStepAccount = await account();
  const crossStep = await Promise.all([
    claim(db, crossStepAccount, 'welcome_day0'),
    claim(other, crossStepAccount, 'nudge_zero_quotes'),
  ]);
  assert.deepEqual(crossStep.map(row => row.action).sort(), ['blocked', 'send']);
  passed('concurrent same-step and different-step workers have one sending winner');
  assert.equal(first.payload.tags.at(-1).value, first.id);
  assert.equal(first.payload.tags.find(tag => tag.name === 'account_id').value, a);
  assert.equal(await finish(a, first), true);
  assert.equal((await claim(db, a)).action, 'busy');
  await db.query("update contractor_lifecycle_sends set next_retry_at=now()-interval '1 minute' where id=$1", [first.id]);
  const retry = await claim(db, a, 'welcome_day0', payload('Changed template'));
  assert.equal(retry.action, 'send'); assert.equal(retry.key, first.key);
  assert.deepEqual(retry.payload, first.payload); assert.notEqual(retry.token, first.token);
  assert.equal(retry.retry_before, first.retry_before);
  assert.equal(await finish(a, first, 'stale-worker'), false);
  passed('retry preserves payload/key/deadline, respects backoff and fences stale workers');
  assert.equal(await finish(a, retry, 'accepted-a'), true);
  assert.equal((await claim(db, a)).action, 'already_sent');
  assert.equal((await claim(db, a, 'quote_speed_day2')).action, 'blocked');
  await db.query("update contractor_lifecycle_sends set first_attempt_at=now()-interval '10 days',accepted_at=now()-interval '3 days' where id=$1", [first.id]);
  assert.equal((await claim(db, a)).action, 'already_sent');
  passed('acceptance survives missing activity logs and provider key expiry; cadence is durable');

  const b = await account(); const lost = await claim(db, b);
  await db.query("update contractor_lifecycle_sends set lease_until=now()-interval '1 minute' where id=$1", [lost.id]);
  assert.equal((await claim(db, b)).action, 'send');
  await db.query("update contractor_lifecycle_sends set first_attempt_at=now()-interval '24 hours' where id=$1", [lost.id]);
  assert.equal((await claim(db, b)).action, 'review');
  assert.equal((await state(lost.id)).state, 'manual_review');
  assert.equal((await claim(db, b, 'another_step')).action, 'review');
  passed('expired leases recover within window and escalate outside it without a new key');
  const confirm = (id, accountId, recipient = 'owner@example.com', provider = 'accepted-b') =>
    db.query('select confirm_contractor_lifecycle_send($1,$2,$3,$4) ok', [id, accountId, recipient, provider]);
  assert.equal((await confirm(lost.id, a)).rows[0].ok, false);
  assert.equal((await confirm(lost.id, b, 'another@example.com')).rows[0].ok, false);
  assert.equal((await confirm(lost.id, b)).rows[0].ok, true);
  assert.equal((await confirm(lost.id, b)).rows[0].ok, true);
  assert.equal((await confirm(lost.id, b, 'owner@example.com', 'different-id')).rows[0].ok, false);
  assert.equal((await claim(db, b)).action, 'already_sent');
  passed('late callback recovers lost acceptance with exact tenant, recipient and provider binding');

  const c = await account(); let bounded = await claim(db, c);
  for (let i = 1; i <= 3; i++) {
    assert.equal(await finish(c, bounded), true);
    await db.query("update contractor_lifecycle_sends set next_retry_at=now()-interval '1 minute' where id=$1", [bounded.id]);
    const next = await claim(db, c);
    if (i < 3) { assert.equal(next.action, 'send'); bounded = next; }
    else assert.equal(next.action, 'review');
  }
  assert.equal((await state(bounded.id)).attempts, 3);
  passed('attempt count is capped independently of the 23-hour window');
  const changedProvider = await account(); const providerClaim = await claim(db, changedProvider);
  await finish(changedProvider, providerClaim);
  assert.equal((await claim(db, changedProvider, 'welcome_day0', payload('Welcome'), 'b'.repeat(64))).action, 'review');
  assert.equal((await state(providerClaim.id)).attempts, 1);
  passed('provider credential changes cannot replay a key in another provider workspace');
  const resolveIntent = (accountId, evidence) => db.query('select resolve_contractor_lifecycle_send($1,$2,$3,$4) ok', [bounded.id, accountId, 'operator', evidence]);
  await assert.rejects(resolveIntent(c, 'done'), /evidence are required/);
  assert.equal((await resolveIntent(a, 'Provider and recipient records reviewed; cancel follow-up.')).rows[0].ok, false);
  assert.equal((await resolveIntent(c, 'Provider and recipient records reviewed; cancel follow-up.')).rows[0].ok, true);
  assert.equal((await state(bounded.id)).state, 'cancelled');
  assert.notEqual((await claim(db, c)).action, 'send');
  passed('operator closeout requires account and retained evidence, and cannot re-arm a send');

  const d = await account();
  await db.query("insert into account_events(account_id,kind,meta,created_at) values($1,'contractor_lifecycle_email_sent','{\"step_id\":\"welcome_day0\"}',now()-interval '3 days')", [d]);
  assert.equal((await claim(db, d)).action, 'already_sent');
  await db.query("insert into email_suppression values($1,'owner@example.com')", [d]);
  assert.equal((await claim(db, d, 'quote_speed_day2')).action, 'blocked');
  const e = await account();
  assert.equal((await claim(db, e, 'welcome_day0', { ...payload('X'), to: 'not-owner@example.com' })).action, 'blocked');
  await db.query('update accounts set connect_onboarded=true where id=$1', [e]);
  assert.equal((await claim(db, e, 'nudge_incomplete_stripe')).action, 'blocked');
  await db.query('insert into jobs values($1,100)', [e]);
  assert.equal((await claim(db, e, 'nudge_zero_quotes')).action, 'blocked');
  await db.query('update accounts set suspended_at=now() where id=$1', [e]);
  assert.equal((await claim(db, e)).action, 'blocked');
  passed('legacy sends, suppression, owner changes, completed milestones and suspension are rechecked');
  await db.query('delete from accounts where id=$1', [a]);
  assert.equal((await db.query('select count(*)::int n from contractor_lifecycle_sends where account_id=$1', [a])).rows[0].n, 0);
  assert.equal((await state(lost.id)).account_id, b);
  passed('account cleanup cascades only its own ledger');
  if (process.env.LGQ_SUPABASE_CLI) {
    await db.query('reset role');
    const output = execFileSync(process.env.LGQ_SUPABASE_CLI, ['db', 'advisors', '--db-url',
      `postgresql://postgres:postgres@127.0.0.1:${port}/lifecycle?sslmode=disable`, '--type', 'security', '--level', 'warn', '--fail-on', 'none'],
    { windowsHide: true, encoding: 'utf8', timeout: 30000 });
    console.log(output);
  }
  console.log(`${checks}/${checks} PostgreSQL checks passed`);
} finally {
  if (other) await other.end(); if (db) await db.end();
  if (process.platform === 'win32' && pg.process) {
    execFileSync(join(root, 'node_modules/@embedded-postgres', platform, 'native/bin/pg_ctl.exe'), ['-D', dataDir, 'stop', '-m', 'fast', '-w'], { windowsHide: true, stdio: 'ignore', timeout: 15000 });
    pg.process = undefined;
  } else await pg.stop();
  const target = resolve(dataDir), allowed = resolve(os.tmpdir()) + sep;
  if (!target.startsWith(allowed) || !target.split(/[\\/]/).pop().startsWith('lgq-lifecycle-sends-')) throw new Error('Unsafe disposable cleanup path');
  rmSync(target, { recursive: true, force: true });
}
