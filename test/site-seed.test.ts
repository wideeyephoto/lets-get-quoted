import { describe, it, expect } from 'vitest';
import { applyGeneratedSiteText, siteIsUnwritten, type GeneratedSiteText } from '../src/lib/site-seed';
import { getSiteContent } from '../src/lib/site-content';
import type { Site } from '../src/lib/sites';

const blankSite = (overrides: Partial<Site> = {}): Site => ({
  id: 'site-1',
  account_id: 'acct-1',
  subdomain: null,
  custom_domain: null,
  custom_domain_verified_at: null,
  published: false,
  template: 'carbon',
  header_font: null,
  button_style: 'solid',
  accent_override: null,
  company_name: 'Northgate Gutter Co',
  headline: '',
  tagline: '',
  phone: null,
  license: null,
  hours: '',
  service_area: '',
  logo_url: null,
  hero_url: null,
  seo_title: null,
  seo_description: null,
  sections: {},
  content: {},
  chrome: {},
  reviews_cache: null,
  portal_mode: 'light',
  updated_at: new Date(0).toISOString(),
  ...overrides,
});

const generated = (overrides: Partial<GeneratedSiteText> = {}): GeneratedSiteText => ({
  headline: 'Reliable Gutter Installation in Lee\'s Summit',
  tagline: 'Protect your home.',
  seo_title: 'Lee\'s Summit Gutters | Northgate',
  seo_description: 'Gutter installation and repair.',
  hours: 'Mon-Fri 8am-5pm',
  service_area: "Lee's Summit and surrounding areas",
  cities: ['Blue Springs', 'Raytown', 'Independence'],
  showcase_title: 'The gutter work we handle',
  showcase_intro: 'Representative photos.',
  services: [{ icon: 'droplets', title: 'Gutter Installation', description: 'Seamless gutters.' }],
  faqs: [{ question: 'Are you insured?', answer: 'Yes.' }],
  testimonials: [{ author: 'Dana R.', text: 'Great work.', rating: 5, label: 'Verified homeowner' }],
  stats: [{ value: 450, suffix: '+', label: 'Jobs completed' }],
  images: { ok: false, configured: false, heroUrl: '', slots: {}, gallery: [], assignments: [] } as GeneratedSiteText['images'],
  ...overrides,
});

describe('siteIsUnwritten', () => {
  it('is true for a fresh site', () => {
    expect(siteIsUnwritten(blankSite())).toBe(true);
  });

  it('is false once ANY text exists — the seed must never clobber work', () => {
    expect(siteIsUnwritten(blankSite({ headline: 'We do gutters' }))).toBe(false);
    expect(siteIsUnwritten(blankSite({ tagline: 'Since 1998' }))).toBe(false);
    expect(siteIsUnwritten(blankSite({ seo_title: 'Gutters' }))).toBe(false);
    expect(siteIsUnwritten(blankSite({ seo_description: 'Gutters near you' }))).toBe(false);
  });

  it('is false once services or a gallery exist, even with no headline', () => {
    const withServices = blankSite({ content: { services: { enabled: true, title: 'Our services', intro: '', items: [{ id: 's1', icon: 'wrench', title: 'Repair', description: 'x' }] } } });
    expect(siteIsUnwritten(withServices)).toBe(false);
  });

  it('a site seeded with only trade and zip is still unwritten', () => {
    // This is exactly what getOrCreateSite produces at first run — the seed has
    // to fire on it, so trade/zip must not count as "written".
    expect(siteIsUnwritten(blankSite({ content: { trade: 'roofers', zip: '64002' } }))).toBe(true);
  });
});

describe('applyGeneratedSiteText', () => {
  it('fills an empty site', () => {
    const next = applyGeneratedSiteText(blankSite(), generated());
    expect(next.headline).toContain("Lee's Summit");
    expect(next.service_area).toContain("Lee's Summit");
    expect(next.hours).toBe('Mon-Fri 8am-5pm');
    const content = getSiteContent(next.content);
    expect(content.services.items).toHaveLength(1);
    expect(content.faqs.items).toHaveLength(1);
    expect(content.serviceAreas.cities).toEqual(['Blue Springs', 'Raytown', 'Independence']);
  });

  it('never overwrites existing text with an empty generated field', () => {
    // A partial generation (model omitted a field) must only ever add.
    const current = blankSite({ headline: 'Mine', tagline: 'Also mine', hours: '9-5' });
    const next = applyGeneratedSiteText(current, generated({ headline: '', tagline: '', hours: '' }));
    expect(next.headline).toBe('Mine');
    expect(next.tagline).toBe('Also mine');
    expect(next.hours).toBe('9-5');
  });

  it('leaves sections alone when the model returned none of them', () => {
    const next = applyGeneratedSiteText(blankSite(), generated({ services: [], faqs: [], cities: [], testimonials: [], stats: [] }));
    const content = getSiteContent(next.content);
    expect(content.services.items).toHaveLength(0);
    expect(content.faqs.items).toHaveLength(0);
  });

  it('keeps the trade and zip that were seeded at first run', () => {
    // The generator reads these; applying its output must not wipe them, or a
    // later "Generate" from the builder would lose the location.
    const current = blankSite({ content: { trade: 'roofers', zip: '64002' } });
    const next = applyGeneratedSiteText(current, generated());
    const content = getSiteContent(next.content);
    expect(content.trade).toBe('roofers');
    expect(content.zip).toBe('64002');
  });

  it('formats stat values with a thousands separator and suffix', () => {
    const next = applyGeneratedSiteText(blankSite(), generated({ stats: [{ value: 1450, suffix: '+', label: 'Jobs' }] }));
    expect(getSiteContent(next.content).stats.items[0].value).toBe('1,450+');
  });
});
