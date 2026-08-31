import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { renderSiteVideoIndex, siteVideoIndexMetadata } from '@/lib/seo/video-index-page';

// The /videos index on a contractor's OWN domain.
//
// This route was missing while the subdomain tree had it, so on a custom domain
// the site's own nav carried a "Videos" link straight to a 404 — and the root
// sitemap submitted that same 404 to Google. Nothing had caught it because no
// contractor has verified a domain yet; it would have broken for the first one.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ domain: string }> };

async function loadSite(domain: string) {
  const site = await getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(domain).toLowerCase());
  return site && site.custom_domain_verified_at ? site : null;
}

export default async function CustomDomainVideoIndexPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const { domain } = await params;
  return await renderSiteVideoIndex(await loadSite(domain));
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const { domain } = await params;
  return siteVideoIndexMetadata(await loadSite(domain));
}
