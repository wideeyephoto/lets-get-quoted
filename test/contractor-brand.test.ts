import { describe, expect, it } from 'vitest';
import { shapeContractorBrand } from '@/lib/contractor-brand';
import { DEFAULT_BRAND_ACCENT } from '@/lib/brand-mark';

const ACCOUNT = { business_name: 'Broke Pipes Plumbing' };

describe('whose name a homeowner sees', () => {
  it('prefers the website company name over the account name', () => {
    // The website name is the one their customers know; the account name is
    // whatever they typed at sign-up.
    expect(shapeContractorBrand(ACCOUNT, { company_name: 'BrokePipes' }).businessName).toBe('BrokePipes');
  });

  it('falls back to the account name with no site', () => {
    expect(shapeContractorBrand(ACCOUNT, null).businessName).toBe('Broke Pipes Plumbing');
  });

  it('treats whitespace as nothing at all', () => {
    expect(shapeContractorBrand(ACCOUNT, { company_name: '   ' }).businessName).toBe('Broke Pipes Plumbing');
  });

  it('never renders an empty header', () => {
    expect(shapeContractorBrand(null, null).businessName).toBe('Your contractor');
    expect(shapeContractorBrand({ business_name: '' }, {}).businessName).toBe('Your contractor');
  });
});

describe('the mark', () => {
  it('uses an uploaded logo when there is one, and builds nothing', () => {
    const brand = shapeContractorBrand(ACCOUNT, { logo_url: 'https://cdn.example.com/logo.png' });
    expect(brand.logoUrl).toBe('https://cdn.example.com/logo.png');
    // Not just unused — not generated. Building an SVG to throw away is bytes
    // on the wire for every invoice a contractor with a logo ever sends.
    expect(brand.markSvg).toBeNull();
  });

  it('always has SOMETHING for a contractor who never uploaded one', () => {
    const brand = shapeContractorBrand(ACCOUNT, {});
    expect(brand.logoUrl).toBeNull();
    expect(brand.markSvg).toMatch(/^<svg/);
    expect(brand.markSvg).toContain('</svg>');
  });

  it('paints the derived mark in their own colour', () => {
    expect(shapeContractorBrand(ACCOUNT, { accent_override: '#0ea5e9' }).markSvg).toContain('#0ea5e9');
  });
});

describe('the accent', () => {
  it('is theirs when they set one', () => {
    expect(shapeContractorBrand(ACCOUNT, { accent_override: '#0ea5e9' }).accent).toBe('#0ea5e9');
  });

  it('falls back rather than reaching a fill= attribute verbatim', () => {
    // This value is interpolated into an SVG and into a CSS custom property.
    for (const junk of ['red', 'url(x)', '"><script>', '', '  ', null, undefined]) {
      expect(shapeContractorBrand(ACCOUNT, { accent_override: junk as string }).accent).toBe(DEFAULT_BRAND_ACCENT);
    }
  });
});

describe('where the links point', () => {
  it('offers no website until the site is published', () => {
    expect(shapeContractorBrand(ACCOUNT, { subdomain: 'brokepipes', published: false }).siteUrl).toBeNull();
    expect(shapeContractorBrand(ACCOUNT, { subdomain: 'brokepipes', published: true }).siteUrl).toContain('brokepipes');
  });

  it('prefers a VERIFIED custom domain', () => {
    const unverified = shapeContractorBrand(ACCOUNT, {
      subdomain: 'brokepipes',
      custom_domain: 'brokepipes.com',
      published: true,
    });
    expect(unverified.siteUrl).toContain('brokepipes.');
    expect(unverified.siteUrl).not.toBe('https://brokepipes.com');

    const verified = shapeContractorBrand(ACCOUNT, {
      subdomain: 'brokepipes',
      custom_domain: 'brokepipes.com',
      custom_domain_verified_at: '2026-01-01T00:00:00Z',
      published: true,
    });
    expect(verified.siteUrl).toBe('https://brokepipes.com');
  });

  // The trap this encodes: `${siteUrl}/book` looks obviously right and 404s.
  // A tenant host rewrites sub-paths to /site/[subdomain]/…, and there is no
  // `book` route in that tree — the booking page is /book/[subdomain] on the
  // app origin.
  it('books on the APP origin, not on the contractor host', () => {
    const brand = shapeContractorBrand(ACCOUNT, { subdomain: 'brokepipes', published: true });
    expect(brand.bookingPath).toBe('/book/brokepipes');
    expect(brand.bookingPath?.startsWith('http')).toBe(false);
  });

  it('offers no booking link before the site is published', () => {
    expect(shapeContractorBrand(ACCOUNT, { subdomain: 'brokepipes', published: false }).bookingPath).toBeNull();
    expect(shapeContractorBrand(ACCOUNT, { published: true }).bookingPath).toBeNull();
  });

  it('carries the phone only when there is one', () => {
    expect(shapeContractorBrand(ACCOUNT, { phone: '(248) 555-0117' }).phone).toBe('(248) 555-0117');
    expect(shapeContractorBrand(ACCOUNT, { phone: '  ' }).phone).toBeNull();
    expect(shapeContractorBrand(ACCOUNT, {}).phone).toBeNull();
  });
});
