import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TRADES } from '@/lib/trades';
import { TRADE_CATEGORIES } from '@/lib/trade-categories';
import { TITLE_MAX, titleWithBrand } from '@/lib/seo/marketing-seo';

/**
 * /for is the hub, and the hub is its links.
 *
 * Everything below protects one of two things: that all 49 trade pages are
 * reachable from the initial HTML however the page is styled, or that the page's
 * claims are ones we could show a sceptic where to check. The visual rebuild is
 * allowed to move anything that is not on this list.
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

/** This repo writes long WHY comments that quote the string being asserted, so
 *  a bare toContain/not.toContain will happily match a comment about the code
 *  rather than the code. */
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const PAGE = stripJs(read('src', 'app', 'for', 'page.tsx'));
const FINDER = stripJs(read('src', 'app', 'for', 'TradeFinder.tsx'));
const SIM = stripJs(read('src', 'app', 'for', 'HeroIntakeSimulator.tsx'));
const CSS = stripCss(read('src', 'app', 'for', 'for.module.css'));
const SIM_CSS = stripCss(read('src', 'app', 'for', 'intake-simulator.module.css'));
const LAYOUT = read('src', 'app', 'for', 'layout.tsx');

/**
 * The block for one selector, from its opening brace to the first closing one.
 *
 * Top-level only — the leading newline is what keeps it off the indented copy
 * of the same selector inside a media query, which is nearly always a partial
 * override and would answer the wrong question.
 */
