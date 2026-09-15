import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: vi.fn((handler) => handler),
}));

import { GET } from '@/app/api/v1/me/route';

describe('V1 Me Route', () => {
  let adminMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'acct_1', business_name: 'Test Biz', created_at: '2023-01-01' },
        error: null
      })
    };
  });

  it('handles missing account', async () => {
    adminMock.single.mockResolvedValue({ data: null, error: new Error('not found') });
    const req = new NextRequest('http://localhost/api/v1/me');
    const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', requestId: 'req_1' });
    expect(res.status).toBe(404);
  });

  it('returns me data', async () => {
    const req = new NextRequest('http://localhost/api/v1/me');
    const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', tokenName: 'My Token', credentialId: 'cred_1', scopes: new Set(['reads']) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.workspace_id).toBe('acct_1');
    expect(data.business_name).toBe('Test Biz');
    expect(data.token_name).toBe('My Token');
    expect(data.token_id).toBe('cred_1');
    expect(data.scopes).toEqual(['reads']);
  });

  it('falls back business name', async () => {
    adminMock.single.mockResolvedValue({
      data: { id: 'acct_1', business_name: null, created_at: '2023-01-01' },
      error: null
    });
    const req = new NextRequest('http://localhost/api/v1/me');
    const res = await (GET as any)(req, { admin: adminMock, accountId: 'acct_1', scopes: new Set() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.business_name).toBe("Let's Get Quoted Workspace");
  });
});
