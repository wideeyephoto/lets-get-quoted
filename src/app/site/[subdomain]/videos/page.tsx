import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { renderSiteVideoIndex, siteVideoIndexMetadata } from '@/lib/seo/video-index-page';

export const dynamic = 'force-dynamic';

type Props = { params: { subdomain: string } };

async function loadSite(subdomain: string) {
  return getPublicSiteBySubdomain(createAdminClient(), subdomain);
}

export default async function PublicVideoIndexPage({ params }: Props) {
  return renderSiteVideoIndex(await loadSite(params.subdomain));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteVideoIndexMetadata(await loadSite(params.subdomain));
}
