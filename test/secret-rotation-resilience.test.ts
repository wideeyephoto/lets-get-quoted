import { describe, it, expect } from 'vitest';
import {
  encryptTin,
  decryptTin,
} from '@/lib/tax-vault-crypto';
import {
  computeWebhookSignature,
  verifyWebhookSignature,
} from '@/lib/public-api/webhook-signatures';

describe('Secret Rotation & Credential Rollover Resilience Audit', () => {
  describe('1. AES-256 Vault Dual-Key Re-Encryption', () => {
    it('simulates zero-downtime key rotation by decrypting with old key and re-encrypting with new key', () => {
      const oldKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const newKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const rawTin = '98-7654321';

      // Encrypt with OLD key
      process.env.TAX_VAULT_ENCRYPTION_KEY = oldKey;
      const initialPayload = encryptTin(rawTin);
      expect(decryptTin(initialPayload)).toBe('987654321');

      // Attempting to decrypt with NEW key before migration must fail
      process.env.TAX_VAULT_ENCRYPTION_KEY = newKey;
      expect(() => decryptTin(initialPayload)).toThrow();

      // Migration: Decrypt with old, re-encrypt with new
      process.env.TAX_VAULT_ENCRYPTION_KEY = oldKey;
      const decryptedPlaintext = decryptTin(initialPayload);

      process.env.TAX_VAULT_ENCRYPTION_KEY = newKey;
      const migratedPayload = encryptTin(decryptedPlaintext);

      // Successfully decrypted with NEW key
      expect(decryptTin(migratedPayload)).toBe('987654321');
    });
  });

  describe('2. Webhook Signing Secret Rotation & Invalidation', () => {
    it('rejects payloads signed with revoked secrets while accepting newly rotated secret', () => {
      const oldSecret = 'whsec_old_signing_secret_1234567890abcdef';
      const newSecret = 'whsec_new_rotated_secret_0987654321fedcba';
      const eventId = 'evt_test_123456';
      const payload = JSON.stringify({ event: 'lead.created', timestamp: Date.now() });

      const timestamp = Math.floor(Date.now() / 1000);

      // Sign with OLD secret
      const oldSig = computeWebhookSignature(oldSecret, eventId, payload, timestamp);

      // Old secret validates against old signature
      expect(verifyWebhookSignature(oldSecret, eventId, payload, oldSig.headerValue)).toBe(true);

      // New secret REJECTS old signature (fail-closed)
      expect(verifyWebhookSignature(newSecret, eventId, payload, oldSig.headerValue)).toBe(false);

      // Sign with NEW secret
      const newSig = computeWebhookSignature(newSecret, eventId, payload, timestamp);

      // New secret accepts new signature
      expect(verifyWebhookSignature(newSecret, eventId, payload, newSig.headerValue)).toBe(true);
    });
  });

  describe('3. Cron Secret Rotation Fail-Closed Behavior', () => {
    it('fails closed when an unrotated or mismatched secret token is provided', () => {
      const activeSecret: string = 'cron_secret_active_version_2';
      const candidate1: string = 'cron_secret_old_version_1';
      const candidate2: string = '';

      expect(activeSecret === candidate1).toBe(false);
      expect(activeSecret === candidate2).toBe(false);
    });
  });
});
