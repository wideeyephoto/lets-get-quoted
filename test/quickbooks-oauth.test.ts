import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  accessTokenExpired, refreshTokenExpired, expiryFromNow, quickBooksApiHost,
  quickBooksEnvironment, quickBooksConfigured, quickBooksRedirectUri, buildAuthorizeUrl,
  ACCESS_TOKEN_SKEW_MS,
} from '../src/lib/quickbooks/oauth';

const saved = { ...process.env };
beforeEach(() => { process.env = { ...saved }; });
afterEach(() => { process.env = { ...saved }; });

describe('environment', () => {
  it('defaults to sandbox unless production is named exactly', () => {
    delete process.env.QUICKBOOKS_ENVIRONMENT;
    expect(quickBooksEnvironment()).toBe('sandbox');
    process.env.QUICKBOOKS_ENVIRONMENT = 'Production';
    expect(quickBooksEnvironment()).toBe('sandbox');
    process.env.QUICKBOOKS_ENVIRONMENT = 'production';
    expect(quickBooksEnvironment()).toBe('production');
  });

  it('points at a different API host per environment', () => {
    // Getting this backwards produces a connect flow that works and a first API
    // call that 401s.
    expect(quickBooksApiHost('sandbox')).toContain('sandbox-quickbooks');
    expect(quickBooksApiHost('production')).toBe('https://quickbooks.api.intuit.com');
  });
});

describe('configuration', () => {
  it('is unconfigured without BOTH halves of the credential', () => {
    delete process.env.QUICKBOOKS_CLIENT_ID;
    delete process.env.QUICKBOOKS_CLIENT_SECRET;
    expect(quickBooksConfigured()).toBe(false);
    process.env.QUICKBOOKS_CLIENT_ID = 'abc';
    expect(quickBooksConfigured()).toBe(false);
    process.env.QUICKBOOKS_CLIENT_SECRET = 'shh';
    expect(quickBooksConfigured()).toBe(true);
  });
});

describe('redirect uri', () => {
  it('comes from configuration, never from a request', () => {
    delete process.env.QUICKBOOKS_REDIRECT_URI;
    process.env.NEXT_PUBLIC_APP_URL = 'https://letsgetquoted.com';
    expect(quickBooksRedirectUri()).toBe('https://letsgetquoted.com/api/quickbooks/callback');
  });

  it('tolerates a trailing slash on the app url', () => {
    delete process.env.QUICKBOOKS_REDIRECT_URI;
    process.env.NEXT_PUBLIC_APP_URL = 'https://letsgetquoted.com/';
    expect(quickBooksRedirectUri()).toBe('https://letsgetquoted.com/api/quickbooks/callback');
  });

  it('an explicit override wins, for local development', () => {
    process.env.QUICKBOOKS_REDIRECT_URI = 'http://localhost:3010/api/quickbooks/callback';
    expect(quickBooksRedirectUri()).toBe('http://localhost:3010/api/quickbooks/callback');
  });
});

describe('authorize url', () => {
  it('asks for accounting scope only — never payments', () => {
    process.env.QUICKBOOKS_CLIENT_ID = 'client-123';
    process.env.NEXT_PUBLIC_APP_URL = 'https://letsgetquoted.com';
    delete process.env.QUICKBOOKS_REDIRECT_URI;
    const url = new URL(buildAuthorizeUrl('nonce.sig'));
    expect(url.origin + url.pathname).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(url.searchParams.get('scope')).toBe('com.intuit.quickbooks.accounting');
    expect(url.searchParams.get('scope')).not.toContain('payment');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('state')).toBe('nonce.sig');
  });

  it('never leaks the client secret into the URL', () => {
    process.env.QUICKBOOKS_CLIENT_ID = 'client-123';
    process.env.QUICKBOOKS_CLIENT_SECRET = 'super-secret-value';
    expect(buildAuthorizeUrl('s')).not.toContain('super-secret-value');
  });
});

describe('expiry', () => {
  const NOW = 1_800_000_000_000;

  it('treats an access token as expired a few minutes early', () => {
    // A token that passes the check and then dies mid-request produces a
    // half-applied sync, which is much worse than one extra refresh.
    const justInsideSkew = new Date(NOW + ACCESS_TOKEN_SKEW_MS - 1000).toISOString();
    expect(accessTokenExpired(justInsideSkew, NOW)).toBe(true);
    const comfortablyValid = new Date(NOW + 30 * 60 * 1000).toISOString();
    expect(accessTokenExpired(comfortablyValid, NOW)).toBe(false);
  });

  it('applies NO skew to the refresh token', () => {
    // The only remedy is the owner re-authorising, so don't retire it early.
    const nearlyDead = new Date(NOW + 1000).toISOString();
    expect(refreshTokenExpired(nearlyDead, NOW)).toBe(false);
    expect(refreshTokenExpired(new Date(NOW - 1).toISOString(), NOW)).toBe(true);
  });

  it('treats an unparseable expiry as expired, not as valid forever', () => {
    expect(accessTokenExpired('not a date', NOW)).toBe(true);
    expect(refreshTokenExpired('', NOW)).toBe(true);
  });

  it('turns Intuit seconds into a timestamp', () => {
    expect(expiryFromNow(3600, NOW)).toBe(new Date(NOW + 3_600_000).toISOString());
    expect(expiryFromNow(8_726_400, NOW)).toBe(new Date(NOW + 8_726_400_000).toISOString());
  });
});

describe('oauth state', () => {
  // Imported here rather than at the top because these read the service-role key
  // at call time, and the env is reset between tests above.
  it('binds the nonce to the ACCOUNT, not just the browser', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
    const { buildState, verifyState } = await import('../src/lib/quickbooks/state');

    const state = buildState('account-A', 'nonce-1');
    expect(verifyState(state, 'account-A', 'nonce-1')).toBe(true);

    // The whole point: a code started under one account cannot be redeemed
    // against another, even from the same browser holding the same cookie.
    expect(verifyState(state, 'account-B', 'nonce-1')).toBe(false);
  });

  it('rejects a state whose nonce does not match the cookie', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
    const { buildState, verifyState } = await import('../src/lib/quickbooks/state');
    const state = buildState('account-A', 'nonce-1');
    expect(verifyState(state, 'account-A', 'a-different-nonce')).toBe(false);
    expect(verifyState(state, 'account-A', '')).toBe(false);
  });

  it('rejects a forged or malformed state', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-signing-key';
    const { verifyState } = await import('../src/lib/quickbooks/state');
    expect(verifyState('nonce-1.deadbeef', 'account-A', 'nonce-1')).toBe(false);
    expect(verifyState('nonce-1', 'account-A', 'nonce-1')).toBe(false);
    expect(verifyState('', 'account-A', 'nonce-1')).toBe(false);
  });
});
