import { describe, it, expect } from 'vitest';
import {
  DEFAULT_JOB_MINUTES,
  blockPosition,
  buildTimeAxis,
  findCrewConflicts,
  formatAxisHour,
  formatClockMinutes,
  hasOverlap,
  occurrenceMinutes,
  packOverlaps,
  parseClockMinutes,
  type TimelineEntry,
} from '@/lib/schedule-timeline';

const at = (key: string, start: number | null, duration = 60): TimelineEntry => ({
  key,
  startMinutes: start,
  durationMinutes: duration,
});

describe('parseClockMinutes', () => {
  it('reads both stored shapes', () => {
    expect(parseClockMinutes('08:30')).toBe(510);
    expect(parseClockMinutes('08:30:00')).toBe(510);
    expect(parseClockMinutes('00:00')).toBe(0);
    expect(parseClockMinutes('23:59')).toBe(1439);
  });

  it('refuses anything it cannot place on a clock', () => {
    for (const bad of [null, undefined, '', 'noon', '25:00', '08:71', '-1:00']) {
      expect(parseClockMinutes(bad)).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('names the hours the way a person reads them', () => {
    expect(formatClockMinutes(0)).toBe('12:00 AM');
    expect(formatClockMinutes(510)).toBe('8:30 AM');
    expect(formatClockMinutes(720)).toBe('12:00 PM');
    expect(formatClockMinutes(1005)).toBe('4:45 PM');
    expect(formatAxisHour(480)).toBe('8 AM');
    expect(formatAxisHour(720)).toBe('12 PM');
    expect(formatAxisHour(1080)).toBe('6 PM');
  });
});

describe('occurrenceMinutes', () => {
  it('falls back to an hour when nobody filled in the estimate', () => {
    expect(occurrenceMinutes({ totalHours: null, dayIndex: 0, dayCount: 1, workdayHours: 8 }))
      .toBe(DEFAULT_JOB_MINUTES);
    expect(occurrenceMinutes({ totalHours: 0, dayIndex: 0, dayCount: 1, workdayHours: 8 }))
      .toBe(DEFAULT_JOB_MINUTES);
  });

  it('spends a multi-day estimate across the days it runs, not once per day', () => {
    // 20 hours over 3 days at 8h/day: 8, 8, 4 — NOT 20, 20, 20.
    const spread = [0, 1, 2].map((dayIndex) =>
      occurrenceMinutes({ totalHours: 20, dayIndex, dayCount: 3, workdayHours: 8 }));
    expect(spread).toEqual([480, 480, 240]);
    expect(spread.reduce((a, b) => a + b, 0)).toBe(20 * 60);
  });

  it('never draws a single day longer than the working day', () => {
    expect(occurrenceMinutes({ totalHours: 30, dayIndex: 0, dayCount: 1, workdayHours: 8 })).toBe(480);
  });

  it('keeps the last day visible when the remainder rounds to nothing', () => {
    expect(occurrenceMinutes({ totalHours: 16, dayIndex: 2, dayCount: 3, workdayHours: 8 })).toBe(30);
  });
});

describe('buildTimeAxis', () => {
  it('uses the configured working day when everything fits inside it', () => {
    const axis = buildTimeAxis({ entries: [at('a', 9 * 60, 60)], workdayStart: '08:00', workdayEnd: '17:00' });
    expect(axis.startMinutes).toBe(480);
    expect(axis.endMinutes).toBe(1020);
    expect(axis.hours).toHaveLength(10);
    expect(axis.totalMinutes).toBe(540);
  });

  it('grows to contain a job booked outside the working day', () => {
    // The alternative is drawing a 6am job above the top of the calendar, which
    // is to say not drawing it.
    const axis = buildTimeAxis({ entries: [at('early', 6 * 60, 60)], workdayStart: '08:00', workdayEnd: '17:00' });
    expect(axis.startMinutes).toBe(360);
    expect(axis.endMinutes).toBe(1020);
  });

  it('grows at the end for a job that runs past closing', () => {
    const axis = buildTimeAxis({ entries: [at('late', 16 * 60, 4 * 60)], workdayStart: '08:00', workdayEnd: '17:00' });
    expect(axis.endMinutes).toBe(20 * 60);
  });

  it('snaps to whole hours so the gridlines are round', () => {
    const axis = buildTimeAxis({ entries: [at('a', 6 * 60 + 20, 25)], workdayStart: '08:00', workdayEnd: '17:00' });
    expect(axis.startMinutes % 60).toBe(0);
    expect(axis.endMinutes % 60).toBe(0);
  });

  it('ignores untimed entries entirely', () => {
    const axis = buildTimeAxis({ entries: [at('tbd', null, 600)], workdayStart: '09:00', workdayEnd: '15:00' });
    expect(axis.startMinutes).toBe(540);
    expect(axis.endMinutes).toBe(900);
  });

  it('keeps a minimum height so a short working day is still a day', () => {
    const axis = buildTimeAxis({ entries: [], workdayStart: '09:00', workdayEnd: '11:00' });
    expect(axis.endMinutes - axis.startMinutes).toBeGreaterThanOrEqual(6 * 60);
  });

  it('never runs past midnight in either direction', () => {
    const late = buildTimeAxis({ entries: [at('a', 21 * 60, 120)], workdayStart: '22:00', workdayEnd: '23:30' });
    expect(late.startMinutes).toBeGreaterThanOrEqual(0);
    expect(late.endMinutes).toBeLessThanOrEqual(1440);
    const early = buildTimeAxis({ entries: [at('a', 0, 60)], workdayStart: '00:30', workdayEnd: '02:00' });
    expect(early.startMinutes).toBe(0);
    expect(early.endMinutes).toBeLessThanOrEqual(1440);
  });

  it('falls back to 8am-6pm with no configuration', () => {
    const axis = buildTimeAxis({ entries: [] });
    expect(axis.startMinutes).toBe(8 * 60);
    expect(axis.endMinutes).toBe(18 * 60);
  });
});

describe('packOverlaps', () => {
  it('gives a lone job the full width', () => {
    const [only] = packOverlaps([at('a', 540, 60)]);
    expect(only).toMatchObject({ column: 0, columns: 1 });
  });

  it('splits two jobs booked at the same time', () => {
    const packed = packOverlaps([at('a', 540, 60), at('b', 540, 60)]);
    expect(packed.map((p) => p.columns)).toEqual([2, 2]);
    expect(packed.map((p) => p.column).sort()).toEqual([0, 1]);
  });

  it('leaves back-to-back jobs at full width', () => {
    // 9-10 and 10-11 do not conflict, and halving both would waste the day.
    const packed = packOverlaps([at('a', 540, 60), at('b', 600, 60)]);
    expect(packed.every((p) => p.columns === 1)).toBe(true);
  });

  it('groups transitively: A-B overlap, B-C overlap, A and C do not', () => {
    // All three must still share. If A and C each took the full width, B —
    // which conflicts with both — would have nowhere to go.
    const packed = packOverlaps([at('a', 540, 60), at('b', 570, 60), at('c', 600, 60)]);
    expect(packed.map((p) => p.columns)).toEqual([2, 2, 2]);
    const byKey = Object.fromEntries(packed.map((p) => [p.key, p.column]));
    expect(byKey.a).not.toBe(byKey.b);
    expect(byKey.b).not.toBe(byKey.c);
    // A and C do not touch, so they may reuse the same column.
    expect(byKey.a).toBe(byKey.c);
  });

  it('reuses a column once its occupant has finished', () => {
    const packed = packOverlaps([at('long', 540, 240), at('one', 540, 60), at('two', 660, 60)]);
    const byKey = Object.fromEntries(packed.map((p) => [p.key, p.column]));
    expect(byKey.one).toBe(byKey.two);
    expect(packed.every((p) => p.columns === 2)).toBe(true);
  });

  it('puts the longest job of a shared start in the first column', () => {
    const packed = packOverlaps([at('short', 540, 30), at('long', 540, 180)]);
    expect(packed.find((p) => p.key === 'long')?.column).toBe(0);
  });

  it('drops untimed entries rather than placing them at midnight', () => {
    expect(packOverlaps([at('tbd', null, 60), at('real', 540, 60)]).map((p) => p.key)).toEqual(['real']);
  });

  it('gives a zero-length job a floor so it is still clickable', () => {
    const [only] = packOverlaps([at('a', 540, 0)]);
    expect(only.endMinutes - only.startMinutes).toBe(30);
  });

  it('is stable for the same input', () => {
    const entries = [at('b', 540, 60), at('a', 540, 60), at('c', 555, 30)];
    expect(packOverlaps(entries)).toEqual(packOverlaps(entries));
  });

  it('returns every timed entry exactly once', () => {
    const entries = Array.from({ length: 40 }, (_, i) => at(`j${i}`, 480 + (i % 9) * 30, 45));
    const packed = packOverlaps(entries);
    expect(packed).toHaveLength(40);
    expect(new Set(packed.map((p) => p.key)).size).toBe(40);
  });

  it('never puts two overlapping blocks in the same column', () => {
    const entries = [
      at('a', 480, 120), at('b', 500, 30), at('c', 510, 200),
      at('d', 700, 60), at('e', 720, 30), at('f', 720, 90),
    ];
    for (const one of packOverlaps(entries)) {
      for (const other of packOverlaps(entries)) {
        if (one.key === other.key || one.column !== other.column) continue;
        const overlaps = one.startMinutes < other.endMinutes && other.startMinutes < one.endMinutes;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe('hasOverlap', () => {
  it('separates a busy day from a conflicted one', () => {
    expect(hasOverlap([at('a', 540, 60), at('b', 600, 60), at('c', 660, 60)])).toBe(false);
    expect(hasOverlap([at('a', 540, 90), at('b', 600, 60)])).toBe(true);
    expect(hasOverlap([])).toBe(false);
  });
});

describe('findCrewConflicts', () => {
  const withCrew = (key: string, start: number, duration: number, crewIds: string[]) =>
    ({ ...at(key, start, duration), crewIds });

  it('ignores two crews working at once, which is a normal Tuesday', () => {
    expect(findCrewConflicts([
      withCrew('a', 540, 120, ['crew-1']),
      withCrew('b', 540, 120, ['crew-2']),
    ])).toEqual([]);
  });

  it('catches one person booked on two jobs at once', () => {
    const conflicts = findCrewConflicts([
      withCrew('a', 540, 120, ['crew-1']),
      withCrew('b', 600, 60, ['crew-1', 'crew-2']),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].crewId).toBe('crew-1');
    expect(conflicts[0].keys.sort()).toEqual(['a', 'b']);
  });

  it('says nothing about jobs with nobody assigned', () => {
    expect(findCrewConflicts([withCrew('a', 540, 120, []), withCrew('b', 540, 120, [])])).toEqual([]);
  });

  it('leaves back-to-back jobs for the same person alone', () => {
    expect(findCrewConflicts([
      withCrew('a', 540, 60, ['crew-1']),
      withCrew('b', 600, 60, ['crew-1']),
    ])).toEqual([]);
  });
});

describe('blockPosition', () => {
  const axis = buildTimeAxis({ entries: [], workdayStart: '08:00', workdayEnd: '18:00' });

  it('places a block as a percentage of the axis', () => {
    const [packed] = packOverlaps([at('a', 9 * 60, 60)]);
    const box = blockPosition(packed, axis);
    expect(box.top).toBeCloseTo(10, 5);
    expect(box.height).toBeCloseTo(10, 5);
    expect(box.left).toBe(0);
    expect(box.width).toBe(100);
  });

  it('splits the width between two conflicting blocks and leaves no gap', () => {
    const packed = packOverlaps([at('a', 9 * 60, 60), at('b', 9 * 60, 60)]);
    const boxes = packed.map((entry) => blockPosition(entry, axis));
    expect(boxes.map((b) => b.width)).toEqual([50, 50]);
    expect(boxes.map((b) => b.left).sort((x, y) => x - y)).toEqual([0, 50]);
  });

  it('never draws outside the axis', () => {
    const [packed] = packOverlaps([at('a', 17 * 60 + 30, 6 * 60)]);
    const box = blockPosition(packed, axis);
    expect(box.top + box.height).toBeLessThanOrEqual(100.0001);
  });
});
