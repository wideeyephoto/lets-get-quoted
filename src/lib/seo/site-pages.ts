// What a contractor site's indexable URLs ARE, in one place.
//
// Three callers need this list and they must not disagree:
//
//   - the root sitemap at letsgetquoted.com/sitemap.xml, which lists every
//     published site's pages by their own host;
//   - each contractor's OWN sitemap.xml, served on their host;
//   - each contractor's robots.txt, which points at that sitemap.
//
// A sitemap that lists a page the site doesn't serve is worse than no sitemap:
// Google reports it as a crawl error against the contractor's domain. So the
// gates below deliberately mirror the routes themselves, which notFound() when
// their content is empty.
//
// Pure: no fetching, no Supabase. Takes a Site and returns strings.

import type { Site } from '@/lib/sites';
import { getAllPublishedVideos, getSiteContent } from '@/lib/site-content';
import { isSiteSeoReady } from './site-seo';

export type SitePageEntry = {
  /** Path under the site's own origin. '' is the homepage. */
  path: string;
  lastModified: string;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
  priority: number;
};

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';

/**
 * The host this site is served on — its verified custom domain if it has one,
 * otherwise its subdomain. Null when it has neither and therefore has no public
 * URL at all.
 */
// Takes only the three fields it reads, so a page that selected a handful of
// columns can ask without loading (or casting to) a whole Site.
type SiteHostFields = Pick<Site, 'custom_domain' | 'custom_domain_verified_at' | 'subdomain'>;

export function siteHost(site: SiteHostFields, rootDomain: string = ROOT_DOMAIN): string | null {
  if (site.custom_domain && site.custom_domain_verified_at) return site.custom_domain;
  if (site.subdomain) return `${site.subdomain}.${rootDomain}`;
  return null;
}

export function siteOrigin(site: SiteHostFields, rootDomain: string = ROOT_DOMAIN): string | null {
  const host = siteHost(site, rootDomain);
  return host ? `https://${host}` : null;
}

/**
 * Every URL on this site that should be submitted for indexing.
 *
 * Returns an empty list for a site that isn't index-worthy, matching the
 * `noindex` the pages themselves emit — advertising a page we've asked Google
 * not to index is a contradiction, not a strategy.
 *
 * /privacy and /terms are deliberately absent: both routes set
 * `robots: { index: false }`, for the same reason.
 */
export function siteIndexablePages(site: Site): SitePageEntry[] {
  if (!isSiteSeoReady(site)) return [];

  const updated = site.updated_at || '';
  const pages: SitePageEntry[] = [
    { path: '', lastModified: updated, changeFrequency: 'weekly', priority: 0.8 },
  ];

  if (getAllPublishedVideos(site.content).length > 0) {
    pages.push({ path: '/videos', lastModified: updated, changeFrequency: 'monthly', priority: 0.6 });
  }

  const posts = getSiteContent(site.content).blog.posts.filter(
    (post) => post.status === 'published' && post.slug.trim() && post.title.trim(),
  );
  for (const post of posts) {
    pages.push({
      // Slugs are owner-typed. Encoding here rather than at each call site is
      // the difference between a valid URL and a sitemap Google rejects
      // outright — one bad character invalidates the whole file, not one entry.
      path: `/blog/${encodeURIComponent(post.slug.trim())}`,
      // The post's own date, not the site's: a sitemap that reports every
      // article changing whenever the owner edits their phone number teaches
      // Google to stop believing lastModified.
      lastModified: post.date || updated,
      changeFrequency: 'yearly',
      priority: 0.5,
    });
  }

  return pages;
}

// --- Serialization -----------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// A <lastmod> Google will accept, or nothing. W3C datetime means a full ISO
// timestamp or a bare date; anything else is dropped rather than guessed at,
// because an unparseable lastmod invalidates the entry.
function lastmod(value: string): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** A complete sitemap document for one contractor's origin. */
export function buildSitemapXml(origin: string, pages: SitePageEntry[]): string {
  const entries = pages.map((page) => {
    const modified = lastmod(page.lastModified);
    return [
      '  <url>',
      `    <loc>${escapeXml(`${origin}${page.path}`)}</loc>`,
      ...(modified ? [`    <lastmod>${modified}</lastmod>`] : []),
      `    <changefreq>${page.changeFrequency}</changefreq>`,
      `    <priority>${page.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * A contractor site's robots.txt.
 *
 * Crawling stays open even for a site we're currently keeping out of the index.
 * That looks backwards and isn't: `Disallow` stops the crawl, and a page that
 * is never crawled is a page whose `noindex` is never read — the standard way
 * to accidentally make a thin page permanent in the index instead of removing
 * it. The meta tag does that job; this file's job is to name the sitemap.
 *
 * /api/ is the one real exclusion. The middleware rewrites tenant hosts into
 * /site/<subdomain>/…, but its matcher skips /api, so those routes answer on a
 * contractor's domain too. They're authenticated; they're just not content, and
 * there's no reason to spend a crawl budget discovering that.
 */
export function buildSiteRobotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export const SITEMAP_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
} as const;

export const ROBOTS_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
} as const;
