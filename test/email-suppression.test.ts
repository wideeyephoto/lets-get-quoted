import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  makeUnsubscribeToken,
  parseUnsubscribeToken,
  resolveMarketingMailingAddress,
} from '@/lib/email-suppression';

const ACC = '11111111-2222-3333-4444-555555555555';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('unsubscribe token round-trip', () => {
  it('signs and verifies (account_id, email), lowercasing + trimming the email', () => {
    const token = makeUnsubscribeToken(ACC, '  Owner@Example.COM ');
    const parsed = parseUnsubscribeToken(token);
    expect(parsed).toEqual({ accountId: ACC, email: 'owner@example.com' });
  });

  it('produces different tokens for different emails', () => {
    expect(makeUnsubscribeToken(ACC, 'a@x.com')).not.toBe(makeUnsubscribeToken(ACC, 'b@x.com'));
  });

  it('rejects a tampered payload', () => {
    const token = makeUnsubscribeToken(ACC, 'owner@example.com');
    const [payload, sig] = token.split('.');
    const flipped = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A');
    expect(parseUnsubscribeToken(`${flipped}.${sig}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = makeUnsubscribeToken(ACC, 'owner@example.com');
    const [payload] = token.split('.');
    expect(parseUnsubscribeToken(`${payload}.deadbeef`)).toBeNull();
  });

  it('rejects malformed / empty tokens', () => {
    expect(parseUnsubscribeToken(null)).toBeNull();
    expect(parseUnsubscribeToken(undefined)).toBeNull();
    expect(parseUnsubscribeToken('')).toBeNull();
    expect(parseUnsubscribeToken('no-dot-here')).toBeNull();
    expect(parseUnsubscribeToken('.onlysig')).toBeNull();
  });

  it('is bound to the signing secret — a token signed under a different key does not verify', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'a-totally-different-secret');
    const foreign = makeUnsubscribeToken(ACC, 'owner@example.com');
    vi.unstubAllEnvs(); // restore the suite's default secret
    expect(parseUnsubscribeToken(foreign)).toBeNull();
  });
});

describe('resolveMarketingMailingAddress', () => {
  it('prefers the contractor address when present', () => {
    vi.stubEnv('COMPANY_MAILING_ADDRESS', '2222 W. Grand River Ave STE A, Okemos, MI 48864');
    expect(resolveMarketingMailingAddress('123 Contractor Rd, Lansing, MI')).toBe('123 Contractor Rd, Lansing, MI');
  });

  it('falls back to the platform address when the contractor has none', () => {
    vi.stubEnv('COMPANY_MAILING_ADDRESS', '2222 W. Grand River Ave STE A, Okemos, MI 48864');
    expect(resolveMarketingMailingAddress('   ')).toBe('2222 W. Grand River Ave STE A, Okemos, MI 48864');
    expect(resolveMarketingMailingAddress(null)).toBe('2222 W. Grand River Ave STE A, Okemos, MI 48864');
  });

  it('returns null when neither is set', () => {
    vi.stubEnv('COMPANY_MAILING_ADDRESS', '');
    expect(resolveMarketingMailingAddress(null)).toBeNull();
    expect(resolveMarketingMailingAddress('')).toBeNull();
  });
});
