import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteByCustomDomain } from '@/lib/sites';
import { getPublishedBlog } from '@/lib/site-content';
import SiteBlogIndex from '@/lib/templates/SiteBlogIndex';

export const dynamic = 'force-dynamic';

type Props = { params: { domain: string } };

async function loadSite(domain: string) {
  return getPublicSiteByCustomDomain(createAdminClient(), decodeURIComponent(domain).toLowerCase());
}

export default async function CustomDomainBlogIndexPage({ params }: Props) {
  const site = await loadSite(params.domain);
  if (!site || !site.custom_domain_verified_at) notFound();
  const blog = getPublishedBlog(site.content);
  if (!blog) notFound();
  return <SiteBlogIndex site={site} title={blog.title} intro={blog.intro} posts={blog.posts} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await loadSite(params.domain);
  if (!site) return { title: 'Not found' };
  const blog = getPublishedBlog(site.content);
  if (!blog) return { title: 'Not found' };
  const title = `${blog.title} | ${site.company_name}`;
  return {
    title: { absolute: title },
    description: blog.intro || `News and tips from ${site.company_name}.`,
  };
}
