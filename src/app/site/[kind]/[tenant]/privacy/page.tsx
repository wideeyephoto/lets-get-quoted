import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';

const loadPublicSite = cache(async (kind: string, tenant: string) => { return kind === 'd' ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) : getCachedPublicSiteBySubdomain(tenant); });

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';


import { resolveSiteLegal } from '@/lib/legal/site-legal';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteLegalPage from '@/lib/templates/SiteLegalPage';

type Props = {
  params: Promise<{ kind: string; tenant: string }>;
};

export default async function PublicPrivacyPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) notFound();
  const legal = resolveSiteLegal(site, 'privacy');
  if (!legal.enabled) notFound();
  return <SiteLegalPage site={site} title={legal.title} body={legal.body} />;
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) return { title: 'Not found' };
  const legal = resolveSiteLegal(site, 'privacy');
  return {
    title: { absolute: `${legal.title} | ${site.company_name}` },
    // Utility page — keep it out of search to avoid near-duplicate content
    // across every contractor site.
    robots: { index: false, follow: true },
    icons: siteIconsMetadata(site),
  };
}
