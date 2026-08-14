import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jobDayKeys, toPlanStop, type PlanJobRow } from '@/lib/route-plan-day';
import { formatClockLabel, formatTimeLabel } from '@/lib/route-plan';

/**
 * Plan my day, when the job runs longer than the day.
 *
 * THE FAILURE THIS FIXES, on a real account: every stop read "Finish around
 * 11:59 PM". estimated_hours is the TOTAL for a job; the router was reading it
 * as the length of one visit. A 16-hour job starting at 8:00 AM finishes at
 * midnight, formatTimeLabel clamps at 23:59, and every stop after it inherited
 * the same clamped arrival — so a two-stop day showed three midnights and no
 * usable time at all.
 *
 * The second half of the same bug: the day's jobs were `scheduled_for =
 * dateKey`, which is the one thing a multi-day job is not. A fortnight of
 * three-hour mornings appeared on the Monday and on none of the days after it.
 *
 * Neither half needed new arithmetic. lib/job-day-load has divided hours by
 * days since the end date existed, lib/jobs has decided spans for the calendar
 * just as long, and this screen called neither.
 */

const JOB: PlanJobRow = {
  id: 'job-1',
  client_name: 'Clay Vandergriff',
  client_phone: null,
  address: '861 SW Oldham Pkwy, Belton, MO 64012',
  lat: 38.8,
  lng: -94.5,
  scheduled_for: '2026-08-10', // a Monday
  scheduled_until: null,
  scheduled_time: '08:00',
  estimated_hours: 16,
  status: 'scheduled',
  appointment_confirmed_at: null,
};

const WEEKDAYS = [1, 2, 3, 4, 5];

describe('which days a job is on', () => {
  it('puts a one-day job on one day', () => {
    expect(jobDayKeys({ ...JOB, estimated_hours: 4 }, 8, WEEKDAYS)).toEqual(['2026-08-10']);
  });

  it('draws an entered range literally, weekend included', () => {
    // The owner picked both ends on a calendar. "Runs through Sunday" means
    // through Sunday — routing that around the working week would be the system
    // overruling a stated fact, which is what per-job dates exist to stop.
    const keys = jobDayKeys({ ...JOB, scheduled_for: '2026-08-14', scheduled_until: '2026-08-17' }, 8, WEEKDAYS);
    expect(keys).toEqual(['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17']);
  });

  it('skips non-working days only when it GUESSED the span', () => {
    // 16 hours on an 8-hour day is two days. Starting Friday, the second is
    // Monday — the same rule the calendar uses, because it is the same function.
    const keys = jobDayKeys({ ...JOB, scheduled_for: '2026-08-14' }, 8, WEEKDAYS);
    expect(keys).toEqual(['2026-08-14', '2026-08-17']);
  });

  it('always keeps day one, even on a day the account does not work', () => {
    // A job the owner put on a Saturday IS on that Saturday. Moving it would
    // make it vanish from the day they are looking at.
    const keys = jobDayKeys({ ...JOB, scheduled_for: '2026-08-15', estimated_hours: 4 }, 8, WEEKDAYS);
    expect(keys).toEqual(['2026-08-15']);
  });

  it('is one day for a job with no hours and no end date', () => {
    expect(jobDayKeys({ ...JOB, estimated_hours: null }, 8, WEEKDAYS)).toEqual(['2026-08-10']);
  });
});

describe('how long the stop is TODAY', () => {
  const minutes = (job: PlanJobRow, placement?: { day: number; of: number }) =>
    toPlanStop(job, 120, { placement, capacityHours: 8 }).visitMinutes;

  it('books the whole estimate when the job is one day', () => {
    expect(minutes({ ...JOB, estimated_hours: 3 }, { day: 1, of: 1 })).toBe(180);
  });

  it('books one day’s share of a job that runs several', () => {
    // THE BUG. 16 hours across 2 days is 8 hours today, not 16 — which is what
    // put 8:00 AM + 16 h = midnight on the row.
    expect(minutes(JOB, { day: 1, of: 2 })).toBe(480);
    expect(minutes(JOB, { day: 2, of: 2 })).toBe(480);
  });

  it('handles the few-hours-a-day case the feature is for', () => {
    // 30 hours over 10 days: three hours a morning at one site.
    expect(minutes({ ...JOB, estimated_hours: 30 }, { day: 4, of: 10 })).toBe(180);
  });

  it('gives a day no more than a day when the range is too short', () => {
    // 60 hours across 3 days is 20 hours a day, which is not a day. The owner
    // has already been told the range is too short on the job form; the route's
    // honest answer is the most a day can hold, not the arithmetic.
    expect(minutes({ ...JOB, estimated_hours: 60 }, { day: 1, of: 3 })).toBe(480);
  });

  it('falls back to the default when there are hours on no job', () => {
    expect(minutes({ ...JOB, estimated_hours: null }, { day: 2, of: 3 })).toBe(120);
  });

  it('carries the span so the row can say which day this is', () => {
    const stop = toPlanStop(JOB, 120, { placement: { day: 2, of: 4 }, capacityHours: 8 });
    expect(stop.span).toEqual({ day: 2, of: 4, totalHours: 16 });
    // And says nothing at all on an ordinary job, so no row grows a badge it
    // does not need.
    expect(toPlanStop(JOB, 120, { placement: { day: 1, of: 1 }, capacityHours: 8 }).span).toBeNull();
  });
});

