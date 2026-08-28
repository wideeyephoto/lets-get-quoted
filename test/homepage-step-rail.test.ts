import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The homepage's 1-2-3 rail hangs DOWN from its anchor, not across it.
 *
 * THE BUG THIS GUARDS. `.step-rail` is a zero-height sticky element and its
 * list is absolutely positioned off it. The list used to be centred on that
 * anchor with translateY(-50%), which meant half of it — 103px — sat above the
 * top of .steps-column. Sticky only decides where an element STOPS; before it
 * pins, it rides at its normal position. So for the whole approach to the
 * section the top half of the rail was over the intro copy: measured at
 * 1440x900, 27px of the "01" node on "Let it capture job details, prioritize
 * leads, and help fill gaps in your schedule.", at every scroll position until
 * the rail pinned.
 *
 * THE FIX HAS TO KEEP THE PINNED POSITION IDENTICAL, which is the part a
 * careless edit would break. Centring moved out of the list and into the
 * offset: top is 50vh minus half the list's height, so the list's centre still
 * lands on 50vh once pinned, while the list itself now starts at the column top
 * and grows downwards. Both halves are asserted below, because either one alone
 * is a regression — dropping the transform without the offset moves the pinned
 * rail 103px down the screen.
 *
 * WHY IT READS THE GENERATOR. flagship.module.css is generated output;
 * scripts/generate-flagship-css.mjs is the file a person edits. Asserting
 * against the CSS would pass on a stale build and hide an unrun generator.
 */

const GEN = readFileSync('scripts/generate-flagship-css.mjs', 'utf8').replace(/\r\n/g, '\n');
const CSS = readFileSync('src/components/flagship/flagship.module.css', 'utf8').replace(/\r\n/g, '\n');

/** The generator with its comments removed — they quote the rules below. */
const GEN_CODE = GEN.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the step rail clears the section intro', () => {
  it('anchors its list at the top, not across the middle', () => {
    const ol = GEN_CODE.slice(GEN_CODE.indexOf('.root :global(.step-rail ol)'));
    const block = ol.slice(0, ol.indexOf('}'));
    expect(block).toContain('top: 0;');
    // The line that put half the rail above .steps-column.
    expect(block).not.toContain('translateY(-50%)');
  });

  it('takes the centring out of the offset instead, so the pin does not move', () => {
    expect(GEN_CODE).toContain('top: calc(50vh - var(--rail-half));');
  });

  it('sets a half-height that matches the nodes and gaps at each width', () => {
    // Desktop: 3 x 46px node + 2 x 34px gap = 206, half 103.
    // <=1100px: 3 x 44px node + 2 x 22px gap = 176, half 88.
    expect(GEN_CODE).toContain('--rail-half: 103px;');
    expect(GEN_CODE).toContain('--rail-half: 88px;');
    expect(GEN_CODE).toMatch(/\.step-rail button\)\s*\{[^}]*width: 46px;\s*\n\s*height: 46px;/);
    expect(GEN_CODE).toMatch(/gap: 34px;/);
    expect(GEN_CODE).toMatch(/\.step-rail button\)\s*\{ width: 44px; height: 44px;/);
    expect(GEN_CODE).toMatch(/gap: 22px;/);
  });

  it('is still sticky and still takes no room in the column', () => {
    // Both were themselves fixes: static rails scroll past a phone reader once,
    // and a rail with height would push the first feature card down.
    const rail = GEN_CODE.slice(GEN_CODE.indexOf('.root :global(.step-rail) {'));
    const block = rail.slice(0, rail.indexOf('}'));
    expect(block).toContain('position: sticky;');
    expect(block).toContain('height: 0;');
  });

  it('the generated stylesheet is in step with the generator', () => {
    // Catches the edit that never ran `node scripts/generate-flagship-css.mjs`.
    expect(CSS).toContain('top: calc(50vh - var(--rail-half));');
    expect(CSS).toContain('--rail-half: 103px;');
    expect(CSS).toContain('--rail-half: 88px;');
    expect(CSS).not.toMatch(/\.step-rail ol\)[^}]*translateY\(-50%\)/);
  });
});
