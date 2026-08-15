import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { daysWithScatter, loadOverWindow, spreadMiles } from '@/lib/schedule-load';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

/** Mon 2026-08-10 … the window used throughout, so weekday maths is checkable. */
const MON = '2026-08-10';

describe('booked hours against the hours there are', () => {
  it('counts working days only', () => {
    const load = loadOverWindow({
      fromKey: MON,
      days: 7,
      hoursByDate: {},
      capacityPerDay: 8,
      workingWeekdays: [1, 2, 3, 4, 5],
    });
    expect(load.workingDays).toBe(5);
    expect(load.capacityHours).toBe(40);
  });

  it('treats an empty working week as all seven days', () => {
    const load = loadOverWindow({ fromKey: MON, days: 7, hoursByDate: {}, capacityPerDay: 8, workingWeekdays: [] });
    expect(load.workingDays).toBe(7);
  });

  it('drops blocked days out of the capacity', () => {
    const load = loadOverWindow({
      fromKey: MON,
      days: 7,
      hoursByDate: {},
      capacityPerDay: 8,
      workingWeekdays: [1, 2, 3, 4, 5],
      blockedDays: { '2026-08-12': 'Truck in the shop' },
    });
    expect(load.workingDays).toBe(4);
    expect(load.capacityHours).toBe(32);
  });

  /**
   * A job booked onto a day that has since been blocked, or onto a Sunday the
   * business does not work, is still booked. Skipping its hours as well as its
   * capacity would hide exactly the state worth seeing.
   */
  it('still counts work booked on a day that carries no capacity', () => {
    const load = loadOverWindow({
      fromKey: MON,
      days: 7,
      hoursByDate: { '2026-08-16': 6 }, // the Sunday
      capacityPerDay: 8,
      workingWeekdays: [1, 2, 3, 4, 5],
    });
    expect(load.bookedHours).toBe(6);
    expect(load.capacityHours).toBe(40);
    expect(load.percent).toBe(15);
  });

  it('reports over 100 rather than stopping at full', () => {
    const load = loadOverWindow({
      fromKey: MON,
      days: 2,
      hoursByDate: { [MON]: 14, '2026-08-11': 10 },
      capacityPerDay: 8,
      workingWeekdays: [1, 2, 3, 4, 5],
    });
    expect(load.percent).toBe(150);
  });

  /** No working days is not zero percent booked, it is a ratio with no
   *  denominator — and printing 0% there would read as "wide open". */
  it('has no percentage when there is no capacity', () => {
    const load = loadOverWindow({
      fromKey: '2026-08-15', // Sat + Sun
      days: 2,
      hoursByDate: {},
      capacityPerDay: 8,
      workingWeekdays: [1, 2, 3, 4, 5],
    });
    expect(load.capacityHours).toBe(0);
    expect(load.percent).toBeNull();
  });

  /**
   * Jobs nobody has estimated contribute nothing to the hours, by design — the
   * same function feeds the public booking page, where inventing a duration
   * closes days that are genuinely free. So the ratio says how much it could
   * not see instead of guessing.
   */
  it('carries the jobs it could not count, without folding them in', () => {
    const load = loadOverWindow({
      fromKey: MON,
      days: 3,
      hoursByDate: { [MON]: 4 },
      unknownByDate: { [MON]: 2, '2026-08-11': 1 },
      capacityPerDay: 8,
      workingWeekdays: [1, 2, 3, 4, 5],
    });
    expect(load.bookedHours).toBe(4);
    expect(load.unknownJobs).toBe(3);
  });
});

describe('days whose stops are a long way apart', () => {
  // Kansas City to Independence is ~10 miles; to Lee's Summit ~18.
  const KC = { lat: 39.0997, lng: -94.5786 };
  const INDEP = { lat: 39.0911, lng: -94.4155 };
  const FAR = { lat: 38.9108, lng: -94.3822 };

  it('measures the two furthest apart, not the first and last', () => {
    const miles = spreadMiles([INDEP, KC, FAR]);
    expect(Math.round(miles)).toBe(Math.round(spreadMiles([KC, FAR])));
  });

  it('is zero for a day with one stop', () => {
    expect(spreadMiles([KC])).toBe(0);
  });

  it('flags only the days over the threshold and names the worst', () => {
    const result = daysWithScatter({
      fromKey: MON,
      days: 3,
      placesByDate: {
        [MON]: [KC, INDEP],           // ~10 miles
        '2026-08-11': [KC, FAR],      // ~17 miles
        '2026-08-12': [INDEP, FAR],   // ~13 miles
      },
      thresholdMiles: 15,
    });
    expect(result.days).toBe(1);
    expect(result.worstKey).toBe('2026-08-11');
    expect(result.worstMiles).toBeGreaterThan(14);
  });

  it('ignores days outside the window', () => {
    const result = daysWithScatter({
      fromKey: MON,
      days: 1,
      placesByDate: { '2026-09-01': [KC, FAR] },
      thresholdMiles: 5,
    });
    expect(result.days).toBe(0);
    expect(result.worstKey).toBeNull();
  });
});

/**
 * THE HEADER IS ABOUT RUNNING WORK, NOT ABOUT MONEY.
 *
 * It carried jobs, revenue and profit — and on a calendar, "revenue" was the
 * sum of every quote in the window whether the work had happened or not, while
 * "profit" was usually that same figure minus nothing, printed twice under two
 * labels. Insights is built to explain money and is one click away.
 */
