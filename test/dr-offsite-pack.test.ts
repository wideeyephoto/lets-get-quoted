import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCipheriv, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

describe('offline recovery rejects unauthenticated archives before extraction', () => {
  for (const mode of ['wrong-key', 'ciphertext-tampering', 'tag-tampering', 'truncated-header']) {
    it(mode, () => {
      const dir = mkdtempSync(join(tmpdir(), 'lgq-dr-integrity-'));
      const key = randomBytes(32), nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const ciphertext = Buffer.concat([cipher.update('never extract unauthenticated content'), cipher.final()]);
      let envelope = Buffer.concat([Buffer.from('LGQDR001'), nonce, cipher.getAuthTag(), ciphertext]);
      if (mode === 'ciphertext-tampering') envelope[envelope.length - 1] ^= 1;
      if (mode === 'tag-tampering') envelope[20] ^= 1;
      if (mode === 'truncated-header') envelope = envelope.subarray(0, 7);
      const pack = join(dir, 'test.aesgcm'), keyFile = join(dir, 'key'), output = join(dir, 'recovered');
      writeFileSync(pack, envelope);
      writeFileSync(keyFile, (mode === 'wrong-key' ? randomBytes(32) : key).toString('hex'));
      try {
        const result = spawnSync(process.execPath, [resolve('scripts/open-dr-recovery-pack.mjs'), `--pack=${pack}`, `--key-file=${keyFile}`, `--out=${output}`], { encoding: 'utf8', windowsHide: true });
        expect(result.status).toBe(1);
        expect(existsSync(output)).toBe(false);
        expect(result.stdout + result.stderr).not.toContain(key.toString('hex'));
      } finally { unlinkSync(pack); unlinkSync(keyFile); rmdirSync(dir); }
    });
  }
});
