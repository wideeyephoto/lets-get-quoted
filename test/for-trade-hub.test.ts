import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRADES } from '@/lib/trades';
import { TRADE_CATEGORIES } from '@/lib/trade-categories';
import { seasonalTrades } from '@/lib/trade-collections';

/**
 * /for trade hub and directory test suite.
 *
 * Verifies that all 150 trades are catalogued and linked, SEO metadata is intact,
 * and the focused trade-finder experience is properly structured.
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const PAGE = stripJs(read('src', 'app', 'for', 'page.tsx'));
const EXP = stripJs(read('src', 'app', 'for', 'ForExperience.tsx'));
const LAYOUT = read('src', 'app', 'for', 'layout.tsx');

/* ===========================================================================
   1. The directory links all 150 trades
   ======================================================================== */
describe('the trade directory links and categorization', () => {
  it('has 150 registered trades across all categories', () => {
    expect(TRADES).toHaveLength(150);
    const filed = TRADE_CATEGORIES.flatMap((category) => category.slugs);
    expect(new Set(filed).size).toBe(TRADES.length);
  });

  it('renders links to trade detail routes', () => {
    expect(EXP).toContain('href={`/for/${trade.slug}`}');
    expect(EXP).toContain('visibleTrades.map(');
    expect(EXP).toContain('directoryMatches.slice(0, 4)');
  });

  it('provides category filter tabs for all trade categories', () => {
    expect(EXP).toContain('TRADE_CATEGORIES.map(');
    expect(EXP).toContain('All trades');
    expect(EXP).toContain('showAllTrades &&');
  });
});

/* ===========================================================================
   2. SEO and metadata
   ======================================================================== */
describe('/for SEO and metadata surface', () => {
  it('defines canonical and title metadata', () => {
    expect(PAGE).toContain("canonical: 'https://letsgetquoted.com/for'");
    expect(PAGE).toContain("titleWithBrand('Contractor Websites, Estimators & Quotes by Trade')");
  });

  it('defines OpenGraph and Twitter cards for /for', () => {
    expect(PAGE).toContain("url: 'https://letsgetquoted.com/for'");
    expect(PAGE).toContain('openGraph:');
    expect(PAGE).toContain('twitter:');
  });

  it('descends from H1 hero to H2 section landmarks', () => {
    expect(EXP).toContain('<h1 id="hero-title"');
    expect(EXP).toContain('<h2 id="benefits-title"');
    expect(EXP).toContain('<h2 id="smart-quotes-title"');
    expect(EXP).toContain('<h2 id="seasonal-title"');
    expect(EXP).toContain('<h2 id="directory-title"');
    expect(EXP).toContain('<h2 id="multi-title"');
    expect(EXP).toContain('<h2 id="faq-title"');
    expect(EXP).toContain('<h2 id="final-title"');
  });
});

/* ===========================================================================
   3. Interactive Features: Finder, previews, and seasonal timeline
   ======================================================================== */
describe('interactive trade experience features', () => {
  it('features a searchable hero and four setup previews', () => {
    expect(EXP).toContain('heroMatches');
    expect(EXP).toContain("type VisualKey = 'quote' | 'website' | 'journey' | 'kit'");
    expect(EXP).toContain('role="tablist" aria-label="Setup previews"');
  });

  it('features a concise seasonal timeline and trade tags', () => {
    expect(EXP).toContain('styles.seasonTimeline');
    expect(EXP).toContain('styles.months');
    expect(seasonalTrades().length).toBeGreaterThan(0);
  });

  it('includes interactive FAQ accordion with aria accessibility', () => {
    expect(EXP).toContain('FAQS');
    expect(EXP).toContain('aria-expanded={openFaq === index}');
    expect(EXP).toContain('setOpenFaq(openFaq === index ? null : index)');
  });
});

/* ===========================================================================
   4. Layout and Chrome
   ======================================================================== */
describe('layout integration', () => {
  it('uses public-header-layout', () => {
    expect(LAYOUT).toContain('public-header-layout');
  });

  it('includes trade closing CTA and footer', () => {
    expect(EXP).toContain('styles.finalSection');
    expect(EXP).toContain('Build my {selectedTrade.name} setup');
    expect(EXP).toContain('APP_SIGNUP_URL');
    expect(PAGE).toContain('<SiteFooter />');
  });
});
