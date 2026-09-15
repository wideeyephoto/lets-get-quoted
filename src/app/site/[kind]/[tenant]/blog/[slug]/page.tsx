import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';

const loadPublicSite = cache(async (kind: string, tenant: string) => { return kind === 'd' ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) : getCachedPublicSiteBySubdomain(tenant); });

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';


import { getPublishedBlogPost } from '@/lib/site-content';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteBlogArticle from '@/lib/templates/SiteBlogArticle';

type Props = {
  params: Promise<{ kind: string; tenant: string; slug: string }>;
};

export default async function PublicBlogPostPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) notFound();
  const post = getPublishedBlogPost(site.content, params.slug);
  if (!post) notFound();
  return <SiteBlogArticle site={site} post={post} />;
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) return { title: 'Not found' };
  const post = getPublishedBlogPost(site.content, params.slug);
  if (!post) return { title: 'Not found' };

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const base = site.custom_domain_verified_at && site.custom_domain
    ? `https://${site.custom_domain}`
    : `https://${site.subdomain}.${rootDomain}`;
  const title = `${post.title} | ${site.company_name}`;
  const images = post.coverImage ? [{ url: post.coverImage }] : site.hero_url ? [{ url: site.hero_url }] : [];

  return {
    // absolute bypasses the SaaS-brand title template on the client's own site.
    title: { absolute: title },
    description: post.excerpt || undefined,
    alternates: { canonical: `${base}/blog/${post.slug}` },
    icons: siteIconsMetadata(site),
    openGraph: { title: post.title, description: post.excerpt, type: 'article', url: `${base}/blog/${post.slug}`, images },
  };
}
