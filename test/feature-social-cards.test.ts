import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';

/**
 * EVERY FEATURE PAGE UNFURLS AS ITSELF.
 *
 * All five inherited the root layout's Open Graph object, and Next only
 * replaces that object if the child declares one — so a share of
 * /features/quick-stops produced the homepage's title, the homepage's
 * description, a screenshot of a website template, and an og:url pointing at
 * letsgetquoted.com. The card sent people to a different page than the link.
 *
 * This is the kind of failure nothing else catches: it type-checks, it builds,
 * it renders, and it is only visible in somebody else's Slack.
 */

const SLUGS = ['website-builder', 'ai-intake', 'quick-stops', 'client-portal', 'back-office'];

const source = (slug: string) =>
  readFileSync(`src/app/features/${slug}/page.tsx`, 'utf8').replace(/\r\n/g, '\n');

/** Just the metadata export — the page body quotes plenty of URLs of its own. */
const meta = (slug: string) => {
  const src = source(slug);
  const at = src.indexOf('export const metadata');
  expect(at, slug).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf('\n};', at));
};

describe.each(SLUGS)('/features/%s', (slug) => {
  const block = meta(slug);

  it('declares its own canonical, og:url and twitter card', () => {
    expect(block).toContain(`canonical: 'https://letsgetquoted.com/features/${slug}'`);
    expect(block).toContain(`url: 'https://letsgetquoted.com/features/${slug}'`);
    expect(block).toContain("card: 'summary_large_image'");
  });

  it('ships a social image of its own, at the size every scraper crops to', () => {
    expect(block).toContain(`/features/og-${slug}.jpg`);
    expect(block).toContain('width: 1200');
    expect(block).toContain('height: 630');
    const path = `public/features/og-${slug}.jpg`;
    expect(existsSync(path), path).toBe(true);
    // Facebook and LinkedIn both refuse to fetch cards over 8MB, and a card
    // nobody can fetch is the same as no card.
    expect(statSync(path).size).toBeLessThan(1_000_000);
  });

  it('does not fall back on the homepage template image', () => {
    expect(block).not.toContain('/template-previews/');
  });

  it('says something about THIS page in the card copy', () => {
    // The failure mode is a copy-paste from a sibling, which is silent.
    const titles = [...block.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
    expect(titles.length).toBeGreaterThanOrEqual(3); // page, og, twitter
    for (const title of titles) expect(title.length).toBeGreaterThan(8);
    const descriptions = [...block.matchAll(/'([^']{60,})',/g)].map((m) => m[1]);
    expect(descriptions.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves the brand suffix to the root layout', () => {
    // The template is "%s · Let's Get Quoted", so naming the brand in the page
    // title renders it twice.
    const pageTitle = block.match(/^\s*title: '([^']+)',$/m)?.[1] ?? '';
    expect(pageTitle, slug).not.toMatch(/Let’s Get Quoted|Let's Get Quoted/);
  });
});

describe('the cards themselves', () => {
  it('are generated from the pages, not drawn by hand', () => {
    const script = readFileSync('scripts/build-feature-og.mjs', 'utf8');
    for (const slug of SLUGS) expect(script).toContain(`slug: '${slug}'`);
  });

  it('never claim anything the pages do not', () => {
    // No customer counts, no ratings, no "trusted by" — the same rule the
    // trust strip on /for is held to.
    const script = readFileSync('scripts/build-feature-og.mjs', 'utf8');
    const cards = script.slice(script.indexOf('const CARDS'), script.indexOf('/** The real mark'));
    expect(cards).not.toMatch(/\b\d+[,\d]*\+? (contractors|customers|users|businesses)\b/i);
    expect(cards).not.toMatch(/trusted by|rated|reviews|award/i);
  });
});

/**
 * THE THINGS YOU TAP ON A PHONE.
 *
 * All three live in the chrome every marketing page shares, so one regression
 * here is a regression on nine pages. Measured at 390x844 before §108:
 * .header-cta 129x36, .nav-toggle 37x44, .detail-back 108x13.
 */
describe('tap targets in the shared chrome', () => {
  const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('gives the signup button, the menu and the breadcrumb a real target', () => {
    expect(CSS).toMatch(/\.header-cta\)\s*\{[^}]*min-height: 44px/);
    expect(CSS).toMatch(/\.nav-toggle\)\s*\{[^}]*min-width: 44px[^}]*min-height: 44px/);
    // The breadcrumb's label stays 10px; the height is padding, and the margin
    // underneath gives it back so nothing on the page moves.
    expect(CSS).toMatch(/\.detail-back\)\s*\{[^}]*padding-block: 16px/);
  });

  it('keeps the fixed bar out of the home-indicator area', () => {
    expect(CSS).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('reserves the bar\'s height at the end of the page', () => {
    expect(CSS).toMatch(/padding-bottom: 78px/);
  });
});

