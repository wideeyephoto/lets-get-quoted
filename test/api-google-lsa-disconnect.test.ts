import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/google-lsa/disconnect/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/google-lsa/connection', () => ({
  disconnectGoogleLsaConnection: vi.fn(),
}));

vi.mock('@/lib/google-lsa/oauth', () => ({
  revokeGoogleToken: vi.fn(),
}));

describe('Google LSA Disconnect Route', () => {
  let requireOwnerContextMock: any;
  let createAdminClientMock: any;
  let disconnectGoogleLsaConnectionMock: any;
  let revokeGoogleTokenMock: any;
  let maybeSingleMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ accountId: 'acct_1' });

    maybeSingleMock = vi.fn().mockResolvedValue({ data: { refresh_token: 'token_1' } });
    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: maybeSingleMock
          })
        })
      })
    });

    disconnectGoogleLsaConnectionMock = (await import('@/lib/google-lsa/connection')).disconnectGoogleLsaConnection;
    disconnectGoogleLsaConnectionMock.mockResolvedValue(undefined);

    revokeGoogleTokenMock = (await import('@/lib/google-lsa/oauth')).revokeGoogleToken;
    revokeGoogleTokenMock.mockResolvedValue(true);
  });

  it('revokes remote token and disconnects locally', async () => {
    const req = new NextRequest('http://localhost/api/google-lsa/disconnect', { method: 'POST' });
    const res = await POST(req);
    
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=disconnected#google-local-services');
    
    expect(revokeGoogleTokenMock).toHaveBeenCalledWith('token_1');
    expect(disconnectGoogleLsaConnectionMock).toHaveBeenCalledWith('acct_1');
  });

  it('redirects with disconnected-local if remote revoke fails', async () => {
    revokeGoogleTokenMock.mockResolvedValue(false);
    
    const req = new NextRequest('http://localhost/api/google-lsa/disconnect', { method: 'POST' });
    const res = await POST(req);
    
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=disconnected-local#google-local-services');
  });

  it('redirects with disconnect-failed if local disconnect fails', async () => {
    disconnectGoogleLsaConnectionMock.mockRejectedValue(new Error('db error'));
    
    const req = new NextRequest('http://localhost/api/google-lsa/disconnect', { method: 'POST' });
    const res = await POST(req);
    
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=disconnect-failed#google-local-services');
  });

  it('proceeds to disconnect locally if fetch token errors', async () => {
    maybeSingleMock.mockResolvedValue({ error: { message: 'db error' } });
    
    const req = new NextRequest('http://localhost/api/google-lsa/disconnect', { method: 'POST' });
    const res = await POST(req);
    
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?google_lsa=disconnected-local#google-local-services');
    expect(revokeGoogleTokenMock).not.toHaveBeenCalled();
    expect(disconnectGoogleLsaConnectionMock).toHaveBeenCalledWith('acct_1');
  });
});
