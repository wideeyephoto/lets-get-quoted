import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/lead-photos/proxy/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/photo-proxy-guard', () => ({
  fetchProxyImage: vi.fn(),
}));

describe('Lead Photos Proxy Route', () => {
  let createSupabaseServerClientMock: any;
  let fetchProxyImageMock: any;
  let getUserMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } });
    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: getUserMock }
    });

    fetchProxyImageMock = (await import('@/lib/photo-proxy-guard')).fetchProxyImage;
    fetchProxyImageMock.mockResolvedValue({ ok: true, buffer: Buffer.from('img'), contentType: 'image/png' });
  });

  it('fails if no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/lead-photos/proxy?url=http://example.com/img.jpg');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('fails if no url param', async () => {
    const req = new NextRequest('http://localhost/api/lead-photos/proxy');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('fails if invalid url', async () => {
    const req = new NextRequest('http://localhost/api/lead-photos/proxy?url=bad_url');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns proxied image', async () => {
    const req = new NextRequest('http://localhost/api/lead-photos/proxy?url=https://example.com/img.jpg');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.toString()).toBe('img');
  });

  it('handles proxy fetch failure', async () => {
    fetchProxyImageMock.mockResolvedValue({ ok: false, status: 404, error: 'Not found' });
    const req = new NextRequest('http://localhost/api/lead-photos/proxy?url=https://example.com/img.jpg');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('handles proxy fetch throw', async () => {
    fetchProxyImageMock.mockRejectedValue(new Error('Network error'));
    const req = new NextRequest('http://localhost/api/lead-photos/proxy?url=https://example.com/img.jpg');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
