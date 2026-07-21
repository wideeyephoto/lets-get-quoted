import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getSiteGallery } from '@/lib/site-images';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { getTemplate } from '@/lib/templates';
import SiteStructuredData from '@/lib/templates/SiteStructuredData';

export const dynamic = 'force-dynamic';

type Props = { params: { domain: string } };

async function loadSite(domain: string) {
  return getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(domain).toLowerCase());
}

export default async function CustomDomainSitePage({ params }: Props) {
  const site = await loadSite(params.domain);
  if (!site || !site.custom_domain_verified_at) notFound();
  const Template = getTemplate(site.template);
  if (!Template) notFound();
  return (
    <>
      <SiteStructuredData site={site} />
      <Template site={site} galleryImages={getSiteGallery(site.content)} />
    </>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await loadSite(params.domain);
  if (!site) return { title: 'Site not found' };
  const title = site.seo_title || site.company_name;
  const description = site.seo_description || site.tagline || `${site.company_name} contractor services`;
  return {
    // absolute bypasses the root layout's '%s · Let's Get Quoted' template so a
    // contractor's own domain/tab doesn't carry the SaaS brand. Guard against an
    // empty title (blank company name) — undefined lets the root default apply
    // rather than emitting an empty <title>.
    title: title ? { absolute: title } : undefined,
    description,
    alternates: { canonical: `https://${site.custom_domain}` },
    openGraph: { title, description, type: 'website', url: `https://${site.custom_domain}`, images: site.hero_url ? [{ url: site.hero_url }] : [] },
  };
}