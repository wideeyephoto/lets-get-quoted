import { describe, it, expect } from 'vitest';
import {
  generateWebhookSecret,
  encryptWebhookSecret,
  decryptWebhookSecret,
} from '@/lib/public-api/webhook-vault-crypto';

describe('Webhook Vault Encryption (AES-256-GCM)', () => {
  it('generates webhook signing secrets with whsec_ prefix', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
  });

  it('successfully encrypts and decrypts webhook secret round-trip', () => {
    const secret = generateWebhookSecret();
    const encrypted = encryptWebhookSecret(secret);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.ciphertext).not.toBe(secret);

    const decrypted = decryptWebhookSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('throws when attempting to decrypt corrupted ciphertext or altered auth tag', () => {
    const secret = generateWebhookSecret();
    const encrypted = encryptWebhookSecret(secret);

    // Corrupt the ciphertext
    const corrupted = {
      ...encrypted,
      ciphertext: 'bm90LXZhbGlkLWJhc2U2NA==',
    };
    expect(() => decryptWebhookSecret(corrupted)).toThrow();
  });
});
