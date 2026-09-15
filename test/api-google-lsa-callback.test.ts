import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/google-lsa/callback/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/google-lsa/api', () => ({
  discoverGoogleLsaCustomers: vi.fn(),
}));

vi.mock('@/lib/google-lsa/connection', () => ({
  saveGoogleLsaAuthorization: vi.fn(),
}));

vi.mock('@/lib/google-lsa/oauth', () => ({
  exchangeGoogleCode: vi.fn(),
}));

vi.mock('@/lib/google-lsa/state', () => ({
  GOOGLE_LSA_STATE_COOKIE: 'google_lsa_nonce',
  verifyGoogleLsaState: vi.fn(),
}));

describe('Google LSA Callback Route', () => {
  let requireOwnerContextMock: any;
  let discoverGoogleLsaCustomersMock: any;
  let saveGoogleLsaAuthorizationMock: any;
  let exchangeGoogleCodeMock: any;
  let verifyGoogleLsaStateMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ accountId: 'acct_1', userId: 'user_1' });

    discoverGoogleLsaCustomersMock = (await import('@/lib/google-lsa/api')).discoverGoogleLsaCustomers;
    discoverGoogleLsaCustomersMock.mockResolvedValue([
      {
        customerId: '123',
        descriptiveName: 'Acme LSA',
        timeZone: 'UTC',
        loginCustomerId: '456',
        campaign: { id: '789' },
        campaignKind: 'LSA'
      }
    ]);

    saveGoogleLsaAuthorizationMock = (await import('@/lib/google-lsa/connection')).saveGoogleLsaAuthorization;
    saveGoogleLsaAuthorizationMock.mockResolvedValue(undefined);

    exchangeGoogleCodeMock = (await import('@/lib/google-lsa/oauth')).exchangeGoogleCode;
    exchangeGoogleCodeMock.mockResolvedValue({
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      accessExpiresIn: 3600
    });

    verifyGoogleLsaStateMock = (await import('@/lib/google-lsa/state')).verifyGoogleLsaState;
    verifyGoogleLsaStateMock.mockReturnValue(true);
  });

  it('redirects with cancelled if error param present', async () => {
    const req = new NextRequest('http://localhost/api/google-lsa/callback?error=access_denied');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=cancelled#google-local-services');
  });

  it('redirects with state if state verification fails', async () => {
    verifyGoogleLsaStateMock.mockReturnValue(false);
    const req = new NextRequest('http://localhost/api/google-lsa/callback?state=bad&code=123');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=state#google-local-services');
  });

  it('redirects with failed if no code present', async () => {
    const req = new NextRequest('http://localhost/api/google-lsa/callback?state=good');
    req.cookies.set('google_lsa_nonce', 'good');
    
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=failed#google-local-services');
  });

  it('redirects with connected on success', async () => {
    const req = new NextRequest('http://localhost/api/google-lsa/callback?state=good&code=real_code');
    req.cookies.set('google_lsa_nonce', 'good');

    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=connected#google-local-services');

    expect(exchangeGoogleCodeMock).toHaveBeenCalledWith('real_code');
    expect(discoverGoogleLsaCustomersMock).toHaveBeenCalledWith({ accessToken: 'access_1' });
    expect(saveGoogleLsaAuthorizationMock).toHaveBeenCalledWith({
      accountId: 'acct_1',
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      accessExpiresIn: 3600,
      connectedBy: 'user_1',
      candidates: [
        {
          customerId: '123',
          customerName: 'Acme LSA',
          timeZone: 'UTC',
          loginCustomerId: '456',
          campaignId: '789',
          campaignMode: 'LSA'
        }
      ]
    });
  });

  it('redirects with failed on error', async () => {
    exchangeGoogleCodeMock.mockRejectedValue(new Error('OAuth failed'));
    
    const req = new NextRequest('http://localhost/api/google-lsa/callback?state=good&code=bad_code');
    req.cookies.set('google_lsa_nonce', 'good');

    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=failed#google-local-services');
  });
});
