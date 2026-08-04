import { describe, it, expect } from 'vitest';
import { buildLocalBusinessJsonLd, preferLocalSeoTitle } from '../src/lib/seo/site-seo';
import { parseOpeningHours } from '../src/lib/seo/opening-hours';
import type { Site } from '../src/lib/sites';

const site = (overrides: Partial<Site> = {}): Site => ({
  id: 'site-1',
  account_id: 'acct-1',
  subdomain: 'brokepipes',
  custom_domain: null,
  custom_domain_verified_at: null,
  published: true,
  template: 'carbon',
  header_font: null,
  button_style: 'solid',
  accent_override: null,
  company_name: 'BrokePipes',
  headline: 'Plumbing in Maplewood',
  tagline: '',
  phone: '555-0100',
  license: null,
  hours: 'Mon-Fri 8am-5pm, Sat 9am-3pm',
  service_area: "Lee's Summit and surrounding areas",
  logo_url: null,
  hero_url: null,
  seo_title: null,
  seo_description: null,
  sections: {},
  content: { trade: 'plumbing', zip: '48067', serviceAreas: { enabled: true, cities: ['Blue Springs', 'Raytown'] } },
  chrome: {},
  reviews_cache: null,
  portal_mode: 'light',
  updated_at: '2026-08-03T22:40:17.517Z',
  ...overrides,
});

describe('parseOpeningHours', () => {
  it('parses the shapes the AI generator actually produces', () => {
    // Every one of these is a real value read off the live sites table.
    expect(parseOpeningHours('Mon-Fri 8am-4pm')).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '16:00' },
    ]);
    expect(parseOpeningHours('Mon-Fri 8am-6pm, Sat 9am-2pm')).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '18:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:00', closes: '14:00' },
    ]);
  });

  it('handles minutes, 24-hour times and long day names', () => {
    expect(parseOpeningHours('Monday-Friday 7:30am-5:30pm')[0]).toMatchObject({ opens: '07:30', closes: '17:30' });
    expect(parseOpeningHours('Mon-Fri 08:00-17:00')[0]).toMatchObject({ opens: '08:00', closes: '17:00' });
  });

  it('gets noon and midnight right', () => {
    expect(parseOpeningHours('Sat 12am-12pm')[0]).toMatchObject({ opens: '00:00', closes: '12:00' });
  });

  it('returns NOTHING when any part is unparseable — never a partial week', () => {
    // Publishing half of somebody's hours tells Google they are CLOSED on days
    // they are open. Silence is recoverable; a wrong answer is not.
    expect(parseOpeningHours('Mon-Fri 8am-5pm, by appointment Sunday')).toEqual([]);
    expect(parseOpeningHours('Open 24 hours')).toEqual([]);
    expect(parseOpeningHours('Call for hours')).toEqual([]);
    expect(parseOpeningHours('')).toEqual([]);
    expect(parseOpeningHours(null)).toEqual([]);
  });

  it('refuses an ambiguous range rather than guessing the afternoon', () => {
    // "8-4" reads as 08:00 to 04:00. They meant 16:00, but that is a guess.
    expect(parseOpeningHours('Mon-Fri 8-4')).toEqual([]);
  });

  it('refuses contradictory segments naming the same day twice', () => {
    expect(parseOpeningHours('Mon-Fri 8am-5pm, Fri 9am-1pm')).toEqual([]);
  });

  it('wraps the week for a range crossing Sunday', () => {
    expect(parseOpeningHours('Sat-Mon 9am-1pm')[0].dayOfWeek).toEqual(['Saturday', 'Sunday', 'Monday']);
  });
});