/**
 * THE SECOND BUTTON IN EVERY FEATURE HERO.
 *
 * Each of these pages offers a way to see the thing before signing up for it.
 * Two failures were possible and both happened: the button said "Build my free
 * site" on a page about something else, and the section it pointed at arrived
 * underneath the fixed header — measured at y=0 on all three.
 */
describe('the feature hero CTAs', () => {
  const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  const CTAS: [string, string, string][] = [
    ['back-office', 'Start free', '#back-office-record'],
    ['client-portal', 'Start free', '#one-job'],
    ['quick-stops', 'Start free with Quick Stops', '#how-it-works'],
  ];

  it.each(CTAS)('%s asks for the thing the page is about', (slug, label, href) => {
    const src = source(slug);
    expect(src).toContain(`primary={{ label: '${label}' }}`);
    expect(src).toContain(`href: '${href}' }}`);
    // And the section that button points at exists, with the id on the section
    // rather than on the heading — that is what carries the scroll-margin.
    expect(src).toContain(`id="${href.slice(1)}"`);
  });

  it('lands those sections clear of the fixed header at both its heights', () => {
    // Two selectors share each rule now: .section-block[id] for the children a
    // feature page adds, and .detail-story[id] for the one the shared layout
    // renders — website-builder's "See how it works" points at that one.
    expect(CSS).toMatch(/\.detail-story\[id\]\)\s*\{ scroll-margin-top: 104px/);
    expect(CSS).toMatch(/\.detail-story\[id\]\)\s*\{ scroll-margin-top: 88px/);
    expect(CSS).toContain('.section-block[id]),');
  });
});

/**
 * /features/website-builder, rebuilt against the approved reference.
 *
 * The page was 1,817 words of eight steps and six benefits that said one thing
 * six ways. What is protected here is the compression — that it stayed
 * compressed — and the claims, which all had to survive it unchanged.
 */
describe('the website builder page', () => {
  const SRC = readFileSync('src/app/features/website-builder/page.tsx', 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('leads on the outcome rather than on the transition', () => {
    expect(SRC).toContain('A contractor website that turns visits into');
    expect(SRC).toContain('ready-to-quote jobs.');
    expect(SRC).not.toContain('Go from no website to');
  });

  it('asks for three answers, not eight steps', () => {
    const steps = SRC.slice(SRC.indexOf('steps={['), SRC.indexOf('cta={{'));
    expect([...steps.matchAll(/title: '/g)].length).toBe(4);
    for (const s of ['Your business name', 'Your trade', 'Your service area']) {
      expect(steps).toContain(s);
    }
  });

  it('compresses six benefits into the three things that happen to a visitor', () => {
    const benefits = SRC.slice(SRC.indexOf('benefits={['), SRC.indexOf('storyId='));
    expect([...benefits.matchAll(/title: '/g)].length).toBe(3);
  });

  it('draws the journey and the one comparison', () => {
    for (const beat of ['Visit', 'Qualify', 'Estimate', 'Win the job']) {
      expect(SRC).toContain(`title: '${beat}'`);
    }
    expect(SRC).toContain('Contact form submitted');
    expect(SRC).toContain('Quote-ready request received');
  });

  it('answers the practical questions with disclosures that work unhydrated', () => {
    expect(SRC).toContain('<details key={item.q} open={index === 0}>');
    // No `name`: an exclusive accordion hides four answers from find-in-page.
    expect(SRC).not.toMatch(/<details[^>]*name=/);
    expect([...SRC.matchAll(/^\s+q: '/gm)].length).toBe(5);
  });

  it('keeps the claims that were already checked against the product', () => {
    // The CNAME target is the real one (lib/domains.ts), the trade count is
    // computed, and the fee comes from the pricing model rather than a number
    // typed into a marketing page.
    expect(SRC).toContain('domains.letsgetquoted.com');
    expect(SRC).toContain('TRADES.length');
    expect(SRC).toContain('FEE_TIERS[0].rate');
    expect(SRC).toContain('STRIPE_PROCESSING_NOTE');
  });

  it('invents no proof', () => {
    expect(SRC).not.toMatch(/\b\d[\d,]*\+? (contractors|customers|users|businesses) (use|trust|have)/i);
    expect(SRC).not.toMatch(/trusted by|rated \d|testimonial/i);
    // The one invented business is labelled as invented wherever it appears.
    expect(SRC).toContain('Invented company, invented range');
  });
});
