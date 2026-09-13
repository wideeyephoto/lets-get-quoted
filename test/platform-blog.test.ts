import { describe, it, expect } from 'vitest';
import {
  getPlatformBlogPosts,
  getPlatformBlogPostBySlug,
  getRelatedPlatformBlogPosts,
  generateBlogRssXml,
  SEED_BLOG_POSTS,
  BLOG_CATEGORIES,
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
});
