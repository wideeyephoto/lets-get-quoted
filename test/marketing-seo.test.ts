import { describe, expect, it } from 'vitest';
import { TRADES, indefiniteArticle, lowerTradeName, tradePayer } from '@/lib/trades';
import { ARTICLES } from '@/lib/resources';
import {
  BRAND_SUFFIX,
  DESCRIPTION_MAX,
  TITLE_MAX,
  titleWithBrand,
} from '@/lib/seo/marketing-seo';

/**
 * The site audit found 29 trade titles past ~60 characters, 30 descriptions
 * past ~160, and a homepage description of 364. Each one was written correctly
 * and then grew — which is the failure mode a review catches once and a test
 * catches forever. These assertions are the reason the next long trade name
 * cannot quietly ship a truncated title.
 *
 * The rendered-length rules are enforced against the DATA, not the built HTML:
 * a page-level check would need a running server, and the data is where the
 * mistake is actually made.
 */

describe('trade page metadata fits what search results render', () => {
  it('every trade title fits inside the title budget once the brand is applied', () => {
    const over = TRADES.map((trade) => ({
      slug: trade.slug,
      rendered: titleWithBrand(trade.metaTitle),
    })).filter((row) => row.rendered.length > TITLE_MAX);

    expect(over).toEqual([]);
  });

  it('every trade description fits inside the description budget', () => {
    const over = TRADES.map((trade) => ({
      slug: trade.slug,
      length: trade.metaDescription.length,
    })).filter((row) => row.length > DESCRIPTION_MAX);

    expect(over).toEqual([]);
  });

  it('titles keep the brand whenever there is room for it', () => {
    // Not a style preference: if this ever returns nothing, titleWithBrand has
    // silently become "never add the brand" and the helper is dead weight.
    const withBrand = TRADES.filter((trade) => titleWithBrand(trade.metaTitle).endsWith(BRAND_SUFFIX));
    expect(withBrand.length).toBeGreaterThan(0);
  });

  it('article titles and excerpts fit too', () => {
    for (const article of ARTICLES) {
      expect(titleWithBrand(article.title).length, article.slug).toBeLessThanOrEqual(TITLE_MAX);
      expect(article.excerpt.length, article.slug).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });
});

describe('trade copy reads as English on all 49 pages', () => {
  it('picks the article by sound, including initialisms', () => {
    expect(indefiniteArticle('appliance repair')).toBe('an');
    expect(indefiniteArticle('electrical work')).toBe('an');
    expect(indefiniteArticle('excavation & grading')).toBe('an');
    // "aitch-vac" — the letter name starts with a vowel even though H does not.
    expect(indefiniteArticle('HVAC')).toBe('an');
    expect(indefiniteArticle('roofing')).toBe('a');
    expect(indefiniteArticle('landscaping & lawn care')).toBe('a');
    // /juː/ takes "a". No current trade hits this; the fiftieth might.
    expect(indefiniteArticle('utility trenching')).toBe('a');
    expect(indefiniteArticle('uniform rental')).toBe('a');
  });

  it('lowercases trade names without flattening acronyms', () => {
    expect(lowerTradeName('HVAC Contractors')).toBe('HVAC contractors');
    expect(lowerTradeName('Landscapers')).toBe('landscapers');
    expect(lowerTradeName('Window & Door Installers')).toBe('window & door installers');
  });

  it('never renders "a" before a vowel-sound trade', () => {
    // The exact sentence the template builds, for every trade.
    const wrong = TRADES.map((trade) => `Everything ${indefiniteArticle(trade.work)} ${trade.work} business`)
      .filter((sentence) => /\ba (?:[aeiou]|HVAC)/i.test(sentence));

    expect(wrong).toEqual([]);
  });

  it('does not call a mover or an inspection client a homeowner', () => {
    expect(tradePayer(TRADES.find((t) => t.slug === 'home-inspectors')!)).toBe('client');
    expect(tradePayer(TRADES.find((t) => t.slug === 'movers')!)).toBe('customer');
    expect(tradePayer(TRADES.find((t) => t.slug === 'auto-detailing')!)).toBe('customer');
    expect(tradePayer(TRADES.find((t) => t.slug === 'roofers')!)).toBe('homeowner');
  });
});
