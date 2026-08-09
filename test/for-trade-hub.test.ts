import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TRADES } from '@/lib/trades';
import { TRADE_CATEGORIES } from '@/lib/trade-categories';

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
const CSS = stripCss(read('src', 'app', 'for', 'for.module.css'));
const LAYOUT = read('src', 'app', 'for', 'layout.tsx');

/** The block for one selector, from its opening brace to the first closing one. */
const ruleFor = (selector: string) => {
  const at = CSS.indexOf(`\n${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
};

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

  it('points at every one of the 49 trade URLs', () => {
    expect(FINDER).toContain('href={`/for/${entry.trade.slug}`}');
    const filed = TRADE_CATEGORIES.flatMap((category) => category.slugs);
    expect(new Set(filed).size).toBe(TRADES.length);
    expect(TRADES).toHaveLength(49);
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
    expect(PAGE).toContain('<h1>Websites and quoting software built for your trade.</h1>');
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

  /* The root layout appends "· Let's Get Quoted" to every title. This one
     already carries the brand, so without `absolute` the tab reads
     "… | Let's Get Quoted · Let's Get Quoted". */
  it('sets the title absolutely, so the brand is not said twice', () => {
    expect(PAGE).toContain(
      "title: { absolute: 'Contractor Website & Quoting Software by Trade | Let’s Get Quoted' }",
    );
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
  const master = join(process.cwd(), 'assets', 'for-hero', 'hero-quote-devices.png');
  const shipped = join(process.cwd(), 'public', 'for', 'hero-quote-devices.webp');

  it('ships a WebP derivative and keeps the PNG master', () => {
    expect(existsSync(master), 'assets/for-hero/hero-quote-devices.png').toBe(true);
    expect(existsSync(shipped), 'public/for/hero-quote-devices.webp').toBe(true);
    // The derivative is the point of having one.
    expect(statSync(shipped).size).toBeLessThan(statSync(master).size);
  });

  /* The intrinsic size is the trimmed master's, printed by
     scripts/build-for-hero.mjs. If it stops matching, Next reserves the wrong
     box and the hero shifts as the image lands — which is the layout shift this
     rebuild is not allowed to introduce. */
  it('declares the size it actually is, so nothing shifts on load', () => {
    expect(PAGE).toContain('width={956}');
    expect(PAGE).toContain('height={642}');
  });

  it('loads eagerly and at high priority — it is the LCP element', () => {
    const img = PAGE.slice(PAGE.indexOf('<Image'), PAGE.indexOf('/>', PAGE.indexOf('<Image')));
    expect(img).toContain('priority');
    expect(img).not.toContain("loading=\"lazy\"");
    expect(img).toContain('sizes=');
  });

  it('says what it shows', () => {
    expect(PAGE).toContain(
      'alt="Let’s Get Quoted quote builder displayed on a laptop and phone."',
    );
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
    expect(strip).toContain("'No monthly subscription'");
    expect(strip).toContain("'Stripe-powered payments'");
  });

  /* Read off TRADES rather than typed, so adding a trade cannot leave the page
     advertising the old number. */
  it('counts the trades rather than claiming a number', () => {
    expect(strip).not.toContain('49 trades supported');
    expect(TRADES.length).toBe(49);
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
  it('says what "you only pay when you get paid" costs, and links the breakdown', () => {
    expect(PAGE).toContain('{HIGHEST_FEE}');
    expect(PAGE).toContain('{LOWEST_FEE}');
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

  it('clips the page as a backstop, without making it a scroll container', () => {
    // `clip`, not `hidden`: hidden on one axis turns the other into a scroll
    // container, which is the bug this is meant to prevent.
    expect(ruleFor('.page')).toContain('overflow-x: clip');
    expect(ruleFor('.page')).not.toContain('overflow-x: hidden');
  });

  /**
   * …AND THE BACKSTOP ATE THE GLOW.
   *
   * The hero art sits flush against the right edge of the page box and its
   * drop-shadows reach ~70px past the image, so `clip` — cutting at the padding
   * box — sliced the warm rim off in a hard vertical line down the right-hand
   * side. overflow-clip-margin extends the PAINT region and leaves the clip on
   * layout alone, so a 400-character word still cannot widen the document.
   */
  it('lets the hero glow paint past the clip without letting layout through', () => {
    const page = ruleFor('.page');
    expect(page).toContain('overflow-clip-margin: 5rem');
    // The margin only means anything while the overflow is `clip`.
    expect(page).toContain('overflow-x: clip');
    // Room for the widest shadow the image casts, with headroom.
    const reach = Math.max(
      ...[...ruleFor('.heroShot').matchAll(/drop-shadow\(0 \d+px (\d+)px/g)].map((m) => Number(m[1])),
    );
    expect(reach).toBeGreaterThan(0);
    expect(5 * 16).toBeGreaterThanOrEqual(reach);
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

  it('runs two layers behind the devices and two on the ground', () => {
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
    expect(seconds).toHaveLength(4);
    expect(new Set(seconds).size).toBe(4);
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

  /* Ambient motion with no trigger — nothing the reader started and nothing
     they can stop. */
  it('stops every one of them for anyone who asked for less motion', () => {
    const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const selector of ['.ground::before', '.ground::after', '.heroArt::before', '.heroArt::after']) {
      expect(reduced, selector).toContain(selector);
    }
    expect(reduced).toContain('animation: none');
  });

  /**
   * drop-shadow, never box-shadow. The hero is a cut-out on transparency, and
   * box-shadow traces the image's RECTANGLE — a hard-edged slab behind two
   * devices that have no rectangle. drop-shadow follows the alpha.
   */
  it('shadows the silhouette rather than the image box', () => {
    const shot = ruleFor('.heroShot');
    expect(shot).toContain('drop-shadow(');
    expect(shot).not.toContain('box-shadow');
    // Contact, mid, ambient, and the warm rim at no offset.
    expect((shot.match(/drop-shadow\(/g) ?? []).length).toBe(4);
    expect(shot).toContain('drop-shadow(0 0 34px rgba(255, 90, 18, 0.24))');
  });

  /* The drift moves ±4%; a layer that ended at the viewport edge would slide a
     hard edge into view, and an oversized one would widen the document if the
     ground did not clip it. */
  it('oversizes the drifting layers and clips them', () => {
    expect(ruleFor('.ground::before,\n.ground::after')).toContain('inset: -25%');
    // Past the shared token block, which also ends in "\n.ground {" and is what
    // a naive lookup finds — the same trap as the palette test above.
    const after = CSS.slice(CSS.indexOf('}', CSS.indexOf('.page,\n.ground {')));
    const own = after.indexOf('\n.ground {');
    expect(after.slice(own, after.indexOf('}', own))).toContain('overflow: hidden');
  });
});
