import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST, DELETE, PATCH } from '@/app/api/lead-photos/route';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/leads', () => ({
  addLeadPhotos: vi.fn(),
  getLead: vi.fn(),
  removeLeadPhoto: vi.fn(),
  reorderLeadPhotos: vi.fn(),
}));

vi.mock('@/lib/lead-photo-storage', () => ({
  createLeadPhotoLinks: vi.fn(),
  createLeadPhotoUrls: vi.fn(),
  deleteLeadPhotos: vi.fn(),
  uploadLeadPhoto: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('Lead Photos Route', () => {
  let createAdminClientMock: any;
  let getCurrentMembershipMock: any;
  let createSupabaseServerClientMock: any;
  let getLeadMock: any;
  let createLeadPhotoLinksMock: any;
  let uploadLeadPhotoMock: any;
  let addLeadPhotosMock: any;
  let createLeadPhotoUrlsMock: any;
  let removeLeadPhotoMock: any;
  let deleteLeadPhotosMock: any;
  let reorderLeadPhotosMock: any;
  let getUserMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } });
    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock }
    });

    getCurrentMembershipMock = (await import('@/lib/auth')).getCurrentMembership;
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'owner' });

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    getLeadMock = (await import('@/lib/leads')).getLead;
    getLeadMock.mockResolvedValue({ photo_paths: ['path_1'] });

    createLeadPhotoLinksMock = (await import('@/lib/lead-photo-storage')).createLeadPhotoLinks;
    createLeadPhotoLinksMock.mockResolvedValue([{ url: 'http://img.com/1' }]);

    uploadLeadPhotoMock = (await import('@/lib/lead-photo-storage')).uploadLeadPhoto;
    uploadLeadPhotoMock.mockResolvedValue('path_2');

    addLeadPhotosMock = (await import('@/lib/leads')).addLeadPhotos;
    addLeadPhotosMock.mockResolvedValue(undefined);

    createLeadPhotoUrlsMock = (await import('@/lib/lead-photo-storage')).createLeadPhotoUrls;
    createLeadPhotoUrlsMock.mockResolvedValue(['http://img.com/2']);

    removeLeadPhotoMock = (await import('@/lib/leads')).removeLeadPhoto;
    removeLeadPhotoMock.mockResolvedValue(undefined);

    deleteLeadPhotosMock = (await import('@/lib/lead-photo-storage')).deleteLeadPhotos;
    deleteLeadPhotosMock.mockResolvedValue(undefined);

    reorderLeadPhotosMock = (await import('@/lib/leads')).reorderLeadPhotos;
    reorderLeadPhotosMock.mockResolvedValue(undefined);
  });

  describe('auth', () => {
    it('fails if no user', async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const req = new NextRequest('http://localhost/api/lead-photos?leadId=1');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('fails if not owner', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'member' });
      const req = new NextRequest('http://localhost/api/lead-photos?leadId=1');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });

  describe('GET', () => {
    it('fails if no leadId', async () => {
      const req = new NextRequest('http://localhost/api/lead-photos');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('fails if lead not found', async () => {
      getLeadMock.mockResolvedValue(null);
      const req = new NextRequest('http://localhost/api/lead-photos?leadId=1');
      const res = await GET(req);
      expect(res.status).toBe(404);
    });

    it('returns signed links', async () => {
      const req = new NextRequest('http://localhost/api/lead-photos?leadId=1');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.photos[0].url).toBe('http://img.com/1');
    });
  });

  describe('POST', () => {
    it('fails if missing leadId or image', async () => {
      const formData = new FormData();
      const req = new NextRequest('http://localhost/api/lead-photos', { method: 'POST', body: formData });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('uploads photo', async () => {
      const formData = new FormData();
      formData.append('leadId', 'lead_1');
      formData.append('image', new File(['123'], 'img.jpg', { type: 'image/jpeg' }));
      const req = new NextRequest('http://localhost/api/lead-photos', { method: 'POST', body: formData });
      
      const res = await POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      
      expect(uploadLeadPhotoMock).toHaveBeenCalledWith('acct_1', expect.any(File), 'workspace');
      expect(addLeadPhotosMock).toHaveBeenCalledWith('fake_admin', 'acct_1', 'lead_1', ['path_2']);
      expect(data.path).toBe('path_2');
      expect(data.url).toBe('http://img.com/2');
    });
  });

  describe('DELETE', () => {
    it('fails if missing leadId or path', async () => {
      const req = new NextRequest('http://localhost/api/lead-photos', { method: 'DELETE', body: JSON.stringify({}) });
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it('removes photo', async () => {
      const req = new NextRequest('http://localhost/api/lead-photos', {
        method: 'DELETE',
        body: JSON.stringify({ leadId: 'lead_1', path: 'path_1' })
      });
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      
      expect(removeLeadPhotoMock).toHaveBeenCalledWith('fake_admin', 'acct_1', 'lead_1', 'path_1');
      expect(deleteLeadPhotosMock).toHaveBeenCalledWith('acct_1', ['path_1']);
    });
  });

  describe('PATCH', () => {
    it('fails if missing leadId or paths', async () => {
      const req = new NextRequest('http://localhost/api/lead-photos', { method: 'PATCH', body: JSON.stringify({}) });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it('reorders photos', async () => {
      const req = new NextRequest('http://localhost/api/lead-photos', {
        method: 'PATCH',
        body: JSON.stringify({ leadId: 'lead_1', paths: ['path_2', 'path_1'] })
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      
      expect(reorderLeadPhotosMock).toHaveBeenCalledWith('fake_admin', 'acct_1', 'lead_1', ['path_2', 'path_1']);
    });
  });
});
