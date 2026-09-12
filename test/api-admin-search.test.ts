import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/admin/search/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/admin-search', () => ({
  searchEverything: vi.fn(),
}));

describe('Admin Search Route', () => {
  let requireAdminMock: any;
  let searchEverythingMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    requireAdminMock = (await import('@/lib/auth')).requireAdmin;
    requireAdminMock.mockResolvedValue({ admin: 'fake_admin' });
    
    searchEverythingMock = (await import('@/lib/admin-search')).searchEverything;
    searchEverythingMock.mockResolvedValue([{ id: 1, name: 'Result 1' }]);
  });

  it('searches with query param', async () => {
    const req = new NextRequest('http://localhost/api/admin/search?q=test_query');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(requireAdminMock).toHaveBeenCalled();
    expect(searchEverythingMock).toHaveBeenCalledWith('fake_admin', 'test_query', { limit: 6 });
    expect(data).toEqual([{ id: 1, name: 'Result 1' }]);
  });

  it('searches with empty query if not provided', async () => {
    const req = new NextRequest('http://localhost/api/admin/search');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(searchEverythingMock).toHaveBeenCalledWith('fake_admin', '', { limit: 6 });
    expect(data).toEqual([{ id: 1, name: 'Result 1' }]);
  });
});
