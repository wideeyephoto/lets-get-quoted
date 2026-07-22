import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain } from '@/lib/sites';
import { getPublishedBlog } from '@/lib/site-content';
import SiteBlogIndex from '@/lib/templates/SiteBlogIndex';

export const dynamic = 'force-dynamic';

type Props = { params: { subdomain: string } };

export default async function PublicBlogIndexPage({ params }: Props) {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) notFound();
  const blog = getPublishedBlog(site.content);
  if (!blog) notFound();
  return <SiteBlogIndex site={site} title={blog.title} intro={blog.intro} posts={blog.posts} />;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await getPublicSiteBySubdomain(createAdminClient(), params.subdomain);
  if (!site) return { title: 'Not found' };
  const blog = getPublishedBlog(site.content);
  if (!blog) return { title: 'Not found' };
  const title = `${blog.title} | ${site.company_name}`;
  return {
    title: { absolute: title },
    description: blog.intro || `News and tips from ${site.company_name}.`,
  };
}
