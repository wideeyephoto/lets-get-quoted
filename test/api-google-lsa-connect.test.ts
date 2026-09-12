import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/google-lsa/connect/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/google-lsa/oauth', () => ({
  buildGoogleAuthorizeUrl: vi.fn(),
  googleLsaConfigured: vi.fn(),
}));

vi.mock('@/lib/google-lsa/state', () => ({
  buildGoogleLsaState: vi.fn(),
  GOOGLE_LSA_STATE_COOKIE: 'google_lsa_nonce',
}));

describe('Google LSA Connect Route', () => {
  let requireOwnerContextMock: any;
  let googleLsaConfiguredMock: any;
  let buildGoogleAuthorizeUrlMock: any;
  let buildGoogleLsaStateMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.NEXT_PUBLIC_APP_URL = 'http://testapp.com';

    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ accountId: 'acct_1', userId: 'user_1' });

    googleLsaConfiguredMock = (await import('@/lib/google-lsa/oauth')).googleLsaConfigured;
    googleLsaConfiguredMock.mockReturnValue(true);

    buildGoogleAuthorizeUrlMock = (await import('@/lib/google-lsa/oauth')).buildGoogleAuthorizeUrl;
    buildGoogleAuthorizeUrlMock.mockReturnValue('https://google.com/auth');

    buildGoogleLsaStateMock = (await import('@/lib/google-lsa/state')).buildGoogleLsaState;
    buildGoogleLsaStateMock.mockReturnValue('fake_state');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('redirects with unconfigured if not configured', async () => {
    googleLsaConfiguredMock.mockReturnValue(false);
    
    const req = new NextRequest('http://localhost/api/google-lsa/connect');
    const res = await GET();
    
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://testapp.com/dashboard/settings?google_lsa=unconfigured#google-local-services');
  });

  it('redirects to authorize url and sets cookie', async () => {
    const res = await GET();
    
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://google.com/auth');
    
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('google_lsa_nonce=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=lax');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).toContain('Path=/');
    
    expect(buildGoogleLsaStateMock).toHaveBeenCalled();
    const args = buildGoogleLsaStateMock.mock.calls[0];
    expect(args[0]).toBe('acct_1');
    expect(args[1]).toBe('user_1');
    expect(args[2]).toHaveLength(32); // base64url of 24 bytes
  });
});
