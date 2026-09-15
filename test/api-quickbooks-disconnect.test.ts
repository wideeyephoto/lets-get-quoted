import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/quickbooks/disconnect/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/quickbooks/oauth', () => ({
  revokeToken: vi.fn(),
}));

vi.mock('@/lib/quickbooks/connection', () => ({
  deleteConnection: vi.fn(),
}));

describe('Quickbooks Disconnect Route', () => {
  let requireOwnerContextMock: any;
  let createAdminClientMock: any;
  let revokeTokenMock: any;
  let deleteConnectionMock: any;
  let qbConnectionMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ accountId: 'acct_1' });

    qbConnectionMock = vi.fn().mockResolvedValue({ data: { refresh_token: 'refresh_1' } });

    const adminMock = {
      from: vi.fn((table: string) => {
        if (table === 'quickbooks_connections') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: qbConnectionMock }) }) };
        return { select: vi.fn() };
      })
    };

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue(adminMock);

    revokeTokenMock = (await import('@/lib/quickbooks/oauth')).revokeToken;
    revokeTokenMock.mockResolvedValue(undefined);

    deleteConnectionMock = (await import('@/lib/quickbooks/connection')).deleteConnection;
    deleteConnectionMock.mockResolvedValue(undefined);
  });

  it('revokes token and deletes connection', async () => {
    const req = new NextRequest('http://localhost/api/quickbooks/disconnect', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard/settings?quickbooks=disconnected#quickbooks');
    expect(revokeTokenMock).toHaveBeenCalledWith('refresh_1');
    expect(deleteConnectionMock).toHaveBeenCalledWith('acct_1');
  });

  it('handles missing connection gracefully', async () => {
    qbConnectionMock.mockResolvedValue({ data: null });
    const req = new NextRequest('http://localhost/api/quickbooks/disconnect', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(revokeTokenMock).not.toHaveBeenCalled();
    expect(deleteConnectionMock).toHaveBeenCalledWith('acct_1');
  });

  it('handles revoke failure gracefully', async () => {
    revokeTokenMock.mockRejectedValue(new Error('revoke failed'));
    const req = new NextRequest('http://localhost/api/quickbooks/disconnect', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(deleteConnectionMock).toHaveBeenCalledWith('acct_1');
  });

  it('handles db error gracefully', async () => {
    qbConnectionMock.mockRejectedValue(new Error('db error'));
    const req = new NextRequest('http://localhost/api/quickbooks/disconnect', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(revokeTokenMock).not.toHaveBeenCalled();
    expect(deleteConnectionMock).toHaveBeenCalledWith('acct_1');
  });
});
