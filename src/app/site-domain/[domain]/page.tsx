import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createAdminClient } from '@/lib/auth';
import { getSiteGallery } from '@/lib/site-images';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';
import { getTemplate } from '@/lib/templates';
import SiteStructuredData from '@/lib/templates/SiteStructuredData';
import { getSiteContent } from '@/lib/site-content';
import { parseVerificationToken } from '@/lib/seo/search-console';
import { resolveSiteSeo, isSiteSeoReady } from '@/lib/seo/site-seo';
import { siteIconsMetadata } from '@/lib/brand-mark';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ domain: string }>;
};

const loadSite = cache(async (domain: string) => {
  return getCachedPublicSiteByCustomDomain(decodeURIComponent(domain).toLowerCase());
});

export default async function CustomDomainSitePage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
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

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await loadSite(params.domain);
  if (!site) return { title: 'Site not found', robots: { index: false, follow: false } };
  const { title, description } = resolveSiteSeo(site);
  const canonical = `https://${site.custom_domain}`;
  // Search Console verification. On the HOMEPAGE only, which is where Google
  // looks — and the only page the owner will be asked for. Stored as typed
  // (often the whole <meta> tag), so it is parsed here rather than trusted.
  const verification = parseVerificationToken(getSiteContent(site.content).googleSiteVerification);
  return {
    // absolute bypasses the root layout's '%s · Let's Get Quoted' template so a
    // contractor's own domain/tab doesn't carry the SaaS brand. Guard against an
    // empty title (blank company name) — undefined lets the root default apply
    // rather than emitting an empty <title>.
    title: title ? { absolute: title } : undefined,
    description,
    alternates: { canonical },
    icons: siteIconsMetadata(site),
    robots: isSiteSeoReady(site) ? undefined : { index: false, follow: true },
    ...(verification ? { verification: { google: verification } } : {}),
    openGraph: { title, description, type: 'website', url: canonical, images: site.hero_url ? [{ url: site.hero_url }] : [] },
  };
}