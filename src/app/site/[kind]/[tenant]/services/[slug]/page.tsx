import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSiteContent, slugifyBlogTitle } from '@/lib/site-content';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteServicePage from '@/lib/templates/SiteServicePage';
import { siteOrigin } from '@/lib/seo/site-pages';

const loadPublicSite = cache(async (kind: string, tenant: string) => { 
  return kind === 'd' 
    ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) 
    : getCachedPublicSiteBySubdomain(tenant); 
});

type Props = {
  params: Promise<{ kind: string; tenant: string; slug: string }>;
};

export default async function PublicServicePage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) notFound();
  
  const content = getSiteContent(site.content);
  if (!content.services.enabled) notFound();

  const service = content.services.items.find(s => encodeURIComponent(slugifyBlogTitle(s.title.trim())) === params.slug);
  if (!service || !service.title.trim()) notFound();

  return <SiteServicePage site={site} service={service} />;
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) return { title: 'Not found' };
  
  const content = getSiteContent(site.content);
  if (!content.services.enabled) return { title: 'Not found' };

  const service = content.services.items.find(s => encodeURIComponent(slugifyBlogTitle(s.title.trim())) === params.slug);
  if (!service || !service.title.trim()) return { title: 'Not found' };

  const base = siteOrigin(site) || `https://letsgetquoted.com`;
  const title = `${service.title} | ${site.company_name}`;
  const images = site.hero_url ? [{ url: site.hero_url }] : [];

  return {
    title: { absolute: title },
    description: service.description || undefined,
    alternates: { canonical: `${base}/services/${params.slug}` },
    icons: siteIconsMetadata(site),
    openGraph: { title: service.title, description: service.description || undefined, type: 'website', url: `${base}/services/${params.slug}`, images },
  };
}
