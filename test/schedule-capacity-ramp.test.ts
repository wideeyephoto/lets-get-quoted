import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAPACITY_LABEL, CAPACITY_LEVELS, capacityLevel, countUnknownDurationByDate, type CapacityLevel } from '@/lib/schedule-capacity';
import { capacityStatus } from '@/lib/schedule-agenda';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = stripCss(read('src', 'app', 'globals.css'));
const MONTH = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleMonthCapacity.tsx'));
const LEGEND = read('src', 'app', 'dashboard', 'schedule', 'CalendarLegend.tsx');
const CALENDAR = stripJs(read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx'));

/** An 8-hour day, which is what the screenshots and the defaults use. */
const day = (bookedHours: number, jobCount = 1, markedFull = false) =>
  capacityLevel({ bookedHours, capacityHours: 8, jobCount, markedFull });

/* ===========================================================================
   1. The five bands
   ---------------------------------------------------------------------------
   The month grid drew every cell in the same orange whatever was in it, so
   "where is there room in August" meant reading thirty-one cells one at a time
   and comparing two small numbers in each.
   ======================================================================== */
describe('how full a day is, in one word', () => {
  it('nothing booked is open', () => {
    expect(day(0, 0)).toBe('open');
  });

  it('anything up to half the day is light', () => {
    expect(day(0.5)).toBe('light');
    expect(day(2)).toBe('light');
    // Half exactly counts as light: 4 of 8 is a day with a clear afternoon,
    // and a yellow cell would say otherwise.
    expect(day(4)).toBe('light');
  });

  it('past half, and not yet full, is busy', () => {
    expect(day(4.01)).toBe('busy');
    expect(day(6)).toBe('busy');
    expect(day(7.9)).toBe('busy');
  });

  it('at capacity is full', () => {
    expect(day(8)).toBe('full');
  });

  it('past capacity is over', () => {
    expect(day(8.5)).toBe('over');
    expect(day(22, 1)).toBe('over');
  });

  /**
   * Booked hours are summed from per-job estimates, so 2.4 + 2.4 + 3.2 lands
   * on 8.000000000000002 against a capacity of 8. A calendar that calls that
   * day overbooked is crying wolf on arithmetic noise.
   */
  it('does not cry overbooked over floating-point dust', () => {
    expect(day(2.4 + 2.4 + 3.2, 3)).toBe('full');
    expect(capacityLevel({ bookedHours: 8.000000000000002, capacityHours: 8, jobCount: 3 })).toBe('full');
  });

  /**
   * A separate axis from hours: a business capped at two visits a day is full
   * at two visits whether they are eight hours or twenty minutes, and a green
   * cell there offers room the booking rules will refuse.
   */
  it('the max-jobs-per-day cap makes a short day full', () => {
    expect(day(1, 2, true)).toBe('full');
    // But it never overrides the worse state.
    expect(day(9, 2, true)).toBe('over');
  });

  /**
   * A job with no estimated duration books zero hours. Drawing that day as
   * open is how somebody gets sent to a day that already has work on it.
   */
  it('a job with no duration still takes the day out of "open"', () => {
    expect(day(0, 1)).toBe('light');
  });

  it('says the least it can when capacity is not configured', () => {
    expect(capacityLevel({ bookedHours: 6, capacityHours: 0, jobCount: 2 })).toBe('light');
    // Never 'full' or 'over' — both would be claims about a number nobody set.
    expect(capacityLevel({ bookedHours: 40, capacityHours: 0, jobCount: 9 })).toBe('light');
    expect(capacityLevel({ bookedHours: 0, capacityHours: 0, jobCount: 0 })).toBe('open');
  });

  it('survives nonsense rather than printing it', () => {
    expect(capacityLevel({ bookedHours: Number.NaN, capacityHours: 8, jobCount: 0 })).toBe('open');
    expect(capacityLevel({ bookedHours: -5, capacityHours: 8, jobCount: 0 })).toBe('open');
    expect(capacityLevel({ bookedHours: 4, capacityHours: Number.NaN, jobCount: 1 })).toBe('light');
  });

  it('the ramp runs green to red, in order, and every band is named', () => {
    expect(CAPACITY_LEVELS).toEqual(['open', 'light', 'busy', 'full', 'over']);
    for (const level of CAPACITY_LEVELS) expect(CAPACITY_LABEL[level], level).toBeTruthy();
    // Off the ramp, but still a band the UI can be in, so it still needs a word.
    expect(CAPACITY_LABEL.unknown).toBe('Duration needed');
    expect(CAPACITY_LEVELS).not.toContain('unknown');
  });
});

/* ===========================================================================
   1b. THE DAY THAT LOOKED EMPTIER THAN AN EMPTY ONE
   ---------------------------------------------------------------------------
   computeHoursByDate skips a job whose estimated hours come to nothing, and it
   has to: the same function decides which slots the public booking page offers,
   and inventing eight hours there would close days that are genuinely free.
   The calendar inherited that silence and reported it as a measurement — a
   Tuesday with three unestimated jobs drew "0 / 8 hrs" behind a lime "up to
   half full", which is a day that reads as MORE available than one with nothing
   on it. Not a small workload; an unmeasured one.
   ======================================================================== */
describe('work of unstated length is not work of no length', () => {
  const withUnknown = (bookedHours: number, jobCount: number, unknownJobs: number) =>
    capacityLevel({ bookedHours, capacityHours: 8, jobCount, unknownJobs });

  it('refuses to quote a fraction when part of the day is unmeasured', () => {
    // The case from the audit: three jobs, no estimates, formerly 'light'.
    expect(withUnknown(0, 3, 3)).toBe('unknown');
    // And the mixed case — 2 known hours plus one job of unknown length is not
    // "up to half full", because nobody knows what the other one costs.
    expect(withUnknown(2, 3, 1)).toBe('unknown');
  });

  it('but a measured certainty still outranks the doubt', () => {
    // Already past capacity on the hours we DO know. Adding an unmeasured job
    // cannot make that day less overbooked.
    expect(withUnknown(9, 4, 1)).toBe('over');
    // The max-jobs-per-day cap is a rule that never consulted hours at all.
    expect(capacityLevel({ bookedHours: 1, capacityHours: 8, jobCount: 2, markedFull: true, unknownJobs: 1 })).toBe('full');
  });

  it('leaves a day with nothing on it alone', () => {
    expect(withUnknown(0, 0, 0)).toBe('open');
  });

  it('changes nothing when every job has an estimate', () => {
    expect(withUnknown(2, 1, 0)).toBe('light');
    expect(withUnknown(6, 2, 0)).toBe('busy');
    expect(withUnknown(8, 2, 0)).toBe('full');
  });

  it('survives nonsense in the new argument too', () => {
    expect(capacityLevel({ bookedHours: 2, capacityHours: 8, jobCount: 1, unknownJobs: Number.NaN })).toBe('light');
    expect(capacityLevel({ bookedHours: 2, capacityHours: 8, jobCount: 1, unknownJobs: -3 })).toBe('light');
  });
});

describe('counting the jobs nobody has estimated', () => {
  it('counts null, zero and nonsense alike — none of them is a duration', () => {
    expect(countUnknownDurationByDate([
      { scheduled_for: '2026-08-18', estimated_hours: null },
      { scheduled_for: '2026-08-18', estimated_hours: 0 },
      { scheduled_for: '2026-08-18', estimated_hours: 'not a number' },
      { scheduled_for: '2026-08-18', estimated_hours: 3 },
    ])).toEqual({ '2026-08-18': 3 });
  });

  /** The occurrences arrive one row per day, so a job running Mon–Wed with no
   *  estimate is unmeasured on all three — the same days its bar covers. */
  it('counts a multi-day job on every day it runs', () => {
    expect(countUnknownDurationByDate([
      { scheduled_for: '2026-08-18', estimated_hours: null },
      { scheduled_for: '2026-08-19', estimated_hours: null },
      { scheduled_for: '2026-08-20', estimated_hours: null },
    ])).toEqual({ '2026-08-18': 1, '2026-08-19': 1, '2026-08-20': 1 });
  });

  it('leaves quiet days out rather than writing zeroes', () => {
    const counts = countUnknownDurationByDate([{ scheduled_for: '2026-08-18', estimated_hours: 4 }]);
    expect(counts).toEqual({});
    expect(counts['2026-08-18'] ?? 0).toBe(0);
  });

  it('ignores a job with no date at all', () => {
    expect(countUnknownDurationByDate([{ scheduled_for: null, estimated_hours: null }])).toEqual({});
  });
});

/* The phone said it in a whole sentence, which made it worse: "Room to spare —
   0h of 8h booked" printed above three job cards. */
describe('the phone stops promising room it cannot see', () => {
  it('names the doubt instead of the fraction', () => {
    const status = capacityStatus(0, 8, 3);
    expect(status.state).toBe('unknown');
    expect(status.word).toBe('Length not known');
    expect(status.detail).toContain('3 jobs with no duration set');
  });

  it('says how many, in the singular when there is one', () => {
    expect(capacityStatus(2, 8, 1).detail).toBe('2h of 8h booked · 1 job with no duration set');
  });

  it('keeps the measured words when the day is measured', () => {
    expect(capacityStatus(0, 8, 0).word).toBe('Nothing booked');
    expect(capacityStatus(2, 8, 0).word).toBe('Room to spare');
    expect(capacityStatus(7, 8, 0).word).toBe('Nearly full');
    expect(capacityStatus(8, 8, 0).word).toBe('Full');
    expect(capacityStatus(9, 8, 0).word).toBe('Over capacity');
  });

  /** Certainty beats doubt on the phone for the same reason it does in Month. */
  it('still says Over when the known hours alone are past capacity', () => {
    expect(capacityStatus(9, 8, 2).state).toBe('over');
  });

  it('and the bar it draws is still the hours it actually knows', () => {
    expect(capacityStatus(2, 8, 3).pct).toBe(25);
  });
});

/* ===========================================================================
   1c. It reaches the screen
   ======================================================================== */
describe('the unmeasured day is marked in more than one way', () => {
  it('marks the cell, the hours and the flag, not just the colour', () => {
    expect(MONTH).toContain('const unknown = unknownDurationByDate[cell.dateKey] ?? 0;');
    expect(MONTH).toContain('className="sched-month-flag unknown"');
    expect(MONTH).toContain('className="sched-month-atleast"');
  });

  /** A neutral with a hatch, not a sixth hue — the ramp is already the pattern
   *  red/green colour blindness flattens. */
  it('is off the ramp in the stylesheet as well as in the type', () => {
    expect(CSS).toContain(".sched-month-cell[data-load='unknown']");
    expect(CSS).toContain('--load-ink: var(--cap-unknown);');
    expect(CSS.slice(CSS.indexOf(".sched-month-cell[data-load='unknown']"))).toContain('repeating-linear-gradient');
    // Defined in every theme block, like the five bands beside it.
    expect((CSS.match(/--cap-unknown:/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  /** The legend's own note argues against captioning colours the grid is not
   *  using, and most months have none of these. */
  it('is captioned only when a day on screen actually has one', () => {
    expect(LEGEND).toContain('showUnknown = false');
    expect(LEGEND).toContain('{showUnknown ? (');
    expect(CALENDAR).toContain('showUnknown={hasUnknownDuration}');
    expect(CALENDAR).toContain('(unknownDurationByDate[cell.dateKey] ?? 0) > 0');
  });

  /** computeHoursByDate feeds the public booking engine. If this fix had been
   *  made there instead, unmeasured jobs would start closing open days. */
  it('does not touch the number the booking engine reads', () => {
    const booking = read('src', 'lib', 'booking.ts');
    expect(booking).not.toContain('unknownJobs');
    expect(booking).not.toContain('countUnknownDurationByDate');
  });
});

/* ===========================================================================
   2. It reaches the cell
   ======================================================================== */
describe('the month cell is coloured by the band', () => {
  it('computes it once and hangs everything off it', () => {
    expect(MONTH).toContain('capacityLevel({ bookedHours: booked, capacityHours, jobCount: dayJobs.length, markedFull: isFull, unknownJobs: unknown })');
    expect(MONTH).toContain('data-load={level ?? undefined}');
  });

  /**
   * A blocked day has no capacity to be a fraction of, and tinting it green
   * would offer a day that is closed.
   */
  it('except a blocked day, which is outside the ramp', () => {
    expect(MONTH).toContain('const level = block\n            ? null');
  });

  it('and the band is said in words too, not only in hue', () => {
    expect(MONTH).toContain('CAPACITY_LABEL[level]');
    // The summary is the button's accessible name AND its tooltip — one
    // string, so the two cannot drift.
    expect(MONTH).toContain('title={summary}');
  });

  it('one attribute drives the border, the tint and the bar', () => {
    for (const level of CAPACITY_LEVELS) {
      expect(CSS, level).toContain(`.sched-month-cell[data-load='${level}']`);
    }
    expect(CSS).toContain('background: var(--load-ink, var(--accent));');
    // The old fixed orange, and the one-off red for `over`, are both gone.
    const bar = CSS.slice(CSS.indexOf('.sched-month-bar i {'));
    expect(bar.slice(0, bar.indexOf('}'))).not.toContain('background: var(--accent);');
    expect(CSS).not.toContain('.sched-month-cell.over .sched-month-bar i');
  });

  /**
   * Which day it is does not change all month; how full a day is changes every
   * time something is booked, and the bar underneath already says that.
   */
  it('today’s ring still wins over the band', () => {
    expect(CSS.lastIndexOf('.sched-month-cell.today { border-color: var(--accent); }'))
      .toBeGreaterThan(CSS.indexOf(".sched-month-cell[data-load='over']"));
  });
});

/* ===========================================================================
   3. Five hues with a key
   ======================================================================== */
describe('the ramp is named on screen', () => {
  it('has a token per band, in both themes', () => {
    const tokens = ['--cap-open', '--cap-light', '--cap-busy', '--cap-full', '--cap-over'];
    for (const token of tokens) {
      // Twice in dark (:root and the canvas block) and once in light.
      const declarations = CSS.match(new RegExp(`${token}:`, 'g')) ?? [];
      expect(declarations.length, token).toBeGreaterThanOrEqual(2);
    }
    // Lime and yellow on white are a highlighter pen. The light theme must not
    // simply inherit them.
    expect(CSS).toContain('--cap-light: #b6e94f;');
    expect(CSS).toContain('--cap-light: #5a8a10;');
  });

  it('Month gets the capacity key and the other views keep the status key', () => {
    expect(LEGEND).toContain("variant = 'status'");
    expect(LEGEND).toContain("if (variant === 'capacity')");
    expect(CALENDAR).toContain("variant={effectiveView === 'month' ? 'capacity' : 'status'}");
  });

  it('and the key uses the same five bands the cells do', () => {
    const capacityBlock = LEGEND.slice(LEGEND.indexOf('const CAPACITY = ['), LEGEND.indexOf('] as const;', LEGEND.indexOf('const CAPACITY = [')));
    for (const level of CAPACITY_LEVELS) {
      expect(capacityBlock, level).toContain(`key: '${level}'`);
    }
    for (const level of CAPACITY_LEVELS) {
      expect(CSS, level).toContain(`.calendar-legend-dot[data-load='${level}']`);
    }
  });

  it('the key’s labels match the ones the tooltip says', () => {
    const capacityBlock = LEGEND.slice(LEGEND.indexOf('const CAPACITY = ['), LEGEND.indexOf('] as const;', LEGEND.indexOf('const CAPACITY = [')));
    for (const level of CAPACITY_LEVELS as CapacityLevel[]) {
      expect(capacityBlock, level).toContain(`label: '${CAPACITY_LABEL[level]}'`);
    }
  });
});
