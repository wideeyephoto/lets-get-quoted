import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE BUTTON HAS TO BE ON THE FIRST SCREEN.
 *
 * Measured at 360x667 — the smallest phone anybody still carries — the primary
 * CTA fell below the fold on /features/website-builder, /features/client-portal
 * and /features/reviews, and was barely visible on /features/quick-stops. A
 * hero whose entire job is to get somebody to press a button, that you have to
 * scroll to find the button in.
 *
 * There is no layout engine here, so this does the next most useful thing: it
 * adds up the CSS box model the rules declare and fails if the total spends
 * more of 667px than it should. Crude, and it would have caught the bug.
 */

const CSS = readFileSync(join(process.cwd(), 'src', 'components', 'flagship', 'flagship.module.css'), 'utf8');

/** The last declaration of a property for a selector — TWEAKS is appended, so
 *  the last one is the one that wins on equal specificity. */
function lastValue(selector: string, property: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escaped}\\)[^{}]*\\{([^}]*)\\}`, 'g');
  let value: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(CSS))) {
    const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(match[1]);
    if (found) value = found[1].trim();
  }
  return value;
}

/** Every `@media (max-width: 430px)` block, brace-matched. */
function narrowBlocks(): { at: number; body: string }[] {
  const blocks: { at: number; body: string }[] = [];
  const marker = /@media \(max-width: 430px\)/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(CSS))) {
    let depth = 0;
    let index = CSS.indexOf('{', match.index);
    const from = index;
    do {
      if (CSS[index] === '{') depth += 1;
      else if (CSS[index] === '}') depth -= 1;
      index += 1;
    } while (depth > 0 && index < CSS.length);
    blocks.push({ at: match.index, body: CSS.slice(from, index) });
  }
  return blocks;
}

/**
 * The narrow-phone HERO block specifically. There is more than one 430px block
 * in the sheet — an earlier one fixes the header — so this picks by what it
 * contains rather than by being first, which is the mistake that made an
 * earlier version of this test pass against the wrong rules.
 */
const HERO_BLOCK = narrowBlocks().find((block) => block.body.includes('.detail-hero'));
const NARROW = HERO_BLOCK?.body ?? '';

describe('the narrow-phone hero exists and is the one that wins', () => {
  it('has a block for phones under 430px', () => {
    // 430 rather than 390, so the 414–428px phones get it too — a long headline
    // had the same problem there, one line later.
    expect(NARROW.length).toBeGreaterThan(200);
  });

  it('is appended after the base rules, so it does not need !important', () => {
    // Equal specificity — the 900px block also targets .detail-hero — so source
    // order is the whole mechanism.
    expect(HERO_BLOCK!.at).toBeGreaterThan(CSS.indexOf('@media (max-width: 900px)'));
  });
});

describe('what the hero spends of a 667px screen', () => {
  const px = (value: string | null) => (value ? Number(value.replace(/[^0-9.]/g, '')) : NaN);

  it('reserves less than 100px above the eyebrow', () => {
    // 118px was set for a 900px-wide tablet and is header clearance plus air.
    const padding = /\.detail-hero\)\s*\{\s*padding:\s*([^;]+);/.exec(NARROW)?.[1] ?? '';
    const top = px(padding.split(/\s+/)[0]);
    expect(top).toBeLessThan(100);
    expect(top, 'still has to clear the fixed header').toBeGreaterThan(70);
  });

  it('sets a headline that fits about six words a line, not four', () => {
    const size = /\.detail-hero h1\)[^{}]*\{[^}]*font-size:\s*(\d+)px/.exec(NARROW)?.[1];
    expect(Number(size)).toBeLessThanOrEqual(40);
    expect(Number(size), 'still a hero headline').toBeGreaterThanOrEqual(32);
  });

  it('adds up to leave room for the buttons', () => {
    // The generous reading of each part, summed. Anything over ~520px and a
    // two-line headline puts a 48px button off the bottom of 667.
    const paddingTop = px((/\.detail-hero\)\s*\{\s*padding:\s*([^;]+);/.exec(NARROW)?.[1] ?? '').split(/\s+/)[0]);
    const h1 = Number(/\.detail-hero h1\)[^{}]*\{[^}]*font-size:\s*(\d+)px/.exec(NARROW)?.[1]);
    const headlineThreeLines = h1 * 1.02 * 3;
    const ledeFourLines = 15 * 1.6 * 4;
    const margins = 16 + 20 + 10 + 34; // lede margins, back link, eyebrow
    const budget = paddingTop + headlineThreeLines + ledeFourLines + margins;
    expect(budget + 48, `hero + button = ${Math.round(budget + 48)}px of 667`).toBeLessThan(667);
  });

  it('stacks the two buttons full width rather than truncating them', () => {
    // "Open the live calendar" does not fit in a 165px half-width button, and a
    // truncated button is a button nobody presses.
    expect(NARROW).toMatch(/\.hero-actions \.button\)[^{}]*\{[^}]*width: 100%/);
  });
});

describe('prose is not set at caption size', () => {
  const PROSE = ['.trade-grid p', '.pricing-faq article p', '.founder-chapters p', '.process-steps p', '.suite-grid p', '.stage-list li'];

  it.each(PROSE)('%s is at least 13px', (selector) => {
    expect(Number((lastValue(selector, 'font-size') ?? '0').replace('px', ''))).toBeGreaterThanOrEqual(13);
  });

  it('leaves the glanced-at labels alone', () => {
    // Chips and initials are read at a glance, not sentence by sentence, and
    // inflating them would break the layouts they sit in.
    const avatar = lastValue('.contact-avatar', 'font-size');
    expect(avatar).toBe('10px');
  });
});

describe('a footer link is something you can hit', () => {
  it('clears the 24px minimum target', () => {
    // Measured 19–21px high, on the only navigation at the foot of every page.
    expect(Number((lastValue('.footer-links a', 'min-height') ?? '0').replace('px', ''))).toBeGreaterThanOrEqual(24);
  });

  it('grows by padding rather than by pushing the row apart', () => {
    expect(lastValue('.footer-links a', 'padding-block')).toBe('4px');
    expect(lastValue('.footer-links a', 'display')).toBe('inline-flex');
  });
});
