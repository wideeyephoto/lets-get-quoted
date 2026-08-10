import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { FEATURE_CATEGORIES, FEATURE_COUNT } from '@/lib/features';

/**
 * The seven pages behind the homepage's suite cards.
 *
 * WHY THEY EXIST. Every one of these cards used to land somewhere more general
 * than the promise it made — /features#payments for "Cash flow", an anchor
 * part-way down /features/back-office for "Quotes + e-sign". Seven specific
 * promises, four destinations, none of them the answer.
 *
 * WHAT THIS SUITE PROTECTS, in order of how badly it would hurt:
 *
 *   THE CATALOG IS READ, NOT RESTATED. The capability list on each page comes
 *   out of lib/features.ts — the same array /features and the homepage grid
 *   render. A page that retypes a catalog is a page that will eventually
 *   describe a product that no longer exists, and nothing would fail when it
 *   did. This is the same rule the fee numbers already follow.
 *
 *   THE CLAIMS. These pages are about money, labor and reviews, which is the
 *   part of the product it is easiest to overpromise. Three specific things the
 *   product deliberately does NOT do are asserted to still be said out loud.
 *
 *   THE LINKS. A card pointing at a route that does not exist is a 404 that
 *   type-checks and builds.
 */

const SUITE = [
  { slug: 'quotes', catalog: ['quotes'] },
  { slug: 'scheduling', catalog: ['scheduling'] },
  { slug: 'crew', catalog: ['jobs'] },
  { slug: 'payments', catalog: ['payments'] },
  { slug: 'recurring', catalog: ['recurring'] },
  { slug: 'cash-flow', catalog: ['insights'] },
  { slug: 'reviews', catalog: ['reviews', 'marketing'] },
] as const;

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
/** WHY comments quote the copy being asserted, so they have to come out. */
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const page = (slug: string) => strip(read(`src/app/features/${slug}/page.tsx`));
const SHELL = strip(read('src/components/marketing/suite-feature-page.tsx'));

