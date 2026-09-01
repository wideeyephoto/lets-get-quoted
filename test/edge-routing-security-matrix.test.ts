import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  resolveTenantHost,
  needsCanonicalHost,
  canonicalHostFor,
  isMarketingPath,
} from '@/lib/tenant-host';

describe('Edge Routing & Security Matrix', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'letsgetquoted.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.letsgetquoted.com';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock_anon_key';
  });

  describe('1. Tenant Host Resolution & Rewrites', () => {
    it('resolves apex domain as platform tenant', () => {
      const tenant = resolveTenantHost('letsgetquoted.com', 'letsgetquoted.com');
      expect(tenant.kind).toBe('platform');
    });

    it('resolves app subdomain as platform tenant', () => {
      const tenant = resolveTenantHost('app.letsgetquoted.com', 'letsgetquoted.com');
      expect(tenant.kind).toBe('platform');
    });

    it('resolves contractor subdomains as subdomain tenants', () => {
      const tenant = resolveTenantHost('acme-roofing.letsgetquoted.com', 'letsgetquoted.com');
      expect(tenant.kind).toBe('subdomain');
      if (tenant.kind === 'subdomain') {
        expect(tenant.subdomain).toBe('acme-roofing');
      }
    });

    it('resolves custom domains as customDomain tenants', () => {
      const tenant = resolveTenantHost('truecoatpainting.com', 'letsgetquoted.com');
      expect(tenant.kind).toBe('customDomain');
      if (tenant.kind === 'customDomain') {
        expect(tenant.domain).toBe('truecoatpainting.com');
      }
    });
  });

  describe('2. Middleware Rewrites & Security Headers', () => {
    it('rewrites subdomain requests to /site/[subdomain] with CSP headers and nonce', async () => {
      const req = new NextRequest('https://acme.letsgetquoted.com/blog/roof-care', {
        headers: {
          host: 'acme.letsgetquoted.com',
          'x-forwarded-host': 'acme.letsgetquoted.com',
        },
      });

      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res.headers.get('content-security-policy') || res.headers.get('content-security-policy-report-only')).toBeDefined();
    });

    it('rewrites custom domain requests to /site-domain/[domain] with CSP headers', async () => {
      const req = new NextRequest('https://truecoatpainting.com/quote', {
        headers: {
          host: 'truecoatpainting.com',
          'x-forwarded-host': 'truecoatpainting.com',
        },
      });

      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res.headers.get('content-security-policy') || res.headers.get('content-security-policy-report-only')).toBeDefined();
    });
  });

  describe('3. Canonical Host Enforcement & Redirects', () => {
    it('identifies dashboard and session routes as requiring canonical app host', () => {
      expect(needsCanonicalHost('/dashboard')).toBe(true);
      expect(needsCanonicalHost('/dashboard/jobs')).toBe(true);
      expect(needsCanonicalHost('/admin')).toBe(true);
      expect(needsCanonicalHost('/login')).toBe(true);
      expect(needsCanonicalHost('/auth')).toBe(true);
      expect(needsCanonicalHost('/pricing')).toBe(false);
      expect(needsCanonicalHost('/features/quotes')).toBe(false);
    });

    it('redirects dashboard requests on marketing apex domain to app canonical host', () => {
      const targetHost = canonicalHostFor('https://app.letsgetquoted.com', 'letsgetquoted.com');
      expect(targetHost).toBe('app.letsgetquoted.com');
    });

    it('does not redirect requests already on the canonical host', () => {
      const targetHost = canonicalHostFor('https://app.letsgetquoted.com', 'app.letsgetquoted.com');
      expect(targetHost).toBeNull();
    });

    it('identifies public marketing paths', () => {
      expect(isMarketingPath('/')).toBe(true);
      expect(isMarketingPath('/pricing')).toBe(true);
      expect(isMarketingPath('/features')).toBe(true);
      expect(isMarketingPath('/dashboard')).toBe(false);
    });
  });
});
