import type { Metadata } from 'next';


import { renderSiteVideoIndex, siteVideoIndexMetadata } from '@/lib/seo/video-index-page';

type Props = { params: Promise<{ kind: string; tenant: string }> };

async function loadSite(subdomain: string) {
  return getPublicSiteBySubdomain(createAdminClient(), subdomain);
}

export default async function PublicVideoIndexPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const { subdomain } = await params;
  return await renderSiteVideoIndex(loadPublicSite(params.kind, params.tenant));
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const { subdomain } = await params;
  return siteVideoIndexMetadata(await loadSite(subdomain));
}
