#!/usr/bin/env node
// Dry run by default. Apply only after the exact target has been approved.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createDecipheriv, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertScratchTarget, restoreArguments } from './lib/dr-target.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
async function envFile(file) {
  return Object.fromEntries((await readFile(resolve(root, file), 'utf8')).split(/\r?\n/).map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#') && s.includes('=')).map((s) => { const i=s.indexOf('='); return [s.slice(0,i).trim(),s.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; }));
}
async function main() {
  const capture = option('capture');
  if (!capture) throw new Error('Use --capture=<capture directory> --env=.env.scratch.local --project=<expected ref>');
  const captureDir = resolve(capture);
  const report = JSON.parse(await readFile(resolve(captureDir, 'capture-report.json'), 'utf8'));
  if (!report.captureVerified || !report.archive) throw new Error('A verified capture is required');
  const targetEnv = await envFile(option('env') || '.env.scratch.local');
  const productionEnv = await envFile('.env.local');
  const expected = option('project');
  if (!/^[a-z]{20}$/.test(expected || '')) throw new Error('Explicit --project=<expected Supabase project ref> is required');
  const target = assertScratchTarget(targetEnv.DATABASE_URL, productionEnv.DATABASE_URL, expected);
  if (target.projectRef === report.projectRef) throw new Error('Source and restore target must be different projects');
  if (new URL(targetEnv.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${expected}.supabase.co`) throw new Error('Scratch API and database project mismatch');
  const apply = process.argv.includes('--apply');
  const archive = resolve(captureDir, `restore-${target.projectRef}.dump`);
  const args = restoreArguments({ apply, confirmedProjectRef: option('confirm-destroy'), target, archive });
  console.log(JSON.stringify({ apply, target, sourceProject: report.projectRef, snapshot: report.snapshot, archiveSha256: report.archive.sha256, restoreGrants: true, atomicTransaction: true }));
  if (basename(report.archive.file) !== report.archive.file) throw new Error('Invalid artifact filename');
  const envelope = await readFile(resolve(captureDir, report.archive.file));
  if (createHash('sha256').update(envelope).digest('hex') !== report.archive.encryptedSha256 || envelope.subarray(0,8).toString() !== 'LGQDR001') throw new Error('Encrypted archive integrity check failed');
  const keys = await envFile('.env.dr-backup.local');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keys.DR_BACKUP_KEY_HEX,'hex'), envelope.subarray(8,20));
  decipher.setAuthTag(envelope.subarray(20,36));
  const bytes = Buffer.concat([decipher.update(envelope.subarray(36)),decipher.final()]);
  if (createHash('sha256').update(bytes).digest('hex') !== report.archive.sha256) throw new Error('Decrypted archive integrity check failed');
  console.log(JSON.stringify({ archiveIntegrityVerified: true, decryptedBytes: bytes.length }));
  if (!apply) return;
  await writeFile(archive, bytes, { flag:'wx', mode:0o600 });
  const url = new URL(targetEnv.DATABASE_URL);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^pg/i.test(name)));
  Object.assign(env,{ PGHOST:target.host, PGPORT:'5432', PGUSER:target.user, PGPASSWORD:decodeURIComponent(url.password), PGDATABASE:'postgres', PGSSLMODE:'require', PGCONNECT_TIMEOUT:'15', PGAPPNAME:'lgq-approved-dr-restore' });
  const log = [], startedAt = new Date().toISOString(), start = Date.now();
  let code;
  try {
    code = await new Promise((done,fail) => {
      const child = spawn(resolve(option('pg-bin') || resolve(root,'tmp/dr-tools/pgsql/bin'),'pg_restore.exe'),args,{ env, windowsHide:true, stdio:['ignore','pipe','pipe'] });
      child.stdout.on('data',(b)=>log.push(b)); child.stderr.on('data',(b)=>log.push(b)); child.on('error',fail); child.on('close',done);
    });
  } finally {
    await writeFile(resolve(captureDir,`restore-${target.projectRef}-${Date.now()}.log`),Buffer.concat(log),{flag:'wx',mode:0o600});
    await unlink(archive);
  }
  console.log(JSON.stringify({ startedAt, durationMs:Date.now()-start, exitCode:code, targetProject:target.projectRef, fullRecoveryVerified:false }));
  if (code !== 0) process.exitCode=1;
}
main().catch((e)=>{ console.error(e.message); process.exitCode=1; });
