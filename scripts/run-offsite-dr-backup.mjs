#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const project = 'mfuvvtrkipkigwqqtcal';
const destination = 'G:/My Drive/LGQ-Backup/disaster-recovery';
const temp = resolve(root, 'tmp');
const stateFile = resolve(temp, 'dr-offsite-status.json');
const lockFile = resolve(temp, 'dr-offsite-run.lock');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
function run(script, args) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts', script), ...args], { cwd: root, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let out = '', err = '';
    child.stdout.on('data', x => { out += x.toString(); });
    child.stderr.on('data', x => { err += x.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`${script} failed (${code}); see local dr-offsite-run.log`));
      try { accept(out.trim().split(/\r?\n/).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean).at(-1)); }
      catch { reject(new Error(`${script} produced no valid result`)); }
    });
    child.on('close', () => writeFile(resolve(temp, 'dr-offsite-run.log'), `${script}\n${out}\n${err}`, { mode: 0o600 }).catch(() => {}));
  });
}
await mkdir(temp, { recursive: true });
let previous = await json(stateFile).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
const good = previous?.lastSuccess;
if (process.argv.includes('--scheduled') && good && Date.now() - Date.parse(good.publishedAt) < 10 * 3600000) {
  console.log(JSON.stringify({ skipped: true, reason: 'A verified backup is less than ten hours old', lastSuccess: good.publishedAt }));
  process.exit(0);
}
try {
  const handle = await open(lockFile, 'wx');
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); await handle.close();
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
  const lock = await json(lockFile);
  let alive = true;
  try { process.kill(lock.pid, 0); } catch (x) { if (x.code === 'ESRCH') alive = false; }
  if (alive || Date.now() - Date.parse(lock.startedAt) < 3600000) throw Error('Another backup may be running; lock retained');
  await unlink(lockFile);
  const handle = await open(lockFile, 'wx'); await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); await handle.close();
}
const startedAt = new Date().toISOString();
try {
  let reuseDirectory;
  const capturesRoot = resolve(temp, 'dr-captures');
  const names = (await readdir(capturesRoot)).filter(n => n.startsWith(project + '-')).sort().reverse();
  for (const name of names) {
    const capture = await json(resolve(capturesRoot, name, 'capture-report.json')).catch(() => null);
    if (capture?.captureVerified && Date.now() - Date.parse(capture.capturedAt) < 7 * 86400000) { reuseDirectory = resolve(capturesRoot, name); break; }
  }
  const lastFull = previous?.lastFullStorageDownloadAt;
  const refresh = lastFull && Date.now() - Date.parse(lastFull) > 7 * 86400000;
  const captureArgs = ['--env=.env.local', `--ref=${project}`];
  if (reuseDirectory && !refresh) captureArgs.push(`--reuse-storage=${reuseDirectory}`);
  const captured = await run('capture-dr-backup.mjs', captureArgs);
  if (!captured?.captureVerified) throw Error('Capture did not verify');
  const receipt = await run('publish-dr-backup.mjs', [`--capture=${captured.captureDir}`, `--destination=${destination}`]);
  if (!receipt?.mountedReadbackVerified || receipt.projectRef !== project) throw Error('Offsite publication did not verify');
  const status = { lastAttempt: { startedAt, finishedAt: new Date().toISOString(), status: 'passed' }, lastSuccess: receipt,
    lastFullStorageDownloadAt: !reuseDirectory || refresh ? startedAt : lastFull || startedAt,
    schedule: '08:45 and 20:45 America/New_York; catch up after logon', recoveryPointTargetHours: 12,
    limitations: ['PC must be running and Google Drive connected', 'A mounted readback does not independently prove cloud synchronization', 'Google Drive is separately credentialed but not immutable'] };
  await writeFile(stateFile, JSON.stringify(status, null, 2) + '\n');
  console.log(JSON.stringify(status));
} catch (e) {
  await writeFile(stateFile, JSON.stringify({ ...previous, lastAttempt: { startedAt, finishedAt: new Date().toISOString(), status: 'failed', reason: e.message } }, null, 2) + '\n');
  console.error(e.message); process.exitCode = 1;
} finally { await unlink(lockFile); }
