import { describe, it, expect } from 'vitest';
import { getSiteContent, preserveBlogPosts, uniqueBlogSlug, type SiteBlogPost } from '@/lib/site-content';

function post(over: Partial<SiteBlogPost> = {}): SiteBlogPost {
  return {
    id: 'post-1',
    slug: 'a-post',
    title: 'A post',
    excerpt: '',
    body: 'Words.',
    coverImage: '',
    status: 'draft',
    date: '2026-08-01',
    publishAt: '',
    ...over,
  };
}

describe('preserveBlogPosts', () => {
  // The website builder holds the whole site content in the browser and saves
  // it in one go. Posts are written somewhere else entirely — Marketing → Blog,
  // the biweekly cron, a seasonal topic — so without this a Save the owner
  // thought only changed their headline would silently delete a post.

  it('keeps the database posts and drops the ones the builder sent', () => {
    const stored = { blog: { enabled: true, posts: [post({ id: 'db', slug: 'db', title: 'Written since you opened the page' })] } };
    const incoming = { blog: { enabled: true, posts: [post({ id: 'stale', slug: 'stale', title: 'Stale browser copy' })] } };

    const merged = getSiteContent(preserveBlogPosts(stored, incoming)).blog;
    expect(merged.posts.map((p) => p.id)).toEqual(['db']);
  });

  it('still lets the builder change how the band looks', () => {
    // The split is ownership, not a lock. The builder decides whether the band
    // shows, what it is headed and how it is laid out; this owns what is in it.
    const stored = { blog: { enabled: false, title: 'Old', layout: 'grid', posts: [post({ id: 'db' })] } };
    const incoming = { blog: { enabled: true, title: 'From our workshop', intro: 'Tips', layout: 'rows', posts: [] } };

    const merged = getSiteContent(preserveBlogPosts(stored, incoming)).blog;
    expect(merged.enabled).toBe(true);
    expect(merged.title).toBe('From our workshop');
    expect(merged.intro).toBe('Tips');
    expect(merged.layout).toBe('rows');
    expect(merged.posts.map((p) => p.id)).toEqual(['db']);
  });

  it('does not disturb anything else on the site', () => {
    const stored = { blog: { posts: [post()] } };
    const incoming = { headline: 'New headline', services: { enabled: true, items: [] }, blog: { posts: [] } };

    const merged = preserveBlogPosts(stored, incoming);
    expect(merged.headline).toBe('New headline');
    expect(merged.services).toEqual({ enabled: true, items: [] });
  });

  it('survives a site whose content is empty or null', () => {
    expect(getSiteContent(preserveBlogPosts(null, { headline: 'x' })).blog.posts).toEqual([]);
    expect(getSiteContent(preserveBlogPosts({ blog: { posts: [post()] } }, null)).blog.posts).toHaveLength(1);
  });

  it('a first-ever post is not wiped by a builder save that predates it', () => {
    // The regression this exists to stop, spelled out: the builder was opened
    // when there were no posts, a post was written on the blog page, and then
    // Save was pressed on the still-open builder tab.
    const stored = { blog: { posts: [post({ id: 'brand-new' })] } };
    const incoming = { blog: { posts: [] } };
    expect(getSiteContent(preserveBlogPosts(stored, incoming)).blog.posts).toHaveLength(1);
  });
});

describe('uniqueBlogSlug', () => {
  it('never collides with another post on the site', () => {
    // /blog/[slug] resolves by slug, so two posts sharing one means one of them
    // is unreachable.
    const existing = [post({ id: '1', slug: 'gutter-tips' }), post({ id: '2', slug: 'gutter-tips-2' })];
    expect(uniqueBlogSlug('Gutter tips', existing)).toBe('gutter-tips-3');
  });

  it('lets a post keep its own slug when it is the one being renamed', () => {
    const existing = [post({ id: '1', slug: 'gutter-tips' })];
    expect(uniqueBlogSlug('Gutter tips', existing, '1')).toBe('gutter-tips');
  });

  it('falls back rather than producing an empty slug', () => {
    expect(uniqueBlogSlug('', [])).toBe('post');
    expect(uniqueBlogSlug('!!!', [])).toBe('post');
  });
});
