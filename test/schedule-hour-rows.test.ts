import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTimeAxis, formatAxisHour, type TimelineEntry } from '@/lib/schedule-timeline';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = stripCss(read('src', 'app', 'globals.css'));
const TIMELINE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleTimeline.tsx'));

const at = (key: string, startMinutes: number | null, durationMinutes: number): TimelineEntry => ({
  key,
  startMinutes,
  durationMinutes,
});

/**
 * The two hour heights, read from where they are actually declared rather than
 * copied here — the whole point of the fit checks below is that they follow
 * whatever the numbers become.
 */
const HOUR_PX = Number(/const HOUR_PX = (\d+);/.exec(TIMELINE)?.[1]);
const TABLET_HOUR_PX = Number(/--tl-hour-h: (\d+)px !important/.exec(CSS)?.[1]);

/**
 * The day and week calendars, after the audit that said they were shorter than
 * the day they were drawing.
 *
 * Comments are stripped first — this repo's WHY comments quote the strings
 * being removed ("a fainter one on the half hour", "min(62vh, 720px)"), so a
 * bare not.toContain matches the explanation of the fix.
 */

/* ===========================================================================
   1. The evening is on the grid
   ======================================================================== */
describe('the axis runs to 8pm, so 7 PM is a row', () => {
  /**
   * The gutter labels the TOP of each row (hours.slice(0, -1)), so an axis
   * ending at 19:00 would put "6 PM" on the last label and leave the 6–7pm
   * band unnamed at the foot — a calendar that reads as stopping at six.
   */
  it('a quiet week still shows the evening', () => {
    const axis = buildTimeAxis({
      entries: [],
      workdayStart: '07:30',
      workdayEnd: '16:00',
      minEndMinutes: 20 * 60,
    });
    expect(axis.startMinutes).toBe(7 * 60);
    expect(axis.endMinutes).toBe(20 * 60);
    // 13 rows, and the last label is 7 PM.
    expect(axis.hours).toHaveLength(14);
    const labels = axis.hours.slice(0, -1).map(formatAxisHour);
    expect(labels[0]).toBe('7 AM');
    expect(labels[labels.length - 1]).toBe('7 PM');
    expect(labels).toHaveLength(13);
  });

  it('is a floor, not a cap — a late job still grows it', () => {
    const axis = buildTimeAxis({
      entries: [at('evening', 21 * 60, 60)],
      workdayStart: '08:00',
      workdayEnd: '17:00',
      minEndMinutes: 20 * 60,
    });
    expect(axis.endMinutes).toBe(22 * 60);
  });

  it('never pushes past midnight', () => {
    const axis = buildTimeAxis({
      entries: [at('a', 23 * 60, 120)],
      workdayStart: '22:00',
      workdayEnd: '23:30',
      minEndMinutes: 20 * 60,
    });
    expect(axis.endMinutes).toBeLessThanOrEqual(24 * 60);
  });

  it('snaps to the hour like everything else on this axis', () => {
    const axis = buildTimeAxis({ entries: [], workdayStart: '08:00', workdayEnd: '09:00', minEndMinutes: 19 * 60 + 20 });
    expect(axis.endMinutes % 60).toBe(0);
    expect(axis.endMinutes).toBe(20 * 60);
  });

  /**
   * A separate argument rather than a change to the arithmetic, because it is
   * a display decision and not a fact about the working day. The crew-lane
   * view shares buildTimeAxis and wants the honest working day.
   */
  it('is opt-in, so the crew lanes are untouched', () => {
    const axis = buildTimeAxis({ entries: [], workdayStart: '08:00', workdayEnd: '17:00' });
    expect(axis.endMinutes).toBe(17 * 60);
    expect(stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleCrewLanes.tsx'))).not.toContain('minEndMinutes');
  });

  it('and the day/week timeline asks for it', () => {
    expect(TIMELINE).toContain('const AXIS_END_MINUTES = 20 * 60;');
    expect(TIMELINE).toContain('minEndMinutes: AXIS_END_MINUTES');
  });
});

/* ===========================================================================
   2. One line per hour
   ======================================================================== */
describe('an hour is one row', () => {
  const col = CSS.slice(CSS.indexOf('.sched-tl-col {'), CSS.indexOf('.sched-tl-col:last-child'));

  it('draws a single gridline per hour, not a half-hour one as well', () => {
    const gradients = col.match(/repeating-linear-gradient/g) ?? [];
    expect(gradients).toHaveLength(1);
    expect(col).toContain('repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px var(--tl-hour-h))');
    // The half-hour line keyed off a division of the hour height. Nothing on
    // this column should be measuring half an hour any more.
    expect(col).not.toContain('var(--tl-hour-h) / 2');
  });

  it('and the gutter is still one label per row', () => {
    expect(CSS).toContain('grid-auto-rows: var(--tl-hour-h);');
    expect(TIMELINE).toContain('axis.hours.slice(0, -1).map');
  });
});

/* ===========================================================================
   3. No scrollbar inside the scrollbar
   ======================================================================== */
describe('the calendar is exactly as tall as the hours it holds', () => {
  // To the end of its own rule. `.sched-tl-body` appears in a grouped selector
  // ABOVE this one, so slicing to it gives an empty string and a green test.
  const scrollAt = CSS.indexOf('.sched-tl-scroll {');
  const scroll = CSS.slice(scrollAt, CSS.indexOf('}', scrollAt));

  /**
   * The cap was min(62vh, 720px), which at 62px an hour is eleven and a half
   * hours — so a 7am-to-7pm day arrived with a second scrollbar down the
   * inside of a page that already had one, and the hours it hid were the
   * evening.
   */
  it('is bounded by its own content, not by the viewport', () => {
    expect(scroll).toContain('max-height: calc(var(--tl-hours) * var(--tl-hour-h));');
    expect(scroll).not.toContain('vh');
  });

  it('and the body it holds is that same height, so nothing overflows', () => {
    expect(CSS).toContain('.sched-tl-body { min-height: calc(var(--tl-hours) * var(--tl-hour-h)); }');
  });

  it('the tablet breakpoint does not put the cap back', () => {
    const tablet = CSS.slice(CSS.indexOf('@media (max-width: 1279.98px)'));
    const block = tablet.slice(0, tablet.indexOf('}\n'));
    expect(block).not.toContain('.sched-tl-scroll');
  });

  /**
   * The arithmetic the whole change rests on: thirteen hours have to fit
   * inside the height the old cap allowed, or the unscheduled rail below the
   * calendar has lost the room this was supposed to be protecting.
   */
  it('thirteen hours still fit in the height the old cap allowed', () => {
    expect(HOUR_PX * 13).toBeLessThanOrEqual(720);
    expect(TABLET_HOUR_PX * 13).toBeLessThanOrEqual(620);
  });
});

/* ===========================================================================
   4. The bill for a shorter hour
   ---------------------------------------------------------------------------
   A block's height is its duration times the hour, so every pixel off the hour
   comes off every card on the grid. The detail thresholds have to move with it
   or the same four lines get clipped mid-word — which is how a calendar starts
   lying about what it knows.
   ======================================================================== */
describe('every band still fits the shortest job in it', () => {
  /** What each band draws, at 12px type with the card's padding and border. */
  const NEEDS_PX = { xs: 20, sm: 60, md: 80 } as const;

  const thresholds = () => {
    const body = TIMELINE.slice(TIMELINE.indexOf('function blockSize('));
    const [, xsMax] = /minutes < (\d+)\) return 'xs'/.exec(body) ?? [];
    const [, smMax] = /minutes < (\d+)\) return 'sm'/.exec(body) ?? [];
    return { xsMax: Number(xsMax), smMax: Number(smMax) };
  };

  it('reads its sizes from duration, not from measured pixels', () => {
    // Which is what lets the hour differ per breakpoint at all.
    expect(TIMELINE).toContain('function blockSize(minutes: number)');
    expect(TIMELINE).toContain('blockSize(entry.endMinutes - entry.startMinutes)');
    expect(TIMELINE).toContain('data-size={size}');
  });

  for (const [name, hourPx] of [['desktop', () => HOUR_PX], ['tablet', () => TABLET_HOUR_PX]] as const) {
    it(`the shortest sm and md block clears its lines on ${name}`, () => {
      const { xsMax, smMax } = thresholds();
      const px = (minutes: number) => (minutes / 60) * hourPx();
      // The shortest job in each band is the one that has to fit.
      expect(px(xsMax), 'shortest sm').toBeGreaterThanOrEqual(NEEDS_PX.sm);
      expect(px(smMax), 'shortest md').toBeGreaterThanOrEqual(NEEDS_PX.md);
    });
  }

  /**
   * …AND THE SHORTEST STRIP IS FLOORED, NOT COMPUTED.
   *
   * This used to be arithmetic — a half-hour block at a 44px hour was 22px,
   * over the one row it needs. At 22px an hour it is 11px, which is less than
   * a line of type plus a border, so `overflow: hidden` would quietly eat the
   * customer's name. The guarantee moved into CSS: the block carries a
   * min-height of one xs row.
   *
   * The cost, named: a very short block overstates its duration at the BOTTOM.
   * Its top edge is still exact, and the top edge is what the eye reads a
   * calendar by.
   */
  it('floors a short block at one readable row rather than drawing a sliver', () => {
    const jobAt = CSS.indexOf('.sched-tl-job {');
    const rule = CSS.slice(jobAt, CSS.indexOf('}', jobAt));
    const floor = Number(/min-height:\s*(\d+)px/.exec(rule)?.[1]);
    expect(floor, 'the block declares no floor').toBeGreaterThan(0);
    expect(floor).toBeGreaterThanOrEqual(NEEDS_PX.xs);
    // And it only has to exist because the hour is now shorter than one row.
    expect(Math.min(HOUR_PX, TABLET_HOUR_PX) / 2).toBeLessThan(NEEDS_PX.xs);
  });

  /**
   * SM is three lines. The foot used to survive there with only the crew
   * hidden inside it, which left the status badge on a fourth row.
   */
  it('sm draws three lines, not four', () => {
    expect(CSS).toContain(".sched-tl-job[data-size='sm'] .sched-tl-job-foot,\n.sched-tl-job[data-size='sm'] .sched-tl-job-span { display: none; }");
    // The status is not lost with the badge: it is what the block's colour
    // encodes, and CalendarLegend names all four.
    expect(CSS).toContain('.calendar-legend-dot');
  });

  it('and everything dropped is still in the DOM for a screen reader', () => {
    expect(TIMELINE).toContain('className="sched-tl-job-city"');
    expect(TIMELINE).toContain('className="sched-tl-job-foot"');
    // Plus the hover title, which carries the whole job whatever the size.
    expect(TIMELINE).toContain('job.city_label,');
  });
});
