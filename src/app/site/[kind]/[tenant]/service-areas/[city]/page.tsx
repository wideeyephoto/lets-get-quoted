import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSiteContent, slugifyBlogTitle } from '@/lib/site-content';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteServiceAreaPage from '@/lib/templates/SiteServiceAreaPage';
import { siteOrigin } from '@/lib/seo/site-pages';
import { siteCities } from '@/lib/seo/site-seo';

const loadPublicSite = cache(async (kind: string, tenant: string) => { 
  return kind === 'd' 
    ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) 
    : getCachedPublicSiteBySubdomain(tenant); 
});

type Props = {
  params: Promise<{ kind: string; tenant: string; city: string }>;
};

export default async function PublicServiceAreaPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) notFound();
  
  const cities = siteCities(site);
  const city = cities.find(c => encodeURIComponent(slugifyBlogTitle(c.trim())) === params.city);
  if (!city || !city.trim()) notFound();

  return <SiteServiceAreaPage site={site} city={city.trim()} />;
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) return { title: 'Not found' };
  
  const content = getSiteContent(site.content);
  const cities = siteCities(site);
  const city = cities.find(c => encodeURIComponent(slugifyBlogTitle(c.trim())) === params.city);
  if (!city || !city.trim()) return { title: 'Not found' };

  const base = siteOrigin(site) || `https://letsgetquoted.com`;
  const trade = content.trade?.trim() || 'Contractor';
  const title = `${trade} in ${city.trim()} | ${site.company_name}`;
  const images = site.hero_url ? [{ url: site.hero_url }] : [];

  return {
    title: { absolute: title },
    description: `Professional ${trade.toLowerCase()} services in ${city.trim()} by ${site.company_name}. Contact us for a free estimate.`,
    alternates: { canonical: `${base}/service-areas/${params.city}` },
    icons: siteIconsMetadata(site),
    openGraph: { title, description: `Professional ${trade.toLowerCase()} services in ${city.trim()} by ${site.company_name}.`, type: 'website', url: `${base}/service-areas/${params.city}`, images },
  };
}
