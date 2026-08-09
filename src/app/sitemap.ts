import type { MetadataRoute } from 'next';
import { marketingOrigin } from '@/lib/tenant-host';
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

/**
 * THE URLS HERE MUST BE THE URLS THE PAGES CLAIM.
 *
 * Every one of these used to be built from NEXT_PUBLIC_APP_URL, which in
 * production is https://app.letsgetquoted.com — so this file published 71 URLs
 * on the app host while each of those pages declared a canonical on the apex,
 * and robots.txt sent crawlers here to read it. Both hosts answered 200. The
 * one file whose job is to say which address is real was naming the other one.
 *
 * `appUrl` is gone from this file entirely rather than renamed, so the mistake
 * cannot be made again by reaching for the variable that was already in scope.
 * The middleware now 308s the same paths off the app host (isMarketingPath).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = marketingOrigin(process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com');

  const staticPages: MetadataRoute.Sitemap = [
    { url: origin, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/features`, changeFrequency: 'monthly', priority: 0.8 },
    ...FEATURE_SLUGS.map((slug) => ({
      url: `${origin}/features/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${origin}/how-it-works`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/for`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/faq`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${origin}/security`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${origin}/resources`, changeFrequency: 'weekly', priority: 0.6 },
    ...TRADES.map((trade) => ({
      url: `${origin}/for/${trade.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...ARTICLES.map((article) => ({
      url: `${origin}/resources/${article.slug}`,
      lastModified: article.datePublished,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
    { url: `${origin}/contact`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${origin}/founder`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${origin}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    // Shipped with the signup terms gate and never added here.
    { url: `${origin}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${origin}/sms-terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
  /* CONTRACTOR SITES ARE NOT LISTED HERE, AND THAT IS THE FIX, NOT AN OMISSION.
     ------------------------------------------------------------------------
     Every published site used to be appended to this file. They live on their
     own hosts — acme.letsgetquoted.com, or a domain the contractor owns — and a
     sitemap may only list URLs on the host that serves it. Cross-host entries
     are ignored unless every host is verified and cross-submitted in Search
     Console, which none of these are, so those entries were doing nothing
     except making this file look like it covered ground it did not.

     They are not lost. Each site serves its OWN sitemap on its own host, built
     from the same siteIndexablePages() this used to call, and declares it in
     its own robots.txt — see src/app/site/[subdomain]/sitemap.xml and
     robots.txt. That is the arrangement Google asks for, and it is also the one
     that survives a contractor moving to a custom domain.

     A consequence worth naming: a brand-new site with no inbound links is now
     discovered through its own host rather than through ours. That was already
     true in practice, because these entries were being ignored. */
  return staticPages;
}