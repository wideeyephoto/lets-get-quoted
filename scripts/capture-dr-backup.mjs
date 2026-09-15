#!/usr/bin/env node
// Manual, read-only capture. This is not a scheduler or a completed restore drill.
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptArtifact } from './lib/dr-capture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
async function envFile(name) {
  return Object.fromEntries((await readFile(resolve(root, name), 'utf8')).split(/\r?\n/)
    .map((s) => s.trim()).filter((s) => s && !s.startsWith('#') && s.includes('='))
    .map((s) => { const at = s.indexOf('='); return [s.slice(0, at).trim(), s.slice(at + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
}
function run(exe, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [], err = [];
    child.stdout.on('data', (b) => out.push(b)); child.stderr.on('data', (b) => err.push(b));
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }));
  });
}

async function main() {
  const envPath = option('env');
  const projectRef = option('ref');
  if (!envPath || !/^[a-z]{20}$/.test(projectRef || '')) throw new Error('Use --env=<local env file> --ref=<expected project ref>');
  const config = await envFile(envPath);
  const dbUrl = new URL(config.DATABASE_URL);
  const apiUrl = new URL(config.NEXT_PUBLIC_SUPABASE_URL);
  if (dbUrl.hostname !== `db.${projectRef}.supabase.co` || apiUrl.hostname !== `${projectRef}.supabase.co`) throw new Error('Source project mismatch');
  if (dbUrl.search) throw new Error('Source URL query options require explicit review');
  const tools = resolve(option('pg-bin') || resolve(root, 'tmp/dr-tools/pgsql/bin'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const captureDir = resolve(root, 'tmp/dr-captures', `${projectRef}-${stamp}`);
  await mkdir(captureDir, { recursive: true });
  let keyConfig;
  try { keyConfig = await envFile('.env.dr-backup.local'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    keyConfig = { DR_BACKUP_KEY_HEX: randomBytes(32).toString('hex') };
    await writeFile(resolve(root, '.env.dr-backup.local'), `# Local DR artifact encryption key; keep separate from any offsite copies.\nDR_BACKUP_KEY_HEX=${keyConfig.DR_BACKUP_KEY_HEX}\n`, { flag: 'wx', mode: 0o600 });
  }
  if (!/^[a-f0-9]{64}$/.test(keyConfig.DR_BACKUP_KEY_HEX || '')) throw new Error('Invalid backup encryption key');
  const key = Buffer.from(keyConfig.DR_BACKUP_KEY_HEX, 'hex');
  async function seal(name, bytes) {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce);
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const envelope = Buffer.concat([Buffer.from('LGQDR001'), nonce, cipher.getAuthTag(), encrypted]);
    const file = resolve(captureDir, name + '.aesgcm');
    await writeFile(file, envelope, { flag: 'wx', mode: 0o600 });
    // Read back and authenticate every written artifact before counting it.
    const saved = await readFile(file);
    const decipher = createDecipheriv('aes-256-gcm', key, saved.subarray(8, 20));
    decipher.setAuthTag(saved.subarray(20, 36));
    const restored = Buffer.concat([decipher.update(saved.subarray(36)), decipher.final()]);
    if (sha256(restored) !== sha256(bytes)) throw new Error('Encrypted artifact readback mismatch');
    return { file: name + '.aesgcm', bytes: bytes.length, sha256: sha256(bytes), encryptedSha256: sha256(saved) };
  }

  const client = new Client({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 30000, options: '-c default_transaction_read_only=on', application_name: 'lgq-dr-readonly-capture' });
  const report = { capturedAt: new Date().toISOString(), projectRef, captureDir, readOnly: true, restorePerformed: false, offsiteCopy: false, encryption: 'AES-256-GCM; LGQDR001 + nonce(12) + tag(16) + ciphertext', checks: [] };
  await client.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const { rows: [snapshot] } = await client.query("select pg_export_snapshot() as id, now() as captured_at, current_setting('server_version') as server_version, current_setting('transaction_read_only') as read_only");
    report.snapshot = snapshot;
    const { rows: tables } = await client.query("select schemaname as schema, tablename as name from pg_tables where schemaname in ('public','auth','storage','supabase_migrations','vault','tax_vault','admin_security') order by 1,2");
    report.rowCounts = (await client.query(tables.map((t) => `select '${t.schema}.${t.name}' as table_name, count(*)::bigint::text as row_count from ${quote(t.schema)}.${quote(t.name)}`).join(' union all '))).rows;
    report.extensions = (await client.query('select extname, extversion from pg_extension order by extname')).rows;
    report.tables = (await client.query("select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls, c.relacl::text as grants from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind='r' order by 1,2")).rows;
    report.policies = (await client.query("select schemaname,tablename,policyname,permissive,roles,cmd,md5(coalesce(qual,'') || '|' || coalesce(with_check,'')) as definition_hash from pg_policies where schemaname in ('public','auth','storage') order by 1,2,3")).rows;
    // The private passkey session reader is required after a disaster too.
    report.functionSchemas = ['public','auth','storage','admin_security'];
    report.functions = (await client.query("select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,md5(pg_get_functiondef(p.oid)) as definition_hash,p.proacl::text as grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage','admin_security') and p.prokind in ('f','p') order by 1,2,3")).rows;
    report.buckets = (await client.query('select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id')).rows;
    const objects = (await client.query('select id,bucket_id,name,metadata,updated_at from storage.objects order by bucket_id,name')).rows;
    report.storageMetadata = await seal('storage-metadata.json', Buffer.from(JSON.stringify(objects)));

    // Use libpq environment variables, keeping the password out of argv and logs.
    const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^pg/i.test(name)));
    Object.assign(pgEnv, { PGHOST: dbUrl.hostname, PGPORT: dbUrl.port || '5432', PGUSER: decodeURIComponent(dbUrl.username), PGPASSWORD: decodeURIComponent(dbUrl.password), PGDATABASE: dbUrl.pathname.slice(1), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '30', PGOPTIONS: '-c default_transaction_read_only=on', PGAPPNAME: 'lgq-dr-readonly-dump' });
    const rawPath = resolve(captureDir, 'database.dump');
    const started = Date.now();
    try {
      const dump = await run(resolve(tools, 'pg_dump.exe'), ['--format=custom','--lock-wait-timeout=5s',`--snapshot=${snapshot.id}`,`--file=${rawPath}`], pgEnv);
      await seal('pg-dump.log', dump.stderr);
      if (dump.code !== 0) { report.dumpExitCode = dump.code; throw new Error('pg_dump failed; encrypted log retained'); }
      const toc = await run(resolve(tools, 'pg_restore.exe'), ['--list',rawPath], pgEnv);
      if (toc.code !== 0) throw new Error('Archive table of contents unreadable');
      const tocText = toc.stdout.toString('utf8');
      report.archive = await seal('database.dump', await readFile(rawPath));
      report.toc = await seal('database.toc', toc.stdout);
      report.tocEntries = tocText.split(/\r?\n/).filter((line) => /^\d+;/.test(line)).length;
      report.tocSchemas = Object.fromEntries(['public','auth','storage'].map((schema) => [schema,new RegExp(`TABLE DATA ${schema} `).test(tocText)]));
      if (!report.tocEntries || Object.values(report.tocSchemas).some((v) => !v)) throw new Error('Archive missing a required schema');
      report.dumpDurationMs = Date.now() - started;
    } finally {
      // Failed archives may contain partial data too. Encrypt before deleting
      // the exact temporary file; never leave a partial plaintext dump behind.
      const raw = await readFile(rawPath).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
      if (raw !== null) {
        if (!report.archive) await seal('database.partial.dump', raw);
        await unlink(rawPath);
      }
    }
    await client.query('commit');
    console.log(JSON.stringify({ step: 'database_captured', projectRef, bytes: report.archive.bytes, tocEntries: report.tocEntries, schemas: report.tocSchemas }));

    const storage = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
    // Reuse authenticated local object bytes only when the current source
    // identity, path, metadata and modification timestamp are unchanged.
    // This avoids re-downloading unchanged media on every scheduled Free-plan
    // capture. The database dump is always new.
    const reuseDirectory = option('reuse-storage') ? resolve(root, option('reuse-storage')) : null;
    let reusable = [];
    if (reuseDirectory) {
      const previous = JSON.parse(await readFile(resolve(reuseDirectory, 'capture-report.json'), 'utf8'));
      if (!previous.captureVerified || previous.projectRef !== projectRef) throw new Error('Invalid Storage reuse capture');
      reusable = JSON.parse((await decryptArtifact(reuseDirectory, previous.storageManifest, keyConfig.DR_BACKUP_KEY_HEX)).toString());
    }
    report.storageDownloaded = 0;
    report.storageReused = 0;
    const manifest = [];
    for (const object of objects) {
      const cached = reusable.find(previous => previous.id === object.id && previous.bucket_id === object.bucket_id && previous.name === object.name && previous.updated_at === object.updated_at && JSON.stringify(previous.metadata) === JSON.stringify(object.metadata));
      let bytes;
      if (cached) {
        bytes = await decryptArtifact(reuseDirectory, cached.artifact, keyConfig.DR_BACKUP_KEY_HEX);
        report.storageReused++;
      } else {
        const { data, error } = await storage.from(object.bucket_id).download(object.name);
        if (error || !data) throw new Error('Storage download failed; object details withheld');
        bytes = Buffer.from(await data.arrayBuffer());
        report.storageDownloaded++;
      }
      if (bytes.length !== Number(object.metadata?.size)) throw new Error('Storage byte count changed or disagrees with metadata');
      const artifact = await seal(`object-${sha256(Buffer.from(object.bucket_id + '/' + object.name))}`, bytes);
      manifest.push({ ...object, artifact });
    }
    const currentObjects = (await client.query('select id,bucket_id,name,metadata,updated_at from storage.objects order by bucket_id,name')).rows;
    if (JSON.stringify(currentObjects) !== JSON.stringify(objects)) throw new Error('Storage changed during capture; repeat for a stable manifest');
    report.storageManifest = await seal('storage-manifest.json', Buffer.from(JSON.stringify(manifest)));
    report.storageTotals = report.buckets.map((b) => ({ bucket: b.id, objects: manifest.filter((o) => o.bucket_id === b.id).length, bytes: manifest.filter((o) => o.bucket_id === b.id).reduce((n,o) => n + o.artifact.bytes,0) }));
    report.captureVerified = true;
  } catch (error) {
    report.captureVerified = false;
    report.failureCode = error.code || error.message;
    throw error;
  } finally {
    await client.end();
    await writeFile(resolve(captureDir, 'capture-report.json'), JSON.stringify(report,null,2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ captureDir, captureVerified: report.captureVerified, databaseBytes: report.archive?.bytes, storage: report.storageTotals }));
  }
}
main().catch((error) => { console.error(JSON.stringify({ failed: true, code: error.code || error.message })); process.exitCode = 1; });
