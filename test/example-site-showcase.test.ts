import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Lawn & Order example-site band on /features/website-builder.
 *
 * WHY A SOURCE-SHAPE TEST FOR SOMETHING SO VISUAL. Two different kinds of
 * failure live here and neither one shows up in a build:
 *
 *   A CLAIM. Every other panel on that page is a drawn mock of an invented
 *   company. This one points at a real published site, so the words around it
 *   are the only thing keeping it from reading as a customer testimonial we
 *   have no evidence for. The copy is pinned, and so is the absence of the
 *   words that would turn it into one.
 *
 *   AN ASSET PATH. A missing MP4 renders as an empty frame with no error
 *   anywhere — the poster covers it, the page returns 200, and nobody notices
 *   that the thing the section exists to show never plays.
 *
 * WHAT IS DELIBERATELY NOT HERE. Playback, autoplay suppression, viewport
 * pausing, one-video-at-a-time and keyboard behaviour were verified in a real
 * browser instead; this suite runs in `environment: 'node'` with no DOM, so a
 * test of them here could only re-read the source that implements them.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
/** WHY comments quote the strings being asserted, so they have to come out. */
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PAGE = read('src', 'app', 'features', 'website-builder', 'page.tsx');
const PAGE_CODE = strip(PAGE);
const SHOWCASE = read('src', 'components', 'marketing', 'example-site-showcase.tsx');
const SHOWCASE_CODE = strip(SHOWCASE);
const LAYOUT = read('src', 'components', 'marketing', 'feature-detail-layout.tsx');
const LAYOUT_CODE = strip(LAYOUT);
const CSS = read('src', 'components', 'marketing', 'example-site-showcase.module.css').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const MEDIA_DIR = ['public', 'media', 'website-builder', 'lawn-and-order'];

