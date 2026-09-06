import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHaloClaimToken,
  verifyHaloClaimToken,
} from '@/lib/neighborhood-halo-claim-token';

describe('Neighborhood Halo public claim capabilities', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'halo-claim-token-test-secret-with-enough-entropy');
  });

  it('signs a short-lived capability bound to both campaign and tenant', () => {
    const now = Date.now();
    const token = createHaloClaimToken('campaign-1', 'account-1', { expiresAt: now + 60_000 });

    expect(verifyHaloClaimToken(token, 'campaign-1', now)).toMatchObject({
      campaignId: 'campaign-1',
      accountId: 'account-1',
      expiresAt: now + 60_000,
    });
    expect(verifyHaloClaimToken(token, 'campaign-2', now)).toBeNull();
  });

  it('fails closed for tampered and expired capabilities', () => {
    const now = Date.now();
    const token = createHaloClaimToken('campaign-1', 'account-1', { expiresAt: now + 60_000 });
    const [payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({
      version: 1,
      campaignId: 'campaign-1',
      accountId: 'account-2',
      expiresAt: now + 60_000,
    })).toString('base64url');

    expect(verifyHaloClaimToken(`${tamperedPayload}.${signature}`, 'campaign-1', now)).toBeNull();
    expect(verifyHaloClaimToken(token, 'campaign-1', now + 60_001)).toBeNull();
    expect(verifyHaloClaimToken(`${payload}.not-a-real-signature`, 'campaign-1', now)).toBeNull();
  });

  it('does not sign or verify when the server-only root secret is absent', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    expect(() => createHaloClaimToken('campaign-1', 'account-1')).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(verifyHaloClaimToken('payload.signature', 'campaign-1')).toBeNull();
  });
});
