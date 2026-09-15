#!/usr/bin/env node
// Hosted Supabase restore: keep platform DDL, restore application DDL and data.
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { assertScratchTarget } from './lib/dr-target.mjs';
import { readEnv, decryptArtifact } from './lib/dr-capture.mjs';
const option = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length+3);
const quote = name => '"'+name.replaceAll('"','""')+'"';
const root = resolve(import.meta.dirname,'..');
const bin = resolve(root,'tmp/dr-tools/pgsql/bin');
async function run(exe,args,env) {
  return new Promise((done,fail)=>{
    const c=spawn(resolve(bin,exe+'.exe'),args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const out=[],err=[]; c.stdout.on('data',b=>out.push(b));c.stderr.on('data',b=>err.push(b));
    c.on('error',fail);c.on('close',code=>done({code,stdout:Buffer.concat(out),stderr:Buffer.concat(err)}));
  });
}
async function main() {
  const expected=option('project');
  if(!/^[a-z]{20}$/.test(expected||'') || !option('capture')) throw Error('Explicit --project and --capture required');
  const config=await readEnv(resolve(root,option('env')||'.env.staging.local'));
  const target=assertScratchTarget(config.DATABASE_URL,(await readEnv(resolve(root,'.env.local'))).DATABASE_URL,expected);
  if(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname!==expected+'.supabase.co') throw Error('API project mismatch');
  const apply=process.argv.includes('--apply');
  if(apply && option('confirm-destroy')!==expected) throw Error('Exact --confirm-destroy is required');
  const directory=resolve(option('capture'));
  const capture=JSON.parse(await readFile(resolve(directory,'capture-report.json'),'utf8'));
  if(!capture.captureVerified || capture.projectRef===expected) throw Error('Verified different-project capture required');
  const key=(await readEnv(resolve(root,'.env.dr-backup.local'))).DR_BACKUP_KEY_HEX;
  const archiveBytes=await decryptArtifact(directory,capture.archive,key);
  const toc=(await decryptArtifact(directory,capture.toc,key)).toString().split(/\r?\n/).filter(l=>/^\d+;/.test(l));
  if(capture.rowCounts.find(t=>t.table_name==='vault.secrets')?.row_count!=='0') throw Error('Nonempty source Vault requires a separate key-aware recovery procedure');
  const supportedSchemas=['public','supabase_migrations','tax_vault','admin_security','auth','storage','extensions','realtime','vault','graphql','graphql_public','pgbouncer'];
  const archiveSchemas=toc.map(l=>l.match(/ SCHEMA - (\S+) /)?.[1]).filter(Boolean);
  if(archiveSchemas.some(s=>!supportedSchemas.includes(s))) throw Error('Archive contains an unreviewed schema; extend the restore plan explicitly');
  const db=new Client({connectionString:config.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:30000,statement_timeout:30000});
  await db.connect();
  let managed,edges,preflight;
  const retained=['auth.schema_migrations','storage.migrations','storage.buckets_vectors','storage.vector_indexes'];
  try {
    const platform=(await db.query("select to_regclass('cron.job') is not null as cron, to_regclass('net.http_request_queue') is not null as http_queue")).rows[0];
    const cron=platform.cron?(await db.query("select count(*)::int as active from cron.job where active")).rows[0].active:0;
    const queue=platform.http_queue?(await db.query('select count(*)::int as n from net.http_request_queue')).rows[0].n:0;
    if(cron||queue) throw Error('Disable staging cron and drain its HTTP queue before restore');
    managed=(await db.query("select schemaname as schema,tablename as name from pg_tables where schemaname in ('auth','storage') order by 1,2")).rows;
    const sourceTables=capture.tables.filter(t=>['auth','storage'].includes(t.schema)).map(t=>({schema:t.schema,name:t.name}));
    if(JSON.stringify(sourceTables)!==JSON.stringify(managed)) throw Error('Managed table inventories differ');
    const functions=(await db.query("select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,md5(pg_get_functiondef(p.oid)) as definition_hash,p.proacl::text as grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('auth','storage') and p.prokind in ('f','p') order by 1,2,3")).rows;
    if(JSON.stringify(functions)!==JSON.stringify(capture.functions.filter(f=>['auth','storage'].includes(f.schema)))) throw Error('Managed functions or grants differ');
    for(const table of retained) {
      const count=(await db.query(`select count(*)::text as n from ${table}`)).rows[0].n;
      if(count!==capture.rowCounts.find(t=>t.table_name===table)?.row_count) throw Error('Retained managed table count mismatch: '+table);
      if(!table.endsWith('migrations') && count!=='0') throw Error('Nonempty protected vector data requires a dedicated restore');
    }
    edges=(await db.query("select n.nspname||'.'||c.relname as child,rn.nspname||'.'||rc.relname as parent from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace join pg_class rc on rc.oid=co.confrelid join pg_namespace rn on rn.oid=rc.relnamespace where co.contype='f' and n.nspname in ('auth','storage')")).rows;
    preflight={managedFunctionsAndGrantsMatch:true,managedTableInventoryMatches:true,cronDisabled:true,httpQueueEmpty:true,retainedManagedTables:retained};
  } finally {await db.end();}
  const remaining=managed.map(t=>t.schema+'.'+t.name).filter(t=>!retained.includes(t)),ordered=[];
  while(remaining.length){const i=remaining.findIndex(t=>!edges.some(e=>e.child===t && remaining.includes(e.parent)));if(i<0)throw Error('Managed foreign-key cycle requires explicit handling');ordered.push(...remaining.splice(i,1));}
  const appSchemas=['public','supabase_migrations','tax_vault','admin_security'];
  // Preserve platform-owned default privileges by retaining the public schema.
  // All application relations, functions and custom types are removed below.
  const selected=toc.filter(l=>{
    const entry=l.match(/^\d+; \d+ \d+ ([A-Z ]+) ([^ ]+) /);
    const appEntry=entry && (appSchemas.includes(entry[2]) || / (?:SCHEMA|ACL - SCHEMA|COMMENT - SCHEMA) -? ?(?:public|supabase_migrations|tax_vault|admin_security) /.test(l));
    return appEntry && !(/DEFAULT ACL/.test(l)&&/supabase_admin$/.test(l));
  });
  const managedToc=ordered.map(t=>toc.find(l=>l.includes(' TABLE DATA '+t.replace('.',' ')+' '))).filter(Boolean);
  managedToc.push(...toc.filter(l=>/ SEQUENCE SET (auth|storage) /.test(l)));
  const work=resolve(directory,'managed-'+Date.now());await mkdir(work);
  const raw=resolve(work,'database.dump'), files=[];
  const env=Object.fromEntries(Object.entries(process.env).filter(([n])=>!/^pg/i.test(n)));
  const url=new URL(config.DATABASE_URL);
  Object.assign(env,{PGHOST:target.host,PGPORT:'5432',PGUSER:target.user,PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'postgres',PGSSLMODE:'require',PGCONNECT_TIMEOUT:'30',PGAPPNAME:'lgq-approved-dr-managed-restore'});
  const report={startedAt:new Date().toISOString(),apply,targetProject:expected,sourceProject:capture.projectRef,preflight,appSchemas,managedLoadOrder:ordered,completed:false};
  try {
    await writeFile(raw,archiveBytes,{flag:'wx',mode:0o600});files.push(raw);
    await writeFile(resolve(work,'application.toc'),selected.join('\n'));
    await writeFile(resolve(work,'managed.toc'),managedToc.join('\n'));
    async function extract(name,args){const file=resolve(work,name+'.sql');files.push(file);const r=await run('pg_restore',['--no-owner','--file='+file,...args,raw],env);if(r.code)throw Error('Offline extraction failed: '+name);return file;}
    const pre=await extract('pre',['--section=pre-data','--use-list='+resolve(work,'application.toc')]);
    const data=await extract('data',['--section=data','--use-list='+resolve(work,'application.toc')]);
    const managedData=await extract('managed-data',['--data-only','--use-list='+resolve(work,'managed.toc')]);
    const post=await extract('post',['--section=post-data','--use-list='+resolve(work,'application.toc')]);
    const eventToc=toc.filter(l=>/EVENT TRIGGER - ensure_rls postgres$/.test(l));
    await writeFile(resolve(work,'events.toc'),eventToc.join('\n'));
    const events=await extract('events',['--use-list='+resolve(work,'events.toc')]);
    const prep=resolve(work,'prep.sql');files.push(prep);
    await writeFile(prep,`SET lock_timeout='10s'; SET statement_timeout='5min';
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP SCHEMA IF EXISTS admin_security CASCADE;
DROP SCHEMA IF EXISTS tax_vault CASCADE;
DROP SCHEMA IF EXISTS supabase_migrations CASCADE;
-- pg_dump ACL entries assume newly created objects have PostgreSQL's base
-- privileges. Destination schema defaults otherwise silently broaden grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
DO $dr$ DECLARE obj record; BEGIN
 FOR obj IN SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') ORDER BY CASE WHEN c.relkind='S' THEN 1 ELSE 0 END LOOP
   EXECUTE format('DROP %s IF EXISTS public.%I CASCADE',CASE obj.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,obj.relname);
 END LOOP;
 FOR obj IN SELECT p.oid::regprocedure AS identity,p.prokind FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
   EXECUTE format('DROP %s IF EXISTS %s CASCADE',CASE obj.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,obj.identity);
 END LOOP;
 FOR obj IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','d','r','c') AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=t.typrelid) LOOP
   EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE',obj.typname);
 END LOOP;
END $dr$;
TRUNCATE ${ordered.map(t=>t.split('.').map(quote).join('.')).join(', ')};
`);
    const finish=resolve(work,'finish.sql');files.push(finish);await writeFile(finish,"NOTIFY pgrst, 'reload schema';\n");
    console.log(JSON.stringify({...report,archiveIntegrityVerified:true,workDirectory:work}));
    if(apply){
      const start=Date.now();const r=await run('psql',['--no-psqlrc','--single-transaction','--set=ON_ERROR_STOP=1','--quiet',...[prep,pre,managedData,data,post,events,finish].flatMap(f=>['--file',f])],env);
      await writeFile(resolve(work,'restore.log'),Buffer.concat([r.stdout,r.stderr]),{mode:0o600});
      report.durationMs=Date.now()-start;report.exitCode=r.code;report.completed=r.code===0;
      if(r.code)process.exitCode=1;
    }
  } finally {
    for(const file of files)await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});
    await writeFile(resolve(work,'restore-report.json'),JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify({completed:report.completed,exitCode:report.exitCode,durationMs:report.durationMs,workDirectory:work}));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
