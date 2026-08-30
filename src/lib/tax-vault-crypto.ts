import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits standard for GCM

export type TinType = 'ein' | 'ssn';

export type EncryptedTinPayload = Readonly<{
  ciphertext: string;
  iv: string;
  authTag: string;
  lastFour: string;
  tinType: TinType;
}>;

function resolveVaultKey(): Buffer {
  const envKey = process.env.TAX_VAULT_ENCRYPTION_KEY?.trim();
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    if (envKey.length === 44 && /^[A-Za-z0-9+/=]+$/.test(envKey)) {
      const buf = Buffer.from(envKey, 'base64');
      if (buf.length === 32) return buf;
    }
    // Hash arbitrary-length passphrase to 32 bytes
    return createHash('sha256').update(envKey, 'utf8').digest();
  }

  // Fallback key for non-production / unit tests
  const testFallback = process.env.NODE_ENV === 'production'
    ? null
    : '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  if (!testFallback) {
    throw new Error('TAX_VAULT_ENCRYPTION_KEY is required in production for tax identity operations.');
  }

  return Buffer.from(testFallback, 'hex');
}

/**
 * Normalizes a raw TIN string by stripping non-digit characters.
 */
export function normalizeTinDigits(raw: string): string {
  return raw.trim().replace(/\D/g, '');
}

/**
 * Validates whether a normalized string is a valid 9-digit TIN.
 */
export function isValidTin(raw: string): boolean {
  const digits = normalizeTinDigits(raw);
  return digits.length === 9 && !/^(000000000|111111111|999999999)$/.test(digits);
}

/**
 * Encrypts a 9-digit TIN using AES-256-GCM envelope encryption.
 */
export function encryptTin(rawTin: string, explicitType?: TinType): EncryptedTinPayload {
  const digits = normalizeTinDigits(rawTin);
  if (!isValidTin(digits)) {
    throw new Error('Taxpayer Identification Number must be a valid 9-digit identifier.');
  }

  const tinType: TinType = explicitType ?? (rawTin.includes('-') && rawTin.indexOf('-') === 2 ? 'ein' : 'ssn');
  const key = resolveVaultKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(digits, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    lastFour: digits.slice(-4),
    tinType,
  };
}

/**
 * Decrypts an encrypted TIN payload with AES-256-GCM authentication tag verification.
 */
export function decryptTin(payload: Pick<EncryptedTinPayload, 'ciphertext' | 'iv' | 'authTag'>): string {
  const key = resolveVaultKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid initialization vector length for tax decryption.');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const plaintext = decrypted.toString('utf8');

  if (!isValidTin(plaintext)) {
    throw new Error('Decrypted tax identity payload is invalid.');
  }

  return plaintext;
}

/**
 * Returns a masked representation of a TIN for display.
 */
export function formatTinMasked(lastFour: string, type: TinType = 'ein'): string {
  const cleanFour = lastFour.replace(/\D/g, '').slice(-4);
  if (type === 'ein') {
    return `••-•••${cleanFour}`;
  }
  return `•••-••-${cleanFour}`;
}
