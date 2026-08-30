import { describe, it, expect } from 'vitest';
import {
  encryptTin,
  decryptTin,
  formatTinMasked,
  isValidTin,
  normalizeTinDigits,
} from '../src/lib/tax-vault-crypto';

describe('Tax Vault Crypto: Normalization and Validation', () => {
  it('normalizes raw TIN digits removing punctuation and spaces', () => {
    expect(normalizeTinDigits(' 12-3456789 ')).toBe('123456789');
    expect(normalizeTinDigits('123-45-6789')).toBe('123456789');
    expect(normalizeTinDigits('12 34 56 789')).toBe('123456789');
  });

  it('validates valid 9-digit TINs', () => {
    expect(isValidTin('12-3456789')).toBe(true);
    expect(isValidTin('123-45-6789')).toBe(true);
    expect(isValidTin('987654321')).toBe(true);
  });

  it('rejects invalid TINs', () => {
    expect(isValidTin('12345678')).toBe(false); // 8 digits
    expect(isValidTin('1234567890')).toBe(false); // 10 digits
    expect(isValidTin('000000000')).toBe(false); // repeated zero dummy
    expect(isValidTin('111111111')).toBe(false); // repeated one dummy
    expect(isValidTin('')).toBe(false);
  });
});

describe('Tax Vault Crypto: Envelope Encryption & Decryption', () => {
  it('encrypts and decrypts EIN payload correctly', () => {
    const rawEin = '12-3456789';
    const encrypted = encryptTin(rawEin, 'ein');

    expect(encrypted.tinType).toBe('ein');
    expect(encrypted.lastFour).toBe('6789');
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
    expect(encrypted.iv.length).toBeGreaterThan(0);
    expect(encrypted.authTag.length).toBeGreaterThan(0);

    const decrypted = decryptTin(encrypted);
    expect(decrypted).toBe('123456789');
  });

  it('encrypts and decrypts SSN payload correctly', () => {
    const rawSsn = '987-65-4321';
    const encrypted = encryptTin(rawSsn, 'ssn');

    expect(encrypted.tinType).toBe('ssn');
    expect(encrypted.lastFour).toBe('4321');

    const decrypted = decryptTin(encrypted);
    expect(decrypted).toBe('987654321');
  });

  it('fails when ciphertext or authTag is tampered with', () => {
    const encrypted = encryptTin('12-3456789', 'ein');
    const tampered = {
      ...encrypted,
      authTag: Buffer.from('badauthtag123456').toString('base64'),
    };

    expect(() => {
      decryptTin(tampered);
    }).toThrow();
  });
});

describe('Tax Vault Crypto: Masking Format', () => {
  it('masks EIN as ••-•••XXXX', () => {
    expect(formatTinMasked('6789', 'ein')).toBe('••-•••6789');
  });

  it('masks SSN as •••-••-XXXX', () => {
    expect(formatTinMasked('4321', 'ssn')).toBe('•••-••-4321');
  });
});
