import type { MetadataRoute } from 'next';
import { marketingOrigin } from '@/lib/tenant-host';
import { TRADES } from '@/lib/trades';
import { ARTICLES } from '@/lib/resources';
import { getAllArticles } from '@/components/help-center/help-center-data';
import { COMPARISONS } from '@/app/compare/compare-data';

export const dynamic = 'force-dynamic';

// The twelve feature detail routes, derived from one list so the sitemap cannot
// drift from the directories under src/app/features.
//
// The first five are the flagship pages. The seven after them are the suite
// pages the homepage's card grid links at — each one used to land on an anchor
// part-way down back-office or on a capability group on /features.
const FEATURE_SLUGS = [
  'ai-intake',
  'ai-voice',
  'ai-vision',
  'text-to-job',
  'dispatch',
  'quick-stops',
  'client-portal',
  'website-builder',
  'back-office',
  'quotes',
  'scheduling',
  'crew',
  'payments',
  'recurring',
  'cash-flow',
  'reviews',
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
/**
 * WHEN THE MARKETING COPY LAST CHANGED. Bump this when you change it.
 *
 * Every entry below except the four articles had no `lastmod` at all, so a
 * crawler had nothing to recrawl on. The fix has to be a date that is TRUE,
 * which rules out the two obvious shortcuts:
 *
 *   - `new Date()` would restamp all 70 URLs as modified on every single
 *     request. lastmod is the one field in this file a crawler will stop
 *     believing if it is wrong, and "everything changed, again" is how you
 *     teach it to ignore the whole document.
 *   - A file mtime is unavailable: this renders on a serverless host from a
 *     bundle, with no git history and no meaningful timestamps on disk.
 *
 * So it is written down by hand, and the failure mode is deliberately the safe
 * one. Forget to bump it and the date is merely OLD, which costs a little
 * recrawl latency on a page that changed. The alternative fails the other way.
 *
 * The articles keep their own datePublished (and dateModified once one is
 * edited), because those are genuinely per-URL.
 */
const MARKETING_REVISED = '2026-08-24';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = marketingOrigin(process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com');
  const lastModified = MARKETING_REVISED;

  const staticPages: MetadataRoute.Sitemap = [
    { url: origin, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/pricing`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/features`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    ...FEATURE_SLUGS.map((slug) => ({
      url: `${origin}/features/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${origin}/how-it-works`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/for`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${origin}/compare`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    ...Object.keys(COMPARISONS).map((slug) => ({
      url: `${origin}/compare/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${origin}/tools`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/tools/hourly-rate-calculator`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/tools/estimate-generator`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/tools/leakage-calculator`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/faq`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${origin}/security`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${origin}/resources`, lastModified, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${origin}/changelog`, lastModified: '2026-08-26', changeFrequency: 'weekly', priority: 0.7 },
    { url: `${origin}/help`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    ...getAllArticles().map((article) => ({
      url: `${origin}/help/articles/${article.slug}`,
      lastModified: '2026-08-25',
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...TRADES.map((trade) => ({
      url: `${origin}/for/${trade.slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...ARTICLES.map((article) => ({
      url: `${origin}/resources/${article.slug}`,
      lastModified: article.dateModified ?? article.datePublished,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
    { url: `${origin}/contact`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${origin}/founder`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${origin}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    // Shipped with the signup terms gate and never added here.
    { url: `${origin}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${origin}/sms-terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${origin}/dpa`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
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