describe('the schedule header', () => {
  const PAGE = read('src', 'app', 'dashboard', 'schedule', 'page.tsx');

  it('shows load, crew and travel', () => {
    expect(PAGE).toContain('loadOverWindow(');
    expect(PAGE).toContain('daysWithScatter(');
    expect(PAGE).toContain('unassignedThisWeek');
    expect(PAGE).toContain('<small>Booked · {scheduledNext30Days} jobs · 30d</small>');
    expect(PAGE).toContain('<small>Need crew · 7d</small>');
    expect(PAGE).toContain('<small>Spread out · 30d</small>');
  });

  /**
   * "0% BOOKED" ABOVE "6 JOBS" WAS TRUE ARITHMETIC AND A FALSE SENTENCE.
   *
   * The numerator is HOURS, and computeHoursByDate contributes nothing for a job
   * nobody has estimated — deliberately, because the same function decides which
   * slots the public booking page offers and a made-up duration there closes days
   * that are genuinely free. Nothing in the app sets estimated_hours on its own,
   * so an account that has never typed one read 0% with a full month on screen.
   *
   * The denominator, the window and the uncounted jobs were all in the link's
   * title and aria-label, which is to say nowhere for the person holding the
   * mouse. The card prints the ratio it measured, names what it could not
   * measure, and gives an em dash rather than a zero when it measured nothing —
   * the same three moves the Year view and the month cells already make.
   */
  it('says what the percentage is a percentage of', () => {
    expect(PAGE).toContain('{load.bookedHours} / {load.capacityHours} hrs');
    expect(PAGE).toContain("{unmeasuredNext30Days === 1 ? 'job has' : 'jobs have'} no duration set");
    /* Zero hours over work nobody has estimated is not zero percent booked —
       and neither is the job buffer's worth of hours. computeHoursByDate adds
       the buffer to every scheduled job, so `bookedHours <= 0` was only ever
       true on an account with the buffer at zero: with the default 30 minutes,
       six unestimated jobs come to three hours and the card went back to
       printing 2%. The question is whether anything in the window has been
       measured, which is a question about jobs. */
    expect(PAGE).toContain('const loadUnmeasured = measuredNext30Days === 0 && unmeasuredNext30Days > 0;');
    expect(PAGE).not.toContain('load.bookedHours <= 0');
    expect(PAGE).toContain("const loadFigure = load.percent === null || loadUnmeasured ? '—' : `${load.percent}%`;");
    /* Counted per JOB, not per occurrence-day. countUnknownDurationByDate emits
       one per day a job runs, so a Monday-to-Friday job printed "5 jobs have no
       duration set" directly under the caption's "1 jobs". */
    expect(PAGE).toContain('const unmeasuredNext30Days = scheduledNext30Days - measuredNext30Days;');
    // Both places the figure is drawn read the same one.
    expect(PAGE).not.toContain("<strong>{load.percent === null ? '—' : `${load.percent}%`}</strong>");
    // And the caption no longer leaves the span to the tooltip.
    expect(PAGE).not.toContain('<small>Booked · {scheduledNext30Days} jobs</small>');
  });

  /**
   * The header is pinned to the real today while the grid below it follows the
   * month you have navigated to, so the cards have to name their own window.
   * They also have to agree with each other: loadOverWindow counts thirty days
   * from `fromKey` INCLUSIVE, so the last of them is today + 29. The caption
   * counted to today + 30 — thirty-one days — and a job on that last day was in
   * the count and not in the ratio.
   */
  it('captions the same span it measures', () => {
    expect(PAGE).toContain('const next30Key = addDaysToDateKey(todayKey, 29);');
    expect(PAGE).not.toContain('now.getDate() + 30');
  });

  it('no longer prices the calendar', () => {
    expect(PAGE).not.toContain('estimatedRevenue');
    expect(PAGE).not.toContain('estimatedProfit');
    expect(PAGE).not.toContain('<small>Revenue</small>');
  });

  /** One round trip fewer per load: it fetched every cost row against thirty
   *  days of jobs to compute a subtraction that was almost always by zero. */
  it('stopped querying costs to do it', () => {
    expect(PAGE).not.toContain("from('costs')");
  });

  /**
   * A day that is merely FULL still has capacity — it is spent, which is the
   * point of the ratio. Passing the map that also holds full days would shrink
   * the denominator every time the numerator grew.
   */
  it('measures capacity against blocks, not against being busy', () => {
    const call = PAGE.slice(PAGE.indexOf('const load = loadOverWindow({'), PAGE.indexOf('const scatter'));
    expect(call).toContain('blockedDays: blockedOnlyDays');
    expect(call).not.toContain('blockedDays: unavailableDays');
  });

  /**
   * Straight-line is not drive time, and the card says so where it is read
   * rather than only in a comment. A river or a highway can make nonsense of
   * haversine, so the number is a flag pointing at the route planner.
   */
  it('tells the reader the distance is not a drive', () => {
    expect(read('src', 'lib', 'schedule-load.ts')).toContain('straight-line');
    expect(PAGE).toContain('miles apart in a straight line');
    expect(PAGE).toContain('Straight-line, not drive time.');
    expect(PAGE).toContain('href="/dashboard/schedule/plan"');
  });
});
