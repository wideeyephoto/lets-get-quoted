import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { resolveSiteLegal } from '@/lib/legal/site-legal';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteLegalPage from '@/lib/templates/SiteLegalPage';

export const dynamic = 'force-dynamic';

type Props = { params: { domain: string } };

async function loadSite(domain: string) {
  return getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(domain).toLowerCase());
}

export default async function CustomDomainPrivacyPage({ params }: Props) {
  const site = await loadSite(params.domain);
  if (!site || !site.custom_domain_verified_at) notFound();
  const legal = resolveSiteLegal(site, 'privacy');
  if (!legal.enabled) notFound();
  return <SiteLegalPage site={site} title={legal.title} body={legal.body} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await loadSite(params.domain);
  if (!site) return { title: 'Not found' };
  const legal = resolveSiteLegal(site, 'privacy');
  return {
    title: { absolute: `${legal.title} | ${site.company_name}` },
    robots: { index: false, follow: true },
    icons: siteIconsMetadata(site),
  };
}
