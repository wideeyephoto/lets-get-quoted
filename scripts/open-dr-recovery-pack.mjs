#!/usr/bin/env node
// Standalone, offline bootstrap: Node.js + tar; no project dependencies or
// network access. Keep a copy beside the encrypted Google Drive packs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createDecipheriv, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
const option = n => process.argv.find(x => x.startsWith(`--${n}=`))?.slice(n.length + 3);
const sha256 = b => createHash('sha256').update(b).digest('hex');
function decrypt(bytes, key) {
  if (bytes.subarray(0,8).toString() !== 'LGQDR001') throw Error('Invalid encrypted pack header');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), bytes.subarray(8,20));
  decipher.setAuthTag(bytes.subarray(20,36));
  return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
}
function run(exe, args, bytes) {
  return new Promise((accept, reject) => {
    const p = spawn(exe, args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    const out = []; p.stdout.on('data', b => out.push(b)); p.stderr.resume();
    p.on('error', reject); p.on('close', code => code === 0 ? accept(Buffer.concat(out)) : reject(Error(`${basename(exe)} failed (${code})`)));
    p.stdin.on('error', e => { if (!['EOF','EPIPE'].includes(e.code)) reject(e); }); p.stdin.end(bytes);
  });
}
async function main() {
  if (!option('pack') || !option('key-file') || !option('out')) throw Error('Use --pack=<downloaded file> --key-file=<local key file> --out=<new empty directory> [--pg-restore=<binary>]');
  const keyText = await readFile(resolve(option('key-file')), 'utf8');
  const key = keyText.match(/(?:^|\n)\s*(?:DR_BACKUP_KEY_HEX=)?([a-f0-9]{64})\s*(?:\n|$)/)?.[1];
  if (!key) throw Error('Expected a 64-character hex recovery key in the key file');
  const encrypted = await readFile(resolve(option('pack'))), packed = decrypt(encrypted, key);
  const tar = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar';
  const entries = (await run(tar, ['-tf','-'], packed)).toString().trim().split(/\r?\n/);
  if (entries.some(x => x !== './' && (!/^\.\/[a-zA-Z0-9._-]+$/.test(x) || ['.','..'].includes(x.slice(2))))) throw Error('Unsafe or nested recovery-pack entry');
  const types = (await run(tar, ['-tvf','-'], packed)).toString().trim().split(/\r?\n/);
  if (types.some(x => !['-','d'].includes(x[0]))) throw Error('Links or special files are not allowed in recovery packs');
  const output = resolve(option('out'));
  await mkdir(output); // Refuse an existing directory instead of overwriting it.
  await run(tar, ['-xf','-','-C',output], packed);
  const capture = JSON.parse(await readFile(resolve(output, 'capture-report.json'), 'utf8'));
  if (!capture.captureVerified) throw Error('Pack contains an unverified capture');
  async function artifact(a) {
    if (basename(a.file) !== a.file) throw Error('Unsafe artifact path');
    const bytes = await readFile(resolve(output, a.file));
    if (sha256(bytes) !== a.encryptedSha256) throw Error('Artifact ciphertext hash mismatch');
    const plain = decrypt(bytes, key);
    if (sha256(plain) !== a.sha256) throw Error('Artifact plaintext hash mismatch');
    return plain;
  }
  const database = await artifact(capture.archive);
  const manifest = JSON.parse((await artifact(capture.storageManifest)).toString());
  for (const object of manifest) await artifact(object.artifact);
  const kit = JSON.parse(await readFile(resolve(output, 'recovery-kit.json'), 'utf8'));
  const kitFiles = { source: 'recovered-source.zip', patch: 'recovered-working-tree.patch', extra: 'recovered-untracked.tar', environment: 'recovered-environment.json' };
  // Explicit opt-in: these files, especially environment JSON, are plaintext.
  const exportKit = process.argv.includes('--export-kit');
  for (const [name, file] of Object.entries(kitFiles)) {
    const bytes = await artifact(kit[name]);
    if (exportKit) await writeFile(resolve(output, file), bytes, { flag: 'wx', mode: 0o600 });
  }
  let archiveEntries;
  if (option('pg-restore')) archiveEntries = (await run(resolve(option('pg-restore')), ['--list'], database)).toString().split(/\r?\n/).filter(x => /^\d+;/.test(x)).length;
  const report = { verifiedAt: new Date().toISOString(), pack: basename(option('pack')), encryptedSha256: sha256(encrypted), plaintextSha256: sha256(packed),
    projectRef: capture.projectRef, sourceSnapshot: capture.snapshot, allArtifactsAuthenticated: true,
    databaseArchiveBytes: database.length, databaseArchiveEntries: archiveEntries, storageObjects: manifest.length,
    storageBytes: manifest.reduce((n, x) => n + x.artifact.bytes, 0), sourceHead: kit.sourceHead,
    sourceAndWorkingChangesAuthenticated: true, environmentAuthenticated: true, environmentWrittenInPlaintext: exportKit,
    recoveredCaptureDirectory: output, keyValuePrinted: false };
  await writeFile(resolve(output, 'recovery-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
