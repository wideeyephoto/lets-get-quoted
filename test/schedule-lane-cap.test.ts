import { describe, it, expect } from 'vitest';
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
