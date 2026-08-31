import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SitePortalPage from '@/lib/templates/SitePortalPage';
import PortalRequestForm from './PortalRequestForm';

export const dynamic = 'force-dynamic';

// The app-origin portal URL. Predates the header/footer link, and stays: it is
// in email signatures and on the bottom of invoices already, and it is the only
// address that works for a contractor whose site isn't published.
//
// Sibling routes site/[subdomain]/portal and site-domain/[domain]/portal serve
// the SAME shell on the contractor's own host. Change one, change all three.

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ subdomain: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  const name = site?.company_name || 'Your contractor';
  return {
    title: `Your jobs · ${name}`,
    description: `Look up your past work, warranties and cover with ${name}.`,
    // Nothing here should be indexed: it's a door, and a door in a search
    // result is an invitation to try addresses at it.
    robots: { index: false, follow: false },
    ...(site ? siteIconsMetadata(site) : {}),
  };
}

export default async function PortalRequestPage({ params: paramsPromise }: { params: Promise<{ subdomain: string }> }) {
  const params = await paramsPromise;
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, params.subdomain);

  const { data: account } = site
    ? await admin.from('accounts').select('client_portal_enabled, business_name').eq('id', site.account_id).maybeSingle()
    : { data: null };

  const businessName = site?.company_name || account?.business_name || 'your contractor';
  // No 404 for an unknown or unpublished subdomain. A 404 answers "does this
  // contractor exist here?", and the whole page is built around never answering
  // questions about who is on somebody's customer list.
  const enabled = Boolean(account?.client_portal_enabled);

  return (
    <SitePortalPage
      accent={site?.accent_override ?? null}
      businessName={businessName}
      enabled={enabled}
      form={site ? <PortalRequestForm subdomain={params.subdomain} businessName={businessName} /> : null}
    />
  );
}
