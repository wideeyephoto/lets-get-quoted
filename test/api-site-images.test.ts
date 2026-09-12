import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/site-images/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/site-image-storage', () => ({
  uploadSiteImage: vi.fn(),
}));

describe('Site Images Route', () => {
  let createSupabaseServerClientMock: any;
  let getUserMock: any;
  let getCurrentMembershipMock: any;
  let uploadSiteImageMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } });
    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock }
    });

    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'owner' });

    uploadSiteImageMock = (await import('@/lib/site-image-storage')).uploadSiteImage;
    uploadSiteImageMock.mockResolvedValue({ url: 'http://example.com/img.jpg' });
  });

  const makeReq = (file?: File | string | null) => {
    const formData = new FormData();
    if (file) {
      if (typeof file === 'string') {
        formData.append('image', file);
      } else {
        formData.append('image', file);
      }
    }
    return new NextRequest('http://localhost/api/site-images', { method: 'POST', body: formData });
  };

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('fails if no active workspace', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: null });
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('fails if not owner', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'office' });
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('fails if no image', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
  });

  it('fails if file size 0', async () => {
    const res = await POST(makeReq(new File([''], 'empty.jpg')));
    expect(res.status).toBe(400);
  });

  it('uploads image', async () => {
    const res = await POST(makeReq(new File(['test'], 'test.jpg')));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.url).toBe('http://example.com/img.jpg');
    expect(uploadSiteImageMock).toHaveBeenCalledWith('acct_1', expect.any(File));
  });

  it('handles upload failure', async () => {
    uploadSiteImageMock.mockRejectedValue(new Error('upload failed'));
    const res = await POST(makeReq(new File(['test'], 'test.jpg')));
    expect(res.status).toBe(400);
  });
});
