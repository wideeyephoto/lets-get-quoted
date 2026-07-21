import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getSiteGallery } from '@/lib/site-images';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getTemplate } from '@/lib/templates';
import SiteStructuredData from '@/lib/templates/SiteStructuredData';

export const dynamic = 'force-dynamic';

type PublicSitePageProps = {
  params: { subdomain: string };
};

export default async function PublicSitePage({ params }: PublicSitePageProps) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) notFound();

  const Template = getTemplate(site.template);
  if (!Template) notFound();

  return (
    <>
      <SiteStructuredData site={site} />
      <Template site={site} galleryImages={getSiteGallery(site.content)} />
    </>
  );
}

export async function generateMetadata({ params }: PublicSitePageProps): Promise<Metadata> {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) return { title: 'Site not found' };

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const title = site.seo_title || site.company_name;
  const description = site.seo_description || site.tagline || `${site.company_name} contractor services`;
  const canonical = site.custom_domain_verified_at && site.custom_domain
    ? `https://${site.custom_domain}`
    : `https://${site.subdomain}.${rootDomain}`;

  return {
    // absolute bypasses the root layout's '%s · Let's Get Quoted' template so a
    // contractor's own domain/tab doesn't carry the SaaS brand. Guard against an
    // empty title (blank company name) — undefined lets the root default apply
    // rather than emitting an empty <title>.
    title: title ? { absolute: title } : undefined,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      images: site.hero_url ? [{ url: site.hero_url }] : [],
    },
  };
}