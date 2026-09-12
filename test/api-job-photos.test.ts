import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST, DELETE, PATCH } from '@/app/api/job-photos/route';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  addJobPhotos: vi.fn(),
  getJob: vi.fn(),
  removeJobPhoto: vi.fn(),
  reorderJobPhotos: vi.fn(),
}));

vi.mock('@/lib/job-photo-storage', () => ({
  createJobPhotoLinks: vi.fn(),
  createJobPhotoUrls: vi.fn(),
  deleteJobPhotos: vi.fn(),
  uploadJobPhoto: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('Job Photos Route', () => {
  let createAdminClientMock: any;
  let getCurrentMembershipMock: any;
  let createSupabaseServerClientMock: any;
  let getJobMock: any;
  let createJobPhotoLinksMock: any;
  let uploadJobPhotoMock: any;
  let addJobPhotosMock: any;
  let createJobPhotoUrlsMock: any;
  let removeJobPhotoMock: any;
  let deleteJobPhotosMock: any;
  let reorderJobPhotosMock: any;
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

    getJobMock = (await import('@/lib/jobs')).getJob;
    getJobMock.mockResolvedValue({ photo_paths: ['path_1'] });

    createJobPhotoLinksMock = (await import('@/lib/job-photo-storage')).createJobPhotoLinks;
    createJobPhotoLinksMock.mockResolvedValue([{ url: 'http://img.com/1' }]);

    uploadJobPhotoMock = (await import('@/lib/job-photo-storage')).uploadJobPhoto;
    uploadJobPhotoMock.mockResolvedValue('path_2');

    addJobPhotosMock = (await import('@/lib/jobs')).addJobPhotos;
    addJobPhotosMock.mockResolvedValue(undefined);

    createJobPhotoUrlsMock = (await import('@/lib/job-photo-storage')).createJobPhotoUrls;
    createJobPhotoUrlsMock.mockResolvedValue(['http://img.com/2']);

    removeJobPhotoMock = (await import('@/lib/jobs')).removeJobPhoto;
    removeJobPhotoMock.mockResolvedValue(undefined);

    deleteJobPhotosMock = (await import('@/lib/job-photo-storage')).deleteJobPhotos;
    deleteJobPhotosMock.mockResolvedValue(undefined);

    reorderJobPhotosMock = (await import('@/lib/jobs')).reorderJobPhotos;
    reorderJobPhotosMock.mockResolvedValue(undefined);
  });

  describe('auth', () => {
    it('fails if no user', async () => {
      getUserMock.mockResolvedValue({ data: { user: null } });
      const req = new NextRequest('http://localhost/api/job-photos?jobId=1');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('fails if not owner', async () => {
      getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'member' });
      const req = new NextRequest('http://localhost/api/job-photos?jobId=1');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });
  });

  describe('GET', () => {
    it('fails if no jobId', async () => {
      const req = new NextRequest('http://localhost/api/job-photos');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('fails if job not found', async () => {
      getJobMock.mockResolvedValue(null);
      const req = new NextRequest('http://localhost/api/job-photos?jobId=1');
      const res = await GET(req);
      expect(res.status).toBe(404);
    });

    it('returns signed links', async () => {
      const req = new NextRequest('http://localhost/api/job-photos?jobId=1');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.photos[0].url).toBe('http://img.com/1');
    });
  });

  describe('POST', () => {
    it('fails if missing jobId or image', async () => {
      const formData = new FormData();
      const req = new NextRequest('http://localhost/api/job-photos', { method: 'POST', body: formData });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('uploads photo', async () => {
      const formData = new FormData();
      formData.append('jobId', 'job_1');
      formData.append('image', new File(['123'], 'img.jpg', { type: 'image/jpeg' }));
      const req = new NextRequest('http://localhost/api/job-photos', { method: 'POST', body: formData });
      
      const res = await POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      
      expect(uploadJobPhotoMock).toHaveBeenCalled();
      expect(addJobPhotosMock).toHaveBeenCalledWith('fake_admin', 'acct_1', 'job_1', ['path_2']);
      expect(data.path).toBe('path_2');
      expect(data.url).toBe('http://img.com/2');
    });
  });

  describe('DELETE', () => {
    it('fails if missing jobId or path', async () => {
      const req = new NextRequest('http://localhost/api/job-photos', { method: 'DELETE', body: JSON.stringify({}) });
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it('removes photo', async () => {
      const req = new NextRequest('http://localhost/api/job-photos', {
        method: 'DELETE',
        body: JSON.stringify({ jobId: 'job_1', path: 'path_1' })
      });
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      
      expect(removeJobPhotoMock).toHaveBeenCalledWith('fake_admin', 'acct_1', 'job_1', 'path_1');
      expect(deleteJobPhotosMock).toHaveBeenCalledWith('acct_1', ['path_1']);
    });
  });

  describe('PATCH', () => {
    it('fails if missing jobId or paths', async () => {
      const req = new NextRequest('http://localhost/api/job-photos', { method: 'PATCH', body: JSON.stringify({}) });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it('reorders photos', async () => {
      const req = new NextRequest('http://localhost/api/job-photos', {
        method: 'PATCH',
        body: JSON.stringify({ jobId: 'job_1', paths: ['path_2', 'path_1'] })
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      
      expect(reorderJobPhotosMock).toHaveBeenCalledWith('fake_admin', 'acct_1', 'job_1', ['path_2', 'path_1']);
    });
  });
});
