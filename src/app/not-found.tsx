import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain, getPublicSiteBySubdomain } from '@/lib/sites';
import { resolveTenantHost } from '@/lib/tenant-host';
import SiteNotFound from '@/lib/templates/SiteNotFound';
import styles from './not-found.module.css';

// One 404 for the whole app, which has to answer for two different products.
//
// A request to <them>.letsgetquoted.com or a contractor's own domain is rewritten
// by the middleware into /site/… — but an unmatched path there was falling all
// the way through to Next's stock error page, rendered inside OUR root layout.
// The result on a contractor's domain: unstyled black-on-white "404: This page
// could not be found.", no way back to their site, and a browser tab reading
// "Let's Get Quoted — Contractor websites that get you paid".
//
// So this resolves whose host it is first, from the same classifier the
// middleware routes with, and renders the contractor's own 404 when it is
// theirs. Reading headers() makes this dynamic, which it has to be: the answer
// depends on the request, and a cached 404 would show one contractor's branding
// to another's visitor.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Not per-tenant — a not-found render has no params to generate metadata from.
  // But a neutral title is honest on both products, where the inherited
  // marketing title was wrong on one of them. noindex because a 404 that gets
  // indexed is a bug in its own right.
  title: { absolute: 'Page not found' },
  robots: { index: false, follow: false },
};

async function tenantSite() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const headerList = headers();
  const tenant = resolveTenantHost(
    headerList.get('x-forwarded-host') || headerList.get('host'),
    rootDomain,
  );
  if (tenant.kind === 'platform') return null;

  // A lookup failure here is not worth a 500 on top of a 404 — fall back to the
  // platform page, which is still a valid thing to show.
  try {
    const admin = createAdminClient();
    if (tenant.kind === 'subdomain') return await getPublicSiteBySubdomain(admin, tenant.subdomain);
    const site = await getPublicSiteByCustomDomain(admin, tenant.domain);
    return site && site.custom_domain_verified_at ? site : null;
  } catch {
    return null;
  }
}

export default async function NotFound() {
  const site = await tenantSite();
  if (site) return <SiteNotFound site={site} />;

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>We couldn’t find that page</h1>
        <p className={styles.body}>
          The link may be out of date, or the address may have a typo in it.
        </p>
        {/* Global .btn classes rather than local ones, so these stay identical
            to every other button on the marketing site and flip with the theme. */}
        <div className={styles.actions}>
          <a className="btn primary" href="/">Go to the homepage</a>
          <a className="btn secondary" href="/contact">Contact us</a>
        </div>
        {/* SOMEWHERE TO GO, not just a way out.
            Two buttons — home, or tell us it is broken — asked a visitor who
            landed here from a stale link or a typo'd URL to start over. These
            four are the pages people arrive looking for, so a 404 becomes a
            junction instead of a dead end. Quieter than the buttons above,
            because the primary action is still "go to the homepage". */}
        <nav className={styles.suggestions} aria-label="Popular pages">
          <a href="/demo">See the live demo</a>
          <a href="/for">Find your trade</a>
          <a href="/pricing">Pricing</a>
          <a href="/features">All features</a>
        </nav>
      </div>
    </main>
  );
}
