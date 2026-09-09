#!/usr/bin/env node
// Read-only baseline parity. Run before sign-in, Storage upserts or migrations.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Client} from 'pg';
import {readEnv} from './lib/dr-capture.mjs';
import {assertScratchTarget} from './lib/dr-target.mjs';
const root=resolve(import.meta.dirname,'..');
const option=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const normalize=rows=>rows.map(row=>({...row,grants:row.grants?.slice(1,-1).split(',').sort().join(',')??null}));
async function main(){
 if(!option('capture')||!option('project')||!option('out'))throw Error('Explicit capture, project and output required');
 const directory=resolve(option('capture'));
 const capture=JSON.parse(await readFile(resolve(directory,'capture-report.json'),'utf8'));
 const env=await readEnv(resolve(root,option('env')||'.env.staging.local'));
 const primary=await readEnv(resolve(root,'.env.local'));
 assertScratchTarget(env.DATABASE_URL,primary.DATABASE_URL,option('project'));
 if(!capture.captureVerified||capture.projectRef===option('project'))throw Error('A verified different-project capture is required');
 const functionSchemas=capture.functionSchemas??['public','auth','storage'];
 if(!Array.isArray(functionSchemas)||functionSchemas.some(s=>!['public','auth','storage','admin_security'].includes(s)))throw Error('Unreviewed function scope');
 const functionScope='('+functionSchemas.map(s=>"'"+s+"'").join(',')+')';
 const report={checkedAt:new Date().toISOString(),targetProject:option('project'),sourceProject:capture.projectRef,sourceSnapshot:capture.snapshot.captured_at,readOnly:true,checks:[],passed:false};
 const db=new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:30000,statement_timeout:60000});
 const check=(name,passed,details={})=>{report.checks.push({name,passed,...details});if(!passed)throw Error('Parity failed: '+name);};
 await db.connect();
 try{
  await db.query('begin transaction isolation level repeatable read read only');
  const rowCounts=[];
  for(const row of capture.rowCounts){
   const parts=row.table_name.split('.');
   if(parts.length!==2||parts.some(p=>!/^\w+$/.test(p)))throw Error('Invalid captured table identifier');
   const actual=(await db.query(`select count(*)::text as n from ${parts.map(quote).join('.')}`)).rows[0].n;
   rowCounts.push({table:row.table_name,expected:row.row_count,actual});
  }
  const vault=rowCounts.find(r=>r.table==='vault.secrets');
  check('captured_row_counts',rowCounts.filter(r=>r.table!=='vault.secrets').every(r=>r.expected===r.actual),{compared:rowCounts.length-Number(Boolean(vault)),mismatches:rowCounts.filter(r=>r.table!=='vault.secrets'&&r.expected!==r.actual),preservedDestinationVault:vault});
  const tableRows=(await db.query("select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,coalesce(c.relacl,acldefault('r',c.relowner))::text as grants,acldefault('r',c.relowner)::text as default_grants from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind='r' order by 1,2")).rows;
  const tables=tableRows.map(({default_grants,...table})=>table);
  const expectedTables=normalize(capture.tables.map(table=>({...table,grants:table.grants??tableRows.find(t=>t.schema===table.schema&&t.name===table.name)?.default_grants}))),actualTables=normalize(tables);
  check('tables_rls_flags_and_grants',JSON.stringify(actualTables)===JSON.stringify(expectedTables),{compared:tables.length,mismatches:actualTables.filter((row,i)=>JSON.stringify(row)!==JSON.stringify(expectedTables[i])).map(row=>({actual:row,expected:expectedTables.find(t=>t.schema===row.schema&&t.name===row.name)}))});
  const policies=(await db.query("select schemaname,tablename,policyname,permissive,roles,cmd,md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) as definition_hash from pg_policies where schemaname in ('public','auth','storage') order by 1,2,3")).rows;
  check('policy_definitions',JSON.stringify(policies)===JSON.stringify(capture.policies),{compared:policies.length});
  const functions=(await db.query(`select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,md5(pg_get_functiondef(p.oid)) as definition_hash,p.proacl::text as grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${functionScope} and p.prokind in ('f','p') order by 1,2,3`)).rows;
  check('function_definitions_and_grants',JSON.stringify(normalize(functions))===JSON.stringify(normalize(capture.functions)),{compared:functions.length});
  report.passed=true;
 }finally{await db.query('rollback').catch(()=>{});await db.end();await writeFile(resolve(option('out')),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
