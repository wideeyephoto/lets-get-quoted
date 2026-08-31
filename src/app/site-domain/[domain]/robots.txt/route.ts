import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { buildSiteRobotsTxt, siteOrigin, ROBOTS_HEADERS } from '@/lib/seo/site-pages';

// A contractor's own robots.txt on their own domain. See lib/seo/site-pages.ts
// for why this stays crawlable even for a site we're keeping out of the index.
export const dynamic = 'force-dynamic';
// See the subdomain sitemap route: in a Route Handler, force-dynamic does not
// stop Supabase's fetch being served from the data cache.
export const fetchCache = 'force-no-store';

type Props = {
  params: Promise<{ domain: string }>;
};

export async function GET(_request: Request, { params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(params.domain).toLowerCase());
  const origin = site && site.custom_domain_verified_at ? siteOrigin(site) : null;
  if (!site || !origin) {
    return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(buildSiteRobotsTxt(origin), { headers: ROBOTS_HEADERS });
}
