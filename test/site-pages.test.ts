import { describe, it, expect } from 'vitest';
import {
  buildSiteRobotsTxt, buildSitemapXml, siteHost, siteIndexablePages, siteOrigin,
} from '../src/lib/seo/site-pages';
import type { Site } from '../src/lib/sites';

const site = (overrides: Partial<Site> = {}): Site => ({
  id: 'site-1',
  account_id: 'acct-1',
  subdomain: 'brokepipes',
  custom_domain: null,
  custom_domain_verified_at: null,
  published: true,
  template: 'carbon',
  header_font: null,
  button_style: 'solid',
  accent_override: null,
  company_name: 'BrokePipes',
  headline: 'Plumbing in Maplewood',
  tagline: '',
  phone: null,
  license: null,
  hours: '',
  service_area: '',
  logo_url: null,
  hero_url: null,
  seo_title: null,
  seo_description: null,
  sections: {},
  content: {},
  chrome: {},
  reviews_cache: null,
  portal_mode: 'light',
  updated_at: '2026-08-03T22:40:17.517Z',
  ...overrides,
});

const withPost = (slug: string, extra: Record<string, unknown> = {}) => ({
  blog: { enabled: true, posts: [{ id: 'p1', slug, title: 'A post', body: 'x', status: 'published', date: '2026-07-22', ...extra }] },
});

describe('siteHost', () => {
  it('uses the subdomain when there is no verified custom domain', () => {
    expect(siteHost(site(), 'letsgetquoted.com')).toBe('brokepipes.letsgetquoted.com');
  });

  it('an UNVERIFIED custom domain does not win — it is not serving yet', () => {
    expect(siteHost(site({ custom_domain: 'brokepipes.com' }), 'letsgetquoted.com')).toBe('brokepipes.letsgetquoted.com');
  });

  it('a verified custom domain is the canonical host', () => {
    const s = site({ custom_domain: 'brokepipes.com', custom_domain_verified_at: '2026-08-01T00:00:00Z' });
    expect(siteHost(s, 'letsgetquoted.com')).toBe('brokepipes.com');
    expect(siteOrigin(s, 'letsgetquoted.com')).toBe('https://brokepipes.com');
  });

  it('is null with neither, so nothing tries to publish a URL that does not exist', () => {
    expect(siteHost(site({ subdomain: null }), 'letsgetquoted.com')).toBeNull();
    expect(siteOrigin(site({ subdomain: null }), 'letsgetquoted.com')).toBeNull();
  });
});

describe('siteIndexablePages', () => {
  it('lists the homepage for a published site with content', () => {
    expect(siteIndexablePages(site()).map((p) => p.path)).toEqual(['']);
  });

  it('lists nothing at all for a site we are keeping out of the index', () => {
    // An unpublished site is not index-worthy, and advertising a page we have
    // asked Google not to index is a contradiction, not a strategy.
    expect(siteIndexablePages(site({ published: false }))).toEqual([]);
  });

  it('adds published blog posts, and skips drafts and untitled ones', () => {
    const s = site({
      content: {
        blog: {
          enabled: true,
          posts: [
            { id: 'p1', slug: 'fall-tips', title: 'Fall tips', body: 'x', status: 'published', date: '2026-07-22' },
            { id: 'p2', slug: 'draft-post', title: 'Draft', body: 'x', status: 'draft', date: '2026-07-23' },
            { id: 'p3', slug: 'no-title', title: '   ', body: 'x', status: 'published', date: '2026-07-24' },
          ],
        },
      },
    });
    expect(siteIndexablePages(s).map((p) => p.path)).toEqual(['', '/blog/fall-tips']);
  });

  it('dates a post from the post, not the site', () => {
    const s = site({ content: withPost('fall-tips') as never });
    const post = siteIndexablePages(s).find((p) => p.path.startsWith('/blog/'));
    // A sitemap that reports every article changing whenever the owner edits
    // their phone number teaches Google to stop believing lastModified.
    expect(post?.lastModified).toBe('2026-07-22');
    expect(post?.lastModified).not.toBe(s.updated_at);
  });

  it('never lists /privacy or /terms — both routes are noindex', () => {
    const paths = siteIndexablePages(site()).map((p) => p.path);
    expect(paths).not.toContain('/privacy');
    expect(paths).not.toContain('/terms');
  });

  it('emits a URL-safe slug — one bad character invalidates the whole file', () => {
    // The content layer already sanitizes slugs, so the encoding here is a
    // second line rather than the only one. Assert the property that matters
    // (nothing that could break the XML or the URL survives) rather than which
    // layer did it, so this keeps holding if either changes.
    const s = site({ content: withPost('summer sale & more') as never });
    const post = siteIndexablePages(s).find((p) => p.path.startsWith('/blog/'));
    expect(post?.path).toBeDefined();
    expect(post!.path).not.toMatch(/[ &<>"']/);
    expect(post!.path).toBe(encodeURI(post!.path));
  });
});

describe('buildSitemapXml', () => {
  it('produces a valid document with the origin on every loc', () => {
    const xml = buildSitemapXml('https://brokepipes.com', siteIndexablePages(site({ content: withPost('fall-tips') as never })));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://brokepipes.com</loc>');
    expect(xml).toContain('<loc>https://brokepipes.com/blog/fall-tips</loc>');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('escapes XML metacharacters in a URL', () => {
    const xml = buildSitemapXml('https://x.com', [{ path: '/blog/a&b', lastModified: '', changeFrequency: 'yearly', priority: 0.5 }]);
    expect(xml).toContain('<loc>https://x.com/blog/a&amp;b</loc>');
    expect(xml).not.toContain('/blog/a&b<');
  });

  it('omits an unparseable lastmod rather than emitting one Google rejects', () => {
    const xml = buildSitemapXml('https://x.com', [{ path: '', lastModified: 'whenever', changeFrequency: 'weekly', priority: 0.8 }]);
    expect(xml).not.toContain('<lastmod>');
    expect(xml).toContain('<loc>https://x.com</loc>');
  });

  it('keeps a bare date as a date and normalizes a timestamp', () => {
    const xml = buildSitemapXml('https://x.com', [
      { path: '/a', lastModified: '2026-07-22', changeFrequency: 'yearly', priority: 0.5 },
      { path: '/b', lastModified: '2026-08-03T22:40:17.517Z', changeFrequency: 'yearly', priority: 0.5 },
    ]);
    expect(xml).toContain('<lastmod>2026-07-22</lastmod>');
    expect(xml).toContain('<lastmod>2026-08-03T22:40:17.517Z</lastmod>');
  });

  it('an empty page list is still a valid document, not a broken one', () => {
    const xml = buildSitemapXml('https://x.com', []);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
    expect(xml).not.toContain('<url>');
  });
});

describe('buildSiteRobotsTxt', () => {
  it('declares the sitemap on the same origin', () => {
    expect(buildSiteRobotsTxt('https://brokepipes.com')).toContain('Sitemap: https://brokepipes.com/sitemap.xml');
  });

  it('keeps the site crawlable', () => {
    // Disallow would stop the crawl, and a page that is never crawled is a page
    // whose noindex is never read — the standard way to make a thin page
    // permanent in the index instead of removing it.
    const txt = buildSiteRobotsTxt('https://brokepipes.com');
    expect(txt).toContain('Allow: /');
    expect(txt).not.toMatch(/^Disallow: \/$/m);
  });

  it('keeps crawlers out of the API the middleware does not rewrite', () => {
    expect(buildSiteRobotsTxt('https://brokepipes.com')).toContain('Disallow: /api/');
  });
});
