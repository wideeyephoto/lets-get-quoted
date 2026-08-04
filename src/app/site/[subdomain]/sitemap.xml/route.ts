import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { buildSitemapXml, siteIndexablePages, siteOrigin, SITEMAP_HEADERS } from '@/lib/seo/site-pages';

// A contractor's own sitemap, served on their own host.
//
// The middleware rewrites <them>.letsgetquoted.com/sitemap.xml to this route.
// Before this existed that path 404'd — and the 404 body was Let's Get Quoted's
// marketing page, canonical and all. Every contractor site was listed only in
// the platform's root sitemap, which is a cross-domain submission Google honours
// only when both domains are verified together in Search Console. A contractor
// verifying their own domain had nothing to submit.
//
// Written as a route handler rather than Next's sitemap.ts convention because
// this segment is dynamic: the file has to resolve which contractor it is from
// the params, and returning the bytes directly makes that explicit and testable.
export const dynamic = 'force-dynamic';
// force-dynamic alone is NOT enough here, and the difference is silent. In a
// Route Handler it opts out of static generation but leaves Supabase's fetch on
// the default data cache — measured: after clearing a site's custom domain, the
// page served the new canonical immediately while this route kept emitting the
// old host indefinitely. A frozen sitemap is the worst kind, because it looks
// like it works: every blog post published after the first crawl is missing.
export const fetchCache = 'force-no-store';

type Props = { params: { subdomain: string } };

export async function GET(_request: Request, { params }: Props) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  const origin = site ? siteOrigin(site) : null;
  if (!site || !origin) {
    return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  // An index-unworthy site yields an empty (but valid) urlset rather than a 404:
  // robots.txt names this file unconditionally, and a 404 on a declared sitemap
  // is a Search Console error, while an empty one is just an empty one.
  return new Response(buildSitemapXml(origin, siteIndexablePages(site)), { headers: SITEMAP_HEADERS });
}