describe('every suite page exists and is wired up', () => {
  it.each(SUITE)('/features/$slug is a route on disk', ({ slug }) => {
    expect(existsSync(`src/app/features/${slug}/page.tsx`)).toBe(true);
  });

  it.each(SUITE)('/features/$slug is in the sitemap', ({ slug }) => {
    expect(read('src/app/sitemap.ts')).toContain(`'${slug}'`);
  });

  it('the homepage suite cards are exactly these seven, in order', () => {
    const home = read('src/components/flagship/flagship-home.tsx');
    const block = home.slice(home.indexOf('const suite:'), home.indexOf('];', home.indexOf('const suite:')));
    const hrefs = [...block.matchAll(/"\/features\/([a-z-]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(SUITE.map((entry) => entry.slug));
  });

  it('the tool cards on /features point at the same pages', () => {
    // The same seven names appear on the features index. Leaving those on
    // back-office anchors while the homepage went to real pages would have been
    // two answers to one question.
    const stages = read('src/app/features/job-record-stages.tsx');
    for (const slug of ['scheduling', 'crew', 'recurring', 'quotes', 'payments', 'cash-flow', 'reviews']) {
      expect(stages, slug).toContain(`href: '/features/${slug}'`);
    }
    expect(stages).not.toContain('/features/back-office#');
  });
});

/**
 * /features/back-office is the hub, and its capability list is the map.
 *
 * Until these pages existed, that list was also the end of the road: a reader
 * who wanted more than three lines on payment plans had nowhere to go. Each of
 * the four stages now names the pages that take it apart — which is also the
 * only thing keeping back-office from reading as a rival to the seven rather
 * than the page they all belong to.
 */
describe('the back office links out to the pages that go deeper', () => {
  const BACK_OFFICE = strip(read('src/app/features/back-office/page.tsx'));
  const linked = [...BACK_OFFICE.matchAll(/href: '(\/features\/[a-z-]+)'/g)].map((m) => m[1]);

  it('reaches all seven suite pages', () => {
    for (const { slug } of SUITE) {
      expect(linked, slug).toContain(`/features/${slug}`);
    }
  });

  it('reaches the client portal too, which is the eighth thing that stage covers', () => {
    expect(linked).toContain('/features/client-portal');
  });

  it('gives every one of the four stages a way out', () => {
    // A stage with no exit is the dead end this change exists to remove.
    const groups = BACK_OFFICE.slice(
      BACK_OFFICE.indexOf('const CAPABILITY_GROUPS'),
      BACK_OFFICE.indexOf('const CAPABILITY_COUNT'),
    );
    expect([...groups.matchAll(/id: '/g)]).toHaveLength(4);
    expect([...groups.matchAll(/deeper: \[/g)]).toHaveLength(4);
  });

  it('keeps the seventeen long-form explanations', () => {
    // The suite pages are built from lib/features.ts's short catalog entries;
    // these are long-form and written for this page. Replacing them with links
    // would have cost the page what it is best at to remove a duplication that
    // does not exist.
    expect([...BACK_OFFICE.matchAll(/^\s+term: '/gm)]).toHaveLength(17);
    expect(BACK_OFFICE).toContain('<p>{item.detail}</p>');
  });

  it('tells a screen reader which stage each link belongs to', () => {
    // Three groups offer a link called "Payments", "Cash flow" or similar. A
    // links list read out of context would otherwise be several identical
    // names with nothing to separate them.
    expect(BACK_OFFICE).toContain('{group.stage.toLowerCase()}');
    expect(BACK_OFFICE).toContain('className="sr-only"');
  });

  it('gives those links a real tap target', () => {
    const css = read('src/app/features/back-office/back-office.module.css');
    expect(css).toMatch(/\.capDeeper a \{[^}]*min-height: 44px/);
  });
});

describe('the capability list is read from the product catalog', () => {
  it('the shell reads FEATURE_CATEGORIES rather than a list of its own', () => {
    expect(SHELL).toContain("from '@/lib/features'");
    expect(SHELL).toContain('FEATURE_CATEGORIES.find((category) => category.slug === slug)');
    // A page naming a category that does not exist must fail loudly. Rendering
    // an empty second half silently is the failure this prevents.
    expect(SHELL).toContain('throw new Error');
  });

  it.each(SUITE)('/features/$slug names catalog slugs that exist', ({ slug, catalog }) => {
    const source = page(slug);
    const named = source.slice(source.indexOf('catalog={['), source.indexOf(']}', source.indexOf('catalog={[')));
    for (const wanted of catalog) {
      expect(named, `${slug} -> ${wanted}`).toContain(`'${wanted}'`);
      expect(FEATURE_CATEGORIES.some((category) => category.slug === wanted)).toBe(true);
    }
  });

  it('no suite page hardcodes a feature name the catalog owns', () => {
    // Spot-check against the catalog itself: if a page restated an entry's
    // description verbatim it would be a second copy to keep in step.
    const descriptions = FEATURE_CATEGORIES.flatMap((c) => c.features.map((f) => f.desc));
    for (const { slug } of SUITE) {
      const source = page(slug);
      const copied = descriptions.filter((desc) => source.includes(desc));
      expect(copied, `${slug} restates ${copied[0]}`).toEqual([]);
    }
  });

  it('covers every homepage promise with a real category', () => {
    const covered = new Set(SUITE.flatMap((entry) => entry.catalog));
    for (const slug of covered) {
      expect(FEATURE_CATEGORIES.map((c) => c.slug)).toContain(slug);
    }
    expect(FEATURE_COUNT).toBeGreaterThan(covered.size);
  });
});

describe('what these pages promise', () => {
  it.each(SUITE)('/features/$slug prices from the fee model, not from a number', ({ slug }) => {
    const source = page(slug);
    expect(source).toContain('FEE_TIERS[0].rate');
    expect(source).toContain('STRIPE_PROCESSING_NOTE');
    // A rate typed into marketing copy is a rate that drifts from /pricing.
    expect(source).not.toMatch(/\b1\.25%|0\.65%/);
  });

  it.each(SUITE)('/features/$slug invents no social proof', ({ slug }) => {
    const source = page(slug);
    expect(source).not.toMatch(/\b\d[\d,]*\+? (contractors|customers|users|businesses) (use|trust|have)/i);
    expect(source).not.toMatch(/trusted by|testimonial|award[- ]winning/i);
    expect(source).not.toMatch(/\brated\s*\d|\b\d(\.\d)?\s*(out of|\/)\s*5\b/i);
  });

  it.each(SUITE)('/features/$slug labels its mock as invented', ({ slug }) => {
    // Same rule as every other panel on the marketing site: an unmarked
    // screenshot-like panel reads as a real account.
    expect(page(slug)).toMatch(/<ExampleFrame/);
    expect(page(slug)).toMatch(/[Ii]nvented/);
  });

  it('keeps saying the three things the product does NOT do', () => {
    // Each of these was written down deliberately somewhere in the codebase and
    // is the kind of honesty that quietly disappears in a marketing rewrite.
    expect(page('crew')).toContain('no tax is calculated or withheld');
    expect(page('payments')).toContain('no credit check');
    expect(page('reviews')).toContain('breaks Google’s');
    // And the one on scheduling: weather flags, it never reschedules for you.
    expect(page('scheduling')).toMatch(/never|flags/i);
  });

  it('does not claim the cash forecast connects to a bank', () => {
    const source = page('cash-flow');
    expect(source).toContain('Does this connect to my bank?');
    expect(source).toMatch(/No\. You tell it what is in the account/);
  });
});

describe('the shell', () => {
  it('gives every page the same questions treatment as the flagship pages', () => {
    expect(SHELL).toContain('<details key={item.q} open={index === 0}>');
    // No `name`: an exclusive accordion hides every other answer from the
    // browser's own find-in-page.
    expect(SHELL).not.toMatch(/<details[^>]*name=/);
  });

  it('sets the capability copy at reading size, not caption size', () => {
    // The shared layout was already corrected once for setting sentences at
    // 11px on five pages. These are sentences.
    const css = read('src/components/marketing/suite-feature-page.module.css');
    expect(css).toMatch(/\.list span \{[^}]*font-size: 0\.92rem/);
    expect(css).toMatch(/\.faq summary \{[^}]*min-height: 56px/);
  });

  it('sends a reader on to the full catalog', () => {
    expect(SHELL).toContain('href="/features"');
  });
});
