import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { siteIconsMetadata } from '@/lib/brand-mark';
import PortalRequestForm from './PortalRequestForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { subdomain: string } }): Promise<Metadata> {
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

export default async function PortalRequestPage({ params }: { params: { subdomain: string } }) {
  const admin = createAdminClient();
  const site = await getPublicSiteBySubdomain(admin, params.subdomain);

  const { data: account } = site
    ? await admin.from('accounts').select('client_portal_enabled, business_name').eq('id', site.account_id).maybeSingle()
    : { data: null };

  const businessName = site?.company_name || account?.business_name || 'your contractor';
  // A contractor who hasn't switched this on gets a page that says so plainly
  // rather than a form that silently does nothing.
  const enabled = Boolean(account?.client_portal_enabled);

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero workspace-hero-solo">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{businessName}</p>
          <h1 className="workspace-title">Your jobs</h1>
          {enabled ? (
            <>
              <p className="workspace-lead">
                Everything {businessName} has done for you — what was quoted, what&apos;s covered by warranty, and how
                long you&apos;ve got left on it.
              </p>
              <PortalRequestForm subdomain={params.subdomain} businessName={businessName} />
            </>
          ) : (
            <p className="workspace-lead">
              {businessName} doesn&apos;t have online job lookup switched on. Give them a call and they&apos;ll send you
              your details directly.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
