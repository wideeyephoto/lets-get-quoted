import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { marketingHostFor, marketingOrigin } from '@/lib/tenant-host';

/**
 * PER HOST, BECAUSE THIS APP ANSWERS ON TWO OF THEM.
 *
 * A crawler reads robots.txt from the host it is crawling, and this file used to
 * return the same body on both: a sitemap line pointing at
 * https://app.letsgetquoted.com/sitemap.xml, built from NEXT_PUBLIC_APP_URL. So
 * a crawler on the apex — the host every page names as its canonical — was sent
 * to a sitemap on the other host, which then listed 71 more URLs on that other
 * host. Every signal pointed away from the address the site actually claims.
 *
 * Two changes:
 *
 *   - The sitemap line is only emitted on the host that serves that sitemap.
 *     A cross-host reference is legal but requires both hosts to be verified
 *     and cross-submitted, and it is not what was wanted here anyway.
 *   - The app host stays CRAWLABLE. The instinct is to disallow it outright,
 *     and that would be exactly wrong right now: the marketing pages already
 *     indexed under app.letsgetquoted.com have to be re-crawled for the 308s to
 *     be seen. A blocked URL that is already indexed stays indexed, as "indexed,
 *     though blocked by robots.txt", and no redirect ever reaches it.
 *
 * Dynamic because it reads the request host.
 */
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const host = (await headers()).get('x-forwarded-host') || (await headers()).get('host');
  // Non-null exactly when this request is on a host that is NOT the apex —
  // www or app. On the apex itself it is null, which is when the sitemap
  // belongs here.
  const servedElsewhere = marketingHostFor(rootDomain, host);

  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard/', '/api/', '/pay/'] },
    ...(servedElsewhere ? {} : { sitemap: `${marketingOrigin(rootDomain)}/sitemap.xml` }),
  };
}
