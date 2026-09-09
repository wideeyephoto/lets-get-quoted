#!/usr/bin/env node
// Publish a self-contained encrypted recovery pack to the user's Drive mount.
// Mounted readback is verified here; independent Drive-web download is a
// separate acceptance check and is never inferred from a successful copy.
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { resolve, basename, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readEnv, decryptArtifact, sha256 } from './lib/dr-capture.mjs';

const option = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(import.meta.dirname, '..');
const project = 'mfuvvtrkipkigwqqtcal';
function run(exe, args, input, cwd = root) {
  return new Promise((accept, reject) => {
    const p = spawn(exe, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', b => out.push(b)); p.stderr.on('data', b => err.push(b));
    p.on('error', reject);
    p.on('close', code => code === 0 ? accept(Buffer.concat(out)) : reject(new Error(`${basename(exe)} failed (${code}); command output withheld`)));
    p.stdin.on('error', e => { if (!['EPIPE','EOF'].includes(e.code)) reject(e); });
    p.stdin.end(input);
  });
}
async function seal(directory, name, bytes, key) {
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), nonce);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const envelope = Buffer.concat([Buffer.from('LGQDR001'), nonce, cipher.getAuthTag(), encrypted]);
  const artifact = { file: name, bytes: bytes.length, sha256: sha256(bytes), encryptedSha256: sha256(envelope) };
  await writeFile(resolve(directory, name), envelope, { flag: 'wx', mode: 0o600 });
  await decryptArtifact(directory, artifact, key);
  return artifact;
}
async function main() {
  if (!option('capture') || !option('destination')) throw Error('Explicit --capture and --destination required');
  const directory = resolve(option('capture')), destination = resolve(option('destination'));
  // This command only publishes into its own folder, never a sync root.
  if (basename(destination) !== 'disaster-recovery' || basename(resolve(destination, '..')) !== 'LGQ-Backup') throw Error('Destination must be LGQ-Backup/disaster-recovery');
  const capture = JSON.parse(await readFile(resolve(directory, 'capture-report.json'), 'utf8'));
  if (!capture.captureVerified || capture.projectRef !== project) throw Error('Verified production capture required');
  const key = (await readEnv(resolve(root, '.env.dr-backup.local'))).DR_BACKUP_KEY_HEX;
  if (!/^[a-f0-9]{64}$/.test(key || '')) throw Error('Invalid recovery key');
  await decryptArtifact(directory, capture.archive, key);
  const manifest = JSON.parse((await decryptArtifact(directory, capture.storageManifest, key)).toString());
  for (const item of manifest) await decryptArtifact(directory, item.artifact, key);
  const git = process.platform === 'win32' ? 'C:/Program Files/Git/cmd/git.exe' : 'git';
  const tar = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar';
  let kit;
  try { kit = JSON.parse(await readFile(resolve(directory, 'recovery-kit.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!kit) {
    const head = (await run(git, ['rev-parse','HEAD'])).toString().trim();
    const source = await seal(directory, 'recovery-source.zip.aesgcm', await run(git, ['archive','--format=zip','HEAD']), key);
    const patch = await seal(directory, 'recovery-working-tree.patch.aesgcm', await run(git, ['diff','--binary','HEAD']), key);
    const untracked = (await run(git, ['ls-files','--others','--exclude-standard','-z'])).toString().split('\0').filter(Boolean);
    for (const name of untracked) if (name.startsWith('-') || name.startsWith('/') || name.includes('..') || /[\r\n]/.test(name) || basename(name).startsWith('.env')) throw Error('Unexpected untracked recovery path');
    const listFile = resolve(root, 'tmp/dr-pack-files.txt');
    await writeFile(listFile, untracked.join('\n') + '\n');
    let extra;
    try { extra = await seal(directory, 'recovery-untracked.tar.aesgcm', await run(tar, ['-cf','-','-T',listFile]), key); }
    finally { await unlink(listFile); }
    const envFiles = {};
    for (const name of ['.env.local','.env.staging.local']) envFiles[name] = await readFile(resolve(root, name), 'utf8');
    const environment = await seal(directory, 'recovery-environment.json.aesgcm', Buffer.from(JSON.stringify(envFiles)), key);
    kit = { capturedAt: new Date().toISOString(), sourceHead: head, source, patch, extra, environment, untrackedFiles: untracked.length,
      recoveryKeyIncluded: false, environmentScope: 'The two local env files only; provider-held or Vercel-only secrets may require re-issuance.' };
    await writeFile(resolve(directory, 'recovery-kit.json'), JSON.stringify(kit, null, 2) + '\n', { flag: 'wx' });
  }
  for (const name of ['source','patch','extra','environment']) await decryptArtifact(directory, kit[name], key);
  const flatFiles = await readdir(directory, { withFileTypes: true });
  if (flatFiles.some(x => !x.isFile() || !/^[a-zA-Z0-9._-]+$/.test(x.name))) throw Error('Recovery pack must contain only flat regular files');
  const packRoot = resolve(root, 'tmp/dr-offsite-packs'); await mkdir(packRoot, { recursive: true });
  const packName = option('resume-pack') || `${project}-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.aesgcm`;
  if (!new RegExp(`^${project}-[0-9TZ.-]+\\.tar\\.aesgcm$`).test(packName)) throw Error('Invalid pack name');
  let artifact;
  if (option('resume-pack')) {
    const envelope = await readFile(resolve(packRoot, packName));
    if (envelope.subarray(0,8).toString() !== 'LGQDR001') throw Error('Invalid pack header');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), envelope.subarray(8,20));
    decipher.setAuthTag(envelope.subarray(20,36));
    const packed = Buffer.concat([decipher.update(envelope.subarray(36)), decipher.final()]);
    const packedCapture = JSON.parse((await run(tar, ['-xOf','-','./capture-report.json'], packed)).toString());
    if (packedCapture.archive.encryptedSha256 !== capture.archive.encryptedSha256 || packedCapture.projectRef !== project) throw Error('Resumed pack belongs to a different capture');
    artifact = { file: packName, bytes: packed.length, sha256: sha256(packed), encryptedSha256: sha256(envelope) };
  } else {
    const packed = await run(tar, ['-cf','-','-C',directory,'.']);
    artifact = await seal(packRoot, packName, packed, key);
  }
  await mkdir(destination, { recursive: true });
  try { await writeFile(resolve(destination, packName), await readFile(resolve(packRoot, packName)), { flag: 'wx' }); }
  catch (e) { if (e.code !== 'EEXIST' || !option('resume-pack')) throw e; }
  // Drive's virtual filesystem can briefly serve an incomplete read just
  // after closing a large write. Success still requires a full authenticated
  // readback; a timeout remains a failed backup with no receipt.
  let readbackError;
  for (let attempt = 0; attempt < 6; attempt++) {
    try { await decryptArtifact(destination, artifact, key); readbackError = null; break; }
    catch (e) { readbackError = e; if (attempt < 5) await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); }
  }
  if (readbackError) throw readbackError;
  const receipt = { publishedAt: new Date().toISOString(), projectRef: project, snapshot: capture.snapshot,
    sourceCapture: basename(directory), artifact, sourceHead: kit.sourceHead, storageObjects: manifest.length,
    storageBytes: manifest.reduce((n, x) => n + x.artifact.bytes, 0), encryptedEnvironmentIncluded: true,
    recoveryKeyIncluded: false, mountedReadbackVerified: true, independentCloudDownloadVerified: false,
    retentionDays: 30, destinationProvider: 'Google Drive', localMount: destination };
  await writeFile(resolve(destination, `${packName}.receipt.json`), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  await writeFile(resolve(packRoot, `${packName}.receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
  // Delete only this command's dated, paired packs older than 30 days. Keep at
  // least the two newest verified receipts. Never traverse or sync-delete.
  const owned = (await readdir(destination)).filter(n => new RegExp(`^${project}-[0-9TZ.-]+\\.tar\\.aesgcm\\.receipt\\.json$`).test(n));
  const receipts = [];
  for (const name of owned) {
    const r = JSON.parse(await readFile(resolve(destination, name), 'utf8'));
    if (r.projectRef === project && r.mountedReadbackVerified && basename(r.artifact.file) === r.artifact.file && `${r.artifact.file}.receipt.json` === name) receipts.push({ name, r });
  }
  receipts.sort((a, b) => b.r.publishedAt.localeCompare(a.r.publishedAt));
  for (const { name, r } of receipts.slice(2)) {
    if (Date.now() - Date.parse(r.publishedAt) <= 30 * 86400000) continue;
    for (const file of [r.artifact.file, name]) {
      const target = resolve(destination, file);
      if (relative(destination, target) !== file || !(await stat(target)).isFile()) throw Error('Unsafe retention path');
      await unlink(target);
    }
  }
  console.log(JSON.stringify(receipt));
}
main().catch(e => { console.error(JSON.stringify({ failed: true, reason: e.message })); process.exitCode = 1; });
