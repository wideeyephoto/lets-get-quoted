import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { getPublishedBlogPost } from '@/lib/site-content';
import SiteBlogArticle from '@/lib/templates/SiteBlogArticle';

export const dynamic = 'force-dynamic';

type Props = { params: { domain: string; slug: string } };

async function loadSite(domain: string) {
  return getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(domain).toLowerCase());
}

export default async function CustomDomainBlogPostPage({ params }: Props) {
  const site = await loadSite(params.domain);
  if (!site || !site.custom_domain_verified_at) notFound();
  const post = getPublishedBlogPost(site.content, params.slug);
  if (!post) notFound();
  return <SiteBlogArticle site={site} post={post} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await loadSite(params.domain);
  if (!site) return { title: 'Not found' };
  const post = getPublishedBlogPost(site.content, params.slug);
  if (!post) return { title: 'Not found' };

  const base = `https://${site.custom_domain}`;
  const title = `${post.title} | ${site.company_name}`;
  const images = post.coverImage ? [{ url: post.coverImage }] : site.hero_url ? [{ url: site.hero_url }] : [];

  return {
    title: { absolute: title },
    description: post.excerpt || undefined,
    alternates: { canonical: `${base}/blog/${post.slug}` },
    openGraph: { title: post.title, description: post.excerpt, type: 'article', url: `${base}/blog/${post.slug}`, images },
  };
}
