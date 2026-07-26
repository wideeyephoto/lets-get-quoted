import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { resolveSiteLegal } from '@/lib/legal/site-legal';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteLegalPage from '@/lib/templates/SiteLegalPage';

export const dynamic = 'force-dynamic';

type Props = { params: { subdomain: string } };

export default async function PublicPrivacyPage({ params }: Props) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) notFound();
  const legal = resolveSiteLegal(site, 'privacy');
  if (!legal.enabled) notFound();
  return <SiteLegalPage site={site} title={legal.title} body={legal.body} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
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
