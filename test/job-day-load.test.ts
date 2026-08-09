import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayLoad, dayLoadSummary, formatHours, spanDays } from '@/lib/job-day-load';
import { occurrenceMinutes } from '@/lib/schedule-timeline';
import { computeHoursByDate } from '@/lib/booking';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FIELDS = stripJs(read('src', 'app', 'dashboard', 'jobs', '[id]', 'JobScheduleFields.tsx'));
const JOB_PAGE = stripJs(read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx'));
const JOB_ACTIONS = stripJs(read('src', 'app', 'dashboard', 'jobs', 'actions.ts'));
const JOBS_LIB = stripJs(read('src', 'lib', 'jobs.ts'));
const CALENDAR = stripJs(read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx'));

/**
 * "Three hours a day at that site, for a fortnight."
 *
 * The app could always express it — total hours plus a date range, and every
 * reader divides one by the other — and never once said so. The end date was
 * behind an edit form, the hours field's note said the hours were "not for how
 * many days this blocks", and the day/week view drew something different from
 * the month view for the very same job.
 */

/* ===========================================================================
   1. The division, named
   ======================================================================== */
describe('how much of each day a spread job takes', () => {
  const capacityHours = 8;

  it('eighteen hours across six days is three a day', () => {
    const load = dayLoad({ totalHours: 18, days: 6, capacityHours });
    expect(load).toEqual({ kind: 'spread', days: 6, perDay: 3, free: 5 });
  });

  /**
   * The free-hours half is what makes it actionable: it is the difference
   * between a day that is spoken for and a day with room for another call.
   */
  it('says what that leaves free', () => {
    expect(dayLoadSummary(dayLoad({ totalHours: 18, days: 6, capacityHours })))
      .toBe('6 days · about 3 hrs a day. Leaves about 5 hrs a day free to book alongside.');
  });

  it('a one-day job has nothing to spread', () => {
    expect(dayLoad({ totalHours: 8, days: 1, capacityHours })).toEqual({ kind: 'single' });
    expect(dayLoad({ totalHours: 8, days: null, capacityHours })).toEqual({ kind: 'single' });
    expect(dayLoadSummary({ kind: 'single' })).toBeNull();
  });

  it('a range with no hours asks for them rather than guessing', () => {
    const load = dayLoad({ totalHours: null, days: 6, capacityHours });
    expect(load).toEqual({ kind: 'unknown', days: 6 });
    expect(dayLoadSummary(load)).toContain('Add estimated hours');
  });

  /**
   * computeHoursByDate CAPS the per-day figure at capacity, which is right for
   * the booking engine — it cannot offer more than a day exists. But it means
   * 60 hours entered across 3 days silently books as 8/day and the schedule
   * under-reports by a day and a half. The owner gets told, not corrected.
   */
  it('names a range too short for the hours instead of quietly shortening it', () => {
    const load = dayLoad({ totalHours: 60, days: 3, capacityHours });
    expect(load).toMatchObject({ kind: 'over', days: 3, perDay: 20, capacity: 8 });
    const summary = dayLoadSummary(load)!;
    expect(summary).toContain('20 hrs a day');
    expect(summary).toContain('more than your 8-hour day');
    expect(summary).toContain('lengthen the range');
  });

  it('rounds to something a person would say', () => {
    expect(formatHours(3)).toBe('3');
    expect(formatHours(2.8333)).toBe('2.8');
    expect(formatHours(0.5)).toBe('0.5');
    expect(formatHours(4.04)).toBe('4');
  });

  it('survives nonsense rather than printing it', () => {
    expect(dayLoad({ totalHours: Number.NaN, days: 6, capacityHours })).toEqual({ kind: 'unknown', days: 6 });
    expect(dayLoad({ totalHours: -4, days: 6, capacityHours })).toEqual({ kind: 'unknown', days: 6 });
    expect(dayLoad({ totalHours: 18, days: 6, capacityHours: 0 })).toMatchObject({ kind: 'spread', free: 5 });
  });
});

describe('spanDays', () => {
  it('counts both ends', () => {
    expect(spanDays('2026-08-10', '2026-08-15')).toBe(6);
    expect(spanDays('2026-08-10', '2026-08-10')).toBe(1);
  });

  it('survives a DST boundary, where one day is 23 or 25 hours long', () => {
    expect(spanDays('2026-10-31', '2026-11-02')).toBe(3);
    expect(spanDays('2026-03-07', '2026-03-09')).toBe(3);
  });

  it('refuses a range that runs backwards or is incomplete', () => {
    expect(spanDays('2026-08-15', '2026-08-10')).toBeNull();
    expect(spanDays('2026-08-10', null)).toBeNull();
    expect(spanDays(null, '2026-08-15')).toBeNull();
    expect(spanDays('2026-08-10', 'not-a-date')).toBeNull();
  });
});

/* ===========================================================================
   2. The two views agreeing
   ---------------------------------------------------------------------------
   Reproduced before the fix, for an 18-hour job over 6 days at 8h capacity:
     Week/Day block :  8h  8h  2h  0.5h  0.5h  0.5h
     Month / booking:  3h  3h  3h  3h    3h    3h
   ======================================================================== */
describe('the week view and the month view describe the same job', () => {
  const TOTAL = 18;
  const DAYS = 6;
  const CAP = 8;

  const weekHours = () =>
    Array.from({ length: DAYS }, (_, dayIndex) =>
      occurrenceMinutes({ totalHours: TOTAL, dayIndex, dayCount: DAYS, workdayHours: CAP, spanEntered: true }) / 60,
    );

  const monthHours = () => {
    const byDate = computeHoursByDate(
      [{ scheduled_for: '2026-08-10', scheduled_until: '2026-08-15', estimated_hours: TOTAL }],
      CAP,
      0,
    );
    return [...byDate.values()];
  };

  it('an entered range spreads evenly, on both', () => {
    expect(weekHours()).toEqual([3, 3, 3, 3, 3, 3]);
    expect(monthHours()).toEqual([3, 3, 3, 3, 3, 3]);
    expect(weekHours()).toEqual(monthHours());
  });

  /**
   * A GUESSED span assumed full days until the work runs out, and nothing said
   * otherwise — so drawing it that way is the assumption made honest. Only an
   * entered range carries a claim about pacing.
   */
  it('but a guessed span still fills day after day', () => {
    const guessed = Array.from({ length: 3 }, (_, dayIndex) =>
      occurrenceMinutes({ totalHours: TOTAL, dayIndex, dayCount: 3, workdayHours: CAP }) / 60,
    );
    expect(guessed).toEqual([8, 8, 2]);
  });

  it('a range too short for the hours is capped, not drawn as a 20-hour block', () => {
    const minutes = occurrenceMinutes({ totalHours: 60, dayIndex: 0, dayCount: 3, workdayHours: CAP, spanEntered: true });
    expect(minutes / 60).toBe(CAP);
  });

  it('and the calendar knows which kind of span it has', () => {
    expect(CALENDAR).toContain('scheduled_until: string | null');
    expect(CALENDAR).toContain('spanEntered: Boolean(job.scheduled_until)');
    for (const page of ['src/app/dashboard/schedule/page.tsx', 'src/app/demo/schedule/page.tsx']) {
      expect(stripJs(read(...page.split('/'))), page).toContain('scheduled_until: job.scheduled_until ?? null');
    }
  });
});

/* ===========================================================================
   3. Being asked, rather than having to know
   ======================================================================== */
describe('the scheduling card asks for the range', () => {
  it('takes a last day, optional, beside the start date', () => {
    expect(FIELDS).toContain('name="scheduledUntil"');
    expect(FIELDS).toContain('Leave blank for a one-day job');
    // A range that runs backwards is refused at the field, not stored.
    expect(FIELDS).toContain('min={date || undefined}');
  });

  it('prints the division back while they are choosing it', () => {
    expect(FIELDS).toContain('dayLoad({ totalHours: estimatedHours, days: spanDays(date, until), capacityHours })');
    expect(FIELDS).toContain('job-day-load');
    // Recomputed from state, not from a prop — the point is that it moves as
    // the dates do.
    expect(FIELDS).toContain('const [until, setUntil] = useState(scheduledUntil)');
  });

  it('and the page hands it the working day to divide by', () => {
    expect(JOB_PAGE).toContain('schedule_day_hours');
    expect(JOB_PAGE).toContain('capacityHours={scheduleDayHours}');
    expect(JOB_PAGE).toContain('estimatedHours={Number(job.estimated_hours) || null}');
  });

  /**
   * The note on the hours field said the hours were "not for how many days
   * this blocks". True of the SPAN — the end date decides that — and false of
   * the daily load, which is exactly hours ÷ days.
   */
  it('the hours field no longer denies having anything to do with the calendar', () => {
    expect(JOB_PAGE).not.toContain('not for how many days this blocks');
    expect(JOB_PAGE).toContain('how much of each day the job takes');
  });
});

describe('and the end date survives the round trip', () => {
  /**
   * Three states, and collapsing the last two would make "actually it is one
   * day after all" impossible to save.
   */
  it('undefined carries the old span, a date sets it, null clears it', () => {
    expect(JOBS_LIB).toContain('if (scheduledUntil !== undefined)');
    expect(JOBS_LIB).toContain('const span = daysBetweenInclusive(current?.scheduled_for, current?.scheduled_until)');
    expect(JOBS_LIB).toContain("scheduledUntil > scheduledFor ? scheduledUntil : null");
  });

  it('the action tells them apart by whether the field was submitted at all', () => {
    // `has`, not a truthy check: an EMPTY field means one day and must be able
    // to clear a range. The schedule board does not submit the field, and gets
    // the carry-the-span behaviour.
    expect(JOB_ACTIONS).toContain("formData.has('scheduledUntil') ? optionalText(formData.get('scheduledUntil')) : undefined");
  });

  /** The feed line is visible to the CUSTOMER. */
  it('and what the customer is told covers the whole range', () => {
    expect(JOB_ACTIONS).toContain('formatJobSchedule(scheduledJob.scheduled_for, scheduledJob.scheduled_time, scheduledJob.scheduled_until)');
    expect(JOB_ACTIONS).toContain('scheduled_until: scheduledJob.scheduled_until');
  });
});
