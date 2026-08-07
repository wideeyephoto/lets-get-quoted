import { describe, expect, it } from 'vitest';
import { getSiteContent, getPublishedSocials } from '@/lib/site-content';
import { buildLocalBusinessJsonLd } from '@/lib/seo/site-seo';
import type { Site } from '@/lib/sites';

function site(content: Record<string, unknown> = {}): Site {
  return {
    id: 's1', account_id: 'a1', subdomain: 'brokepipes', custom_domain: null,
    // 'forge' is a THEME name, not a template — it never appears in
    // TemplateType. And portal_mode is light|dark; 'quote' was from an older
    // shape. The `as Site` cast at the bottom is gone with them: it was
    // suppressing exactly these two, and a fixture that has to be cast to
    // become its own type has stopped standing in for one.
    custom_domain_verified_at: null, published: true, template: 'carbon',
    header_font: null, button_style: null, accent_override: null,
    company_name: 'BrokePipes', headline: 'Fast, honest plumbing', tagline: null,
    phone: '555-0100', license: null, hours: null, service_area: 'Detroit, MI',
    logo_url: null, hero_url: null, seo_title: null, seo_description: null,
    sections: {}, content, chrome: {}, reviews_cache: null, portal_mode: 'light',
    updated_at: '2026-08-03T00:00:00.000Z',
  };
}

describe('parseSocials — the last gate before a URL is published', () => {
  it('keeps a well-formed link', () => {
    const parsed = getSiteContent({
      socials: [{ platform: 'facebook', url: 'https://facebook.com/brokepipes' }],
    });
    expect(parsed.socials).toEqual([{ platform: 'facebook', url: 'https://facebook.com/brokepipes' }]);
  });

  it('re-normalizes on the way out, not just on the way in', () => {
    // Content arrives from AI seeding and site imports too, not only the form —
    // so a tracking parameter that never passed through the builder still gets
    // stripped before it becomes an href and a sameAs claim.
    const parsed = getSiteContent({
      socials: [{ platform: 'facebook', url: 'http://www.facebook.com/brokepipes?fbclid=abc' }],
    });
    expect(parsed.socials).toEqual([{ platform: 'facebook', url: 'https://www.facebook.com/brokepipes' }]);
  });

  it('drops a link whose host does not match its platform', () => {
    const parsed = getSiteContent({
      socials: [
        { platform: 'instagram', url: 'https://evil.example/brokepipes' },
        { platform: 'facebook', url: 'https://facebook.com/brokepipes' },
      ],
    });
    expect(parsed.socials).toEqual([{ platform: 'facebook', url: 'https://facebook.com/brokepipes' }]);
  });

  it('drops a javascript: URL rather than rendering it as an href', () => {
    const parsed = getSiteContent({
      socials: [{ platform: 'facebook', url: 'javascript:alert(document.cookie)' }],
    });
    expect(parsed.socials).toEqual([]);
  });

  it('drops an unknown platform instead of rendering a blank icon', () => {
    const parsed = getSiteContent({ socials: [{ platform: 'myspace', url: 'https://myspace.com/x' }] });
    expect(parsed.socials).toEqual([]);
  });

  it('keeps only the first link per platform', () => {
    const parsed = getSiteContent({
      socials: [
        { platform: 'facebook', url: 'https://facebook.com/first' },
        { platform: 'facebook', url: 'https://facebook.com/second' },
      ],
    });
    expect(parsed.socials).toEqual([{ platform: 'facebook', url: 'https://facebook.com/first' }]);
  });

  it('defaults to empty for every site that has never set one', () => {
    expect(getSiteContent({}).socials).toEqual([]);
    expect(getSiteContent(null).socials).toEqual([]);
    expect(getSiteContent({ socials: 'nope' }).socials).toEqual([]);
  });

  it('keeps the header toggle off unless explicitly true', () => {
    expect(getSiteContent({}).socialsInHeader).toBe(false);
    expect(getSiteContent({ socialsInHeader: 'yes' }).socialsInHeader).toBe(false);
    expect(getSiteContent({ socialsInHeader: true }).socialsInHeader).toBe(true);
  });
});

describe('sameAs on the LocalBusiness JSON-LD', () => {
  it('publishes the linked profiles', () => {
    const data = buildLocalBusinessJsonLd(site({
      socials: [
        { platform: 'facebook', url: 'https://facebook.com/brokepipes' },
        { platform: 'yelp', url: 'https://yelp.com/biz/brokepipes' },
      ],
    }))!;
    expect(data.sameAs).toEqual([
      'https://facebook.com/brokepipes',
      'https://yelp.com/biz/brokepipes',
    ]);
  });

  it('omits sameAs entirely rather than emitting an empty array', () => {
    const data = buildLocalBusinessJsonLd(site())!;
    expect(data).not.toHaveProperty('sameAs');
  });

  it('never claims a profile the footer would not also link', () => {
    // The two read the same accessor, so a dropped link is dropped from both.
    // A sameAs the page doesn't back up is a false identity claim to Google.
    const content = { socials: [{ platform: 'instagram', url: 'https://facebook.com/brokepipes' }] };
    expect(getPublishedSocials(content)).toEqual([]);
    expect(buildLocalBusinessJsonLd(site(content))!).not.toHaveProperty('sameAs');
  });
});
