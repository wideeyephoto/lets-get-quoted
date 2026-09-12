import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GETConnect } from '@/app/api/quickbooks/connect/route';
import { GET as GETCallback } from '@/app/api/quickbooks/callback/route';
import { POST as POSTDisconnect } from '@/app/api/quickbooks/disconnect/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/quickbooks/oauth', () => ({
  quickBooksConfigured: vi.fn(),
  buildAuthorizeUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  revokeToken: vi.fn(),
  quickBooksApiHost: vi.fn().mockReturnValue('https://qbo.intuit.com'),
}));

vi.mock('@/lib/quickbooks/state', () => ({
  STATE_COOKIE: 'qb_state',
  buildState: vi.fn(),
  verifyState: vi.fn(),
}));

vi.mock('@/lib/quickbooks/connection', () => ({
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn().mockReturnValue({ toString: () => 'fake_nonce' }),
}));

describe('Quickbooks Auth Routes', () => {
  let requireOwnerContextMock: any;
  let createAdminClientMock: any;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    
    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({
      accountId: 'acct_123',
      userEmail: 'user@example.com'
    });

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
  });

  describe('Connect', () => {
    let quickBooksConfiguredMock: any;
    let buildAuthorizeUrlMock: any;
    let buildStateMock: any;

    beforeEach(async () => {
      quickBooksConfiguredMock = (await import('@/lib/quickbooks/oauth')).quickBooksConfigured;
      buildAuthorizeUrlMock = (await import('@/lib/quickbooks/oauth')).buildAuthorizeUrl;
      buildStateMock = (await import('@/lib/quickbooks/state')).buildState;
    });

    it('redirects to authorize URL with state and cookie', async () => {
      quickBooksConfiguredMock.mockReturnValue(true);
      buildStateMock.mockReturnValue('fake_state');
      buildAuthorizeUrlMock.mockReturnValue('https://authorize.intuit.com?state=fake_state');

      const req = new NextRequest('http://localhost/api/quickbooks/connect');
      const res = await GETConnect();

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('https://authorize.intuit.com');
      expect(res.headers.get('location')).toContain('state=fake_state');
      
      const cookies = res.cookies.getAll();
      expect(cookies.some(c => c.name === 'qb_state' && c.value === 'fake_nonce')).toBe(true);
      
      expect(buildStateMock).toHaveBeenCalledWith('acct_123', 'fake_nonce');
    });

    it('redirects to settings with unconfigured param if not configured', async () => {
      quickBooksConfiguredMock.mockReturnValue(false);

      const req = new NextRequest('http://localhost/api/quickbooks/connect');
      const res = await GETConnect();

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/dashboard/settings?quickbooks=unconfigured');
    });
  });

  describe('Callback', () => {
    let verifyStateMock: any;
    let exchangeCodeForTokensMock: any;
    let saveConnectionMock: any;

    beforeEach(async () => {
      verifyStateMock = (await import('@/lib/quickbooks/state')).verifyState;
      exchangeCodeForTokensMock = (await import('@/lib/quickbooks/oauth')).exchangeCodeForTokens;
      saveConnectionMock = (await import('@/lib/quickbooks/connection')).saveConnection;
    });

    const createCallbackRequest = (url: string, nonce: string | null = 'fake_nonce') => {
      const headers = new Headers();
      if (nonce) headers.set('cookie', `qb_state=${nonce}`);
      return new NextRequest(url, { headers });
    };

    it('handles cancellation', async () => {
      const req = createCallbackRequest('http://localhost/api/quickbooks/callback?error=access_denied');
      const res = await GETCallback(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('quickbooks=cancelled');
      // Should delete cookie
      expect(res.cookies.get('qb_state')?.value).toBe('');
    });

    it('handles state verification failure', async () => {
      verifyStateMock.mockReturnValue(false);
      const req = createCallbackRequest('http://localhost/api/quickbooks/callback?code=fake_code&realmId=123&state=bad_state');
      const res = await GETCallback(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('quickbooks=state');
      expect(verifyStateMock).toHaveBeenCalledWith('bad_state', 'acct_123', 'fake_nonce');
    });

    it('handles missing code or realm', async () => {
      verifyStateMock.mockReturnValue(true);
      const req = createCallbackRequest('http://localhost/api/quickbooks/callback?state=good_state');
      const res = await GETCallback(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('quickbooks=failed');
    });

    it('exchanges tokens and saves connection', async () => {
      verifyStateMock.mockReturnValue(true);
      exchangeCodeForTokensMock.mockResolvedValue({
        accessToken: 'access_t',
        refreshToken: 'refresh_t',
        accessExpiresIn: 3600,
        refreshExpiresIn: 86400,
      });

      // Mock fetch for companyName
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ CompanyInfo: { CompanyName: 'Test Company' } })
      });

      const req = createCallbackRequest('http://localhost/api/quickbooks/callback?code=good_code&realmId=123&state=good_state');
      const res = await GETCallback(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('quickbooks=connected');
      
      expect(saveConnectionMock).toHaveBeenCalledWith({
        accountId: 'acct_123',
        realmId: '123',
        companyName: 'Test Company',
        accessToken: 'access_t',
        refreshToken: 'refresh_t',
        accessExpiresIn: 3600,
        refreshExpiresIn: 86400,
        connectedBy: 'user@example.com',
      });
    });

    it('handles exchange token failure gracefully', async () => {
      verifyStateMock.mockReturnValue(true);
      exchangeCodeForTokensMock.mockRejectedValue(new Error('Network error'));
      
      const req = createCallbackRequest('http://localhost/api/quickbooks/callback?code=good_code&realmId=123&state=good_state');
      const res = await GETCallback(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('quickbooks=failed');
    });
  });

  describe('Disconnect', () => {
    let revokeTokenMock: any;
    let deleteConnectionMock: any;

    beforeEach(async () => {
      revokeTokenMock = (await import('@/lib/quickbooks/oauth')).revokeToken;
      deleteConnectionMock = (await import('@/lib/quickbooks/connection')).deleteConnection;
      
      createAdminClientMock.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { refresh_token: 'refresh_t' } })
            })
          })
        })
      });
    });

    it('revokes token and deletes connection', async () => {
      const req = new NextRequest('http://localhost/api/quickbooks/disconnect', { method: 'POST' });
      const res = await POSTDisconnect(req);

      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toContain('quickbooks=disconnected');
      
      expect(revokeTokenMock).toHaveBeenCalledWith('refresh_t');
      expect(deleteConnectionMock).toHaveBeenCalledWith('acct_123');
    });

    it('deletes connection even if revoke fails', async () => {
      revokeTokenMock.mockRejectedValue(new Error('Revoke failed'));

      const req = new NextRequest('http://localhost/api/quickbooks/disconnect', { method: 'POST' });
      const res = await POSTDisconnect(req);

      expect(res.status).toBe(303);
      expect(deleteConnectionMock).toHaveBeenCalledWith('acct_123');
    });

    it('deletes connection if no refresh token is found', async () => {
      createAdminClientMock.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null })
            })
          })
        })
      });

      const req = new NextRequest('http://localhost/api/quickbooks/disconnect', { method: 'POST' });
      const res = await POSTDisconnect(req);

      expect(res.status).toBe(303);
      expect(revokeTokenMock).not.toHaveBeenCalled();
      expect(deleteConnectionMock).toHaveBeenCalledWith('acct_123');
    });
  });
});
