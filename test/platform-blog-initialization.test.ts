import { describe, expect, it, vi } from 'vitest';

describe('blog collection initialization', () => {
  it.each(['posts', 'drafts'])('initializes every author when %s is imported first', async (first) => {
    vi.resetModules();
    if (first === 'posts') await import('@/lib/platform-blog');
    else await import('@/lib/platform-blog-drafts');
    const { ALL_INITIAL_BLOG_POSTS, DEFAULT_AUTHOR } = await import('@/lib/platform-blog');
    expect(ALL_INITIAL_BLOG_POSTS.length).toBeGreaterThan(0);
    for (const post of ALL_INITIAL_BLOG_POSTS) {
      expect(post.author, post.slug).toEqual(DEFAULT_AUTHOR);
      expect(post.author.name).toBe('Brett');
    }
  });
});
