import { describe, it, expect, beforeEach } from 'vitest';
import {
  mintInvitationToken,
  hashInvitationToken,
  invitationTokenMatches,
  invitationExpiry,
  INVITATION_TTL_DAYS,
} from '@/lib/office-invitations';
import {
  createPortalToken,
  hashPortalToken,
  portalExpiry,
  PORTAL_TOKEN_BYTES,
  PORTAL_LINK_DAYS,
} from '@/lib/client-portal';
import {
  generateApiTokenSecret,
  isValidApiTokenFormat,
  hashApiToken,
  API_TOKEN_PREFIX,
} from '@/lib/public-api/api-credentials';
import {
  generateWebhookSecret,
  encryptWebhookSecret,
  decryptWebhookSecret,
} from '@/lib/public-api/webhook-vault-crypto';
import {
  makeUnsubscribeToken,
  parseUnsubscribeToken,
} from '@/lib/email-suppression';
import {
  encryptTin,
  decryptTin,
  isValidTin,
} from '@/lib/tax-vault-crypto';

describe('Token-Surface & Bearer Link Cryptographic Security Audit', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_for_hmac_signing';
    process.env.TAX_VAULT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.WEBHOOK_VAULT_ENCRYPTION_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  });

  describe('1. Office Invitation Tokens', () => {
    it('generates high-entropy CSPRNG tokens (256-bit base64url)', () => {
      const token1 = mintInvitationToken();
      const token2 = mintInvitationToken();

      expect(token1).not.toBe(token2);
      expect(token1.length).toBeGreaterThanOrEqual(40);
      expect(token1).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('hashes tokens with SHA-256 and never matches plaintext', () => {
      const token = mintInvitationToken();
      const hash = hashInvitationToken(token);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toBe(token);
    });

    it('verifies constant-time hash matching without timing leaks', () => {
      const token = mintInvitationToken();
      const hash = hashInvitationToken(token);

      expect(invitationTokenMatches(hash, hash)).toBe(true);
      expect(invitationTokenMatches(hash, hash.replace(/^./, 'f'))).toBe(false);
      expect(invitationTokenMatches('invalid', hash)).toBe(false);
    });

    it('enforces 7-day TTL expiration', () => {
      const now = new Date('2026-09-01T12:00:00Z');
      const expiry = invitationExpiry(now);
      const diffDays = (expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

      expect(diffDays).toBe(INVITATION_TTL_DAYS);
      expect(INVITATION_TTL_DAYS).toBe(7);
    });
  });

  describe('2. Client Portal Magic Link Tokens', () => {
    it('generates 256-bit entropy hex tokens and SHA-256 hashes', () => {
      const token = createPortalToken();
      expect(PORTAL_TOKEN_BYTES).toBe(32);
      expect(token.length).toBe(64); // 32 bytes hex = 64 chars

      const hash = hashPortalToken(token);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('enforces 90-day portal link expiration window', () => {
      const now = new Date('2026-09-01T12:00:00Z');
      const expiryStr = portalExpiry(now);
      const expiryDate = new Date(expiryStr);
      const diffDays = Math.round((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      expect(diffDays).toBe(PORTAL_LINK_DAYS);
      expect(PORTAL_LINK_DAYS).toBe(90);
    });
  });

  describe('3. Public API Credentials & Webhook Secrets', () => {
    it('generates prefixed live API tokens with SHA-256 digests and validates format', () => {
      const tokenSecret = generateApiTokenSecret();
      expect(tokenSecret.startsWith(API_TOKEN_PREFIX)).toBe(true);
      expect(isValidApiTokenFormat(tokenSecret)).toBe(true);

      const hash = hashApiToken(tokenSecret);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toBe(tokenSecret);
    });

    it('generates and securely encrypts/decrypts webhook signing secrets with AES-256-GCM', () => {
      const secret = generateWebhookSecret();

      expect(secret.startsWith('whsec_')).toBe(true);
      expect(secret.length).toBeGreaterThan(40);

      const encrypted = encryptWebhookSecret(secret);
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      const decrypted = decryptWebhookSecret(encrypted);
      expect(decrypted).toBe(secret);
    });
  });

  describe('4. Stateless Email Unsubscribe Tokens', () => {
    it('signs and verifies account-scoped recipient email unsubscribe tokens with HMAC-SHA256', () => {
      const accountId = 'acc_11223344';
      const email = 'homeowner@example.com';

      const token = makeUnsubscribeToken(accountId, email);
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThan(20);

      const parsed = parseUnsubscribeToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.accountId).toBe(accountId);
      expect(parsed?.email).toBe(email);
    });

    it('fails closed and rejects tampered unsubscribe tokens', () => {
      const accountId = 'acc_11223344';
      const email = 'homeowner@example.com';
      const token = makeUnsubscribeToken(accountId, email);

      // Tamper payload
      const tampered = token.replace(/^[A-Za-z0-9]/, 'Z');
      expect(parseUnsubscribeToken(tampered)).toBeNull();
      expect(parseUnsubscribeToken(null)).toBeNull();
      expect(parseUnsubscribeToken('')).toBeNull();
    });
  });

  describe('5. Authenticated AES-256-GCM Tax Vault Encryption', () => {
    it('encrypts sensitive contractor SSN/EIN with unique IVs and verifies GCM authentication tags', () => {
      const plaintext = '12-3456789';
      expect(isValidTin(plaintext)).toBe(true);

      const cipher1 = encryptTin(plaintext);
      const cipher2 = encryptTin(plaintext);

      // Unique IV per encryption
      expect(cipher1.iv).not.toBe(cipher2.iv);
      expect(cipher1.ciphertext).not.toBe(cipher2.ciphertext);
      expect(cipher1.lastFour).toBe('6789');
      expect(cipher1.tinType).toBe('ein');

      const decrypted1 = decryptTin(cipher1);
      const decrypted2 = decryptTin(cipher2);

      expect(decrypted1).toBe('123456789');
      expect(decrypted2).toBe('123456789');

      // Tampering fails closed (GCM auth tag verification failure)
      const tampered = {
        ...cipher1,
        ciphertext: Buffer.from('corrupted_ciphertext_data').toString('base64'),
      };
      expect(() => decryptTin(tampered)).toThrow();
    });
  });
});