describe('a clock that admits the day ran out', () => {
  it('reads normally inside the day', () => {
    expect(formatClockLabel(8 * 60)).toBe('8:00 AM');
    expect(formatClockLabel(23 * 60 + 59)).toBe('11:59 PM');
  });

  it('says +1d instead of a third 11:59 PM', () => {
    // formatTimeLabel is right for a STORED time, which cannot be past
    // midnight, and wrong for a computed one, which can.
    expect(formatTimeLabel(25 * 60)).toBe('11:59 PM');
    expect(formatClockLabel(25 * 60)).toBe('1:00 AM +1d');
    expect(formatClockLabel(24 * 60)).toBe('12:00 AM +1d');
  });

  it('is what the plan rows and the finish figures use', () => {
    const SRC = readFileSync('src/app/dashboard/schedule/plan/DayPlanner.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(SRC).toContain('<strong>{formatClockLabel(arrival)}</strong>');
    expect(SRC).toContain('<strong>{formatClockLabel(finish)}</strong>');
    // The workday end is a stored setting, so it keeps the clamping formatter.
    expect(SRC).toContain('formatTimeLabel(parseTimeMinutes(payload.workdayEnd)');
  });
});

/**
 * A JOB WITH NO ESTIMATED HOURS, AND THE TWO ANSWERS IT USED TO GET.
 *
 * The Schedule page counts it as zero — countUnknownDurationByDate deliberately
 * refuses to invent a duration, because inventing hours would close days that
 * are genuinely open. The route planner cannot do that: it has to order the day
 * around something, so it falls back to the account default.
 *
 * Both are right on their own. Together, silently, they produced a Schedule
 * page reading "0 of 136 hours" above a route that had already spent two of
 * them on one of those jobs. The fallback stays; it is labelled now.
 */
describe('a stop the router had to guess the length of', () => {
  const noHours: PlanJobRow = { ...JOB, estimated_hours: null, scheduled_until: null };

  it('still gets planned, on the account default', () => {
    const stop = toPlanStop(noHours, 120);
    expect(stop.visitMinutes).toBe(120);
  });

  it('and is marked as assumed, so the row can say so', () => {
    expect(toPlanStop(noHours, 120).assumedVisit).toBe(true);
  });

  it('is not marked when the job actually says how long it takes', () => {
    expect(toPlanStop({ ...JOB, estimated_hours: 3 }, 120).assumedVisit).toBe(false);
    expect(toPlanStop({ ...JOB, estimated_hours: 3 }, 120).visitMinutes).toBe(180);
  });

  it('treats zero, negative and unparseable the same as missing', () => {
    for (const estimated_hours of [0, -4, Number.NaN, 'abc' as unknown as number]) {
      const stop = toPlanStop({ ...JOB, estimated_hours }, 90);
      expect(stop.assumedVisit, String(estimated_hours)).toBe(true);
      expect(stop.visitMinutes, String(estimated_hours)).toBe(90);
    }
  });

  /** A multi-day job HAS hours — they are just divided. That is a share, not a
   *  guess, and labelling it "assumed" would be a second wrong answer. */
  it('does not call a multi-day share an assumption', () => {
    const stop = toPlanStop({ ...JOB, estimated_hours: 16 }, 120, { placement: { day: 1, of: 2 }, capacityHours: 8 });
    expect(stop.assumedVisit).toBe(false);
    expect(stop.visitMinutes).toBe(480);
  });

  it('the row shows it, and links at the field that settles it', () => {
    const SRC = readFileSync('src/app/dashboard/schedule/plan/DayPlanner.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(SRC).toContain('stop.assumedVisit ?');
    expect(SRC).toContain('Assumed: {minutesLabel(stop.visitMinutes)}');
    // A link to the job, not a bare badge — the fix is one field away.
    expect(SRC).toMatch(/className="plan-badge assumed"[\s\S]{0,40}title=/);
    expect(SRC).toMatch(/href=\{`\/dashboard\/jobs\/\$\{stop\.id\}`\}\s*\n\s*className="plan-badge assumed"/);
    // And it says the other half out loud: zero against capacity.
    expect(SRC).toContain('zero hours against the day');
  });
});
