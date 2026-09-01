import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit standard for GCM

export type EncryptedSecretPayload = Readonly<{
  ciphertext: string;
  iv: string;
  authTag: string;
}>;

function resolveWebhookVaultKey(): Buffer {
  const envKey = process.env.WEBHOOK_VAULT_ENCRYPTION_KEY?.trim() || process.env.TAX_VAULT_ENCRYPTION_KEY?.trim();
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    if (envKey.length === 44 && /^[A-Za-z0-9+/=]+$/.test(envKey)) {
      const buf = Buffer.from(envKey, 'base64');
      if (buf.length === 32) return buf;
    }
    return createHash('sha256').update(envKey, 'utf8').digest();
  }

  // Safe non-production test fallback
  const testFallback = process.env.NODE_ENV === 'production'
    ? null
    : 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  if (!testFallback) {
    throw new Error('WEBHOOK_VAULT_ENCRYPTION_KEY is required in production for webhook operations.');
  }

  return Buffer.from(testFallback, 'hex');
}

/**
 * Generates a new cryptographically random webhook signing secret.
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

/**
 * Encrypts a raw webhook signing secret using AES-256-GCM.
 */
export function encryptWebhookSecret(rawSecret: string): EncryptedSecretPayload {
  const key = resolveWebhookVaultKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(rawSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts an encrypted webhook secret payload.
 */
export function decryptWebhookSecret(payload: EncryptedSecretPayload): string {
  const key = resolveWebhookVaultKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid initialization vector length for webhook secret decryption.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
