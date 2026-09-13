import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  getPlatformBlogPosts,
  getPlatformBlogPostBySlug,
  getRelatedPlatformBlogPosts,
  generateBlogRssXml,
  savePlatformBlogPost,
  deletePlatformBlogPost,
  publishDuePlatformBlogPosts,
  getNextScheduleDate,
  batchQueuePlatformBlogPosts,
  SEED_BLOG_POSTS,
  BLOG_CATEGORIES,
  DEFAULT_AUTHOR,
} from '@/lib/platform-blog';

describe('Platform Blog System', () => {
  it('loads seed blog posts correctly', async () => {
    const posts = await getPlatformBlogPosts({ status: 'published' });
    expect(posts.length).toBeGreaterThanOrEqual(4);

    const first = posts[0];
    expect(first.id).toBeDefined();
    expect(first.slug).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.excerpt).toBeDefined();
    expect(first.blocks.length).toBeGreaterThan(0);
  });

  it('retrieves an article by exact slug', async () => {
    const target = SEED_BLOG_POSTS[0];
    const post = await getPlatformBlogPostBySlug(target.slug);
    expect(post).toBeDefined();
    expect(post?.title).toBe(target.title);
    expect(post?.category).toBe(target.category);
  });

  it('filters posts by category', async () => {
    const economicsPosts = await getPlatformBlogPosts({
      status: 'published',
      category: 'Software Economics',
    });
    expect(economicsPosts.length).toBeGreaterThanOrEqual(1);
    for (const post of economicsPosts) {
      expect(post.category.toLowerCase()).toBe('software economics');
    }
  });

  it('filters posts by search query', async () => {
    const searchResults = await getPlatformBlogPosts({
      status: 'published',
      search: 'per-seat',
    });
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchResults[0].slug).toContain('per-seat');
  });

  it('generates valid RSS 2.0 XML containing published posts', async () => {
    const origin = 'https://letsgetquoted.com';
    const rssXml = await generateBlogRssXml(origin);

    expect(rssXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(rssXml).toContain('<rss version="2.0"');
    expect(rssXml).toContain("<title>Let's Get Quoted Contractor Blog</title>");
    expect(rssXml).toContain('<link>https://letsgetquoted.com/blog</link>');
    expect(rssXml).toContain('<atom:link');

    for (const post of SEED_BLOG_POSTS.filter((p) => p.status === 'published')) {
      expect(rssXml).toContain(`<link>${origin}/blog/${post.slug}</link>`);
    }
  });

  it('provides related articles excluding current slug', async () => {
    const targetSlug = SEED_BLOG_POSTS[0].slug;
    const related = await getRelatedPlatformBlogPosts(targetSlug, 2);
    expect(related.length).toBeLessThanOrEqual(2);
    expect(related.some((p) => p.slug === targetSlug)).toBe(false);
  });

  it('hides scheduled future posts from the public listing unless preview is enabled', async () => {
    const testPost = {
      id: 'post-test-scheduled-future',
      slug: 'test-scheduled-future-article',
      title: 'Future Scheduled Article',
      excerpt: 'This should not be live yet.',
      category: 'Software Economics',
      author: DEFAULT_AUTHOR,
      readMinutes: 4,
      datePublished: '2099-12-31',
      status: 'scheduled' as const,
      tags: ['future'],
      blocks: [{ type: 'p' as const, text: 'Coming soon.' }],
    };

    await savePlatformBlogPost(testPost);

    try {
      // 1) Should not appear in default published list
      const publishedPosts = await getPlatformBlogPosts({ status: 'published' });
      expect(publishedPosts.some((p) => p.slug === testPost.slug)).toBe(false);

      // 2) Should appear when admin asks for 'scheduled' or 'all'
      const scheduledPosts = await getPlatformBlogPosts({ status: 'scheduled' });
      expect(scheduledPosts.some((p) => p.slug === testPost.slug)).toBe(true);

      // 3) Direct slug fetch should return undefined without preview
      const publicView = await getPlatformBlogPostBySlug(testPost.slug);
      expect(publicView).toBeUndefined();

      // 4) Direct slug fetch with preview=true should return post
      const staffPreview = await getPlatformBlogPostBySlug(testPost.slug, { preview: true });
      expect(staffPreview).toBeDefined();
      expect(staffPreview?.title).toBe(testPost.title);
    } finally {
      await deletePlatformBlogPost(testPost.id);
    }
  });

  it('automatically treats scheduled posts due today or earlier as live and promotes them via publishDuePlatformBlogPosts', async () => {
    const duePost = {
      id: 'post-test-scheduled-due',
      slug: 'test-scheduled-due-article',
      title: 'Due Scheduled Article',
      excerpt: 'This should be live now.',
      category: 'Software Economics',
      author: DEFAULT_AUTHOR,
      readMinutes: 3,
      datePublished: '2020-01-01',
      status: 'scheduled' as const,
      tags: ['due'],
      blocks: [{ type: 'p' as const, text: 'Already arrived.' }],
    };

    await savePlatformBlogPost(duePost);

    try {
      // 1) Real-time query fallback: should be visible in published list because date has passed
      const published = await getPlatformBlogPosts({ status: 'published' });
      expect(published.some((p) => p.slug === duePost.slug)).toBe(true);

      // 2) Direct slug fetch works publicly
      const direct = await getPlatformBlogPostBySlug(duePost.slug);
      expect(direct).toBeDefined();

      // 3) Cron worker promotes post to 'published'
      const result = await publishDuePlatformBlogPosts('2026-09-13');
      expect(result.publishedSlugs).toContain(duePost.slug);

      // 4) After promotion, status is now 'published'
      const afterPromotion = await getPlatformBlogPostBySlug(duePost.slug);
      expect(afterPromotion?.status).toBe('published');
    } finally {
      await deletePlatformBlogPost(duePost.id);
    }
  });

  it('calculates the next 3-day schedule slot and batch queues posts sequentially every 3 days', async () => {
    // 1) Test next schedule slot calculation
    const slot = getNextScheduleDate(3, '2026-09-13');
    expect(slot).toBe('2026-09-16');

    // 2) Batch queue test
    const p1 = {
      id: 'post-test-queue-1',
      slug: 'test-queue-post-1',
      title: 'Queue Post 1',
      excerpt: 'First queued post.',
      category: 'Software Economics',
      author: DEFAULT_AUTHOR,
      readMinutes: 3,
      datePublished: '2026-09-13',
      status: 'draft' as const,
      tags: ['queue'],
      blocks: [{ type: 'p' as const, text: 'Post 1' }],
    };
    const p2 = {
      id: 'post-test-queue-2',
      slug: 'test-queue-post-2',
      title: 'Queue Post 2',
      excerpt: 'Second queued post.',
      category: 'Software Economics',
      author: DEFAULT_AUTHOR,
      readMinutes: 3,
      datePublished: '2026-09-13',
      status: 'draft' as const,
      tags: ['queue'],
      blocks: [{ type: 'p' as const, text: 'Post 2' }],
    };

    await savePlatformBlogPost(p1);
    await savePlatformBlogPost(p2);

    try {
      const result = await batchQueuePlatformBlogPosts([p1.id, p2.id], {
        intervalDays: 3,
        startDate: '2026-09-16',
      });

      expect(result.count).toBe(2);
      expect(result.queue[0].datePublished).toBe('2026-09-16');
      expect(result.queue[1].datePublished).toBe('2026-09-19');

      const updatedP1 = await getPlatformBlogPostBySlug(p1.slug, { preview: true });
      const updatedP2 = await getPlatformBlogPostBySlug(p2.slug, { preview: true });

      expect(updatedP1?.status).toBe('scheduled');
      expect(updatedP1?.datePublished).toBe('2026-09-16');
      expect(updatedP2?.status).toBe('scheduled');
      expect(updatedP2?.datePublished).toBe('2026-09-19');
    } finally {
      await deletePlatformBlogPost(p1.id);
      await deletePlatformBlogPost(p2.id);
    }
  });

  it('ensures all seed posts have custom cover images that exist in public/', () => {
    expect(SEED_BLOG_POSTS.length).toBe(9);

    for (const post of SEED_BLOG_POSTS) {
      expect(post.coverImage).toBeDefined();
      expect(post.coverImage?.startsWith('/blog/')).toBe(true);
      expect(post.coverAlt).toBeDefined();
      expect(post.coverAlt?.length).toBeGreaterThan(15);

      const filePath = path.join(process.cwd(), 'public', post.coverImage!);
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(10000); // Image has substantial size
    }
  });

  it('ensures all seed posts have high-converting SEO metadata and keywords', () => {
    expect(SEED_BLOG_POSTS.length).toBe(9);

    for (const post of SEED_BLOG_POSTS) {
      // Keyword validation
      expect(post.targetKeyword).toBeDefined();
      expect(post.targetKeyword!.length).toBeGreaterThanOrEqual(10);

      // Meta Title validation (under 70 chars for SERP display)
      expect(post.metaTitle).toBeDefined();
      expect(post.metaTitle!.length).toBeGreaterThanOrEqual(30);
      expect(post.metaTitle!.length).toBeLessThanOrEqual(70);

      // Meta Description validation (100 to 175 chars for Google SERP snippet)
      expect(post.metaDescription).toBeDefined();
      expect(post.metaDescription!.length).toBeGreaterThanOrEqual(100);
      expect(post.metaDescription!.length).toBeLessThanOrEqual(175);

      // Categorization and tagging
      expect(BLOG_CATEGORIES).toContain(post.category as any);
      expect(post.tags.length).toBeGreaterThanOrEqual(3);

      // Verify keyword is represented in tags or title
      const keywordTokens = post.targetKeyword!.toLowerCase().split(' ');
      const titleLower = post.title.toLowerCase();
      const tagsString = post.tags.join(' ').toLowerCase();
      const someTokensPresent = keywordTokens.some(
        (token) => token.length > 3 && (titleLower.includes(token) || tagsString.includes(token))
      );
      expect(someTokensPresent).toBe(true);
    }
  });
});