describe('the example-site band sits between the benefits and the steps', () => {
  it('is passed through the layout slot, not as a child', () => {
    // children renders after the four steps, three sections further down, by
    // which point the page has finished arguing.
    expect(PAGE_CODE).toMatch(/afterBenefits=\{\s*<ExampleSiteShowcase/);
  });

  it('the layout renders that slot after the story and before the process', () => {
    const story = LAYOUT_CODE.indexOf('detail-story');
    const slot = LAYOUT_CODE.indexOf('{afterBenefits ?? null}');
    const process = LAYOUT_CODE.indexOf('detail-process');
    expect(story).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(story);
    expect(process).toBeGreaterThan(slot);
  });

  it('leaves the existing afterProof slot alone', () => {
    // The sibling that /features/back-office depends on.
    expect(LAYOUT_CODE).toContain('{afterProof ?? null}');
  });
});

describe('what the section claims', () => {
  it('carries the agreed copy, word for word', () => {
    expect(PAGE_CODE).toContain('Example site created with Let’s Get Quoted');
    expect(PAGE_CODE).toContain('From three answers to a complete contractor website.');
    expect(PAGE_CODE).toContain(
      'See how Lawn & Order brings its services, project gallery, trust signals and instant estimate together in one connected site.',
    );
    expect(PAGE_CODE).toContain('Visit the Lawn & Order example site ↗');
    expect(PAGE_CODE).toContain(
      'Service pages, project galleries, reviews and instant estimates—generated as one connected site.',
    );
  });

  it('calls it an example site and never a customer', () => {
    // The line this section must not cross. It is a real published site, which
    // is exactly why the words around it have to stay this careful: we have no
    // testimonial, no permission to quote anybody, and no traffic figures.
    const words = /\b(testimonial|case study|our customer|verified customer|success story)\b/i;
    expect(PAGE_CODE).not.toMatch(words);
    expect(SHOWCASE_CODE).not.toMatch(words);
  });

  it('makes no performance claim', () => {
    // Percentages, multipliers and lead counts. Nothing on this page can
    // support one, and an invented one is the fastest way to lose the rest.
    const band = PAGE_CODE.slice(PAGE_CODE.indexOf('afterBenefits'), PAGE_CODE.indexOf('storyId='));
    expect(band).not.toMatch(/\d+\s*%/);
    expect(band).not.toMatch(/\b\d+x\b/i);
    expect(band).not.toMatch(/\b(more leads|conversion|increase[sd]?|boost)\b/i);
  });

  it('opens the example in a new tab, without handing it this window', () => {
    expect(SHOWCASE_CODE).toContain("href={SITE_URL}");
    expect(SHOWCASE_CODE).toContain('target="_blank"');
    expect(SHOWCASE_CODE).toContain('rel="noopener noreferrer"');
    expect(SHOWCASE_CODE).toContain("const SITE_URL = 'https://lawnandorder.letsgetquoted.com/'");
    // Said out loud, because "↗" is not read as "opens in a new tab".
    expect(SHOWCASE_CODE).toMatch(/sr-only">\s*\(opens in a new tab\)/);
  });
});

describe('the media that has to exist', () => {
  const assets = [
    ['lawn-and-order-desktop-hero.jpg', 'ffd8ff'],
    ['lawn-and-order-mobile-hero.jpg', 'ffd8ff'],
    ['lawn-and-order-project-gallery.jpg', 'ffd8ff'],
    ['lawn-and-order-desktop-scroll.mp4', ''],
    ['lawn-and-order-mobile-scroll.mp4', ''],
  ] as const;

  it.each(assets)('%s is on disk and not empty', (name) => {
    const size = statSync(join(process.cwd(), ...MEDIA_DIR, name)).size;
    expect(size).toBeGreaterThan(10_000);
  });

  it('the images really are JPEG, which is why they are not named .png', () => {
    // THE SUPPLIED FILES WERE .png HOLDING JPEG BYTES. next.config.mjs sets
    // X-Content-Type-Options: nosniff on /:path*, so a .png extension would
    // have had these served as image/png with a JFIF header inside.
    for (const [name, magic] of assets.filter(([, m]) => m)) {
      const head = readFileSync(join(process.cwd(), ...MEDIA_DIR, name)).subarray(0, 3).toString('hex');
      expect(head, name).toBe(magic);
    }
  });

  it('every path the component names points at one of those files', () => {
    const referenced = [...SHOWCASE.matchAll(/\$\{BASE\}\/([\w.-]+)/g)].map((m) => m[1]);
    const fromPage = [...PAGE.matchAll(/\/media\/website-builder\/lawn-and-order\/([\w.-]+)/g)].map((m) => m[1]);
    const all = [...referenced, ...fromPage];
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const name of all) {
      expect(() => statSync(join(process.cwd(), ...MEDIA_DIR, name)), name).not.toThrow();
    }
  });

  it('declares the captures at their real pixel size', () => {
    // This is what reserves the box before anything loads. A wrong number here
    // is a layout shift, and the aspect-ratio in the CSS has to agree with it.
    expect(SHOWCASE_CODE).toMatch(/width: 1424,\s*\n\s*height: 890,/);
    expect(SHOWCASE_CODE).toMatch(/width: 464,\s*\n\s*height: 968,/);
    expect(CSS).toContain('aspect-ratio: 1424 / 890;');
    expect(CSS).toContain('aspect-ratio: 464 / 968;');
  });

  it('uses the project gallery once, and only here', () => {
    // The brief's rule: the same screenshot must not turn up in two sections.
    const uses = PAGE.split('lawn-and-order-project-gallery').length - 1;
    expect(uses).toBe(1);
  });
});

describe('playback is the visitor’s choice, not ours', () => {
  it('is muted, inline, looping, and asks for metadata only', () => {
    expect(SHOWCASE_CODE).toContain('muted');
    expect(SHOWCASE_CODE).toContain('playsInline');
    expect(SHOWCASE_CODE).toContain('loop');
    expect(SHOWCASE_CODE).toContain('preload="metadata"');
    // Never "auto" — on a section nobody may scroll to, that is the whole file.
    expect(SHOWCASE_CODE).not.toContain('preload="auto"');
  });

  it('holds the source back until the section is approached', () => {
    expect(SHOWCASE_CODE).toContain('src={near ? media.src : undefined}');
    expect(SHOWCASE_CODE).toContain("rootMargin: '400px 0px'");
  });

  it('mounts exactly one video, so only one can ever download', () => {
    // A hidden <video> keeps its src and a browser may keep pulling on it.
    expect(SHOWCASE_CODE).toMatch(/mode === option \? \(/);
    expect(SHOWCASE_CODE.match(/<video/g)?.length).toBe(1);
  });

  it('abandons the old clip on the way out, rather than just pausing it', () => {
    expect(SHOWCASE_CODE).toContain('video.removeAttribute(\'src\')');
    expect(SHOWCASE_CODE).toContain('video.load()');
    expect(SHOWCASE_CODE).toContain('video.currentTime = 0');
  });

  it('will not start itself for reduced motion, reduced data, or Save-Data', () => {
    expect(SHOWCASE_CODE).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(SHOWCASE_CODE).toContain("matchMedia('(prefers-reduced-data: reduce)')");
    expect(SHOWCASE_CODE).toContain('saveData');
    // The server renders the not-allowed state, so hydration cannot disagree.
    expect(SHOWCASE_CODE).toMatch(/useState\(false\);\s*\n\s*useEffect/);
  });

  it('stops when the section is off screen or the tab is hidden', () => {
    expect(SHOWCASE_CODE).toContain('setOnScreen(entry.isIntersecting)');
    expect(SHOWCASE_CODE).toContain("addEventListener('visibilitychange'");
    expect(SHOWCASE_CODE).toContain('const shouldPlay = wantsPlay && near && onScreen;');
  });
});

describe('it can be used without a mouse or without sight', () => {
  it('is a real tablist, with panels the tabs point at', () => {
    expect(SHOWCASE_CODE).toContain('role="tablist"');
    expect(SHOWCASE_CODE).toContain('role="tab"');
    expect(SHOWCASE_CODE).toContain('role="tabpanel"');
    expect(SHOWCASE_CODE).toContain('aria-controls={`${id}-panel-${option}`}');
    expect(SHOWCASE_CODE).toContain('aria-labelledby={`${id}-tab-${option}`}');
    expect(SHOWCASE_CODE).toContain('aria-selected={mode === option}');
  });

  it('gives the group one tab stop and moves within it by arrow', () => {
    expect(SHOWCASE_CODE).toContain('tabIndex={mode === option ? 0 : -1}');
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      expect(SHOWCASE_CODE, key).toContain(key);
    }
    // Selection without focus leaves the ring behind on the tab you left.
    expect(SHOWCASE_CODE).toContain('tabRefs.current[next]?.focus()');
  });

  it('names the video and the play control for a screen reader', () => {
    expect(SHOWCASE_CODE).toContain('aria-label={media.alt}');
    expect(SHOWCASE_CODE).toMatch(/sr-only"> the \{MEDIA\[option\]\.tab\.toLowerCase\(\)\} walkthrough/);
    expect(SHOWCASE_CODE).toContain('aria-label="Choose a screen size for the example site"');
  });

  it('describes the screenshots it shows', () => {
    expect(SHOWCASE_CODE).toContain('Lawn & Order landscaping website with an instant-estimate form.');
    expect(SHOWCASE_CODE).toContain('Mobile version of the Lawn & Order website and instant-estimate form.');
    expect(PAGE_CODE).toContain('Lawn & Order project gallery showing landscaping service examples.');
    // The still under the video is the same picture the video shows, so it is
    // hidden rather than announced twice; the <video> carries the description.
    expect(SHOWCASE_CODE).toMatch(/className=\{styles\.still\}[\s\S]{0,120}alt=""/);
  });

  it('draws its own focus ring, and specifically enough to win', () => {
    // .root :global(*:focus-visible) is (0,2,0) and paints --yellow, which is
    // unreadable on this band's cream. These are (0,3,0).
    expect(CSS).toContain('.band .tab:focus-visible');
    expect(CSS).toContain('.band .visit:focus-visible');
    expect(CSS).toContain('.band .playBtn:focus-visible');
    expect(CSS).toContain('outline: 2px solid #b8430f;');
  });

  it('keeps every control at 44px', () => {
    // Counted, not spot-checked: tab, visit link and play button.
    expect(CSS.match(/min-height: 44px;/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('uses the contrast-checked orange on cream, not the brand one', () => {
    // #ff6a24 on #f5f0e7 is 2.50:1. #b8430f is 4.85:1. Already established in
    // flagship.module.css §95 — this band follows it rather than relitigating.
    expect(CSS).not.toMatch(/color:\s*var\(--orange\)/);
    expect(CSS).not.toMatch(/color:\s*#ff6a24/i);
    expect(CSS).toContain('#b8430f');
  });
});

describe('the frame fills the band without outgrowing the screen', () => {
  it('sizes the column once and shares it', () => {
    // The heading, the switcher, the frame and the still are one centred
    // column. Four separate widths is four chances for them to drift apart —
    // which is exactly what happened when the frame moved and the still, which
    // had its own 980px, stayed behind on the band's left edge.
    expect(CSS).toMatch(/--frame:\s*min\(/);
    expect(CSS.match(/var\(--frame\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('is bounded by the viewport height, not just the band', () => {
    // The stage is locked to 1424:890, so width decides height. Filling a
    // 1712px band makes a 1070px frame — taller than the screen watching it.
    expect(CSS).toMatch(/--frame:[^;]*\dvh/);
  });

  it('never upscales past the capture it is showing', () => {
    // Measured at 2560x1440: the viewport rule alone allowed 1832px of a
    // 1425px screen recording.
    expect(CSS).toMatch(/--frame:[^;]*1425px/);
  });

  it('keeps the still a proof card rather than a second act', () => {
    // It was a 1fr/0.68fr split of the whole media column: a 640px still under
    // a 1123px video, 512px of the band's 1,832px at 1440x900. The image column
    // is now a hard ceiling, and it has to stay one when the card stacks —
    // otherwise a tablet gets 750px of screenshot under a 700px video.
    expect(CSS).toMatch(/grid-template-columns:\s*minmax\(0,\s*300px\)/);
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 900px)'));
    expect(narrow).toMatch(/\.band \.supportImg\s*\{[^}]*max-width:\s*340px/);
  });

  it('scopes the still under .band, or the shell eats both its margins', () => {
    // `.root p, .root figure, ... { margin: 0 }` is (0,1,1) and a bare .support
    // is (0,1,0). This is the third rule in this file to lose that fight.
    expect(CSS).toContain('.band .support');
    // A rule whose selector STARTS with .support — `.band .support {` starts
    // with .band, so it survives this.
    expect(CSS).not.toMatch(/^\s*\.support\s*\{/m);
    // And the media query that stacks it has to be scoped too — a media query
    // adds no specificity, so a bare .support there would lose to the base rule
    // and the figure would never stack.
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 900px)'));
    expect(narrow).toContain('.band .support');
  });
});

describe('the assets stay where they were put', () => {
  it('nothing outside this section references them', () => {
    // The brief's rule: no scattering them through unrelated pages, and no new
    // case-study page. /features has no example-card pattern to hold one.
    const FEATURES_INDEX = read('src', 'app', 'features', 'page.tsx');
    expect(FEATURES_INDEX).not.toContain('lawn-and-order');
    expect(FEATURES_INDEX).not.toContain('ExampleSiteShowcase');
  });

  it('the page is the only place the component is mounted', () => {
    expect(PAGE_CODE).toContain('<ExampleSiteShowcase');
  });
});
