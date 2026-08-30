import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = stripCss(read('src', 'app', 'globals.css'));
const BUILDER = stripJs(read('src', 'app', 'dashboard', 'jobs', '[id]', 'QuoteBuilder.tsx'));

// Anchored to the start of a line: `.quote-builder-controls select` is also a
// substring of `.quote-builder-row-addon .quote-builder-controls select`, which
// appears first and would be the rule every assertion silently read instead.
const rule = (selector: string) => {
  const at = CSS.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
};

/**
 * The quote line item, on anything narrower than a laptop column.
 *
 * THE FAILURE. The row is three grid columns and only the first could shrink:
 * `minmax(0, 1fr)` for the description, a fixed 8rem for the price, and an
 * `auto` controls column carrying a type select, two reorder arrows and a
 * remove button. Those three fixed things come to roughly 300px before the
 * row's own padding and gaps, so in a ~330px column the description collapsed
 * to a few characters — and on the subscription row, which trades the type
 * select for a RECURRING chip and a frequency select, it collapsed to nothing.
 * A zero-width field is not a cramped input; it is a missing one, and it was
 * the field you name a recurring plan in.
 *
 * Comments stripped first — the fix's own note quotes "minmax(0, 1fr) 8rem
 * auto", so a bare not.toContain matches the explanation of the fix.
 */

describe('a line item restacks before its description runs out of room', () => {
  it('the wide layout is still three columns', () => {
    expect(rule('.quote-builder-row')).toContain('grid-template-columns: var(--qb-cols, minmax(0, 1fr) 8rem auto)');
  });

  /**
   * Keyed on the ROW's own width, not the window's. This builder renders in
   * two places at very different widths — the job page's full column, and Step
   * 2 of the lead page, which is a ~380px rail on a 1440px desktop — so a
   * viewport query would have been wrong on the lead page at every size.
   */
  it('restacks on the width it actually has', () => {
    expect(rule('.quote-builder-rows')).toContain('container-type: inline-size');
    const container = CSS.slice(CSS.indexOf('@container (max-width: 520px)'));
    expect(container.slice(0, container.indexOf('}'))).toContain('--qb-cols: minmax(0, 1fr)');
  });

  /**
   * Container queries are Chrome 105 / Safari 16 / Firefox 110. A browser
   * without them cannot see the lead page's narrow rail, but it can see a
   * phone — which is the case that matters most.
   */
  it('and falls back to the viewport on a browser without container queries', () => {
    const at = CSS.indexOf('@media (max-width: 700px)');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(at, CSS.indexOf('}', at))).toContain('--qb-cols: minmax(0, 1fr)');
  });

  /**
   * A <select> will not shrink below its widest OPTION without this, and
   * "Optional add-on" is the widest — it is what was pushing the description
   * out of the row in the first place.
   */
  it('the type select can give width back', () => {
    const select = rule('.quote-builder-controls select');
    expect(select).toContain('min-width: 0');
    expect(select).toContain('flex: 1 1 auto');
    expect(rule('.quote-builder-controls')).toContain('min-width: 0');
  });

  it('the arrows and the remove button stay together on the right', () => {
    expect(CSS).toMatch(/\.quote-builder-controls \.quote-builder-move\s*\{\s*margin-left:\s*auto;/);
  });

  /**
   * Every row type goes through the same grid, so the subscription row — the
   * one that was worst hit — is fixed by the same rule rather than by a second
   * one that can drift from it.
   */
  it('one row definition covers included, add-on and subscription', () => {
    expect(BUILDER).toContain('className={`quote-builder-row quote-builder-row-${row.kind}`}');
    expect(BUILDER).toContain('className="quote-builder-label"');
    expect(BUILDER).toContain('aria-label="Line item description"');
    // The add-on's second line spans whatever the row's column count is.
    expect(rule('.quote-builder-addon-options')).toContain('grid-column: 1 / -1');
  });

  /**
   * The arithmetic behind 520px: the two fixed columns plus the row's padding
   * and gaps are about 300px, and a description worth typing into wants the
   * ~11rem that leaves. If someone widens the price column or adds a control,
   * this is the number that has to move with it.
   */
  it('the breakpoint leaves a usable description behind it', () => {
    const PRICE_PX = 8 * 16;
    const CONTROLS_PX = 170; // select + two arrows + remove + their gaps
    const CHROME_PX = 0.6 * 16 * 2 + 0.6 * 16 * 2; // padding + gaps
    const DESCRIPTION_MIN_PX = 11 * 16;
    const needed = PRICE_PX + CONTROLS_PX + CHROME_PX + DESCRIPTION_MIN_PX;

    // The row must restack AT OR BEFORE the width where the three columns stop
    // leaving a usable description — never after it, which is the state the
    // screenshot caught.
    const breakpoint = Number(/@container \(max-width: (\d+)px\)/.exec(CSS)?.[1]);
    expect(breakpoint).toBeGreaterThanOrEqual(needed);

    // And the price column is one of the two fixed widths that number is built
    // from, so changing it has to bring the breakpoint with it.
    expect(rule('.quote-builder-row')).toContain('8rem');
  });
});
