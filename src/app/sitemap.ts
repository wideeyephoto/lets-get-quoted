import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/auth';
import type { Site } from '@/lib/sites';
import { siteIndexablePages, siteOrigin } from '@/lib/seo/site-pages';
import { TRADES } from '@/lib/trades';
import { ARTICLES } from '@/lib/resources';

export const dynamic = 'force-dynamic';

// The five feature detail routes, derived from one list so the sitemap cannot
// drift from the directories under src/app/features.
const FEATURE_SLUGS = [
  'ai-intake',
  'quick-stops',
  'client-portal',
  'website-builder',
  'back-office',
] as const;

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
    { url: `${appUrl}/features`, changeFrequency: 'monthly', priority: 0.8 },
    ...FEATURE_SLUGS.map((slug) => ({
      url: `${appUrl}/features/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${appUrl}/how-it-works`, changeFrequency: 'monthly', priority: 0.7 },
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
    { url: `${appUrl}/founder`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${appUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    // Shipped with the signup terms gate and never added here.
    { url: `${appUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${appUrl}/sms-terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
  // Which URLs a contractor site has is defined once, in lib/seo/site-pages.ts,
  // because each site now also serves its OWN sitemap on its own host. Two
  // hand-maintained copies of this list would eventually disagree, and the way
  // that surfaces is a contractor's Search Console reporting crawl errors on
  // pages the platform's sitemap promised and theirs didn't (or worse, the
  // reverse). This file and theirs are the same function.
  const sitePages: MetadataRoute.Sitemap = ((sites ?? []) as Site[]).flatMap((site) => {
    const origin = siteOrigin(site, rootDomain);
    if (!origin) return [];
    return siteIndexablePages(site).map((page) => ({
      url: `${origin}${page.path}`,
      lastModified: page.lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    }));
  });
  return [...staticPages, ...sitePages];
}