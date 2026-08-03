import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/auth';
import type { Site } from '@/lib/sites';
import { isSiteSeoReady } from '@/lib/seo/site-seo';
import { getAllPublishedVideos, getSiteContent } from '@/lib/site-content';
import { TRADES } from '@/lib/trades';
import { ARTICLES } from '@/lib/resources';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${rootDomain}`;
  const { data: sites } = await createAdminClient()
    .from('sites')
    .select('*')
    .eq('published', true);

  const staticPages: MetadataRoute.Sitemap = [
    { url: appUrl, changeFrequency: 'monthly', priority: 1 },
    { url: `${appUrl}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${appUrl}/for`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${appUrl}/faq`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${appUrl}/security`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${appUrl}/resources`, changeFrequency: 'weekly', priority: 0.6 },
    ...TRADES.map((trade) => ({
      url: `${appUrl}/for/${trade.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...ARTICLES.map((article) => ({
      url: `${appUrl}/resources/${article.slug}`,
      lastModified: article.datePublished,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
    { url: `${appUrl}/contact`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${appUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${appUrl}/sms-terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
  // Only list sites that carry real content — mirrors the noindex gate on the
  // pages so thin/incomplete sites aren't advertised for indexing.
  //
  // A contractor site is not just its homepage. This listed the root and stopped,
  // so /videos and every blog post existed, were linked in the site's own nav,
  // and appeared in no sitemap anywhere — the two page types most likely to earn
  // a contractor a search result on their own were the two we never submitted.
  const sitePages: MetadataRoute.Sitemap = ((sites ?? []) as Site[]).flatMap((site) => {
    if (!isSiteSeoReady(site)) return [];
    const host = site.custom_domain && site.custom_domain_verified_at
      ? site.custom_domain
      : site.subdomain ? `${site.subdomain}.${rootDomain}` : null;
    if (!host) return [];
    const origin = `https://${host}`;
    const pages: MetadataRoute.Sitemap = [
      { url: origin, lastModified: site.updated_at, changeFrequency: 'weekly', priority: 0.8 },
    ];

    // Both gates below mirror the routes themselves, which notFound() when empty
    // — a sitemap entry for a 404 is worse than no entry at all.
    if (getAllPublishedVideos(site.content).length > 0) {
      pages.push({ url: `${origin}/videos`, lastModified: site.updated_at, changeFrequency: 'monthly', priority: 0.6 });
    }

    const posts = getSiteContent(site.content).blog.posts.filter(
      (post) => post.status === 'published' && post.slug.trim() && post.title.trim(),
    );
    for (const post of posts) {
      pages.push({
        // The post's own date, not the site's: a sitemap that reports every
        // article changing whenever the owner edits their phone number teaches
        // Google to stop believing lastModified.
        url: `${origin}/blog/${post.slug.trim()}`,
        lastModified: post.date || site.updated_at,
        changeFrequency: 'yearly',
        priority: 0.5,
      });
    }
    return pages;
  });
  return [...staticPages, ...sitePages];
}