import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';

const loadPublicSite = cache(async (kind: string, tenant: string) => { return kind === 'd' ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) : getCachedPublicSiteBySubdomain(tenant); });



import { buildSiteRobotsTxt, siteOrigin, ROBOTS_HEADERS } from '@/lib/seo/site-pages';

// A contractor's own robots.txt, served on their own host — chiefly so their
// sitemap has somewhere to be declared. See lib/seo/site-pages.ts for why this
// stays crawlable even when the site is being kept out of the index.
// See the sitemap route: in a Route Handler, force-dynamic does not stop
// Supabase's fetch being served from the data cache.
export const fetchCache = 'force-no-store';

type Props = {
  params: Promise<{ kind: string; tenant: string }>;
};

export async function GET(_request: Request, { params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  const origin = site ? siteOrigin(site) : null;
  if (!site || !origin) {
    return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(buildSiteRobotsTxt(origin), { headers: ROBOTS_HEADERS });
}
