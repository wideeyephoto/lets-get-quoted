import type { Metadata } from 'next';
import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';

import { renderSiteVideoIndex, siteVideoIndexMetadata } from '@/lib/seo/video-index-page';

type Props = { params: Promise<{ kind: string; tenant: string }> };

const loadPublicSite = cache(async (kind: string, tenant: string) => { return kind === 'd' ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) : getCachedPublicSiteBySubdomain(tenant); });

export default async function PublicVideoIndexPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  return await renderSiteVideoIndex(await loadPublicSite(params.kind, params.tenant));
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  return siteVideoIndexMetadata(await loadPublicSite(params.kind, params.tenant));
}
