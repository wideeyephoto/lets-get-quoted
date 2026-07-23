import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/auth';
import type { Site } from '@/lib/sites';
import { isSiteSeoReady } from '@/lib/seo/site-seo';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${rootDomain}`;
  const { data: sites } = await createAdminClient()
    .from('sites')
    .select('*')
    .eq('published', true);

  const staticPages: MetadataRoute.Sitemap = [
    { url: appUrl, changeFrequency: 'monthly', priority: 1 },
    { url: `${appUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${appUrl}/sms-terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
  // Only list sites that carry real content — mirrors the noindex gate on the
  // pages so thin/incomplete sites aren't advertised for indexing.
  const sitePages: MetadataRoute.Sitemap = ((sites ?? []) as Site[]).flatMap((site) => {
    if (!isSiteSeoReady(site)) return [];
    const host = site.custom_domain && site.custom_domain_verified_at
      ? site.custom_domain
      : site.subdomain ? `${site.subdomain}.${rootDomain}` : null;
    return host ? [{ url: `https://${host}`, lastModified: site.updated_at, changeFrequency: 'weekly' as const, priority: 0.8 }] : [];
  });
  return [...staticPages, ...sitePages];
}