import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/admin/revalidate/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/cached-sites', () => ({
  revalidatePublicSiteCache: vi.fn(),
  PUBLIC_SITES_CACHE_TAG: 'public-sites-cache',
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

describe('Admin Revalidate Route', () => {
  let revalidatePublicSiteCacheMock: any;
  let revalidateTagMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    revalidatePublicSiteCacheMock = (await import('@/lib/cached-sites')).revalidatePublicSiteCache;
    revalidateTagMock = (await import('next/cache')).revalidateTag;
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  const createRequest = (body?: any, auth: string | null = 'Bearer test_secret') => {
    const headers = new Headers();
    if (auth) headers.set('authorization', auth);
    
    return new NextRequest('http://localhost/api/admin/revalidate', {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it('fails if unauthorized', async () => {
    const req = createRequest(undefined, null);
    const res = await POST(req);
    
    expect(res.status).toBe(401);
  });

  it('fails if wrong secret', async () => {
    const req = createRequest(undefined, 'Bearer wrong');
    const res = await POST(req);
    
    expect(res.status).toBe(401);
  });

  it('revalidates with body params', async () => {
    const req = createRequest({ subdomain: 'test', customDomain: 'example.com' });
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(revalidatePublicSiteCacheMock).toHaveBeenCalledWith({
      subdomain: 'test',
      customDomain: 'example.com',
    });
    expect(revalidateTagMock).toHaveBeenCalledWith('public-sites-cache');
    
    expect(data.ok).toBe(true);
    expect(data.revalidated.subdomain).toBe('test');
    expect(data.revalidated.customDomain).toBe('example.com');
  });

  it('revalidates with no body', async () => {
    const req = createRequest();
    const res = await POST(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(revalidatePublicSiteCacheMock).toHaveBeenCalledWith({
      subdomain: undefined,
      customDomain: undefined,
    });
    
    expect(data.ok).toBe(true);
  });
});
