// Real disposable PostgreSQL 17. No hosted URL, credentials, provider, or .env.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
try { os.userInfo(); } catch { os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null }); syncBuiltinESMExports(); }
const root = resolve(import.meta.dirname, '..');
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
const bin = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin');
process.env.PATH = bin + (process.platform === 'win32' ? ';' : ':') + process.env.PATH;
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const port = await new Promise((done, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); }); });
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-office-boundary-'));
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: randomUUID(), port,
  persistent: true, onLog: () => {}, onError: () => {}, postgresFlags: ['-h', '127.0.0.1'] });
const schema = readFileSync(join(root, 'schema.sql'), 'utf8');
const source = file => readFileSync(join(root, 'migrations', file), 'utf8');
const repair = source('20260911154456_repair_office_job_write_boundary.sql');
const reads = source('20260911154457_enforce_office_job_read_boundary.sql');
const broken = source('20260911000000_office_data_api_security.sql');
const section = (text, start, end) => { const a = text.indexOf(start), b = text.indexOf(end, a); assert(a >= 0 && b > a, `Missing SQL anchors ${start}`); return text.slice(a,b); };
const fn = name => { const r = new RegExp(`create or replace function (?:public\\.)?${name}\\([\\s\\S]*?as (\\$[\\w]*\\$)[\\s\\S]*?\\1;`, 'i'); const found = schema.match(r); assert(found, `Missing actual schema function ${name}`); return found[0]; };
const policies = [...schema.matchAll(/create policy job_owner_\w+ on public\.jobs[\s\S]*?;/g)].map(m => m[0]).join('\n');
assert.equal((policies.match(/create policy/g) || []).length, 4);
const [a,b,owner,office,crew,clientA,clientB,jobA,jobB] = Array.from({length:9},randomUUID);
let db, checks = 0;
const q = (sql, args=[]) => db.query(sql,args);
const pass = name => { checks++; console.log('PASS '+name); };
async function actor(role, user, task) {
  await q('begin');
  try { await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role, ...(user ? {sub:user} : {})})]); await q(`set local role ${role}`); return await task(); }
  finally { await q('rollback'); }
}
async function deny(role,user,sql,args=[]) {
  await actor(role,user,() => assert.rejects(q(sql,args), e => ['42501','23503'].includes(e.code)));
}
const update = 'update jobs set quoted_amount=77777 where id=$1 returning quoted_amount';
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('office_boundary');
  db = pg.getPgClient('office_boundary'); await db.connect();
  const version = Number((await q("select current_setting('server_version_num') v")).rows[0].v);
  assert(version >= 170000 && version < 180000, 'PostgreSQL 17 required');
  await q(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create table accounts(id uuid primary key,suspended_at timestamptz);
    create table memberships(account_id uuid,user_id uuid,role text,deactivated_at timestamptz);
    create table office_capabilities(capability text primary key,enabled boolean);
    create table office_member_capabilities(account_id uuid,user_id uuid,capability text);
    create table crew(id uuid primary key,account_id uuid,user_id uuid);
    create table crew_assignments(job_id uuid,crew_id uuid);
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  for (const name of ['job_status','lead_source']) { const t = schema.match(new RegExp(`create type ${name} as enum [^;]+;`)); assert(t); await q(t[0]); }
  // Actual jobs/client columns, defaults and constraints; real authorization
  // helper bodies and RLS statements. Only unrelated lookup fixtures are minimal.
  await q(section(schema,'create table if not exists jobs (','-- Set when a client texts'));
  for (const match of schema.matchAll(/alter table jobs add column if not exists reschedule_discount_\w+ [^;]+;/g)) await q(match[0]);
  for (const name of ['is_owner','is_office','is_crew','crew_on_job','office_can','crew_jobs_update_guard']) await q(fn(name));
  await q(`alter table jobs enable row level security;
    create policy job_crew_read on jobs for select using(crew_on_job(id));
    create trigger crew_jobs_update_guard before update on jobs for each row execute function crew_jobs_update_guard();
    ${policies}`);
  await q('insert into accounts values($1,null),($2,null)',[a,b]);
  await q("insert into memberships values($1,$2,'owner',null),($1,$3,'office',null),($1,$4,'crew',null)",[a,owner,office,crew]);
  await q("insert into office_capabilities values('jobs.read',true),('jobs.write',true),('quotes.read',true),('quotes.write',true),('reports.read',true)");
  await q("insert into office_member_capabilities values($1,$2,'jobs.read'),($1,$2,'jobs.write')",[a,office]);
  await q("insert into clients(id,account_id,name) values($1,$2,'A'),($3,$4,'B')",[clientA,a,clientB,b]);
  await q("insert into jobs(id,account_id,client_id,ref,client_name,quoted_amount,quote_items) values($1,$2,$3,'A','A',12345,'[{\"price\":12345}]'),($4,$5,$6,'B','B',54321,'[]')",[jobA,a,clientA,jobB,b,clientB]);
  await actor('authenticated',office,async()=> {
    assert.equal((await q('select quoted_amount from jobs where id=$1',[jobA])).rows[0].quoted_amount,'12345.00');
    assert.equal((await q(update,[jobA])).rowCount,1);
    assert.equal((await q('update jobs set client_id=$1 where id=$2 returning id',[clientB,jobA])).rowCount,1);
  });
  pass('unfixed real RLS model reproduces all three reported vulnerabilities');
  await q(broken);
  await deny('service_role',null,update,[jobA]);
  await actor('authenticated',office,async()=>{
    assert.equal((await q('select quoted_amount from jobs where id=$1',[jobA])).rows[0].quoted_amount,'12345.00');
    assert.equal((await q("insert into jobs(account_id,ref,client_name,quoted_amount) values($1,'ATTACK','A',77777) returning id",[a])).rowCount,1);
  });
  await deny('authenticated',office,update,[jobA]);
  await deny('authenticated',office,'update jobs set client_id=$1 where id=$2',[clientB,jobA]);
  pass('deployed migration reproduces service-role regression, financial disclosure and priced INSERT bypass');
  await assert.rejects(q(broken),e=>e.code==='42710'); await q('rollback');
  assert.equal((await q("select count(*)::int n from pg_proc where proname in ('jobs_finance_guard','jobs_client_tenancy_guard') and prosecdef and proconfig is null")).rows[0].n,2);
  pass('old migration replay fails and both old definer functions lack search_path');
  await q(repair); await q(repair);
  await actor('service_role',null,async()=>assert.equal((await q(update,[jobA])).rows[0].quoted_amount,'77777.00'));
  pass('phase one replays safely and restores service-role price writes before app deployment');
  await q(reads); await q(reads);
  for(const role of ['anon','authenticated']) {
    for(const sql of ['select quoted_amount from jobs','select quote_items from jobs','select * from jobs','select to_jsonb(jobs) from jobs','select count(*) from jobs where quoted_amount>0','truncate jobs cascade']) await deny(role,role==='authenticated'?office:null,sql);
  }
  pass('raw financial projections, wildcard, JSON, filter oracle and TRUNCATE are denied');
  await actor('authenticated',office,async()=> {
    const rows=(await q('select id,quoted_amount,quote_items from job_access')).rows;
    assert.deepEqual(rows,[{id:jobA,quoted_amount:'0.00',quote_items:null}]);
    assert.equal((await q("update job_access set scope='operational edit' where id=$1 returning quoted_amount",[jobA])).rowCount,1);
  });
  assert.equal((await q('select quoted_amount from jobs where id=$1',[jobA])).rows[0].quoted_amount,'12345.00');
  pass('office operational reads/writes succeed without disclosing or overwriting masked values');
  for(const table of ['jobs','job_access']) {
    for(const payload of ['quoted_amount=77777',"quote_items='[]'::jsonb","deposit_gate='before_work'","reschedule_discount_percent=12","reschedule_discount_note='private'","reschedule_discount_agreed_at=now()","quote_signer_name='forged'","quote_signed_at=now()","quote_signature_path='forged'","quote_signature_method='typed'"]) await deny('authenticated',office,`update ${table} set ${payload} where id=$1`,[jobA]);
    await deny('authenticated',office,`insert into ${table}(account_id,ref,client_name,quoted_amount) values($1,'ATTACK','A',77777)`,[a]);
    await deny('authenticated',office,`delete from ${table} where id=$1`,[jobA]);
    await deny('authenticated',office,`update ${table} set client_id=$1 where id=$2`,[clientB,jobA]);
    await deny('authenticated',office,`insert into ${table}(account_id,ref,client_name,client_id) values($1,'FOREIGN','A',$2)`,[a,clientB]);
  }
  await deny('authenticated',office,"insert into jobs(id,account_id,ref,client_name,quoted_amount) values($1,$2,'A','A',77777) on conflict(id) do update set quoted_amount=excluded.quoted_amount",[jobA,a]);
  await deny('authenticated',office,"insert into jobs(id,account_id,ref,client_name,client_id) values($1,$2,'A','A',$3) on conflict(id) do update set client_id=excluded.client_id",[jobA,a,clientB]);
  pass('every financial field, priced INSERT, UPSERT, delete/reinsert and foreign parent mutation is blocked');
  await actor('authenticated',office,async()=> {
    const id=(await q("insert into job_access(account_id,ref,client_name) values($1,'ZERO','A') returning id",[a])).rows[0].id;
    assert.equal((await q('delete from job_access where id=$1 returning id',[id])).rowCount,1);
  });
  for(const role of ['authenticated','service_role']) await actor(role,role==='authenticated'?owner:null,async()=> {
    assert.equal((await q('select quoted_amount from job_access where id=$1',[jobA])).rows[0].quoted_amount,'12345.00');
    assert.equal((await q('update job_access set quoted_amount=222 where id=$1 returning quoted_amount',[jobA])).rows[0].quoted_amount,'222.00');
    assert.equal((await q("insert into job_access(account_id,ref,client_name,quoted_amount) values($1,'PRICE','A',333) returning quoted_amount",[a])).rows[0].quoted_amount,'333.00');
  });
  pass('default-zero office create/delete, owner writes and service-role reads/writes remain functional');
  for(const cap of ['quotes.read','reports.read']) {
    await q('insert into office_member_capabilities values($1,$2,$3)',[a,office,cap]);
    await actor('authenticated',office,async()=>assert.equal((await q('select quoted_amount from job_access where id=$1',[jobA])).rows[0].quoted_amount,'12345.00'));
    await q('delete from office_member_capabilities where capability=$1',[cap]);
    await actor('authenticated',office,async()=>assert.equal((await q('select quoted_amount from job_access where id=$1',[jobA])).rows[0].quoted_amount,'0.00'));
  }
  await q("insert into office_member_capabilities values($1,$2,'quotes.write')",[a,office]);
  await actor('authenticated',office,async()=>assert.equal((await q('update jobs set quoted_amount=555 where id=$1 returning id',[jobA])).rowCount,1));
  await q("delete from office_member_capabilities where capability='quotes.write'");
  pass('live capability grants and revocations independently govern finance reads and writes');
  await q("insert into memberships values($1,$2,'owner',null)",[b,office]);
  await actor('authenticated',office,async()=>assert.deepEqual((await q('select quoted_amount from job_access order by ref')).rows.map(r=>r.quoted_amount),['0.00','54321.00']));
  await deny('authenticated',office,'update jobs set account_id=$1,client_id=$2 where id=$3',[b,clientB,jobA]);
  await q('update memberships set deactivated_at=now() where account_id=$1 and user_id=$2',[a,office]);
  await actor('authenticated',office,async()=>assert.equal((await q('select id from job_access where id=$1',[jobA])).rowCount,0));
  await actor('authenticated',null,async()=>assert.equal((await q('select id from job_access')).rowCount,0));
  pass('dual-workspace permissions, immutable identity, deactivation and missing identity fail closed');
  const view=(await q("select reloptions from pg_class where oid='job_access'::regclass")).rows[0];
  assert(view.reloptions.includes('security_invoker=true')); assert(view.reloptions.includes('security_barrier=true'));
  assert.equal((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('job_quote_values','guard_job_protected_fields','write_job_access') and proconfig is null")).rows[0].n,0);
  assert.equal((await q("select count(*)::int n from pg_proc where proname in ('jobs_finance_guard','jobs_client_tenancy_guard')")).rows[0].n,0);
  assert.equal((await q("select count(*)::int n from pg_constraint where conrelid='jobs'::regclass and confrelid='clients'::regclass")).rows[0].n,1);
  await q('delete from clients where id=$1',[clientA]);
  assert.deepEqual((await q('select account_id,client_id from jobs where id=$1',[jobA])).rows[0],{account_id:a,client_id:null});
  pass('actual catalog verifies invoker view, pinned functions, one composite FK and safe client deletion');
  console.log(`${checks}/${checks} PostgreSQL 17 boundary checks passed`);
} finally {
  if(db) await db.end();
  if(process.platform==='win32' && pg.process) { execFileSync(join(bin,'pg_ctl.exe'),['-D',dataDir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'ignore',timeout:15000}); pg.process=undefined; }
  else await pg.stop();
  const target=resolve(dataDir), allowed=resolve(os.tmpdir())+sep;
  if(!target.startsWith(allowed)||!target.split(/[\\/]/).pop().startsWith('lgq-office-boundary-')) throw new Error('Unsafe disposable cleanup path');
  rmSync(target,{recursive:true,force:true});
}
