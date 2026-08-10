import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * /founder's hero, which is now a face rather than two columns of text.
 *
 * It used to be copy beside a manifesto panel — both of them arguing for the
 * first screen, neither of them the person the eyebrow promises. The panel is
 * still on the page; it moved down, under its own heading.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Comments stripped first — the WHY comments here quote the code they explain
   ("no `order` here", "a figcaption inside it"), so a bare toContain would
   match the explanation instead of the fix. */
const PAGE = stripJs(read('src', 'app', 'founder', 'page.tsx'));
const CSS = stripCss(read('src', 'app', 'founder', 'founder.module.css'));
const RAW_CSS = read('src', 'app', 'founder', 'founder.module.css');

function ruleFor(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  expect(at, `${selector} has no rule`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

/* ===========================================================================
   1. The hero leads with the person
   ======================================================================== */
describe('the hero is portrait-led', () => {
  it('says who is talking before it says anything else', () => {
    expect(PAGE).toContain('<p className="eyebrow">From Brett, the founder</p>');
  });

  it('splits the headline so the second half can carry the accent', () => {
    expect(PAGE).toContain('Contractors don’t need more software. <em>They need better leverage.</em>');
  });

  it('and that accent agrees with the button under it', () => {
    // The rest of the page emphasises in --gold-ink, which survives a theme
    // flip; this hero is dark-only and should match its own primary action.
    expect(ruleFor('.portraitHero .title em')).toContain('color: var(--accent)');
  });

  it('offers one action and one way down the page', () => {
    expect(PAGE).toContain("spec={{ label: 'Start free' }}");
    expect(PAGE).toContain('href="#the-story"');
    // …and the anchor has to land somewhere.
    expect(PAGE).toContain('id="the-story"');
    // Under a fixed header, so the target needs the clearance.
    expect(ruleFor('.storyAnchor')).toContain('scroll-margin-top');
  });
});

/* ===========================================================================
   2. The placeholder, and how cheaply it stops being one
   ======================================================================== */
describe('the portrait placeholder is built to be replaced', () => {
  const slot = ruleFor('.portraitSlot');

  /**
   * The whole point: every rule that shapes the photograph is on the class,
   * not on the <div>. Dropping an <img className={styles.portraitSlot}> in its
   * place inherits the crop, the greyscale and the fade — so the layout cannot
   * shift when the real picture lands.
   */
  it('carries the rules an <img> needs, so the swap cannot move the layout', () => {
    expect(slot).toContain('object-fit: cover');
    expect(slot).toContain('object-position');
    expect(slot).toContain('filter: grayscale(1)');
  });

  /**
   * A mask rather than a gradient overlay: the photograph fades to
   * transparent and the card's own background shows through, so there is no
   * second colour to keep in sync with the hero's background.
   */
  it('melts into the copy with a mask rather than a colour-matched overlay', () => {
    expect(slot).toContain('mask-image: linear-gradient(90deg, transparent 0%, #000 38%)');
    expect(slot).toContain('-webkit-mask-image');
  });

  it('is announced as nothing, because it depicts nothing', () => {
    expect(PAGE).toContain('<div className={styles.portraitSlot} aria-hidden="true" />');
  });

  it('and says so on its face rather than sitting there empty', () => {
    // An empty box in a hero reads as a broken image and invites a "fix".
    expect(PAGE).toContain('Portrait to come');
    expect(ruleFor('.portraitSlotNote')).toContain('position: absolute');
  });

  it('the file no longer claims to contain no image', () => {
    // The header used to say a portrait "would be a claim about a person".
    expect(RAW_CSS).not.toContain('One thing this file deliberately does NOT contain: an image');
    expect(RAW_CSS).toContain('.portraitSlot is a deliberate placeholder');
  });
});

/* ===========================================================================
   3. The two bugs the browser found
   ======================================================================== */
describe('the pull quote sits where it is supposed to', () => {
  /**
   * As a <figcaption> it inherited the frame's fixed aspect-ratio box, so on a
   * phone — where it stops being absolutely positioned — it landed on top of
   * the portrait instead of below it.
   */
  it('is a sibling of the figure, not a caption inside it', () => {
    expect(PAGE).toContain('<blockquote className={styles.portraitQuote}>');
    expect(PAGE).not.toContain('<figcaption className={styles.portraitQuote}>');
    // Which means it positions against the hero, not the frame.
    expect(PAGE.indexOf('</figure>')).toBeLessThan(PAGE.indexOf('className={styles.portraitQuote}'));
  });

  /**
   * An order:2 on the frame alone pushed it past the quote, which has none —
   * putting the pull quote ABOVE the picture it is meant to close.
   */
  it('and nothing reorders the stack away from DOM order on a phone', () => {
    const mobile = CSS.slice(CSS.indexOf('@media (max-width: 860px)'));
    expect(mobile.slice(0, mobile.indexOf('\n}\n'))).not.toContain('order:');
  });

  it('goes static on a phone so it can follow the portrait', () => {
    const mobile = CSS.slice(CSS.indexOf('@media (max-width: 860px)'));
    expect(mobile).toContain('position: static');
  });
});

/* ===========================================================================
   4. Nothing was thrown away to make room
   ======================================================================== */
describe('what the hero displaced is still on the page', () => {
  it('keeps the manifesto quote and all three pledges', () => {
    expect(PAGE).toContain('{MANIFESTO_QUOTE}');
    expect(PAGE).toContain('{PLEDGES.map(');
    expect(PAGE).toContain('id="founder-manifesto-title"');
  });

  it('keeps the monogram, now signing the pledges rather than standing in for a face', () => {
    expect(PAGE).toContain('className={styles.monogram}');
    const monogram = PAGE.indexOf('className={styles.monogram}');
    expect(monogram, 'the monogram is back in the hero').toBeGreaterThan(PAGE.indexOf('id="founder-manifesto-title"'));
  });

  it('and the old hero paragraph opens the story it was always about', () => {
    // LEDE answers "where did this come from" — the question somebody who just
    // pressed "Read the story" is asking, and never the one the hero was.
    expect(PAGE).toContain('{LEDE}');
    expect(PAGE.indexOf('{LEDE}')).toBeGreaterThan(PAGE.indexOf('id="the-story"'));
    expect(PAGE).toContain('{HERO_LEDE}');
  });
});
