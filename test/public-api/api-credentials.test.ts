import { describe, it, expect } from 'vitest';
import {
  generateApiTokenSecret,
  hashApiToken,
  isValidApiTokenFormat,
  ALL_API_SCOPES,
} from '@/lib/public-api/api-credentials';

describe('API Credentials & Token Management', () => {
  it('generates token with lgq_live_ prefix and valid base64url entropy', () => {
    const token = generateApiTokenSecret();
    expect(token).toMatch(/^lgq_live_[A-Za-z0-9_-]{43}$/);
    expect(isValidApiTokenFormat(token)).toBe(true);
  });

  it('correctly validates valid and invalid token formats', () => {
    expect(isValidApiTokenFormat('lgq_live_1234567890123456789012345678901234567890123')).toBe(true);
    expect(isValidApiTokenFormat('invalid_token')).toBe(false);
    expect(isValidApiTokenFormat('lgq_test_1234567890123456789012345678901234567890123')).toBe(false);
    expect(isValidApiTokenFormat('')).toBe(false);
  });

  it('generates deterministic SHA-256 hashes for secret tokens', () => {
    const token = 'lgq_live_testsecretkey1234567890123456789012345678';
    const hash1 = hashApiToken(token);
    const hash2 = hashApiToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // 32 bytes hex
  });

  it('includes all necessary scopes for Release 1', () => {
    expect(ALL_API_SCOPES).toContain('leads.read');
    expect(ALL_API_SCOPES).toContain('leads.write');
    expect(ALL_API_SCOPES).toContain('webhooks.manage');
  });
});
