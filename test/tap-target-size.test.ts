import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A CONTROL SMALLER THAN A FINGERTIP HAS TO SAY WHERE THE REST OF IT IS.
 *
 * The audit reported 14x14 and 20x20 hit areas. Both were measurements of the
 * wrong thing, and the way they were wrong is worth writing down because it is
 * the same shape as the eighty unlabelled selects in 6fe6f462 — a plausible
 * number produced by reading a proxy instead of the thing itself.
 *
 *   14x14 is .infotip-btn's width and height. It has carried
 *   `::after { position:absolute; inset:-0.6rem }` the whole time, and a tap
 *   lands on it across 35x34 — measured by hit-testing with
 *   document.elementFromPoint, which resolves a pseudo-element to the element
 *   that owns it. Reading the box could never have seen that.
 *
 *   20x20 is the SMS consent checkbox. It sits inside a <label> that wraps it,
 *   so the target is the label's row: 66px tall, and a press anywhere along it
 *   toggles the box. The 20px square is the paint, not the target.
 *
 * One was real: .ins-kpi-info, six per Insights page, 17x17 by the box AND
 * 17x17 by hit-test, with no expansion of any kind. It now answers across
 * 35x35 with the ring still drawn at 17.
 *
 * Everything else in the dashboard measuring under 24px in one dimension is
 * wide text — links in prose, a search field 21px tall — and every one of them
 * clears the spacing exception in WCAG 2.5.8: the nearest other target's centre
 * is 63px to 1605px away, never the 24px that criterion asks for.
 *
 * So the rule this guards is not "no small controls". It is: a control that is
 * DRAWN small must expand its hit area, because that is the pattern this
 * codebase already uses and the one an audit reading widths cannot see.
 *
 * Re-measure with `node scripts/tap-target-audit.mjs`.
 */

const SHEETS = ['src/app/globals.css', 'src/app/globals-lite.css'];
const MIN = 24;

type Rule = { selector: string; body: string };

/** Split a stylesheet into top-level-ish rules. Good enough: every rule here is
 *  `selector { declarations }` and declarations never contain a brace. */
function rules(css: string): Rule[] {
  // Comments first. Every WHY note in this sheet sits directly above the rule
  // it explains, and without this the note becomes part of the next selector —
  // which is how the first run of this test failed to find .ins-kpi-info at all.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  }
  return out;
}

const px = (body: string, prop: string): number | null => {
  const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(body);
  return m ? Number(m[1]) : null;
};

/**
 * A rule that draws a control, rather than an icon inside one. Both markers are
 * how this codebase actually writes them: the small controls all declare a
 * cursor, and the icons inside them (`.infotip-btn svg`) never do.
 */
const isControl = (r: Rule) =>
  /cursor:\s*(pointer|help)/.test(r.body) &&
  !/\bsvg\b|::(before|after)|:hover|:focus/.test(r.selector) &&
  // A checkbox or radio is not its own target — its label is, whether the
  // label wraps it (.checkbox-chip) or points at it with htmlFor
  // (.welcome-accept). Measured on the consent box that the audit reported as
  // 20x20: the input is 20x20 and the label around it is 640x66, and a press
  // anywhere along that row toggles it. Sizing the square would be sizing the
  // paint.
  !/\binput\b/.test(r.selector);

/**
 * .template-deck-dot, 8x8, in a row with `gap: 0.5rem` — 8px between them. No
 * hit area can reach 24px here without overlapping the dot next door, and a
 * tap landing in the overlap goes to whichever paints last, which is worse
 * than a small target that goes where it is aimed. Reaching 24 means changing
 * the spacing, which is a visual decision about a slider.
 *
 * It is also not rendered: nothing in src/ imports template-slider.tsx, the
 * same as map-section.tsx. Left alone on both counts. Delete this entry with
 * the fix, or with the component.
 */
const KNOWN_SMALL = ['.template-deck-dot'];

function undersizedWithoutExpansion(): string[] {
  const bad: string[] = [];
  for (const file of SHEETS) {
    const css = readFileSync(file, 'utf8');
    const all = rules(css);
    for (const r of all) {
      if (!isControl(r)) continue;
      const w = px(r.body, 'width');
      const h = px(r.body, 'height');
      if (w === null || h === null) continue;
      if (w >= MIN && h >= MIN) continue;

      // Does anything grow its hit area? An absolutely positioned ::after or
      // ::before pulled outward with a negative inset/offset is the pattern.
      const grown = all.some(
        (o) =>
          o.selector.startsWith(`${r.selector}::`) &&
          /position:\s*absolute/.test(o.body) &&
          /(inset|top|left|right|bottom):\s*-/.test(o.body),
      );
      if (grown) continue;
      if (KNOWN_SMALL.includes(r.selector)) continue;
      bad.push(`${file}  ${r.selector}  ${w}x${h}`);
    }
  }
  return bad;
}

describe('a control drawn smaller than 24px', () => {
  it('is scanning real stylesheets (a silent zero would pass)', () => {
    const counted = SHEETS.flatMap((f) => rules(readFileSync(f, 'utf8'))).filter(isControl);
    expect(counted.length).toBeGreaterThan(50);
  });

  it('expands its hit area', () => {
    expect(undersizedWithoutExpansion()).toEqual([]);
  });

  it('still knows the one that is outstanding', () => {
    // So changing the slider's spacing fails here and takes the note with it,
    // rather than the allowance quietly outliving the reason for it.
    const all = SHEETS.flatMap((f) => rules(readFileSync(f, 'utf8')));
    for (const sel of KNOWN_SMALL) {
      const r = all.find((x) => x.selector === sel);
      expect(r, `${sel} rule not found`).toBeDefined();
      expect(px(r!.body, 'width')).toBeLessThan(MIN);
    }
  });

  it('still recognises the ones that already do it', () => {
    // If the parser stops finding these, the test above is passing because it
    // sees nothing rather than because everything is fine.
    const css = readFileSync('src/app/globals.css', 'utf8');
    const all = rules(css);
    for (const sel of ['.infotip-btn', '.ins-kpi-info', '.photo-thumb-remove', '.client-schedule-remove-button']) {
      const base = all.find((r) => r.selector === sel);
      expect(base, `${sel} rule not found`).toBeDefined();
      expect(px(base!.body, 'width')).toBeLessThan(MIN);
      expect(all.some((r) => r.selector === `${sel}::after` && /inset:\s*-/.test(r.body))).toBe(true);
    }
  });
});
