import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SitePortalPage from '@/lib/templates/SitePortalPage';
import PortalRequestForm from '@/app/portal/[subdomain]/PortalRequestForm';

export const dynamic = 'force-dynamic';

// The custom-domain twin of site/[subdomain]/portal. Change one, change both.

type Props = { params: { domain: string } };

async function loadSite(domain: string) {
  return getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(domain).toLowerCase());
}

export default async function CustomDomainPortalPage({ params }: Props) {
  const site = await loadSite(params.domain);
  if (!site || !site.custom_domain_verified_at) notFound();

  const { data: account } = await createAdminClient()
    .from('accounts')
    .select('client_portal_enabled, business_name')
    .eq('id', site.account_id)
    .maybeSingle();

  const businessName = site.company_name || account?.business_name || 'your contractor';

  return (
    <SitePortalPage
      accent={site.accent_override}
      businessName={businessName}
      enabled={Boolean(account?.client_portal_enabled)}
      form={
        // The request action resolves the site by SUBDOMAIN, so a row without
        // one has no way to send. Rare, and a silent no-op form would be worse.
        site.subdomain ? (
          <PortalRequestForm subdomain={site.subdomain} businessName={businessName} />
        ) : null
      }
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await loadSite(params.domain);
  if (!site) return { title: 'Not found' };
  return {
    title: { absolute: `Your jobs | ${site.company_name}` },
    robots: { index: false, follow: false },
    icons: siteIconsMetadata(site),
  };
}
