import { describe, it, expect, vi } from 'vitest';
import { matchesServedCity, canonicalPlace } from '../src/lib/service-area-match';
import { buildLocalBusinessJsonLd } from '../src/lib/seo/site-seo';
import type { Site } from '../src/lib/sites';

describe('Site Builder Phase 2: Service Area Matcher', () => {
  const cities = ['Royal Oak', 'Troy', 'Birmingham', 'Bloomfield Hills'];

  it('matches exact city names case-insensitively', () => {
    expect(matchesServedCity('royal oak', cities)).toBe(true);
    expect(matchesServedCity('TROY', cities)).toBe(true);
    expect(matchesServedCity('Birmingham', cities)).toBe(true);
  });

  it('matches city names with state suffixes', () => {
    expect(matchesServedCity('Royal Oak, MI', cities)).toBe(true);
    expect(matchesServedCity('Troy MI', cities)).toBe(true);
  });

  it('strips leading ZIP codes when checking city match', () => {
    expect(matchesServedCity('48067 · Royal Oak, MI', cities)).toBe(true);
    expect(matchesServedCity('48084 Troy', cities)).toBe(true);
  });

  it('rejects towns outside the contractor service territory', () => {
    expect(matchesServedCity('Chicago, IL', cities)).toBe(false);
    expect(matchesServedCity('Miami', cities)).toBe(false);
  });

  it('normalizes place names properly with canonicalPlace', () => {
    expect(canonicalPlace('48067 · Royal Oak, MI')).toBe('royal oak');
    expect(canonicalPlace('New York, NY')).toBe('new york');
    expect(canonicalPlace('')).toBe('');
  });
});

describe('Site Builder Phase 2: Enhanced LocalBusiness Schema', () => {
  const sampleSite: Site = {
    id: 'site-phase2',
    account_id: 'acct-phase2',
    subdomain: 'apexplumbing',
    custom_domain: null,
    custom_domain_verified_at: null,
    published: true,
    template: 'carbon',
    header_font: null,
    button_style: 'solid',
    accent_override: null,
    company_name: 'Apex Plumbing Co',
    headline: 'Top-Rated Plumbing in Metro Detroit',
    tagline: '',
    phone: '248-555-0199',
    license: 'MI-PLUMB-98765',
    hours: 'Mon-Fri 7am-6pm',
    service_area: 'Royal Oak and surrounding areas',
    logo_url: null,
    hero_url: 'https://images.example.com/hero.jpg',
    seo_title: null,
    seo_description: null,
    sections: {},
    content: {
      trade: 'plumbing',
      zip: '48067',
      serviceAreas: { enabled: true, cities: ['Royal Oak', 'Troy', 'Birmingham'] },
      services: {
        enabled: true,
        items: [
          { id: 's1', icon: 'spark', title: 'Emergency Pipe Repair', description: '24/7 leak detection & repair' },
          { id: 's2', icon: 'spark', title: 'Water Heater Installation', description: 'Tankless and standard tank units' },
        ],
      },
      socials: [{ platform: 'facebook', url: 'https://facebook.com/apexplumbing' }],
    },
    chrome: {},
    reviews_cache: null,
    portal_mode: 'light',
    updated_at: '2026-08-24T12:00:00.000Z',
  };

  it('generates full LocalBusiness schema with OfferCatalog, address, areaServed, and sameAs', () => {
    const jsonLd = buildLocalBusinessJsonLd(sampleSite)!;
    expect(jsonLd).not.toBeNull();
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Plumber');
    expect(jsonLd.name).toBe('Apex Plumbing Co');
    expect(jsonLd.telephone).toBe('248-555-0199');
    expect(jsonLd.sameAs).toEqual(['https://facebook.com/apexplumbing']);
    expect(jsonLd.hasOfferCatalog).toEqual({
      '@type': 'OfferCatalog',
      name: 'Apex Plumbing Co Services',
      itemListElement: [
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Emergency Pipe Repair' } },
        { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Water Heater Installation' } },
      ],
    });
  });
});

describe('Site Builder Phase 2: Custom Domain Providers', () => {
  it('includes Cloudflare with DNS only guidance and apex flattening', async () => {
    const { PROVIDERS } = await import('../src/app/dashboard/sites/DomainConnector');
    const cloudflare = PROVIDERS.find((p) => p.id === 'cloudflare');
    expect(cloudflare).toBeDefined();
    expect(cloudflare?.name).toBe('Cloudflare');
    expect(cloudflare?.steps.some((step) => step.includes('DNS only'))).toBe(true);
    expect(cloudflare?.apex).toContain('CNAME flattening');
  });

  it('includes Namecheap with Advanced DNS steps and URL redirect apex', async () => {
    const { PROVIDERS } = await import('../src/app/dashboard/sites/DomainConnector');
    const namecheap = PROVIDERS.find((p) => p.id === 'namecheap');
    expect(namecheap).toBeDefined();
    expect(namecheap?.name).toBe('Namecheap');
    expect(namecheap?.steps.some((step) => step.includes('Advanced DNS'))).toBe(true);
    expect(namecheap?.apex).toContain('URL Redirect Record');
  });

  it('includes GoDaddy, Squarespace, and Other providers', async () => {
    const { PROVIDERS } = await import('../src/app/dashboard/sites/DomainConnector');
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toContain('godaddy');
    expect(ids).toContain('squarespace');
    expect(ids).toContain('cloudflare');
    expect(ids).toContain('namecheap');
    expect(ids).toContain('other');
  });
});
