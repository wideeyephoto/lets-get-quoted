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

describe('BLOG_STYLES', () => {
  it('provides 4 distinct blog layout styles for users to choose from', async () => {
    const { BLOG_STYLES } = await import('@/lib/site-content');
    expect(BLOG_STYLES.map((s) => s.key)).toEqual(['grid', 'featured', 'rows', 'magazine']);
    expect(BLOG_STYLES).toHaveLength(4);
    for (const style of BLOG_STYLES) {
      expect(style.label).toBeTruthy();
      expect(style.desc).toBeTruthy();
    }
  });

  it('accepts and normalizes all 4 blog layouts in site content', () => {
    for (const key of ['grid', 'featured', 'rows', 'magazine']) {
      const content = getSiteContent({ blog: { layout: key } });
      expect(content.blog.layout).toBe(key);
    }
  });

  it('falls back unknown blog layouts to grid', () => {
    const content = getSiteContent({ blog: { layout: 'unknown-layout' } });
    expect(content.blog.layout).toBe('grid');
  });
});

describe('estimateReadingTime', () => {
  it('handles null, undefined, and empty text gracefully', async () => {
    const { estimateReadingTime } = await import('@/lib/site-content');
    expect(estimateReadingTime(null)).toBe('1 min read');
    expect(estimateReadingTime(undefined)).toBe('1 min read');
    expect(estimateReadingTime('')).toBe('1 min read');
    expect(estimateReadingTime('   ')).toBe('1 min read');
  });

  it('calculates reading time at ~200 words per minute', async () => {
    const { estimateReadingTime } = await import('@/lib/site-content');
    const shortText = 'This is a brief 10 word post about home improvement tips.';
    expect(estimateReadingTime(shortText)).toBe('1 min read');

    const twoHundredWords = Array(200).fill('word').join(' ');
    expect(estimateReadingTime(twoHundredWords)).toBe('1 min read');

    const fourHundredFiftyWords = Array(450).fill('word').join(' ');
    expect(estimateReadingTime(fourHundredFiftyWords)).toBe('3 min read');
  });
});

describe('SiteBlogPost new SEO fields & parseBlogPosts', () => {
  it('preserves updatedAt, coverAlt, photographerName, photographerUrl, and targetKeyword', () => {
    const rawContent = {
      blog: {
        posts: [
          {
            id: 'post-test',
            title: 'Roofing Guide',
            date: '2026-08-01',
            updatedAt: '2026-08-20',
            coverAlt: 'A clean asphalt shingle roof',
            photographerName: 'Jane Doe',
            photographerUrl: 'https://pexels.com/@janedoe',
            targetKeyword: 'roof replacement',
            status: 'draft',
          },
        ],
      },
    };

    const parsed = getSiteContent(rawContent).blog.posts[0];
    expect(parsed.updatedAt).toBe('2026-08-20');
    expect(parsed.coverAlt).toBe('A clean asphalt shingle roof');
    expect(parsed.photographerName).toBe('Jane Doe');
    expect(parsed.photographerUrl).toBe('https://pexels.com/@janedoe');
    expect(parsed.targetKeyword).toBe('roof replacement');
  });
});

describe('postDateLabel honesty', () => {
  it('labels creation date vs updated date honestly', async () => {
    const { postDateLabel } = await import('@/lib/marketing-status');

    // Just created draft
    const freshDraft = {
      status: 'draft' as const,
      date: '2026-08-01',
      publishAt: '',
    };
    expect(postDateLabel(freshDraft, '2026-08-05')).toBe('Created Aug 1');

    // Edited draft
    const editedDraft = {
      status: 'draft' as const,
      date: '2026-08-01',
      updatedAt: '2026-08-20',
      publishAt: '',
    };
    expect(postDateLabel(editedDraft, '2026-08-25')).toBe('Updated Aug 20');

    // Published without further updates
    const published = {
      status: 'published' as const,
      date: '2026-08-10',
      publishAt: '',
    };
    expect(postDateLabel(published, '2026-08-25')).toBe('Published Aug 10');

    // Published and later updated
    const publishedAndUpdated = {
      status: 'published' as const,
      date: '2026-08-10',
      updatedAt: '2026-08-22',
      publishAt: '',
    };
    expect(postDateLabel(publishedAndUpdated, '2026-08-25')).toBe('Published Aug 10 · Updated Aug 22');

    // Archived post
    const archived = {
      status: 'archived' as const,
      date: '2026-08-01',
      updatedAt: '2026-08-15',
      publishAt: '',
    };
    expect(postDateLabel(archived, '2026-08-25')).toBe('Archived · last saved Aug 15');

    // Scheduled post
    const scheduled = {
      status: 'ready' as const,
      date: '2026-08-01',
      publishAt: '2026-09-01',
    };
    expect(postDateLabel(scheduled, '2026-08-25')).toBe('Scheduled for Sep 1');
  });
});
