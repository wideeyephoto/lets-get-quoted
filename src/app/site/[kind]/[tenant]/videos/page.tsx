import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';
import type { Metadata } from 'next';
import { renderSiteVideoIndex, siteVideoIndexMetadata } from '@/lib/seo/video-index-page';

const loadPublicSite = cache(async (kind: string, tenant: string) => { 
  return kind === 'd' 
    ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) 
    : getCachedPublicSiteBySubdomain(tenant); 
});

type Props = { params: Promise<{ kind: string; tenant: string }> };

export default async function PublicVideoIndexPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  return await renderSiteVideoIndex(site);
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  return siteVideoIndexMetadata(site);
}
