import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getPublicSiteSubdomainTag,
  getPublicSiteDomainTag,
  PUBLIC_SITES_CACHE_TAG,
  revalidatePublicSiteCache,
} from '@/lib/cached-sites';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Cached Public Sites & Hero Image Optimization', () => {
  it('generates normalized cache tags for subdomains and custom domains', () => {
    expect(getPublicSiteSubdomainTag('LawnAndOrder')).toBe('site-subdomain-lawnandorder');
    expect(getPublicSiteDomainTag(' Chelsea-Cleans.com ')).toBe('site-domain-chelsea-cleans.com');
    expect(PUBLIC_SITES_CACHE_TAG).toBe('public-sites');
  });

  it('revalidates tags safely when revalidatePublicSiteCache is called', () => {
    expect(() => {
      revalidatePublicSiteCache({ subdomain: 'lawnandorder', customDomain: 'example.com' });
    }).not.toThrow();

    expect(() => {
      revalidatePublicSiteCache({});
    }).not.toThrow();
  });

  it('verifies HeroImageCycle.tsx uses next/image with fill and priority for LCP optimization', () => {
    const heroCode = read('src', 'lib', 'templates', 'HeroImageCycle.tsx');
    expect(heroCode).toContain("import Image from 'next/image';");
    expect(heroCode).toContain("import { isOptimizableHost } from './SafeImage';");
    expect(heroCode).toContain('isOptimizableHost(images[0])');
    expect(heroCode).toContain('<Image');
    expect(heroCode).toContain('fill');
    expect(heroCode).toContain('priority');
  });

  it('verifies site/[subdomain]/page.tsx uses getCachedPublicSiteBySubdomain', () => {
    const pageCode = read('src', 'app', 'site', '[subdomain]', 'page.tsx');
    expect(pageCode).toContain("import { getCachedPublicSiteBySubdomain } from '@/lib/cached-sites';");
    expect(pageCode).toContain('getCachedPublicSiteBySubdomain(subdomain)');
  });

  it('verifies site-domain/[domain]/page.tsx uses getCachedPublicSiteByCustomDomain', () => {
    const domainPageCode = read('src', 'app', 'site-domain', '[domain]', 'page.tsx');
    expect(domainPageCode).toContain("import { getCachedPublicSiteByCustomDomain } from '@/lib/cached-sites';");
    expect(domainPageCode).toContain('getCachedPublicSiteByCustomDomain(');
  });
});
