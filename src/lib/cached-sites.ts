import { unstable_cache, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/auth';
import { getPublicSiteBySubdomain, getPublicSiteByCustomDomain, type Site } from '@/lib/sites';

export function getPublicSiteSubdomainTag(subdomain: string): string {
  return `site-subdomain-${subdomain.trim().toLowerCase()}`;
}

export function getPublicSiteDomainTag(domain: string): string {
  return `site-domain-${domain.trim().toLowerCase()}`;
}

export const PUBLIC_SITES_CACHE_TAG = 'public-sites';

/**
 * Loads and caches the public site record by subdomain across requests.
 * Uses a 1-hour stale-while-revalidate TTL fallback with on-demand tag revalidation.
 */
export async function getCachedPublicSiteBySubdomain(subdomain: string): Promise<Site | null> {
  const normalized = subdomain.trim().toLowerCase();
  const fetcher = unstable_cache(
    async () => {
      const supabase = createAdminClient();
      return getPublicSiteBySubdomain(supabase, normalized);
    },
    ['public-site-by-subdomain', normalized],
    {
      tags: [getPublicSiteSubdomainTag(normalized), PUBLIC_SITES_CACHE_TAG],
      revalidate: 3600,
    }
  );
  return fetcher();
}

/**
 * Loads and caches the public site record by custom domain across requests.
 * Uses a 1-hour stale-while-revalidate TTL fallback with on-demand tag revalidation.
 */
export async function getCachedPublicSiteByCustomDomain(domain: string): Promise<Site | null> {
  const normalized = domain.trim().toLowerCase();
  const fetcher = unstable_cache(
    async () => {
      const supabase = createAdminClient();
      return getPublicSiteByCustomDomain(supabase, normalized);
    },
    ['public-site-by-custom-domain', normalized],
    {
      tags: [getPublicSiteDomainTag(normalized), PUBLIC_SITES_CACHE_TAG],
      revalidate: 3600,
    }
  );
  return fetcher();
}

/**
 * Invalidates the cached public site data when a contractor updates or publishes their site.
 */
export function revalidatePublicSiteCache(site: {
  subdomain?: string | null;
  customDomain?: string | null;
}): void {
  try {
    if (site.subdomain) {
      revalidateTag(getPublicSiteSubdomainTag(site.subdomain));
    }
    if (site.customDomain) {
      revalidateTag(getPublicSiteDomainTag(site.customDomain));
    }
  } catch {
    // Graceful fallback if called in a context where revalidateTag is unavailable
  }
}
