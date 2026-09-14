/** Verify idempotent, serialized no-show enforcement on disposable PostgreSQL 17. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

try { os.userInfo(); } catch (error) {
  if (process.platform !== 'win32' || error?.code !== 'ERR_SYSTEM_ERROR') throw error;
  os.userInfo = () => ({ uid:-1,gid:-1,username:process.env.USERNAME || 'windows-user',homedir:process.env.USERPROFILE || '',shell:null });
  syncBuiltinESMExports();
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const platform of ['windows-x64','linux-x64','darwin-arm64']) {
  process.env.PATH = `${join(repo,'node_modules','@embedded-postgres',platform,'native','bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}
const databaseDir = mkdtempSync(join(tmpdir(),'lgq-quick-stop-enforcement-'));
assert(resolve(databaseDir).startsWith(`${resolve(tmpdir())}${sep}lgq-quick-stop-enforcement-`));
const postgres = new EmbeddedPostgres({ databaseDir,user:'postgres',password:'postgres',port:Number(process.env.LGQ_QUICK_STOP_ENFORCEMENT_PORT || 54425),persistent:true,onLog(){},onError(){} });
let client;
let other;
let checks = 0;
const account = '10000000-0000-4000-8000-000000000001';
const otherAccount = '10000000-0000-4000-8000-000000000002';
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase('quick_stop_enforcement');
  client=postgres.getPgClient('quick_stop_enforcement'); other=postgres.getPgClient('quick_stop_enforcement');
  await client.connect(); await other.connect();
  const q=(sql,values)=>client.query(sql,values);
  await q(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.accounts(id uuid primary key,extra_stop_locked_until timestamptz,extra_stop_lock_reason text);
    create table public.extra_stop_requests(id uuid primary key,account_id uuid not null,status text,no_show_confirmed_at timestamptz);
    grant select,insert,update on all tables in schema public to service_role;`);
  await q(readFileSync(join(repo,'migrations/20260914134359_quick_stop_no_show_lock.sql'),'utf8'));
  await q('insert into public.accounts(id) values($1),($2)',[account,otherAccount]);
  const reset=async()=>{ await q('truncate public.quick_stop_no_show_enforcements,public.extra_stop_requests'); await q('update public.accounts set extra_stop_locked_until=null,extra_stop_lock_reason=null'); };
  const seed=(n,at,status='no_show_confirmed',connection=client)=>connection.query('insert into public.extra_stop_requests values($1,$2,$3,$4)',[id(n),account,status,at]);
  const apply=async(n,connection=client,accountId=account)=>(await connection.query('select public.apply_quick_stop_no_show_lock($1,$2) as result',[accountId,id(n)])).rows[0].result;
  const lock=async()=>(await q('select extra_stop_locked_until,extra_stop_lock_reason from public.accounts where id=$1',[account])).rows[0];
  const anchor=Date.now()-60_000;
  const date=(days=0)=>new Date(anchor+days*86_400_000).toISOString();

  await seed(1,date());
  const first=await apply(1);
  assert.equal(first.tier,1); assert.equal(first.priorNoShows,0); assert.equal(first.changed,true);
  assert.equal(new Date(first.untilIso).getTime(),anchor+10*86_400_000);
  const replay=await apply(1);
  assert.equal(replay.changed,false); assert.equal(replay.untilIso,first.untilIso);
  await q('update public.accounts set extra_stop_locked_until=null,extra_stop_lock_reason=null where id=$1',[account]);
  assert.equal((await apply(1)).changed,false);
  assert.equal((await lock()).extra_stop_locked_until,null);
  checks+=8;

  await reset();
  await seed(1,date(-20),'refunded'); await seed(2,date(),'no_show_confirmed');
  const second=await apply(2);
  assert.equal(second.tier,2); assert.equal(second.priorNoShows,1);
  assert.equal(new Date(second.untilIso).getTime(),anchor+30*86_400_000);
  checks+=3;

  await reset();
  await seed(1,date(-170),'refunded'); await seed(2,date(-100),'disputed'); await seed(3,date());
  const third=await apply(3);
  assert.equal(third.tier,3); assert.equal(third.priorNoShows,2);
  assert.equal(new Date(third.untilIso).getTime(),anchor+3650*86_400_000);
  checks+=3;

  await reset();
  await seed(1,date(-181),'refunded'); await seed(2,date(-200),'disputed'); await seed(3,date());
  assert.equal((await apply(3)).tier,1);
  await assert.rejects(apply(3,client,otherAccount),/confirmed no-show/);
  await seed(4,date(1));
  await assert.rejects(apply(4),/confirmed no-show/);
  checks+=3;

  await reset(); await seed(1,date());
  const manualUntil=date(4000);
  await q('update public.accounts set extra_stop_locked_until=$2,extra_stop_lock_reason=$3 where id=$1',[account,manualUntil,'Manual enforcement pending review']);
  const kept=await apply(1);
  assert.equal(kept.changed,false);
  assert.equal(new Date(kept.untilIso).toISOString(),manualUntil);
  assert.equal(kept.reason,'Manual enforcement pending review');
  assert.equal((await q('select count(*)::integer n from public.quick_stop_no_show_enforcements')).rows[0].n,1);
  checks+=4;

  await reset(); await seed(1,date(-1)); await seed(2,date());
  await q('begin');
  const newest=await apply(2);
  const otherPid=(await other.query('select pg_backend_pid() pid')).rows[0].pid;
  let resolved=false;
  const older=apply(1,other).then(result=>{resolved=true;return result;});
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(resolved,false);
  assert((await q('select cardinality(pg_blocking_pids($1)) n',[otherPid])).rows[0].n>0);
  await q('commit');
  const olderResult=await older;
  assert.equal(olderResult.changed,false);
  assert.equal(olderResult.tier,2);
  assert.equal((await lock()).extra_stop_locked_until.toISOString(),new Date(newest.untilIso).toISOString());
  checks+=5;

  // An earlier report may commit AFTER a later report was already enforced.
  await reset();
  await other.query('begin'); await seed(1,date(-1),'no_show_confirmed',other);
  await seed(2,date()); assert.equal((await apply(2)).tier,1);
  await other.query('commit');
  const delayed=await apply(1);
  assert.equal(delayed.tier,2); assert.equal(delayed.changed,true);
  assert.equal(new Date(delayed.untilIso).getTime(),anchor+30*86_400_000);
  checks+=4;

  await reset(); await seed(1,date());
  await q(`create function public.fail_enforcement_marker() returns trigger language plpgsql as $$ begin raise exception 'marker unavailable'; end $$;
    create trigger fail_enforcement_marker before insert on public.quick_stop_no_show_enforcements for each row execute function public.fail_enforcement_marker();`);
  await assert.rejects(apply(1),/marker unavailable/);
  assert.equal((await lock()).extra_stop_locked_until,null);
  await q('drop trigger fail_enforcement_marker on public.quick_stop_no_show_enforcements');
  checks+=2;

  for(const role of ['anon','authenticated']) {
    assert.equal((await q("select has_function_privilege($1,'public.apply_quick_stop_no_show_lock(uuid,uuid)','execute') allowed",[role])).rows[0].allowed,false);
    assert.equal((await q("select has_table_privilege($1,'public.quick_stop_no_show_enforcements','insert') allowed",[role])).rows[0].allowed,false);
    checks+=2;
  }
  assert.equal((await q("select relrowsecurity from pg_class where oid='public.quick_stop_no_show_enforcements'::regclass")).rows[0].relrowsecurity,true);
  await q('set role service_role'); assert.equal((await apply(1)).changed,true); await q('reset role');
  checks+=2;
  console.log(`Quick Stop no-show enforcement: ${checks} PostgreSQL assertions passed.`);
} finally {
  await other?.query('rollback').catch(()=>{}); await client?.query('rollback').catch(()=>{});
  await other?.end().catch(()=>{}); await client?.end().catch(()=>{});
  if(process.platform==='win32' && postgres.process?.exitCode===null) {
    await promisify(execFile)(join(repo,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),['stop','-D',databaseDir,'-m','fast','-w','-t','8'],{windowsHide:true,timeout:10_000});
    postgres.process=undefined;
  } else await postgres.stop().catch(()=>{});
  try { rmSync(databaseDir,{recursive:true,force:true,maxRetries:10,retryDelay:100}); } catch { console.warn(`Temporary PostgreSQL files remain at ${databaseDir}`); }
}
