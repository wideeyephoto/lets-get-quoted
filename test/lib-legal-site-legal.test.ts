import { describe, it, expect } from 'vitest';
import { resolveSiteLegal, siteLegalLinks } from '@/lib/legal/site-legal';

describe('Site Legal Lib', () => {
  const site = {
    company_name: 'Test Co',
    service_area: 'Test City',
    phone: '555-1234',
    content: {
      legal: {
        privacyEnabled: true,
        termsEnabled: false,
        privacyBody: 'Custom Privacy',
        termsBody: 'Custom Terms',
        updated: '2023-01-01',
      }
    }
  } as any;

  it('resolves privacy policy', () => {
    const res = resolveSiteLegal(site, 'privacy');
    expect(res.enabled).toBe(true);
    expect(res.title).toBe('Privacy Policy');
    expect(res.body).toBe('Custom Privacy');
  });

  it('resolves terms of service', () => {
    const res = resolveSiteLegal(site, 'terms');
    expect(res.enabled).toBe(false);
    expect(res.title).toBe('Terms of Service');
    expect(res.body).toBe('Custom Terms');
  });

  it('resolves legal links', () => {
    const res = siteLegalLinks(site);
    expect(res.privacy).toBe(true);
    expect(res.terms).toBe(false);
  });
});
