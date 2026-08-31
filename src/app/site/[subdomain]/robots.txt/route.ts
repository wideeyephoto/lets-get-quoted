import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { buildSiteRobotsTxt, siteOrigin, ROBOTS_HEADERS } from '@/lib/seo/site-pages';

// A contractor's own robots.txt, served on their own host — chiefly so their
// sitemap has somewhere to be declared. See lib/seo/site-pages.ts for why this
// stays crawlable even when the site is being kept out of the index.
export const dynamic = 'force-dynamic';
// See the sitemap route: in a Route Handler, force-dynamic does not stop
// Supabase's fetch being served from the data cache.
export const fetchCache = 'force-no-store';

type Props = {
  params: Promise<{ subdomain: string }>;
};

export async function GET(_request: Request, { params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  const origin = site ? siteOrigin(site) : null;
  if (!site || !origin) {
    return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(buildSiteRobotsTxt(origin), { headers: ROBOTS_HEADERS });
}
