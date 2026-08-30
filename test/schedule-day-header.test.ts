import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WHICH DAY IS THIS COLUMN?
 *
 * The header's whole job, and it used to be the third thing the eye found:
 * "MON 10" sat on one baseline at 0.66rem and 1rem — near enough the same size
 * to read as one string — while the Closed pill was thrown to the far end of
 * the row by margin-left:auto with more colour than either of them.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = stripCss(read('src', 'app', 'globals.css'));
const TIMELINE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleTimeline.tsx'));

/**
 * A rule's body, found by its selector at the start of a line so a grouped
 * selector elsewhere (".sched-tl-body {" appears inside one) cannot match
 * first and hand back somebody else's declarations.
 */
function ruleFor(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  expect(at, `${selector} has no rule`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

const px = (rule: string, prop: string) => Number(new RegExp(`${prop}:\\s*([\\d.]+)px`).exec(rule)?.[1]);
const rem = (rule: string, prop: string) => Number(new RegExp(`${prop}:\\s*([\\d.]+)rem`).exec(rule)?.[1]);

/* ===========================================================================
   1. The number is the headline
   ======================================================================== */
describe('the date is the biggest thing in its own header', () => {
  const head = ruleFor('.sched-tl-day-head');
  const name = ruleFor('.sched-tl-day-head small');
  const number = ruleFor('.sched-tl-day-head strong');

  it('stacks the weekday over the date instead of sharing a baseline', () => {
    expect(head).toContain('flex-direction: column');
    expect(head).toContain('align-items: flex-start');
    // baseline alignment only means anything in a row, and it is what put the
    // weekday and the date on one line in the first place.
    expect(head).not.toContain('align-items: baseline');
  });

  it('and the date is at least twice the weekday, which is what makes it read first', () => {
    expect(rem(number, 'font-size') / rem(name, 'font-size')).toBeGreaterThanOrEqual(2);
    expect(Number(/font-weight:\s*(\d+)/.exec(number)?.[1])).toBeGreaterThanOrEqual(
      Number(/font-weight:\s*(\d+)/.exec(name)?.[1]),
    );
  });

  it('gives the stack room to be a stack', () => {
    // Three lines of type at these sizes need somewhere to go; without a floor
    // the columns with no badge would also sit shorter than the ones with one.
    expect(px(head, 'min-height')).toBeGreaterThanOrEqual(52);
  });

  it('sets the date in tabular figures so a row of dates lines up', () => {
    expect(number).toContain('font-variant-numeric: tabular-nums');
  });

  /**
   * In a row, margin-left:auto pushed the badge to the far end. In a column it
   * pushes it to the right EDGE, which would leave the badge floating away
   * from the left-aligned stack it belongs to.
   */
  it('drops the auto margins the old row layout depended on', () => {
    expect(ruleFor('.sched-tl-head-count')).toContain('margin-left: 0');
    expect(ruleFor('.sched-tl-head-flag')).toContain('margin-left: 0');
  });
});

/* ===========================================================================
   2. Today, without relying on hue
   ======================================================================== */
describe('today is marked by more than its colour', () => {
  const today = ruleFor('.sched-tl-day-head.today');

  /**
   * Orange text alone asks the reader to compare five numbers and pick the odd
   * one out — and asks a red-green colourblind reader to tell an orange from a
   * grey at 0.66rem. Two extra channels: a fill, and a bar in a fixed place.
   */
  it('carries a fill and an inset bar, not just accent text', () => {
    expect(today).toMatch(/background:\s*rgba\(/);
    expect(today).toMatch(/box-shadow:\s*inset 0 -\dpx 0 var\(--accent\)/);
  });

  it('and the bar is thick enough to be a marker rather than a border', () => {
    expect(Number(/inset 0 -(\d)px/.exec(today)?.[1])).toBeGreaterThanOrEqual(3);
  });

  it('stays looking like today while the pointer is on it', () => {
    // The plain hover fill would otherwise replace the accent wash for as long
    // as somebody hovered the column.
    expect(CSS).toContain('.sched-tl-day-head.today:hover');
  });
});

/* ===========================================================================
   3. The badge annotates the day; it does not compete with it
   ======================================================================== */
describe('only the flags that are news are drawn as flags', () => {
  it('a routine closed day loses its pill', () => {
    const blocked = ruleFor('.sched-tl-head-flag.blocked');
    expect(blocked).toContain('background: none');
    expect(blocked).toContain('padding: 0');
  });

  /**
   * The other two states are exceptions and keep their fill: a full day, and
   * work sitting on a day the owner is closed. Flattening all three would have
   * been the opposite mistake.
   */
  it('but a full day and work-on-a-closed-day keep theirs', () => {
    expect(ruleFor('.sched-tl-head-flag.full')).toMatch(/background:\s*rgba\(255/);
    const withWork = ruleFor('.sched-tl-head-flag.blocked[data-with-work]');
    expect(withWork).toMatch(/background:\s*rgba\(255/);
    // .blocked zeroed the padding above; this state has to take it back or it
    // is a fill with no pill around it.
    expect(withWork).toMatch(/padding:\s*[\d.]+rem/);
  });

  it('and the bare job count says what it counts', () => {
    // Stacked under a 1.4rem "11", a lone "3" reads as a second date.
    expect(TIMELINE).toContain("{dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}");
  });
});

/* ===========================================================================
   4. Sticky, and the thing that used to prevent it
   ======================================================================== */
describe('the header survives a scroll of the page', () => {
  it('is sticky to the top', () => {
    const head = ruleFor('.sched-tl-head');
    expect(head).toContain('position: sticky');
    expect(head).toContain('top: 0');
  });

  /**
   * THE LOAD-BEARING HALF. overflow:hidden makes a box a scroll container, and
   * a sticky child sticks to its nearest scrolling ancestor — so with hidden
   * here the head stuck to a box that never scrolls, which is exactly why the
   * old comment said it could not be done. clip clips identically without
   * establishing a scrollport.
   */
  it('because the frame clips without becoming a scroll container', () => {
    const frame = ruleFor('.sched-tl');
    expect(frame).toContain('overflow: clip');
    expect(frame).not.toContain('overflow: hidden');
  });

  it('and is opaque, because rows now genuinely pass under it', () => {
    // The old 3% tint over the card was fine when nothing moved beneath it.
    const head = ruleFor('.sched-tl-head');
    expect(head).toMatch(/background:\s*var\(--bg-\d\)/);
    expect(head).not.toMatch(/background:\s*rgba\(var\(--tint\), 0\.03\)/);
  });

  it('sits above the blocks it covers', () => {
    expect(Number(/z-index:\s*(\d+)/.exec(ruleFor('.sched-tl-head'))?.[1])).toBeGreaterThanOrEqual(3);
  });

  /**
   * The one scroll position this component sets is on the inner container, not
   * on the frame — which is what makes the overflow change above safe.
   */
  it('and nothing scrolls the frame programmatically', () => {
    expect(TIMELINE).toContain('node.scrollTop = Math.max(0, target);');
    expect(TIMELINE).toContain('const node = scrollRef.current;');
  });
});

/* ===========================================================================
   5. The narrow band that still shows seven columns
   ---------------------------------------------------------------------------
   Below 640 the mobile agenda replaces this component entirely, so "mobile"
   for the timeline means the 640–900 window: a small tablet, or a phone in
   landscape.
   ======================================================================== */
describe('seven columns at tablet width', () => {
  /**
   * Found by scanning BACK from the declaration to its enclosing @media, not
   * by looking the query up. This stylesheet is 29,000 lines and holds several
   * `@media (max-width: 900px)` blocks; indexOf returns the first one, which
   * belongs to somebody else entirely and quietly tests nothing.
   */
  function mediaAround(needle: RegExp | string): { query: string; upTo: string } {
    const at = typeof needle === 'string' ? CSS.indexOf(needle) : CSS.search(needle);
    expect(at, `${needle} is not in the stylesheet`).toBeGreaterThan(-1);
    const open = CSS.lastIndexOf('@media', at);
    expect(open, `${needle} is not inside a media query at all`).toBeGreaterThan(-1);
    const matchLen = typeof needle === 'string' ? needle.length : (CSS.slice(at).match(needle)?.[0].length ?? 0);
    return {
      query: CSS.slice(open, CSS.indexOf('{', open)).replace(/\s+/g, ' ').trim(),
      upTo: CSS.slice(open, at + matchLen),
    };
  }

  const SHRUNK = /\.sched-tl-day-head strong\s*\{\s*font-size:\s*1\.15rem;/;
  const tablet = mediaAround(SHRUNK);

  it('shrinks the date rather than rewrapping the header', () => {
    expect(tablet.query).toBe('@media (max-width: 900px)');
    // The wrap was what the old single-row layout needed in order to fit a
    // badge beside the date. A column has nothing to wrap.
    expect(tablet.upTo).not.toContain('flex-wrap: wrap');
  });

  it('and the date stays clearly larger than the weekday', () => {
    const shrunk = 1.15;
    expect(shrunk / rem(ruleFor('.sched-tl-day-head small'), 'font-size')).toBeGreaterThan(1.5);
  });
});
