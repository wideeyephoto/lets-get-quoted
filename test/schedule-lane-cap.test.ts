import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTimeAxis,
  capLanes,
  overflowPosition,
  packOverlaps,
  type TimelineEntry,
} from '@/lib/schedule-timeline';

/**
 * The contract this file exists to defend is one sentence: a job may be hidden,
 * but a job may never be hidden silently. Everything else here is geometry.
 */

const entry = (key: string, start: number, minutes: number): TimelineEntry => ({
  key,
  startMinutes: start,
  durationMinutes: minutes,
});

const pack = (list: TimelineEntry[]) => capLanes(packOverlaps(list));

describe('two lanes, and a count for the rest', () => {
  it('leaves a day with no overlap alone', () => {
    const { entries, overflows } = pack([
      entry('a', 8 * 60, 60),
      entry('b', 10 * 60, 60),
      entry('c', 13 * 60, 90),
    ]);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.columns === 1)).toBe(true);
    expect(overflows).toEqual([]);
  });

  it('leaves a two-way overlap alone', () => {
    const { entries, overflows } = pack([entry('a', 9 * 60, 120), entry('b', 10 * 60, 60)]);
    expect(entries.map((e) => [e.key, e.column, e.columns])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
    expect(overflows).toEqual([]);
  });

  it('keeps two and folds the rest into one marker', () => {
    const { entries, overflows } = pack([
      entry('a', 9 * 60, 180),
      entry('b', 9 * 60, 120),
      entry('c', 9 * 60, 60),
      entry('d', 9 * 60, 90),
    ]);
    expect(entries.map((e) => e.key).sort()).toEqual(['a', 'b']);
    expect(entries.every((e) => e.columns === 2)).toBe(true);
    expect(overflows).toHaveLength(1);
    expect(overflows[0].keys.sort()).toEqual(['c', 'd']);
  });

  it('never loses a job — every key is either drawn or counted', () => {
    const list = [
      entry('a', 8 * 60, 240),
      entry('b', 8 * 60, 60),
      entry('c', 8 * 60 + 30, 60),
      entry('d', 9 * 60, 120),
      entry('e', 9 * 60, 30),
      entry('f', 14 * 60, 60),
    ];
    const { entries, overflows } = pack(list);
    const accounted = new Set([...entries.map((e) => e.key), ...overflows.flatMap((o) => o.keys)]);
    expect([...accounted].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // And never twice.
    expect(entries.length + overflows.reduce((n, o) => n + o.keys.length, 0)).toBe(list.length);
  });

  it('puts the marker over the hidden jobs, not over the whole day', () => {
    // Two all-day blocks force a third lane; the hidden job is 13:00-14:00, so
    // the marker has to sit at 13:00 and be one hour tall — a marker pinned to
    // the top of the cluster would point at the wrong time.
    const { overflows } = pack([
      entry('wide1', 8 * 60, 480),
      entry('wide2', 8 * 60, 480),
      entry('late', 13 * 60, 60),
    ]);
    expect(overflows).toHaveLength(1);
    expect(overflows[0]).toMatchObject({ keys: ['late'], startMinutes: 780, endMinutes: 840 });

    const axis = buildTimeAxis({ entries: [], workdayStart: '08:00', workdayEnd: '16:00' });
    const box = overflowPosition(overflows[0], axis);
    const spanTop = ((780 - axis.startMinutes) / axis.totalMinutes) * 100;
    expect(box.top).toBeCloseTo(spanTop, 6);
    expect(box.height).toBeCloseTo((60 / axis.totalMinutes) * 100, 6);
  });

  it('treats back-to-back as separate runs, so 09-10 and 10-11 never overflow', () => {
    const { entries, overflows } = pack([
      entry('a', 9 * 60, 60),
      entry('b', 9 * 60, 60),
      entry('c', 9 * 60, 60),
      entry('d', 10 * 60, 60),
      entry('e', 10 * 60, 60),
    ]);
    // The 9am run needs three lanes and overflows by one; the 10am run needs
    // two and does not overflow at all.
    expect(overflows).toHaveLength(1);
    expect(overflows[0].keys).toEqual(['c']);
    expect(entries.filter((e) => e.startMinutes === 600).map((e) => e.key).sort()).toEqual(['d', 'e']);
  });

  it('counts two separate crowded runs separately', () => {
    const morning = [entry('a', 9 * 60, 60), entry('b', 9 * 60, 60), entry('c', 9 * 60, 60)];
    const afternoon = [
      entry('d', 14 * 60, 60),
      entry('e', 14 * 60, 60),
      entry('f', 14 * 60, 60),
      entry('g', 14 * 60, 60),
    ];
    const { overflows } = pack([...morning, ...afternoon]);
    expect(overflows.map((o) => o.keys.length)).toEqual([1, 2]);
  });

  it('refuses a lane count that could not draw anything', () => {
    expect(() => capLanes([], 0)).toThrow();
  });
});

/**
 * …AND A MARKER THAT DOES SOMETHING.
 *
 * The lane cap was the constant 2, which is right for a 190px week column and
 * wrong for the day view — one column across the whole calendar, still folding
 * everything past the second lane behind a "+3" whose only action is "open this
 * day". That is the view you are already in: a control that looked like one,
 * did nothing, and sat on top of three jobs you then had no way to reach.
 *
 * Read as source, because both facts are about the component rather than about
 * the packing this file otherwise tests.
 */
describe('the overflow marker is a control only where it leads somewhere', () => {
  const TIMELINE = readFileSync(
    join(process.cwd(), 'src', 'app', 'dashboard', 'schedule', 'ScheduleTimeline.tsx'),
    'utf8',
  )
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('takes the lane cap from the column width instead of a constant 2', () => {
    expect(TIMELINE).toContain('Math.floor((colWidth - OVERFLOW_PX) / MIN_LANE_PX)');
    expect(TIMELINE).not.toContain('colWidth < MIN_LANE_PX * 2 + OVERFLOW_PX ? 1 : 2');
  });

  it('keeps the narrow cases exactly where they were', () => {
    // The rule the constant encoded: 2 lanes at a 190px week column, 1 at 99px.
    const MIN_LANE_PX = Number(/const MIN_LANE_PX = (\d+);/.exec(TIMELINE)?.[1]);
    const OVERFLOW_PX = Number(/const OVERFLOW_PX = (\d+);/.exec(TIMELINE)?.[1]);
    const lanes = (width: number) => Math.max(1, Math.floor((width - OVERFLOW_PX) / MIN_LANE_PX));
    expect(lanes(190)).toBe(2);
    expect(lanes(99)).toBe(1);
    // And the day column, which is the one that was wrong.
    expect(lanes(1000)).toBeGreaterThan(2);
  });

  it('renders a count rather than a button when there is only one day on screen', () => {
    expect(TIMELINE).toContain('const overflowOpensDay = Boolean(onOpenDay) && dayKeys.length > 1;');
    expect(TIMELINE).toContain('overflowOpensDay ? (');
    expect(TIMELINE).toContain("className=\"sched-tl-overflow is-static\"");
  });

  it('and the count stops looking pressable', () => {
    const CSS = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(CSS).toMatch(/\.sched-tl-overflow\.is-static\s*\{\s*cursor:\s*default;/);
    expect(CSS).toContain('.sched-tl-overflow.is-static:hover');
  });
});
