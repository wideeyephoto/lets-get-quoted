import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { renderSiteVideoIndex, siteVideoIndexMetadata } from '@/lib/seo/video-index-page';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ subdomain: string }> };

async function loadSite(subdomain: string) {
  return getPublicSiteBySubdomain(createAdminClient(), subdomain);
}

export default async function PublicVideoIndexPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const { subdomain } = await params;
  return await renderSiteVideoIndex(await loadSite(subdomain));
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const { subdomain } = await params;
  return siteVideoIndexMetadata(await loadSite(subdomain));
}