describe('buildLocalBusinessJsonLd', () => {
  it('carries the structured fields the data supports', () => {
    const data = buildLocalBusinessJsonLd(site())!;
    expect(data['@type']).toBe('Plumber');
    expect(data.name).toBe('BrokePipes');
    expect(data.telephone).toBe('555-0100');
    expect(data.address).toEqual({ '@type': 'PostalAddress', addressLocality: "Lee's Summit", postalCode: '48067', addressCountry: 'US' });
    expect(Array.isArray(data.openingHoursSpecification)).toBe(true);
  });

  it('names the primary city AND the outlying towns', () => {
    // The free-text service area holds the main city; the cities list holds the
    // rest and does not repeat it. Reading either alone loses a town.
    const areas = buildLocalBusinessJsonLd(site())!.areaServed as { '@type': string; name: string }[];
    expect(areas.map((a) => a.name)).toEqual(["Lee's Summit", 'Blue Springs', 'Raytown']);
    expect(areas.every((a) => a['@type'] === 'City')).toBe(true);
  });

  it('recovers the home city even when the free text is padded', () => {
    const data = buildLocalBusinessJsonLd(site({ content: { serviceAreas: { cities: [] } }, service_area: 'Greater Detroit' }))!;
    expect(data.areaServed).toEqual([{ '@type': 'City', name: 'Detroit' }]);
    expect(data.address).toMatchObject({ addressLocality: 'Detroit' });
  });

  it('falls back to the free text when no city can be read out of it', () => {
    const data = buildLocalBusinessJsonLd(site({ content: { serviceAreas: { cities: [] } }, service_area: 'the surrounding metro area' }))!;
    expect(data.areaServed).toBe('the surrounding metro area');
  });

  it('picks the region out of a "City, ST" service area', () => {
    const data = buildLocalBusinessJsonLd(site({ content: { serviceAreas: { cities: [] } }, service_area: 'Normal, IL' }))!;
    expect(data.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Normal', addressRegion: 'IL', addressCountry: 'US' });
  });

  it('omits what it does not know instead of faking it', () => {
    const data = buildLocalBusinessJsonLd(site({ hours: 'Call for hours', phone: null, content: {}, service_area: '' }))!;
    expect(data).not.toHaveProperty('openingHoursSpecification');
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('address');
    // No coordinates are stored anywhere, so a geo point could only be invented.
    expect(data).not.toHaveProperty('geo');
    expect(data).not.toHaveProperty('priceRange');
  });

  it('never carries self-serving review markup', () => {
    const data = buildLocalBusinessJsonLd(site())!;
    expect(data).not.toHaveProperty('aggregateRating');
    expect(data).not.toHaveProperty('review');
  });

  it('is null without a business name', () => {
    expect(buildLocalBusinessJsonLd(site({ company_name: '' }))).toBeNull();
  });
});

describe('preferLocalSeoTitle', () => {
  it('keeps a generated title that already names the town and the trade', () => {
    const kept = 'Plumbing in Blue Springs | BrokePipes';
    expect(preferLocalSeoTitle(site(), kept)).toBe(kept);
  });

  it('replaces one that names neither', () => {
    // The real failure: "Northgate Gutter Co | Licensed & Insured" — no city,
    // no trade, for the field that ranks for "<trade> in <city>".
    const weak = 'BrokePipes | Licensed & Insured';
    const result = preferLocalSeoTitle(site(), weak);
    expect(result).not.toBe(weak);
    expect(result.toLowerCase()).toContain('plumb');
  });

  it('counts ANY town the contractor serves, not just the primary one', () => {
    // "Nashville Cleaning | Chelsea's" must not be judged city-less because the
    // primary city happens to be a suburb.
    const s = site({ content: { trade: 'plumbing', serviceAreas: { cities: ['Raytown'] } }, service_area: "Lee's Summit and surrounding areas" });
    const title = 'Plumbing in Raytown | BrokePipes';
    expect(preferLocalSeoTitle(s, title)).toBe(title);
  });

  it('matches a trade word rather than the whole phrase', () => {
    const s = site({ content: { trade: 'landscaping and lawns', serviceAreas: { cities: ['Raytown'] } } });
    const title = 'Landscaping in Raytown | Lawn & Order';
    expect(preferLocalSeoTitle(s, title)).toBe(title);
  });

  it('leaves a weak title alone when it has nothing better to offer', () => {
    // No city and no trade anywhere in the data — swapping one signal-less
    // title for another just to have acted would lose the owner's wording.
    const s = site({ content: {}, service_area: '', headline: '' });
    const weak = 'BrokePipes | Licensed & Insured';
    expect(preferLocalSeoTitle(s, weak)).toBe(weak);
  });

  it('passes an empty title straight through', () => {
    expect(preferLocalSeoTitle(site(), '')).toBe('');
  });
});
