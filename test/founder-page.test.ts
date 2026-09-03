import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * /founder, founder letter & interactive experience.
 *
 * Verifies structure, design fidelity, portrait assets, and SEO metadata.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const RAW_PAGE = read('src', 'app', 'founder', 'page.tsx');
const RAW_EXP = read('src', 'app', 'founder', 'FounderExperience.tsx');
const PAGE = stripJs(RAW_PAGE) + '\n' + stripJs(RAW_EXP);
const CSS = stripCss(read('src', 'app', 'founder', 'founder.module.css'));
const LAYOUT = read('src', 'app', 'founder', 'layout.tsx');

function ruleFor(selector: string): string {
  const start = CSS.search(new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'));
  expect(start, `${selector} has no rule`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

function at(marker: string): number {
  const index = PAGE.indexOf(marker);
  expect(index, `${marker} is not on the page`).toBeGreaterThan(-1);
  return index;
}

/* ===========================================================================
   1. The letterhead & hero
   ======================================================================== */
describe('the hero is a note from the founder', () => {
  it('identifies the author clearly in the eyebrow badge', () => {
    expect(PAGE).toContain('A NOTE FROM BRETT · FOUNDER &amp; BUILDER');
  });

  it('carries the headline highlighting craftsman values', () => {
    expect(PAGE).toContain('Great craftsmanship shouldn’t lose jobs to mediocre competitors with a');
    expect(PAGE).toContain('<em>better website and faster follow-up.</em>');
  });

  it('offers the two primary hero actions', () => {
    expect(PAGE).toContain("spec={{ label: 'Build my free site' }}");
    expect(PAGE).toContain('href="#story"');
    expect(PAGE).toContain('Read the letter');
    expect(PAGE).toContain('id="story"');
  });

  it('states the core assurances in the hero', () => {
    expect(PAGE).toContain('No credit card required');
    expect(PAGE).toContain('Start at $0/month (Flex tier)');
    expect(PAGE).toContain('One single connected product');
  });
});

/* ===========================================================================
   2. The photograph
   ======================================================================== */
describe('the portrait is a real photograph', () => {
  it('the photograph asset exists on disk with realistic size', () => {
    const file = join(process.cwd(), 'public', 'founder', 'brett-workshop.jpg');
    expect(existsSync(file), 'public/founder/brett-workshop.jpg is missing').toBe(true);
    const bytes = statSync(file).size;
    expect(bytes).toBeGreaterThan(50_000);
    expect(bytes).toBeLessThan(2_000_000);
  });

  it('is rendered through next/image with priority', () => {
    expect(PAGE).toContain('src="/founder/brett-workshop.jpg"');
    expect(PAGE).toContain('priority');
    expect(PAGE).toContain('alt="Brett');
  });

  it('no trace of old unrendered placeholder tags', () => {
    expect(PAGE).not.toContain('Portrait to come');
    expect(CSS).not.toContain('.portraitSlotNote');
  });
});

/* ===========================================================================
   3. Structured flow & sections
   ======================================================================== */
describe('structured page flow', () => {
  it('has exactly one H1 and it is the hero title', () => {
    expect(PAGE.match(/<h1\b/g)).toHaveLength(1);
    expect(PAGE).toContain('<h1 id="founder-title"');
  });

  it('renders key narrative landmarks in logical reading order', () => {
    const ORDER = [
      'id="founder-title"',
      'id="story"',
      'id="principles"',
      'id="promise"',
      '<MarketingCta',
    ];
    const positions = ORDER.map(at);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('features the founder beliefs, broken cards, and pledges without tool sprawl calculator', () => {
    expect(PAGE).not.toContain('SPRAWL_TOOLS');
    expect(PAGE).not.toContain('Interactive Tool-Sprawl Cost Calculator');
    expect(PAGE).toContain('FOUNDER_BELIEFS');
    expect(PAGE).toContain('BROKEN_CARDS');
    expect(PAGE).toContain('PLEDGES');
  });

  it('removes bloated legacy catalogue dumps', () => {
    expect(PAGE).not.toContain('FEATURE_CATEGORIES');
    expect(PAGE).not.toContain('FEATURE_COUNT');
  });
});

/* ===========================================================================
   4. Chrome & CTA components
   ======================================================================== */
describe('shared chrome and navigation destinations', () => {
  it('draws header layout from the wrapper', () => {
    expect(LAYOUT).toContain('public-header-layout');
    expect(PAGE).not.toContain('<SiteHeader');
  });

  it('the primary action links through APP_SIGNUP_URL', () => {
    expect(PAGE).toContain('APP_SIGNUP_URL');
  });

  it('closes with shared MarketingCta and SiteFooter', () => {
    expect(PAGE).toContain('<MarketingCta');
    expect(PAGE).toContain('<SiteFooter />');
  });

  it('includes persistent mobile StickyCta', () => {
    expect(PAGE.match(/<StickyCta\b/g)).toHaveLength(1);
  });
});

/* ===========================================================================
   5. Metadata & JSON-LD Structured Data
   ======================================================================== */
describe('metadata and structured schema', () => {
  it('defines page title and canonical URL in metadata', () => {
    expect(PAGE).toContain("title: 'A note from Brett, founder · Let’s Get Quoted'");
    expect(PAGE).toContain("canonical: 'https://letsgetquoted.com/founder'");
  });

  it('defines OpenGraph and Twitter cards', () => {
    expect(PAGE).toContain('openGraph:');
    expect(PAGE).toContain('twitter:');
  });

  it('embeds JSON-LD AboutPage & Person schema', () => {
    expect(PAGE).toContain("'@type': 'AboutPage'");
    expect(PAGE).toContain("'@type': 'Person'");
    expect(PAGE).toContain("name: 'Brett'");
  });
});

/* ===========================================================================
   6. Responsive Styling & Reduced Motion
   ======================================================================== */
describe('responsive styling & accessiblity', () => {
  it('defines container and page styles', () => {
    expect(CSS).toContain('.page');
    expect(CSS).toContain('.heroGrid');
  });

  it('contains responsive media breakpoints', () => {
    expect(CSS).toContain('@media');
  });

  it('supports reduced motion preferences', () => {
    expect(CSS).toContain('prefers-reduced-motion');
  });
});
