import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/blog/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/site-content', () => ({
  getSiteContent: vi.fn(),
  slugifyBlogTitle: vi.fn((title: string) => title.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('@/lib/blog-generate', () => ({
  draftBlogPost: vi.fn(),
}));

vi.mock('@/lib/marketing-status', () => ({
  shouldAutoPublish: vi.fn(),
}));

vi.mock('@/lib/cron-runs', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    cronRoute: (job: string, run: () => Promise<unknown>) => {
      return async function GET(request: Request) {
        const secret = process.env.CRON_SECRET;
        const auth = request.headers.get('authorization');
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
        try {
          const summary = await run();
          return new Response(JSON.stringify(summary), { status: 200 });
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
      };
    }
  };
});

describe('Blog Cron Route', () => {
  let createAdminClientMock: any;
  let getSiteContentMock: any;
  let draftBlogPostMock: any;
  let shouldAutoPublishMock: any;
  let originalEnv: NodeJS.ProcessEnv;
  let supabaseMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    getSiteContentMock = (await import('@/lib/site-content')).getSiteContent;
    draftBlogPostMock = (await import('@/lib/blog-generate')).draftBlogPost;
    shouldAutoPublishMock = (await import('@/lib/marketing-status')).shouldAutoPublish;

    supabaseMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { id: 'site_1', company_name: 'Site 1', service_area: 'Area 1', content: {} }
        ],
        error: null
      }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null })
    };
    
    createAdminClientMock.mockReturnValue(supabaseMock);

    getSiteContentMock.mockReturnValue({
      trade: 'plumbing',
      blog: {
        enabled: true,
        posts: [
          { id: 'post_1', slug: 'existing-post', status: 'draft', publishAt: '2023-01-01', date: '' }
        ]
      }
    });

    draftBlogPostMock.mockResolvedValue({
      title: 'New Post',
      excerpt: 'Excerpt',
      body: 'Body',
      trade: 'plumbing'
    });

    shouldAutoPublishMock.mockReturnValue(false);
    
    vi.useFakeTimers({ toFake: ['Date'] });
    // Set to a draft day (e.g. 15th)
    vi.setSystemTime(new Date('2023-06-15T12:00:00Z'));
  });
  
  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/blog');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('fails if sites query errors', async () => {
    supabaseMock.limit.mockResolvedValue({ data: null, error: new Error('DB Error') });
    
    const req = new NextRequest('http://localhost/api/cron/blog', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('sites query failed: DB Error');
  });

  it('drafts a new post on draft day', async () => {
    const req = new NextRequest('http://localhost/api/cron/blog', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(draftBlogPostMock).toHaveBeenCalled();
    expect(supabaseMock.update).toHaveBeenCalled();
    expect(data.drafted).toBe(1);
    expect(data.published).toBe(0);
    expect(data.failed).toBe(0);
  });

  it('does not draft if not a draft day', async () => {
    vi.setSystemTime(new Date('2023-06-10T12:00:00Z')); // 10th is not a draft day
    
    const req = new NextRequest('http://localhost/api/cron/blog', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(draftBlogPostMock).not.toHaveBeenCalled();
    expect(data.drafted).toBe(0);
    expect(data.skipped).toBe(1);
  });

  it('auto-publishes posts when shouldAutoPublish is true', async () => {
    vi.setSystemTime(new Date('2023-06-10T12:00:00Z')); // 10th is not a draft day, focus on publishing
    shouldAutoPublishMock.mockReturnValue(true);
    
    const req = new NextRequest('http://localhost/api/cron/blog', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(supabaseMock.update).toHaveBeenCalled();
    expect(data.published).toBe(1);
    expect(data.drafted).toBe(0);
  });

  it('handles drafting errors gracefully', async () => {
    draftBlogPostMock.mockRejectedValue(new Error('AI failed'));
    
    const req = new NextRequest('http://localhost/api/cron/blog', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.failed).toBe(1);
    expect(data.drafted).toBe(0);
  });

  it('handles update errors gracefully', async () => {
    supabaseMock.eq.mockResolvedValue({ error: new Error('Update failed') });
    
    const req = new NextRequest('http://localhost/api/cron/blog', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.failed).toBe(1);
  });

  it('avoids slug collisions', async () => {
    getSiteContentMock.mockReturnValue({
      trade: 'plumbing',
      blog: {
        enabled: true,
        posts: [
          { id: 'post_1', slug: 'new-post', status: 'published', publishAt: '', date: '' }
        ]
      }
    });

    const req = new NextRequest('http://localhost/api/cron/blog', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    
    // Check that update was called with a suffixed slug
    const updateCall = supabaseMock.update.mock.calls[0][0];
    const newPost = updateCall.content.blog.posts[0]; // New post is prepended
    expect(newPost.slug).toBe('new-post-2');
  });
});
