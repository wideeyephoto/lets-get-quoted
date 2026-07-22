import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getPublishedBlogPost } from '@/lib/site-content';
import SiteBlogArticle from '@/lib/templates/SiteBlogArticle';

export const dynamic = 'force-dynamic';

type Props = { params: { subdomain: string; slug: string } };

export default async function PublicBlogPostPage({ params }: Props) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) notFound();
  const post = getPublishedBlogPost(site.content, params.slug);
  if (!post) notFound();
  return <SiteBlogArticle site={site} post={post} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
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
    openGraph: { title: post.title, description: post.excerpt, type: 'article', url: `${base}/blog/${post.slug}`, images },
  };
}
