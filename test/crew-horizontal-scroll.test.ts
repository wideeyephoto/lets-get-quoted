import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = stripCss(read('src', 'app', 'dashboard', 'crew', 'crew.module.css'));
const HOURS = stripJs(read('src', 'app', 'dashboard', 'crew', 'HoursAndPay.tsx'));
const ROSTER = stripJs(read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx'));
const LABOR = stripJs(read('src', 'app', 'dashboard', 'crew', 'LaborByJob.tsx'));

const rule = (selector: string, from = 0) => {
  const at = CSS.indexOf(`${selector} {`, from);
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
};

/**
 * Crew & Labor scrolled sideways, and it had two unrelated reasons to.
 *
 * Comments stripped first — the fix's own note quotes "overflow: visible" and
 * ".tableWrap", so a bare not.toContain matches the explanation.
 */

/* ===========================================================================
   1. The list that scrolled sideways because of a 4px nudge
   ---------------------------------------------------------------------------
   Overview's roster showed a horizontal scrollbar at every width, under a list
   with nothing wide in it. `overflow-y: auto` makes the OTHER axis a scroll
   container too, and .ovRowOn translates a width:100% row 4px to the right —
   so the open row ended 4px past its own container. Overview always has a row
   open, which is why it was always there.
   ======================================================================== */
describe('the overview roster cannot scroll sideways', () => {
  const list = rule('.ovList');

  it('closes the axis it never meant to open', () => {
    expect(list).toContain('overflow-y: auto');
    expect(list).toContain('overflow-x: hidden');
  });

  it('and leaves room for the nudge, so nothing is clipped instead', () => {
    // The selection nudge is 4px and the focus ring is 2px at 2px offset, so
    // the right edge needs 8px. 0.55rem is 8.8.
    expect(list).toContain('padding: 0.3rem 0.55rem 0.3rem 0.3rem');
    expect(rule('.ovRowOn')).toContain('transform: translateX(4px)');
    expect(rule('.ovRow:focus-visible')).toContain('outline-offset: 2px');
  });

  /**
   * The nudge is what tells you the click landed. Removing it would have been
   * the other way to fix this, and a worse one.
   */
  it('the nudge itself survives', () => {
    expect(rule('.ovRow:hover')).toContain('translateX(2px)');
  });
});

/* ===========================================================================
   2. The scroll box taken away from tables that never flatten
   ======================================================================== */
describe('below 900px, only the table that flattens loses its scroll box', () => {
  const narrow = CSS.slice(CSS.indexOf('@media (max-width: 900px)'));

  /**
   * `.tableWrap` is shared by five wrappers. The pay table is the only one the
   * same media block turns into cards; the roster, both labor tables
   * (min-width: 44rem) and the entries table stay tables. Taking their scroll
   * box away did not make them fit — it handed a 704px table to a 390px page.
   */
  it('the override is keyed on the pay wrapper, not the shared one', () => {
    expect(narrow).toContain('.payWrap { border: 0; overflow: visible; }');
    expect(narrow).not.toContain('.tableWrap { border: 0; overflow: visible; }');
  });

  it('and the pay wrapper is the only one that carries the class', () => {
    expect(HOURS).toContain('`${styles.tableWrap} ${styles.payWrap}`');
    expect(HOURS).toContain('<table className={styles.payTable}>');
    // The tables that never flatten keep the plain wrapper.
    expect(ROSTER).toContain('<div className={styles.tableWrap}>');
    expect(ROSTER).not.toContain('styles.payWrap');
    expect(LABOR).not.toContain('styles.payWrap');
  });

  it('the wide tables it protects really are wider than a phone', () => {
    expect(rule('.hoursTable')).toContain('min-width: 44rem');
    expect(rule('.payTable')).toContain('min-width: 42rem');
    // Which is fine, because their wrapper still scrolls.
    expect(rule('.tableWrap')).toContain('overflow-x: auto');
  });

  /**
   * An empty rule is a thing a minifier may drop, and dropping it would take
   * the CSS-module mapping with it — `styles.payWrap` would render the string
   * "undefined" as a class name and the media rule would match nothing.
   */
  it('payWrap has a real declaration, so its mapping cannot be optimised away', () => {
    expect(CSS).toContain('.payWrap { overflow-x: auto; }');
  });
});
