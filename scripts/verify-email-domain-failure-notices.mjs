// Disposable PostgreSQL only. No hosted credentials or actual email sends.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
try { os.userInfo(); } catch { os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null }); syncBuiltinESMExports(); }
const root = resolve(import.meta.dirname, '..');
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
process.env.PATH = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-domain-notices-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54419, persistent: true, onLog: () => {}, onError: () => {} });
let db, other, checks = 0;
const passed = name => { checks++; console.log(`PASS ${name}`); };
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('domain_notices');
  db = pg.getPgClient('domain_notices'); await db.connect();
  other = pg.getPgClient('domain_notices'); await other.connect();
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create table accounts(id uuid primary key default gen_random_uuid());
    create function public.office_can(uuid,text) returns boolean language sql as 'select false';
    grant usage on schema public to anon,authenticated,service_role;`);
  await db.query(readFileSync(join(root, 'migrations/20260907180000_email_sending_domains.sql'), 'utf8'));
  await db.query(readFileSync(join(root, 'migrations/20260909210950_email_sending_domain_account_limit.sql'), 'utf8'));
  await db.query(readFileSync(join(root, 'migrations/20260910120000_email_domain_failure_notices.sql'), 'utf8'));
  await db.query('grant select,insert,update,delete on accounts,email_sending_domains to service_role');
  passed('actual migrations apply to PostgreSQL 17');

  for (const role of ['anon', 'authenticated']) {
    await db.query(`set role ${role}`);
    for (const query of [
      'select * from email_domain_failure_notices',
      "insert into email_domain_failure_notices(account_id,domain) values(gen_random_uuid(),'forbidden.example')",
      "update email_domain_failure_notices set state='resolved' where false",
      'delete from email_domain_failure_notices where false',
      'select * from claim_email_domain_failure_notices(5)',
      "select resolve_email_domain_failure_notice(gen_random_uuid(),gen_random_uuid(),'operator','Verified evidence for this incident')",
    ]) await assert.rejects(db.query(query), /permission denied/);
    await db.query('reset role');
    passed(`${role} cannot read, mutate, claim or resolve private incidents`);
  }
  const [accountA, accountB] = (await db.query('insert into accounts values(default),(default) returning id')).rows;
  const makeDomain = async (name, account) => {
    const accountId = account ?? (await db.query('insert into accounts default values returning id')).rows[0].id;
    return (await db.query("insert into email_sending_domains(account_id,domain,status) values($1,$2,'verified') returning id", [accountId,name])).rows[0].id;
  };
  const downgrade = id => db.query("update email_sending_domains set status='failed',failure_notice_requested_at=clock_timestamp(),failure_reason='DKIM missing' where id=$1",[id]);
  const state = async id => (await db.query('select * from email_domain_failure_notices where id=$1',[id])).rows[0];
  const domain = await makeDomain('one.example', accountA.id);

  await db.query("update email_sending_domains set status='failed' where id=$1",[domain]);
  assert.equal((await db.query('select count(*)::int n from email_domain_failure_notices')).rows[0].n,0);
  await db.query("update email_sending_domains set status='verified' where id=$1",[domain]);
  passed('migration does not enqueue a second notice for the legacy inline sender');

  await db.query('revoke insert on email_domain_failure_notices from service_role');
  await db.query('set role service_role');
  await assert.rejects(downgrade(domain),/permission denied/);
  await db.query('reset role');
  assert.equal((await db.query('select status from email_sending_domains where id=$1',[domain])).rows[0].status,'verified');
  assert.equal((await db.query('select count(*)::int n from email_domain_failure_notices')).rows[0].n,0);
  await db.query('grant insert on email_domain_failure_notices to service_role');
  passed('notice persistence failure rolls back the downgrade instead of losing the alert');

  await downgrade(domain); await downgrade(domain);
  const first = (await db.query('select * from email_domain_failure_notices')).rows;
  assert.equal(first.length,1); assert.equal(first[0].account_id,accountA.id); assert.equal(first[0].state,'pending');
  passed('one technical transition atomically records exactly one owned notice');
  await db.query('set role service_role'); await other.query('set role service_role');
  const claims = await Promise.all([db.query('select * from claim_email_domain_failure_notices(1)'),other.query('select * from claim_email_domain_failure_notices(1)')]);
  assert.equal(claims.flatMap(r=>r.rows).length,1);
  assert.equal((await db.query('select * from claim_email_domain_failure_notices(1)')).rowCount,0);
  passed('concurrent workers have one winner and cannot reclaim an attempted notice');

  await db.query("update email_domain_failure_notices set attempted_at=now()-interval '6 minutes' where id=$1",[first[0].id]);
  assert.equal((await db.query('select * from claim_email_domain_failure_notices(5)')).rowCount,0);
  assert.equal((await state(first[0].id)).state,'manual_review');
  assert.equal((await state(first[0].id)).last_error,'send_outcome_unknown');
  passed('expired sending claim becomes a retained incident rather than a duplicate send');
  assert.equal((await db.query("select resolve_email_domain_failure_notice($1,$2,'operator','Provider inventory inspected; no duplicate submission') ok",[first[0].id,accountB.id])).rows[0].ok,false);
  await assert.rejects(db.query("select resolve_email_domain_failure_notice($1,$2,'operator','done')",[first[0].id,accountA.id]),/evidence are required/);
  assert.equal((await state(first[0].id)).state,'manual_review');
  passed('wrong-account or evidence-free closeout cannot clear the incident');
  const close = () => db.query("select resolve_email_domain_failure_notice($1,$2,'operator','Provider inventory checked; recovery receipt verified') ok",[first[0].id,accountA.id]);
  assert.equal((await close()).rows[0].ok,true); assert.equal((await close()).rows[0].ok,false);
  assert.equal((await state(first[0].id)).last_error,'send_outcome_unknown');
  passed('scoped operator closeout is idempotent and preserves original failure evidence');

  await db.query('reset role');
  for (const condition of ['verified','disabled','deleted']) {
    const id = await makeDomain(`${condition}.example`); await downgrade(id);
    const notice = (await db.query('select id from email_domain_failure_notices where domain_id=$1',[id])).rows[0];
    if (condition==='deleted') await db.query('delete from email_sending_domains where id=$1',[id]);
    else await db.query('update email_sending_domains set status=$2 where id=$1',[id,condition]);
    assert.equal((await db.query('select * from claim_email_domain_failure_notices(5)')).rowCount,0);
    assert.equal((await state(notice.id)).state,'cancelled');
    passed(`unsent notice is cancelled after domain ${condition}`);
  }
  await db.query("update email_sending_domains set status='verified' where id=$1",[domain]); await downgrade(domain);
  assert.equal((await db.query('select count(*)::int n from email_domain_failure_notices where domain_id=$1',[domain])).rows[0].n,2);
  passed('a later distinct breakage creates a new notice while retaining the reviewed incident');
  const otherDomain=await makeDomain('other.example',accountB.id); await downgrade(otherDomain);
  await db.query('delete from accounts where id=$1',[accountA.id]);
  assert.equal((await db.query('select count(*)::int n from email_domain_failure_notices where account_id=$1',[accountA.id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from email_domain_failure_notices where account_id=$1',[accountB.id])).rows[0].n,1);
  passed('account cleanup stays scoped and preserves another workspace notice');
  console.log(`${checks}/${checks} checks passed`);
} finally {
  if (other) await other.end(); if (db) await db.end();
  if (process.platform === 'win32' && pg.process) {
    execFileSync(join(root,'node_modules/@embedded-postgres',platform,'native/bin/pg_ctl.exe'),['-D',dataDir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'ignore',timeout:15000});
    pg.process=undefined;
  } else await pg.stop();
  const target=resolve(dataDir), allowed=resolve(os.tmpdir())+sep;
  if (!target.startsWith(allowed) || !target.split(/[\\/]/).pop().startsWith('lgq-domain-notices-')) throw new Error('Unsafe disposable cleanup path');
  rmSync(target,{recursive:true,force:true});
}
