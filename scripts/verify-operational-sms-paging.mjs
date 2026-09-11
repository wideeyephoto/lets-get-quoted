import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
try { os.userInfo(); } catch { os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null }); syncBuiltinESMExports(); }
const root=resolve(import.meta.dirname,'..');
const platform=process.platform==='win32'?'windows-x64':process.platform==='darwin'?'darwin-arm64':'linux-x64';
process.env.PATH=join(root,'node_modules/@embedded-postgres',platform,'native/bin')+(process.platform==='win32'?';':':')+process.env.PATH;
const {default:EmbeddedPostgres}=await import('embedded-postgres');
const dataDir=mkdtempSync(join(os.tmpdir(),'lgq-ops-sms-'));
const pg=new EmbeddedPostgres({databaseDir:dataDir,user:'postgres',password:'postgres',port:54427,persistent:true,onLog:()=>{},onError:()=>{}});
let db,other;
try {
  await pg.initialise();await pg.start();await pg.createDatabase('ops');db=pg.getPgClient('ops');await db.connect();
  await db.query('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role');
  await db.query(readFileSync(join(root,'migrations/20260909200503_operational_sms_paging.sql'),'utf8'));
  await db.query('set role anon');await assert.rejects(db.query('select * from operational_sms_pages'),/permission denied/);await db.query('reset role');
  await db.query('set role authenticated');await assert.rejects(db.query('select * from operational_sms_pages'),/permission denied/);await db.query('reset role');
  await db.query('set role service_role');other=pg.getPgClient('ops');await other.connect();await other.query('set role service_role');
  const insert="insert into operational_sms_pages(page_key,recipient,sender,body) values('same-page','+15555550123','+15555550124','Recovery context')";
  const race=await Promise.allSettled([db.query(insert),other.query(insert)]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.code==='23505').length,1);
  await db.query("update operational_sms_pages set provider_id='one',state='accepted' where page_key='same-page'");
  await assert.rejects(db.query("update operational_sms_pages set recipient='+15555550125'"),/identity is immutable/);
  await assert.rejects(db.query("update operational_sms_pages set provider_id='two'"),/identity is immutable/);
  await assert.rejects(db.query('delete from operational_sms_pages'),/permission denied/);
  await db.query("update operational_sms_pages set state='delivered',delivered_at=now() where page_key='same-page'");
  await assert.rejects(db.query('update operational_sms_pages set delivered_at=null'),/identity is immutable/);
  console.log('PASS 7 PostgreSQL checks: anonymous/authenticated denial, concurrent one-winner insert, immutable recipient/provider/delivery evidence, deletion denied.');
} finally {
  await other?.end();await db?.end();
  if(process.platform==='win32'&&pg.process){
    execFileSync(join(root,'node_modules/@embedded-postgres',platform,'native/bin/pg_ctl.exe'),['-D',dataDir,'stop','-m','fast','-w'],{windowsHide:true,stdio:'ignore',timeout:15000});
    pg.process=undefined;
  }else await pg.stop();
}
