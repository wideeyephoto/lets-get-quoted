import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/quickbooks/callback/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/quickbooks/oauth', () => ({
  exchangeCodeForTokens: vi.fn(),
  quickBooksApiHost: vi.fn().mockReturnValue('https://api.quickbooks.com'),
}));

vi.mock('@/lib/quickbooks/connection', () => ({
  saveConnection: vi.fn(),
}));

vi.mock('@/lib/quickbooks/state', () => ({
  STATE_COOKIE: 'qb_state',
  verifyState: vi.fn(),
}));

describe('Quickbooks Callback Route', () => {
  let requireOwnerContextMock: any;
  let exchangeCodeForTokensMock: any;
  let saveConnectionMock: any;
  let verifyStateMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ accountId: 'acct_1', userEmail: 'test@example.com' });

    exchangeCodeForTokensMock = (await import('@/lib/quickbooks/oauth')).exchangeCodeForTokens;
    exchangeCodeForTokensMock.mockResolvedValue({
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      accessExpiresIn: 3600,
      refreshExpiresIn: 7200,
    });

    saveConnectionMock = (await import('@/lib/quickbooks/connection')).saveConnection;
    saveConnectionMock.mockResolvedValue(undefined);

    verifyStateMock = (await import('@/lib/quickbooks/state')).verifyState;
    verifyStateMock.mockReturnValue(true);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ CompanyInfo: { CompanyName: 'Acme Corp' } }),
    });
  });

  const makeReq = (url: string, cookieValue: string | null = 'nonce_1') => {
    const req = new NextRequest(url);
    if (cookieValue) {
      req.cookies.set('qb_state', cookieValue);
    }
    return req;
  };

  it('handles cancellation', async () => {
    const req = makeReq('http://localhost/api/quickbooks/callback?error=access_denied');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?quickbooks=cancelled#quickbooks');
  });

  it('fails on invalid state', async () => {
    verifyStateMock.mockReturnValue(false);
    const req = makeReq('http://localhost/api/quickbooks/callback?state=bad&code=1&realmId=123');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?quickbooks=state#quickbooks');
    expect(verifyStateMock).toHaveBeenCalledWith('bad', 'acct_1', 'nonce_1');
  });

  it('fails if missing code or realm', async () => {
    const req = makeReq('http://localhost/api/quickbooks/callback?state=valid');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?quickbooks=failed#quickbooks');
  });

  it('exchanges code and saves connection', async () => {
    const req = makeReq('http://localhost/api/quickbooks/callback?state=valid&code=code_1&realmId=realm_1');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?quickbooks=connected#quickbooks');
    expect(exchangeCodeForTokensMock).toHaveBeenCalledWith('code_1');
    expect(saveConnectionMock).toHaveBeenCalledWith({
      accountId: 'acct_1',
      realmId: 'realm_1',
      companyName: 'Acme Corp',
      accessToken: 'access_1',
      refreshToken: 'refresh_1',
      accessExpiresIn: 3600,
      refreshExpiresIn: 7200,
      connectedBy: 'test@example.com',
    });
  });

  it('handles missing company name gracefully', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });
    const req = makeReq('http://localhost/api/quickbooks/callback?state=valid&code=code_1&realmId=realm_1');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(saveConnectionMock).toHaveBeenCalledWith(expect.objectContaining({ companyName: null }));
  });

  it('redirects to failed if token exchange fails', async () => {
    exchangeCodeForTokensMock.mockRejectedValue(new Error('exchange failed'));
    const req = makeReq('http://localhost/api/quickbooks/callback?state=valid&code=code_1&realmId=realm_1');
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?quickbooks=failed#quickbooks');
  });
});
