import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The /features/back-office hero shows two real screens.
 *
 * Node environment, no DOM, so this reads the source as text — and the
 * comments in both files quote the class names and behaviours being asserted,
 * so they are stripped first.
 */

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const stripJs = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PAGE = stripJs(read('src/app/features/back-office/page.tsx'));
const SLIDER = stripJs(read('src/components/marketing/shot-slider.tsx'));
const CSS = read('src/components/flagship/flagship.module.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the hero shots', () => {
  it('ships every file the page asks for', () => {
    const srcs = [...PAGE.matchAll(/src: '(\/features\/[^']+)'/g)].map((m) => m[1]);
    expect(srcs.length).toBe(3); // two shots, one of them with a phone capture
    for (const src of srcs) {
      expect(existsSync(`public${src}`), `missing asset: public${src}`).toBe(true);
    }
  });

  it('declares each file\'s real dimensions', () => {
    // The frame is sized by aspect ratio, but a wrong intrinsic size still
    // costs a layout pass and misreports the image to the browser.
    for (const [src, w, h] of [
      ['/features/back-office-quote.jpg', 900, 551],
      ['/features/back-office-insights.png', 1000, 684],
      ['/features/back-office-quote-mobile.jpg', 426, 700],
    ] as const) {
      const at = PAGE.indexOf(src);
      expect(at, src).toBeGreaterThan(-1);
      const near = PAGE.slice(at, at + 220);
      expect(near, src).toContain(`${w}`);
      expect(near, src).toContain(`${h}`);
    }
  });

  it('describes what is on each screen rather than naming the file', () => {
    // HERO_SHOTS only. The page's Open Graph block carries an `alt` too, and it
    // describes the social card rather than a screen in the slider.
    const shots = PAGE.slice(PAGE.indexOf('const HERO_SHOTS'), PAGE.indexOf('];', PAGE.indexOf('const HERO_SHOTS')));
    const alts = [...shots.matchAll(/alt:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(alts.length).toBe(2);
    for (const alt of alts) {
      expect(alt.length).toBeGreaterThan(80);
      expect(alt).not.toMatch(/screenshot of|image of|\.jpg|\.png/i);
    }
  });

  it('serves the phone capture of the quote builder below 700px', () => {
    // A desktop capture in a 358px column renders the line items about four
    // pixels tall. Art direction, so a <picture> and not a srcset.
    expect(PAGE).toContain("mobile: { src: '/features/back-office-quote-mobile.jpg'");
    expect(SLIDER).toContain('<source media="(max-width: 700px)"');
    expect(CSS).toMatch(/\.shot-frame\)\s*\{\s*aspect-ratio: 3 \/ 4/);
  });
});

describe('the slider itself', () => {
  it('contains rather than crops, so the monitor render keeps its corners', () => {
    const at = CSS.indexOf('.shot-img) {');
    expect(at).toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf('}', at));
    expect(rule).toContain('object-fit: contain');
    expect(rule).not.toContain('object-fit: cover');
  });

  it('stops rotating when nobody is looking at it', () => {
    expect(SLIDER).toContain('IntersectionObserver');
    expect(SLIDER).toContain('visibilitychange');
    expect(SLIDER).toContain("matchMedia('(prefers-reduced-motion:reduce)')");
  });

  it('stops rotating the moment the reader takes over', () => {
    expect(SLIDER).toContain('onMouseEnter={() => setPaused(true)}');
    expect(SLIDER.match(/setPaused\(true\)/g)?.length).toBe(4); // hover, both arrows, a dot
  });

  it('is a tablist whose dots keep a 44px target', () => {
    expect(SLIDER).toContain('role="tablist"');
    expect(SLIDER).toContain('role="tab"');
    expect(SLIDER).toContain('aria-selected={i === index}');
    // The dot is drawn inside the button; the button is the target.
    expect(CSS).toMatch(/\.shot-tabs button\)\s*\{[^}]*width: 44px[^}]*height: 44px/);
  });

  it('does not eagerly fetch a shot nobody has scrolled to', () => {
    expect(SLIDER).toContain("loading={i === 0 ? 'eager' : 'lazy'}");
    expect(SLIDER).toContain("fetchPriority={i === 0 ? 'high' : 'low'}");
  });

  it('leaves the dot filled rather than mid-count when the timer is not running', () => {
    // A half-filled timer that is not counting is a lie about what is about to
    // happen — so hover and reduced-motion both fill it.
    const hover = CSS.slice(CSS.indexOf('.shot-slider:hover .shot-tabs'));
    expect(hover.slice(0, hover.indexOf('}'))).toContain('animation: none');
    const reduced = CSS.slice(
      CSS.indexOf('@media (prefers-reduced-motion: reduce)', CSS.indexOf('.shot-tabs')),
    );
    expect(reduced.slice(0, 400)).toContain('.shot-tabs button[data-on="true"] i s');
  });
});

describe('the drawing the slider replaced', () => {
  it('is still on the page, where its argument is made', () => {
    // It is the only thing that shows all five bands of one record at once,
    // which is what the capability list then itemises.
    expect(PAGE).toContain('<JobRecordExample />');
    expect(PAGE).toContain('back-office-record');
    const record = PAGE.indexOf('id="back-office-record"');
    const capabilities = PAGE.indexOf('id="back-office-capabilities"');
    expect(record).toBeGreaterThan(-1);
    expect(record).toBeLessThan(capabilities);
  });

  it('keeps the marker saying the job is invented', () => {
    expect(PAGE).toContain('An invented job with invented figures');
  });
});
