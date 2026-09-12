import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/jobs/[id]/detail/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/job-detail', () => ({
  loadJobDetail: vi.fn(),
}));

describe('Jobs Detail Route', () => {
  let getCurrentMembershipMock: any;
  let createSupabaseServerClientMock: any;
  let loadJobDetailMock: any;
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

    loadJobDetailMock = (await import('@/lib/job-detail')).loadJobDetail;
    loadJobDetailMock.mockResolvedValue({ id: 'job_1', ref: 'JOB-123' });
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/jobs/job_1/detail');
    const res = await GET(req, { params: Promise.resolve({ id: 'job_1' }) });
    expect(res.status).toBe(401);
  });

  it('fails if not owner', async () => {
    getCurrentMembershipMock.mockResolvedValue({ accountId: 'acct_1', role: 'member' });
    const req = new NextRequest('http://localhost/api/jobs/job_1/detail');
    const res = await GET(req, { params: Promise.resolve({ id: 'job_1' }) });
    expect(res.status).toBe(403);
  });

  it('fails if id is malformed', async () => {
    const req = new NextRequest('http://localhost/api/jobs/job_1/detail');
    const res = await GET(req, { params: Promise.resolve({ id: 'job_1' }) });
    expect(res.status).toBe(400);
  });

  it('fails if job not found', async () => {
    loadJobDetailMock.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/jobs/123e4567-e89b-12d3-a456-426614174000/detail');
    const res = await GET(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });
    expect(res.status).toBe(404);
  });

  it('returns detail', async () => {
    const req = new NextRequest('http://localhost/api/jobs/123e4567-e89b-12d3-a456-426614174000/detail');
    const res = await GET(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.detail.ref).toBe('JOB-123');
  });

  it('fails with 500 if load fails', async () => {
    loadJobDetailMock.mockRejectedValue(new Error('db error'));
    const req = new NextRequest('http://localhost/api/jobs/123e4567-e89b-12d3-a456-426614174000/detail');
    const res = await GET(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });
    expect(res.status).toBe(500);
  });
});
