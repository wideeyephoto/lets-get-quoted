import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/quickbooks/connect/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/quickbooks/oauth', () => ({
  buildAuthorizeUrl: vi.fn(),
  quickBooksConfigured: vi.fn(),
}));

vi.mock('@/lib/quickbooks/state', () => ({
  STATE_COOKIE: 'qb_state',
  buildState: vi.fn(),
}));

describe('Quickbooks Connect Route', () => {
  let requireOwnerContextMock: any;
  let buildAuthorizeUrlMock: any;
  let quickBooksConfiguredMock: any;
  let buildStateMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ accountId: 'acct_1' });

    buildAuthorizeUrlMock = (await import('@/lib/quickbooks/oauth')).buildAuthorizeUrl;
    buildAuthorizeUrlMock.mockReturnValue('https://auth.quickbooks.com');

    quickBooksConfiguredMock = (await import('@/lib/quickbooks/oauth')).quickBooksConfigured;
    quickBooksConfiguredMock.mockReturnValue(true);

    buildStateMock = (await import('@/lib/quickbooks/state')).buildState;
    buildStateMock.mockReturnValue('state_123');

    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3010';
  });

  it('redirects to settings if unconfigured', async () => {
    quickBooksConfiguredMock.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3010/dashboard/settings?quickbooks=unconfigured#quickbooks');
  });

  it('redirects to quickbooks auth with state cookie', async () => {
    const res = await GET();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://auth.quickbooks.com/');
    
    const cookies = res.cookies.getAll();
    const stateCookie = cookies.find((c: any) => c.name === 'qb_state');
    expect(stateCookie).toBeDefined();
    expect(stateCookie?.value).toBeTruthy();
    expect(stateCookie?.sameSite).toBe('lax');
    
    expect(buildStateMock).toHaveBeenCalledWith('acct_1', expect.any(String));
    expect(buildAuthorizeUrlMock).toHaveBeenCalledWith('state_123');
  });
});
