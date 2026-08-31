import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SitePortalPage from '@/lib/templates/SitePortalPage';
import PortalRequestForm from '@/app/portal/[subdomain]/PortalRequestForm';

export const dynamic = 'force-dynamic';

// The portal on the contractor's OWN host, so the "Client Login" link in their
// header doesn't hop to another company's domain to ask for an email address.
//
// Must stay in lockstep with site-domain/[domain]/portal — a route in one tree
// and not the other is a live 404 on custom domains only, which nothing catches.

type Props = {
  params: Promise<{ subdomain: string }>;
};

export default async function PublicPortalPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, params.subdomain);
  if (!site) notFound();

  const { data: account } = await admin
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
        site.subdomain ? (
          <PortalRequestForm subdomain={site.subdomain} businessName={businessName} />
        ) : null
      }
    />
  );
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) return { title: 'Not found' };
  return {
    title: { absolute: `Your jobs | ${site.company_name}` },
    // A door, and a door in a search result is an invitation to try addresses
    // at it. Never indexed, on any host.
    robots: { index: false, follow: false },
    icons: siteIconsMetadata(site),
  };
}
