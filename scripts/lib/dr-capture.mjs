import { readFile } from 'node:fs/promises';
import { createDecipheriv, createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function readEnv(file) {
  return Object.fromEntries((await readFile(file, 'utf8')).split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#') && s.includes('=')).map(s => { const i=s.indexOf('='); return [s.slice(0,i).trim(),s.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]; }));
}
export async function decryptArtifact(directory, artifact, keyHex) {
  if (basename(artifact.file) !== artifact.file) throw new Error('Invalid artifact path');
  const envelope = await readFile(resolve(directory, artifact.file));
  if (sha256(envelope) !== artifact.encryptedSha256 || envelope.subarray(0,8).toString() !== 'LGQDR001') throw new Error('Encrypted artifact integrity failed');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex,'hex'), envelope.subarray(8,20));
  decipher.setAuthTag(envelope.subarray(20,36));
  const bytes = Buffer.concat([decipher.update(envelope.subarray(36)),decipher.final()]);
  if (sha256(bytes) !== artifact.sha256) throw new Error('Plaintext artifact integrity failed');
  return bytes;
}
