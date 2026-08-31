import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { buildSitemapXml, siteIndexablePages, siteOrigin, SITEMAP_HEADERS } from '@/lib/seo/site-pages';

// A contractor's own sitemap on their own domain — the one that actually
// matters. The platform's root sitemap lists these URLs too, but a sitemap
// hosted on letsgetquoted.com listing pages on someone else's domain is a
// cross-domain submission, which Google honours only when both domains are
// verified together in Search Console. This is the copy a contractor can submit
// themselves, from their own property, with no coordination.
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
  return new Response(buildSitemapXml(origin, siteIndexablePages(site)), { headers: SITEMAP_HEADERS });
}
