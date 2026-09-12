import { cache } from 'react';
import { getCachedPublicSiteBySubdomain, getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';

const loadPublicSite = cache(async (kind: string, tenant: string) => { return kind === 'd' ? getCachedPublicSiteByCustomDomain(decodeURIComponent(tenant)) : getCachedPublicSiteBySubdomain(tenant); });

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';


import { getPublishedBlog } from '@/lib/site-content';
import { siteIconsMetadata } from '@/lib/brand-mark';
import SiteBlogIndex from '@/lib/templates/SiteBlogIndex';

type Props = {
  params: Promise<{ kind: string; tenant: string }>;
};

export default async function PublicBlogIndexPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) notFound();
  const blog = getPublishedBlog(site.content);
  if (!blog) notFound();
  return <SiteBlogIndex site={site} title={blog.title} intro={blog.intro} posts={blog.posts} layout={blog.layout} />;
}

export async function generateMetadata({ params: paramsPromise }: Props): Promise<Metadata> {
  const params = await paramsPromise;
  const site = await loadPublicSite(params.kind, params.tenant);
  if (!site) return { title: 'Not found' };
  const blog = getPublishedBlog(site.content);
  if (!blog) return { title: 'Not found' };
  const title = `${blog.title} | ${site.company_name}`;
  return {
    title: { absolute: title },
    description: blog.intro || `News and tips from ${site.company_name}.`,
    icons: siteIconsMetadata(site),
  };
}