const rule = (source: string, selector: string) => {
  const at = source.indexOf(`\n${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('}', at));
};
const ruleFor = (selector: string) => rule(CSS, selector);
const simRule = (selector: string) => rule(SIM_CSS, selector);

/* ===========================================================================
   1. Every trade link, in the HTML, whatever the controls say
   ======================================================================== */
describe('the directory is 49 links and not a search box', () => {
  it('renders every group and every entry unconditionally', () => {
    // The list that is MAPPED is the full one. The previous version rendered
    // `matches`, which put all 49 in the initial HTML and then unmounted 40 of
    // them the moment a category was pressed.
    expect(FINDER).toContain('GROUPS.map((group)');
    expect(FINDER).toContain('group.entries.map((entry)');
    expect(FINDER).not.toContain('matches.map');
  });

  it('filters by hiding, so a filtered-out link is still in the document', () => {
    expect(FINDER).toContain('hidden={!shows(entry, group.id)}');
    expect(FINDER).toContain('hidden={visible === 0}');
    // `hidden` and not a display:none class, because it also takes the entry out
    // of the tab order and the accessibility tree.
    expect(CSS).not.toMatch(/\.tradeList\s+li\s*\{[^}]*display:\s*none/);
  });

  it('points at every one of the 76 trade URLs', () => {
    expect(FINDER).toContain('href={`/for/${entry.trade.slug}`}');
    const filed = TRADE_CATEGORIES.flatMap((category) => category.slugs);
    expect(new Set(filed).size).toBe(TRADES.length);
    expect(TRADES).toHaveLength(76);
  });

  it('keeps the descriptive anchor text — the trade name and what it does', () => {
    expect(FINDER).toContain('<b>{entry.trade.name}</b>');
    expect(FINDER).toContain("entry.trade.services.slice(0, 3).join(' · ')");
  });

  it('groups them, and files each group A–Z inside itself', () => {
    expect(FINDER).toContain('TRADE_CATEGORIES.map(');
    expect(FINDER).toContain("a.trade.name.localeCompare(b.trade.name, 'en')");
  });

  /* Building the index per keystroke is 49 joins and lower-casings nobody asked
     for; it is static data, so it is built once at module scope. */
  it('indexes once, not per render', () => {
    const beforeComponent = FINDER.slice(0, FINDER.indexOf('export default function'));
    expect(beforeComponent).toContain('searchIndexFor(trade)');
  });
});

/* ===========================================================================
   2. The SEO surface, which is the reason this page exists
   ======================================================================== */
describe('/for keeps its place in search', () => {
  it('is one H1 and nothing else at that level', () => {
    expect(PAGE.match(/<h1>/g) ?? []).toHaveLength(1);
    expect(PAGE).toContain('<h1>The connected contractor system—preconfigured for your trade.</h1>');
  });

  it('descends h1 → h2 → h3 without skipping', () => {
    const levels = [...PAGE.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    expect(levels[0]).toBe(1);
    // A heading may only ever be one deeper than the one before it.
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - Math.min(...levels.slice(0, i)), `heading ${i}`).toBeLessThanOrEqual(2);
    }
    expect(FINDER).toContain('<h3>{group.label}</h3>');
  });

  it('keeps the canonical, and points Open Graph at /for rather than the homepage', () => {
    expect(PAGE).toContain("alternates: { canonical: 'https://letsgetquoted.com/for' }");
    expect(PAGE).toContain("url: 'https://letsgetquoted.com/for'");
    expect(PAGE).not.toContain("url: 'https://letsgetquoted.com'");
  });

  /* Next replaces the parent's openGraph object wholesale rather than merging
     into it, so a page that sets openGraph without an image ships a card with
     no image. */
  it('carries its own og:image, because the root layout is not merged in', () => {
    const og = PAGE.slice(PAGE.indexOf('openGraph: {'), PAGE.indexOf('twitter: {'));
    expect(og).toContain('images: [');
    expect(og).toContain('width: 1900');
    expect(og).toContain('height: 881');
  });

  /* The root layout appends "· Let's Get Quoted" to every title, so this page
     needs `absolute` or the tab reads the brand twice — it used to carry the
     brand in the string as well, at 65 characters.
     titleWithBrand is now what appends it, and only while the result fits
     inside the ~60 Google renders. Asserted through the helper rather than
     against a literal, because the literal is exactly what went stale. */
  it('sets the title absolutely, so the brand is not said twice or truncated', () => {
    expect(PAGE).toContain('title: { absolute: titleWithBrand(');
    expect(PAGE).not.toContain('by Trade | Let’s Get Quoted');
    expect(titleWithBrand('Contractor Website & Software by Trade').length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it('still mounts the one public header, and still ends on the shared footer', () => {
    expect(LAYOUT).toContain('public-header-layout');
    expect(PAGE).toContain("import SiteFooter from '@/components/site-footer'");
    expect(PAGE).toContain('<SiteFooter />');
  });
});

/* ===========================================================================
   3. The hero image
   ======================================================================== */
describe('the hero graphic', () => {
  const master = join(process.cwd(), 'assets', 'for-hero', 'homeowner-estimate.jpeg');
  const shipped = join(process.cwd(), 'public', 'for', 'homeowner-estimate.webp');

  it('ships a WebP derivative and keeps the master', () => {
    expect(existsSync(master), 'assets/for-hero/homeowner-estimate.jpeg').toBe(true);
    expect(existsSync(shipped), 'public/for/homeowner-estimate.webp').toBe(true);
    // The derivative is the point of having one.
    expect(statSync(shipped).size).toBeLessThan(statSync(master).size);
  });

  /* The cut-out of a laptop and a phone is gone, and so is everything that only
     ever existed to hold it up: the eight drop-shadows, the drift, the parallax
     wrapper, and the Chromium script that trimmed the PNG master. If any of
     these come back it will be by accident. */
  it('has retired the device shot and everything built for it', () => {
    for (const gone of [
      join(process.cwd(), 'public', 'for', 'hero-quote-devices.webp'),
      join(process.cwd(), 'assets', 'for-hero', 'hero-quote-devices.png'),
      join(process.cwd(), 'scripts', 'build-for-hero.mjs'),
      join(process.cwd(), 'src', 'app', 'for', 'HeroParallax.tsx'),
    ]) {
      expect(existsSync(gone), gone.replace(process.cwd(), '.')).toBe(false);
    }
    expect(PAGE).not.toContain('hero-quote-devices');
    expect(PAGE).not.toContain('HeroParallax');
    expect(CSS).not.toContain('.heroShot');
    expect(CSS).not.toContain('hero-float');
  });

  it('is the simulator, and it is the only thing in the art column', () => {
    expect(PAGE).toContain("import HeroIntakeSimulator from './HeroIntakeSimulator'");
    const art = PAGE.slice(PAGE.indexOf('className={styles.heroArt}'));
    expect(art.slice(0, art.indexOf('</div>'))).toContain('<HeroIntakeSimulator />');
  });

  it('loads the photograph eagerly and at high priority — it is the LCP element', () => {
    const img = SIM.slice(SIM.indexOf('<Image'), SIM.indexOf('/>', SIM.indexOf('<Image')));
    expect(img).toContain('src="/for/homeowner-estimate.webp"');
    expect(img).toContain('priority');
    expect(img).not.toContain('loading="lazy"');
    expect(img).toContain('sizes=');
    // `fill` rather than intrinsic dimensions: the panel's height is an
    // aspect-ratio of the column and the photo is cropped to it.
    expect(img).toContain('fill');
  });

  it('says what it shows', () => {
    expect(SIM).toContain('alt="A homeowner in her kitchen, asking for an estimate on her phone."');
  });

  /* The homeowner stands in the right third of the frame. Anchored right, every
     crop the panel asks for is taken off the empty wall on the left, so she is
     never cut into at any width. */
  it('anchors the crop to the right so the homeowner survives it', () => {
    expect(simRule('.photo')).toContain('object-position: right center');
    expect(simRule('.photo')).toContain('object-fit: cover');
  });

  /* THE CAP IS ON THE PANEL, NOT ON .heroArt. .heroArt is a grid item; capping
     or auto-margining a grid item cancels its stretch, which leaves the panel
     resolving `width: 100%` against a fit-content parent whose height is an
     aspect-ratio of that width. Measured when it was wrong: a 2x2px hero. */
  it('sizes the panel without collapsing the grid item that holds it', () => {
    const art = ruleFor('.heroArt');
    expect(art).not.toContain('max-width');
    expect(art).not.toContain('margin-left: auto');
    expect(simRule('.panel')).toContain('max-width: 740px');
  });
});

/* ===========================================================================
   4. The trust strip claims only what can be checked
   ======================================================================== */
describe('the trust strip', () => {
  const strip = PAGE.slice(PAGE.indexOf('const TRUST = ['), PAGE.indexOf('];', PAGE.indexOf('const TRUST = [')));

  it('carries the five product facts', () => {
    expect(strip).toContain('${TRADES.length} trades supported');
    expect(strip).toContain("'Free to start'");
    expect(strip).toContain("'No credit card'");
    expect(strip).toContain("'Flex is $0/month'");
    expect(strip).toContain("'Stripe-powered payments'");
  });

  /* Read off TRADES rather than typed, so adding a trade cannot leave the page
     advertising the old number. */
  it('counts the trades rather than claiming a number', () => {
    expect(strip).not.toContain('49 trades supported');
    expect(TRADES.length).toBe(76);
  });

  /* No customer counts, no ratings, no processed-payment totals, no logos.
     There is no measurement behind any of those. */
  it('claims no social proof anywhere on the page', () => {
    for (const phrase of [
      'contractors trust',
      'customers trust',
      'rated',
      'reviews from',
      '5 stars',
      'processed',
      'testimonial',
      'trusted by',
      'join thousands',
    ]) {
      expect(PAGE.toLowerCase(), phrase).not.toContain(phrase);
    }
  });

  /* The fee is the number the decision turns on, and the page that explains it
     has to be one click away from where the claim is made. */
  it('states plan-based prices from the canonical projection and links the breakdown', () => {
    expect(PAGE).toContain('{FLEX_PRICE.platformFee}');
    expect(PAGE).toContain('{LOWEST_PLATFORM_FEE}');
    expect(PAGE).toContain('<Link href="/pricing">');
  });
});

/* ===========================================================================
   5. The demo section, in place of a testimonial
   ======================================================================== */
describe('the product-proof section shows the product', () => {
  it('asks them to try it rather than telling them somebody else liked it', () => {
    expect(PAGE).toContain('<h2>Try the entire customer experience.</h2>');
    expect(PAGE).toContain('Open a real demo website, request an estimate, review a quote');
    expect(PAGE).toContain('Explore the demo &mdash; no signup');
  });

  it('walks the four steps in the order they happen', () => {
    const steps = PAGE.slice(PAGE.indexOf('const STEPS = ['), PAGE.indexOf('];', PAGE.indexOf('const STEPS = [')));
    const order = ['Visit the website', 'Get an estimate', 'Approve the quote', 'Pay online'];
    let cursor = -1;
    for (const step of order) {
      const at = steps.indexOf(step);
      expect(at, step).toBeGreaterThan(cursor);
      cursor = at;
    }
    // An ordered list, and one that keeps its list semantics in Safari, where
    // list-style: none otherwise drops them.
    expect(PAGE).toContain('<ol className={styles.steps} role="list">');
  });
});

/* ===========================================================================
   5b. Every card on the page goes somewhere

   This is an index page. A card that names a capability and does nothing is a
   dead end on the one kind of page whose entire job is to send people onward —
   which is what the four benefits and the four steps were.
   ======================================================================== */
describe('the cards are links', () => {
  const hrefs = [...PAGE.matchAll(/href: '(\/features[^']*)'/g)].map((m) => m[1]);

  it('gives all eight cards a destination', () => {
    expect(hrefs.length).toBe(9);
    expect(PAGE).toContain('<Link key={item.title} href={item.href} className={styles.benefit}>');
    expect(PAGE).toContain('<Link href={step.href}>');
  });

  it('walks the customer journey through four different parts of the product', () => {
    // The steps are the one list here where the sequence maps cleanly onto five
    // separate features, so none of them repeats.
    const steps = PAGE.slice(PAGE.indexOf('const STEPS = ['), PAGE.indexOf('];', PAGE.indexOf('const STEPS = [')));
    const stepHrefs = [...steps.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
    expect(stepHrefs).toEqual([
      '/features/website-builder',
      '/features/ai-intake',
      '/features/quotes',
      '/features/scheduling',
      '/features/client-portal',
    ]);
  });

  it('points every one of them at a route that exists', () => {
    for (const href of new Set(hrefs)) {
      const path = href.split('#')[0];
      expect(existsSync(`src/app${path}/page.tsx`), href).toBe(true);
    }
  });

  it('points every fragment at an id on the page it lands on', () => {
    const targets: Record<string, string> = {
      '/features/back-office': 'src/app/features/back-office/page.tsx',
      '/features': 'src/app/features/job-record-stages.tsx',
    };
    const fragments = hrefs.filter((href) => href.includes('#'));
    expect(fragments.length).toBeGreaterThan(0);
    for (const href of fragments) {
      const [path, id] = href.split('#');
      const source = readFileSync(targets[path], 'utf8');
      const found = source.includes(`id="${id}"`) || source.includes(`id: '${id}'`);
      expect(found, `no id "${id}" on ${path}`).toBe(true);
    }
  });
});

/* ===========================================================================
   6. The dark sheet: contrast, targets, and no sideways scroll
   ======================================================================== */

/** WCAG 2.1 relative luminance and contrast, for the two colours that carry
 *  every action on this page. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('the palette is legible, not just dark', () => {
  const GROUND = '#071521';
  const FLARE = '#ff5a12';

  /* Declared on BOTH .page and .ground. .ground is a sibling, not a descendant,
     so a token declared only on .page is invisible to it — and the failure is
     silent: `var(--ground)` falls back to transparent and the navy simply never
     paints. It shipped once looking brown. */
  it('pins the mockup palette, where the ground can see it too', () => {
    const palette = ruleFor('.page,\n.ground');
    expect(palette).toContain('--ground: #071521');
    expect(palette).toContain('--card: #0d1c2a');
    expect(palette).toContain('--card-2: #112332');
    expect(palette).toContain('--edge: #263949');
    expect(palette).toContain('--ink: #f5f0e8');
    expect(palette).toContain('--ink-2: #b9c3cb');
    expect(palette).toContain('--flare: #ff5a12');
    // The ground's own rule, not the shared token block above it — which also
    // ends in "\n.ground {" and would be what a naive lookup found.
    const after = CSS.slice(CSS.indexOf('}', CSS.indexOf('.page,\n.ground {')));
    expect(after.slice(after.indexOf('\n.ground {'), after.indexOf('}', after.indexOf('\n.ground {'))))
      .toContain('background: var(--ground)');
  });

  it('is AA for body text and for the orange used as text', () => {
    expect(contrast('#f5f0e8', GROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#b9c3cb', GROUND)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(FLARE, GROUND)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * THE ONE PLACE THE MOCKUP AND WCAG DISAGREE. White on #FF5A12 measures
   * 3.1:1 — fine for a 24px heading, not for a 16px button label. The navy is
   * 5.9:1 on the same orange, so the filled CTA carries the navy as its ink.
   */
  it('puts navy on the orange button, not white', () => {
    expect(contrast('#ffffff', FLARE)).toBeLessThan(4.5);
    expect(contrast(GROUND, FLARE)).toBeGreaterThanOrEqual(4.5);
    expect(ruleFor('.btnPrimary')).toContain('color: #071521');
  });

  it('gives every interactive thing a visible ring and a 44px target', () => {
    expect(CSS).toContain('outline: 2px solid var(--flare)');
    expect(CSS).toContain('a:focus-visible');
    expect(CSS).toContain('button:focus-visible');
    expect(ruleFor('.btn')).toContain('min-height: 48px');
    expect(ruleFor('.cat')).toContain('min-height: 44px');
    expect(ruleFor('.searchField input')).toContain('min-height: 46px');
  });
});

describe('nothing scrolls sideways', () => {
  /* Every grid track is minmax(0, …). A bare `1fr` has an automatic minimum of
     min-content, so one long unbroken word widens the whole grid and with it the
     page — which is exactly how the horizontal scrollbar gets in. */
  it('bounds every grid track', () => {
    const tracks = [...CSS.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(tracks.length).toBeGreaterThan(4);
    for (const track of tracks) expect(track, track).toContain('minmax(0');
  });

  it('clips the document as a backstop, without making it a scroll container', () => {
    // `clip`, not `hidden`: hidden on one axis turns the other into a scroll
    // container, which is the bug this is meant to prevent. x only, because
    // clipping y would kill page scrolling.
    expect(ruleFor('.frame')).toMatch(/overflow-x:\s*clip;/);
    expect(ruleFor('.frame')).not.toContain('hidden');
    expect(ruleFor('.frame')).not.toMatch(/overflow-y:/);
  });

  /**
   * …AND THE BACKSTOP ATE THE GLOW.
   *
   * The guard used to sit on .page, which is 1280px and centred, so it cut at
   * the edge of the TEXT COLUMN — and the hero art is flush against that edge
   * with drop-shadows reaching ~105px past the image. The warm rim came off in
   * a hard vertical line down the right-hand side.
   *
   * The repair is where the clip happens, not how big a margin it is given.
   * (overflow-clip-margin was the first attempt and does not survive contact:
   * it is only applied when the box clips in both directions, content inside
   * the margin counts towards the document width again, and Safari does not
   * implement it.) On a full-bleed box the cut lands at the viewport edge,
   * where there was nothing to see.
   *
   * So: .page must not clip at all, and the box that does must not be the
   * width-limited one.
   */
  it('lets the hero glow out of the column the copy is measured by', () => {
    expect(ruleFor('.page')).not.toMatch(/overflow/);
    expect(ruleFor('.frame')).not.toMatch(/max-width|margin|padding/);
    expect(PAGE).toMatch(/<div className=\{styles\.frame\}>\s*<main className=\{styles\.page\}/);
  });

  it('steps the grids down: four, then two, then one', () => {
    expect(CSS).toContain('@media (max-width: 980px)');
    expect(CSS).toContain('@media (max-width: 760px)');
    expect(CSS).toContain('@media (max-width: 560px)');
    // The category chips are a row that scrolls rather than three rows of wrap.
    const phone = CSS.slice(CSS.indexOf('@media (max-width: 760px)'));
    expect(phone).toContain('overflow-x: auto');
  });

  it('stacks the CTAs on a narrow phone instead of squeezing two onto a line', () => {
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 560px)'));
    expect(narrow).toContain('flex-direction: column');
  });
});

/* ===========================================================================
   7. The hero has depth, and it moves
   ======================================================================== */
describe('the glow and the shimmer', () => {
  const ANIMATIONS = ['ground-drift-a', 'ground-drift-b', 'hero-bloom', 'hero-core'];

  it('runs two layers behind the hero panel and two on the ground', () => {
    for (const name of ANIMATIONS) {
      expect(CSS, name).toContain(`@keyframes ${name}`);
      expect(CSS, `${name} is declared but never used`).toContain(`animation: ${name}`);
    }
  });

  /**
   * Two layers rather than one, at durations with no common factor. One pulsing
   * ellipse is a heartbeat — the eye locks onto the beat and starts watching
   * that instead of the product — and two cycles that share a factor
   * re-synchronise, which reads as a loop.
   */
  it('gives each layer its own period, and no two of them a shared factor', () => {
    const seconds = [...CSS.matchAll(/animation: [a-z-]+ (\d+)s/g)].map((m) => Number(m[1]));
    expect(seconds).toHaveLength(ANIMATIONS.length);
    expect(new Set(seconds).size).toBe(ANIMATIONS.length);
    for (const a of seconds) {
      for (const b of seconds) {
        if (a !== b) expect(Math.max(a, b) % Math.min(a, b), `${a}s and ${b}s`).not.toBe(0);
      }
    }
  });

  /* Transform and opacity are what a compositor can animate without repainting.
     Moving the gradient's own position would re-blur a full-viewport surface on
     every frame, which is the version of this that heats a phone up. */
  it('animates only what composites', () => {
    for (const name of ANIMATIONS) {
      const at = CSS.indexOf(`@keyframes ${name}`);
      const frames = CSS.slice(at, CSS.indexOf('\n}', at));
      // Anywhere in the frame, not at line start: these keyframes are written
      // one per line — `from { transform: …; opacity: …; }`.
      const props = [...frames.matchAll(/\b([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(props.length, name).toBeGreaterThan(0);
      for (const prop of props) expect(['transform', 'opacity'], `${name} animates ${prop}`).toContain(prop);
    }
  });

  /**
   * THE BLOOMS HAVE TO REACH PAST THE PANEL, and this is the only part of that
   * a stylesheet can be silently wrong about.
   *
   * They were authored to sit INSIDE the hero art (inset 10% 4% 16% 8%), which
   * was right for a cut-out with transparency all round it and became two
   * animated gradients rendering underneath an opaque photograph sixty times a
   * second, visible from nowhere. Every side has to be negative or the layer is
   * tucked back under the thing it is supposed to be lighting.
   */
  it('throws the blooms past the edges of the panel they light', () => {
    for (const selector of ['.heroArt::before', '.heroArt::after']) {
      // lastIndexOf, not the shared helper: both of these appear FIRST in the
      // combined `.heroArt::before,\n.heroArt::after {` block that sets content
      // and position, which carries no inset at all. The rule with the inset in
      // it is the standalone one below that.
      const at = CSS.lastIndexOf(`\n${selector} {`);
      expect(at, `no standalone rule for ${selector}`).toBeGreaterThan(-1);
      const inset = /inset:\s*([^;]+);/.exec(CSS.slice(at, CSS.indexOf('}', at)));
      expect(inset, `${selector} has no inset`).not.toBeNull();
      const sides = inset![1].trim().split(/\s+/);
      expect(sides, `${selector} inset`).toHaveLength(4);
      // At least one side reaching out past the panel on each axis; a layer
      // wholly inside it is the bug this is here for.
      const negatives = sides.filter((side) => side.startsWith('-')).length;
      expect(negatives, `${selector} inset ${sides.join(' ')}`).toBeGreaterThanOrEqual(2);
    }
  });
});

/* ===========================================================================
   7b. Nothing on the page moves for anybody who asked it not to
   ======================================================================== */
describe('reduced motion', () => {
  const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  const simReduced = SIM_CSS.slice(SIM_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));

  /* Ambient motion with no trigger — nothing the reader started and nothing
     they can stop. That is the exact case this media query exists for. */
  it('stands the four ambient layers down', () => {
    for (const selector of ['.ground::before', '.ground::after', '.heroArt::before', '.heroArt::after']) {
      expect(reduced, selector).toContain(selector);
    }
    expect(reduced).toContain('animation: none');
  });

  /* Four decorative loops live in the panel — a caret, the thinking dots, a
     bubble arriving, the estimate landing. The component not autoplaying the
     transcript does nothing about any of them. */
  it('stands the panel down too, blink included', () => {
    expect(simReduced).toContain('.caret');
    expect(simReduced).toContain('.thinking i');
    expect(simReduced).toContain('animation: none');
  });

  /* The oversized layers, which is a different question: the drift moves ±4%,
     and a layer that ended at the viewport edge would slide a hard edge into
     view while an oversized one would widen the document if the ground did not
     clip it. */
  it('oversizes the drifting layers and clips them', () => {
    expect(ruleFor('.ground::before,\n.ground::after')).toContain('inset: -25%');
    // Past the shared token block, which also ends in "\n.ground {" and is what
    // a naive lookup finds — the same trap as the palette test above.
    const after = CSS.slice(CSS.indexOf('}', CSS.indexOf('.page,\n.ground {')));
    const own = after.indexOf('\n.ground {');
    expect(after.slice(own, after.indexOf('}', own))).toContain('overflow: hidden');
  });
});
