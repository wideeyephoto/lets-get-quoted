#!/usr/bin/env node
// Restore an authenticated offsite capture into a NEW loopback-only PostgreSQL
// cluster. Never accepts a database URL, never connects to a hosted database.
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { decryptArtifact, readEnv, sha256 } from './lib/dr-capture.mjs';

const option = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const root = resolve(import.meta.dirname, '..');
const schemas = "('public','auth','storage')";
// ACL arrays have no ordering semantics. pg_restore may emit the same grants
// in another order, so compare entries, not their storage order.
const normalize = items => items.map(item => ({...item, grants:item.grants === null ? null : item.grants?.slice(1,-1).split(',').sort().join(',')}));

async function run(exe, args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    const out = [], err = [];
    child.stdout.on('data', b => out.push(b));
    child.stderr.on('data', b => err.push(b));
    child.on('error', reject);
    child.on('close', code => accept({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }));
  });
}

async function unusedPort() {
  const server = createServer();
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const port = server.address().port;
  await new Promise((accept, reject) => server.close(e => e ? reject(e) : accept()));
  return port;
}

async function main() {
  if (!option('capture') || !option('key-file') || !option('out')) {
    throw Error('Use --capture=<authenticated capture> --key-file=<private key file> --out=<new evidence JSON>');
  }
  const captureDirectory = resolve(option('capture'));
  const capture = JSON.parse(await readFile(join(captureDirectory, 'capture-report.json'), 'utf8'));
  if (!capture.captureVerified) throw Error('A verified capture is required');
  const functionSchemas = capture.functionSchemas ?? ['public','auth','storage'];
  if (!Array.isArray(functionSchemas) || functionSchemas.some(s => !['public','auth','storage','admin_security'].includes(s))) {
    throw Error('Unreviewed function schema in capture');
  }
  const functionSchemaSql = '(' + functionSchemas.map(s => "'" + s + "'").join(',') + ')';
  const cloud = JSON.parse(await readFile(join(captureDirectory, 'recovery-verification.json'), 'utf8'));
  if (!cloud.allArtifactsAuthenticated || cloud.projectRef !== capture.projectRef) throw Error('Authenticated offsite opening is required');
  if (capture.rowCounts.find(t => t.table_name === 'vault.secrets')?.row_count !== '0') {
    throw Error('Nonempty Supabase Vault requires hosted, key-aware recovery');
  }
  const keyFile = resolve(option('key-file'));
  const keyEnv = await readEnv(keyFile);
  const key = keyEnv.DR_BACKUP_KEY_HEX || (await readFile(keyFile, 'utf8')).trim();
  const archive = await decryptArtifact(captureDirectory, capture.archive, key);
  const toc = (await decryptArtifact(captureDirectory, capture.toc, key)).toString().split(/\r?\n/);
  // Supabase Vault needs its own server extension. It is empty in this capture.
  // Preserve all other captured owners, grants, functions and event triggers.
  const excluded = toc.filter(line => /^\d+;/.test(line) && /\b(?:vault|supabase_vault)\b/.test(line));
  const selected = toc.filter(line => !excluded.includes(line));
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const platform = process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`;
  const bin = resolve(root, 'node_modules', '@embedded-postgres', platform, 'native/bin');
  const exe = process.platform === 'win32' ? '.exe' : '';
  const tempRoot = resolve(root, 'tmp');
  await mkdir(tempRoot, { recursive: true });
  const work = await mkdtemp(join(tempRoot, 'dr-local-'));
  // Validate the final absolute path before any recursive cleanup on Windows.
  const actualRoot = await realpath(tempRoot), actualWork = await realpath(work);
  const childPath = relative(actualRoot, actualWork);
  if (!childPath || childPath.startsWith('..') || isAbsolute(childPath)) throw Error('Unsafe local recovery directory');
  const port = await unusedPort(), password = randomBytes(32).toString('hex');
  const logs = [];
  const pg = new EmbeddedPostgres({ databaseDir: join(work, 'database'), port, password,
    persistent: true, initdbFlags: ['--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: line => logs.push(String(line)) });
  const report = {
    startedAt: new Date().toISOString(), sourceProject: capture.projectRef,
    sourceSnapshot: capture.snapshot.captured_at, sourcePack: cloud.pack,
    sourcePackSha256: cloud.encryptedSha256, archiveSha256: capture.archive.sha256,
    target: 'new isolated loopback PostgreSQL cluster', hostedDatabasesContacted: false,
    outboundProvidersEnabled: false, fullRecoveryVerified: false, checks: [],
    exclusions: ['Empty Supabase Vault extension/table; its cryptographic provider is not available in stock PostgreSQL'],
    hostedAuthServiceVerified: false, hostedStorageServiceVerified: false, providerRecoveryVerified: false,
  };
  let client, started = false;
  const check = (name, passed, detail = {}) => report.checks.push({ name, passed, ...detail });
  try {
    await pg.initialise();
    await pg.start(); started = true;
    await pg.createDatabase('lgq_recovery');
    client = pg.getPgClient('lgq_recovery', '127.0.0.1'); await client.connect();
    const roles = ['anon','authenticated','service_role','authenticator','supabase_admin','pgbouncer',
      'supabase_auth_admin','supabase_realtime_admin','supabase_storage_admin','supabase_read_only_user',
      'dashboard_user','supabase_replication_admin','supabase_functions_admin'];
    for (const role of roles) await client.query(`CREATE ROLE ${quote(role)} NOLOGIN ${role === 'service_role' ? 'BYPASSRLS' : ''} ${role === 'supabase_admin' ? 'SUPERUSER' : ''}`);
    await client.query('GRANT ALL ON DATABASE lgq_recovery TO supabase_admin');
    const dumpPath = join(work,'database.dump'), tocPath = join(work,'selected.toc');
    await writeFile(dumpPath, archive, { flag:'wx', mode:0o600 });
    await writeFile(tocPath, selected.join('\n'), { flag:'wx', mode:0o600 });
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k)));
    Object.assign(env, { PGHOST:'127.0.0.1', PGPORT:String(port), PGUSER:'postgres', PGPASSWORD:password,
      PGDATABASE:'lgq_recovery', PGCONNECT_TIMEOUT:'10', PGSSLMODE:'disable', PGAPPNAME:'lgq-offsite-local-restore' });
    const restore = await run(option('pg-restore') ? resolve(option('pg-restore')) : join(bin,'pg_restore'+exe), ['--exit-on-error','--single-transaction','--use-list='+tocPath,'--dbname=lgq_recovery',dumpPath], env);
    check('atomic_archive_restore', restore.code === 0, { exitCode:restore.code });
    if (restore.code !== 0) {
      // SQL errors can contain customer rows or credentials; keep only SQLSTATE-
      // independent structural error lines, never COPY context or SQL payloads.
      report.restoreErrors = restore.stderr.toString().split(/\r?\n/).filter(s => /^pg_restore: error:/.test(s)).map(s => s.replaceAll(password,'[redacted]').slice(0,250));
      throw Error('Archive restore failed; transaction rolled back');
    }
    const counts = [];
    for (const item of capture.rowCounts.filter(t => t.table_name !== 'vault.secrets')) {
      const sqlName = item.table_name.split('.').map(quote).join('.');
      const n = (await client.query(`SELECT count(*)::text AS n FROM ${sqlName}`)).rows[0].n;
      counts.push({ table:item.table_name, expected:item.row_count, actual:n, passed:n === item.row_count });
    }
    check('captured_row_counts', counts.every(c => c.passed), { compared:counts.length, mismatches:counts.filter(c => !c.passed) });
    const tableRows = (await client.query(`select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls, coalesce(c.relacl,acldefault('r',c.relowner))::text as grants, acldefault('r',c.relowner)::text as default_grants from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} and c.relkind='r' order by 1,2`)).rows;
    const tables = tableRows.map(({default_grants,...table}) => table);
    const expectedTables = capture.tables.map(table => ({...table,grants:table.grants ?? tableRows.find(t=>t.schema===table.schema&&t.name===table.name)?.default_grants}));
    check('tables_rls_flags_and_grants', JSON.stringify(normalize(tables)) === JSON.stringify(normalize(expectedTables)), { compared:tables.length,
      mismatches:normalize(tables).filter((t,i) => JSON.stringify(t)!==JSON.stringify(normalize(expectedTables)[i])).map(t=>({actual:t,expected:normalize(expectedTables).find(s=>s.schema===t.schema&&s.name===t.name)})) });
    const policies = (await client.query(`select schemaname,tablename,policyname,permissive,roles,cmd,md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) as definition_hash from pg_policies where schemaname in ${schemas} order by 1,2,3`)).rows;
    check('policy_definitions', JSON.stringify(policies) === JSON.stringify(capture.policies), { compared:policies.length });
    const functions = (await client.query(`select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,md5(pg_get_functiondef(p.oid)) as definition_hash,p.proacl::text as grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${functionSchemaSql} and p.prokind in ('f','p') order by 1,2,3`)).rows;
    check('function_definitions_and_grants', JSON.stringify(normalize(functions)) === JSON.stringify(normalize(capture.functions)), { compared:functions.length,
      mismatches:normalize(functions).filter((t,i) => JSON.stringify(t)!==JSON.stringify(normalize(capture.functions)[i])).map(t=>({actual:t,expected:normalize(capture.functions).find(s=>s.schema===t.schema&&s.name===t.name&&s.arguments===t.arguments)})) });
    const owner = (await client.query("select m.user_id,m.account_id from public.memberships m where m.role='owner' and exists(select 1 from public.jobs j where j.account_id=m.account_id) and exists(select 1 from public.jobs j where j.account_id<>m.account_id) limit 1")).rows[0];
    if (owner) {
      const own = (await client.query('select count(*)::int as n from public.jobs where account_id=$1',[owner.account_id])).rows[0].n;
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE authenticated');
        await client.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:owner.user_id,role:'authenticated'}),owner.user_id]);
        const visible = (await client.query('select count(*) filter(where account_id=$1)::int as own,count(*) filter(where account_id<>$1)::int as other from public.jobs',[owner.account_id])).rows[0];
        check('real_restored_owner_rls', visible.own === own && own > 0 && visible.other === 0, { expectedOwnJobs:own, visibleOwnJobs:visible.own, visibleOtherJobs:visible.other });
      } finally { await client.query('ROLLBACK'); }
    } else check('real_restored_owner_rls', false, { reason:'No suitable restored owner fixture' });
    const manifest = JSON.parse((await decryptArtifact(captureDirectory,capture.storageManifest,key)).toString());
    const storageDir = join(work,'storage'); await mkdir(storageDir);
    let objectBytes = 0;
    for (const object of manifest) {
      const bytes = await decryptArtifact(captureDirectory,object.artifact,key);
      const filename = join(storageDir,sha256(Buffer.from(object.bucket_id+'/'+object.name))+'.bin');
      await writeFile(filename,bytes,{flag:'wx',mode:0o600});
      if (sha256(await readFile(filename)) !== object.artifact.sha256) throw Error('Restored Storage file differs');
      objectBytes += bytes.length;
    }
    check('storage_file_materialization_and_readback', true, { objects:manifest.length, bytes:objectBytes, destination:'local files, not hosted Storage API' });
    report.passed = report.checks.every(c => c.passed);
  } catch (e) {
    report.passed = false;
    report.error = report.restoreErrors?.length ? 'Archive restore failed; transaction rolled back' : 'Recovery verification failed; inspect the failing gate';
    // No raw DB, provider, or child-process exception text is printed.
    if (!report.restoreErrors?.length) report.errorCode = e.code || e.name;
    report.errorLocation = e.stack?.split('\n').find(s => s.includes('verify-dr-local-restore.mjs:'))?.trim();
  } finally {
    if (client) await client.end().catch(() => {});
    if (started) await pg.stop();
    // Re-resolve immediately before removal; fail closed if the path changed.
    if (await realpath(work) !== actualWork) throw Error('Recovery cleanup path changed');
    await rm(actualWork,{recursive:true,force:true});
    report.plaintextClusterAndFilesRemoved = true;
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.parse(report.finishedAt)-Date.parse(report.startedAt);
    await writeFile(resolve(option('out')),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify(report));
  process.exit(report.passed ? 0 : 1);
}
main().catch(e => { console.error(JSON.stringify({error:'Local recovery failed before evidence completion; no secret values printed.',code:e.code||e.name,location:e.stack?.split('\n').find(s=>s.includes('verify-dr-local-restore.mjs:'))?.trim()})); process.exit(1); });
