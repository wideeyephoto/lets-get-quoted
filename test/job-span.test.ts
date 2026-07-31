import { describe, it, expect } from 'vitest';
import {
  daysBetweenInclusive,
  expandScheduledJobs,
  formatJobSchedule,
  getJobScheduleSpanDays,
  type SchedulableJob,
} from '@/lib/jobs';
import { computeHoursByDate } from '@/lib/booking';

const job = (over: Partial<SchedulableJob> = {}): SchedulableJob => ({
  status: 'in_progress',
  scheduled_for: '2026-08-04',
  scheduled_until: null,
  estimated_hours: null,
  ...over,
});

describe('daysBetweenInclusive', () => {
  it('counts both ends', () => {
    expect(daysBetweenInclusive('2026-08-04', '2026-08-06')).toBe(3);
    expect(daysBetweenInclusive('2026-08-04', '2026-08-04')).toBe(1);
  });

  it('survives a DST boundary', () => {
    // Nov 1 2026 is the US fall-back; the range is 25 hours per day-ish, and
    // flooring instead of rounding would silently drop a day.
    expect(daysBetweenInclusive('2026-10-31', '2026-11-02')).toBe(3);
    // Spring forward, 23-hour day.
    expect(daysBetweenInclusive('2026-03-07', '2026-03-09')).toBe(3);
  });

  it('rejects a range that runs backwards or is incomplete', () => {
    expect(daysBetweenInclusive('2026-08-06', '2026-08-04')).toBeNull();
    expect(daysBetweenInclusive('2026-08-04', null)).toBeNull();
    expect(daysBetweenInclusive(null, '2026-08-06')).toBeNull();
    expect(daysBetweenInclusive('2026-08-04', 'not-a-date')).toBeNull();
  });
});

describe('how many days a job blocks', () => {
  it('uses the dates the owner entered', () => {
    expect(getJobScheduleSpanDays(job({ scheduled_until: '2026-08-06' }), 8)).toBe(3);
  });

  // The whole point of the change: one number in account settings was deciding
  // how every job drew on the calendar.
  it('ignores the account capacity once a range is entered', () => {
    const ranged = job({ scheduled_until: '2026-08-06', estimated_hours: 40 });
    for (const capacity of [4, 8, 10, 12, 24]) {
      expect(getJobScheduleSpanDays(ranged, capacity)).toBe(3);
    }
  });

  it('still derives a span from hours when no range is entered', () => {
    expect(getJobScheduleSpanDays(job({ estimated_hours: 16 }), 8)).toBe(2);
    expect(getJobScheduleSpanDays(job({ estimated_hours: 24 }), 8)).toBe(3);
    // Same job, capacity moved — this is the behaviour being retired, kept as
    // the fallback for jobs nobody has given a range.
    expect(getJobScheduleSpanDays(job({ estimated_hours: 24 }), 12)).toBe(2);
  });

  it('treats a job with no hours and no range as one day', () => {
    expect(getJobScheduleSpanDays(job(), 8)).toBe(1);
    expect(getJobScheduleSpanDays(job({ estimated_hours: 0 }), 8)).toBe(1);
  });

  it('keeps an entered range on a finished job but collapses a guessed one', () => {
    // A range somebody typed is a fact and should stay on the calendar; a span
    // guessed from hours is noise once the work is over.
    expect(getJobScheduleSpanDays(job({ status: 'complete', scheduled_until: '2026-08-06' }), 8)).toBe(3);
    expect(getJobScheduleSpanDays(job({ status: 'complete', estimated_hours: 24 }), 8)).toBe(1);
  });

  it('falls back cleanly when the migration has not run', () => {
    // The column reads undefined, not null, before 2026-07-30-job-end-date.sql.
    const legacy = { status: 'in_progress', scheduled_for: '2026-08-04', estimated_hours: 16 } as SchedulableJob;
    expect(getJobScheduleSpanDays(legacy, 8)).toBe(2);
  });
});

describe('expanding jobs onto calendar days', () => {
  it('draws one occurrence per day of the entered range', () => {
    const occurrences = expandScheduledJobs([job({ scheduled_until: '2026-08-06' })], 8);
    expect(occurrences.map((o) => o.scheduled_for)).toEqual(['2026-08-04', '2026-08-05', '2026-08-06']);
  });

  it('crosses a month boundary', () => {
    const occurrences = expandScheduledJobs([job({ scheduled_for: '2026-07-30', scheduled_until: '2026-08-02' })], 8);
    expect(occurrences.map((o) => o.scheduled_for)).toEqual(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02']);
  });
});

describe('schedule label', () => {
  it('shows a single day unchanged', () => {
    expect(formatJobSchedule('2026-08-04', null)).toBe('Aug 4, 2026');
    expect(formatJobSchedule('2026-08-04', '08:00')).toMatch(/^Aug 4, 2026 at /);
  });

  it('shows a range with its length', () => {
    expect(formatJobSchedule('2026-08-04', null, '2026-08-06')).toBe('Aug 4 – Aug 6, 2026 (3 days)');
  });

  it('keeps the arrival time on a range', () => {
    expect(formatJobSchedule('2026-08-04', '08:00', '2026-08-06')).toMatch(/^Aug 4 – Aug 6, 2026 at .+ \(3 days\)$/);
  });

  it('spells out both years when the job runs across New Year', () => {
    expect(formatJobSchedule('2026-12-30', null, '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027 (4 days)');
  });

  it('ignores an end date that is not after the start', () => {
    expect(formatJobSchedule('2026-08-04', null, '2026-08-04')).toBe('Aug 4, 2026');
    expect(formatJobSchedule('2026-08-04', null, '2026-08-01')).toBe('Aug 4, 2026');
  });

  it('still says when nothing is scheduled', () => {
    expect(formatJobSchedule(null)).toBe('Not yet scheduled');
  });
});

describe('booking capacity across a multi-day job', () => {
  it('spreads the hours over the entered range instead of filling the first day', () => {
    // 12 hours across 3 days is 4 a day — the old code put 8 on day one, 4 on
    // day two and left day three looking completely free.
    const hours = computeHoursByDate([{ scheduled_for: '2026-08-04', scheduled_until: '2026-08-06', estimated_hours: 12 }], 8, 0);
    expect(hours.get('2026-08-04')).toBeCloseTo(4, 5);
    expect(hours.get('2026-08-05')).toBeCloseTo(4, 5);
    expect(hours.get('2026-08-06')).toBeCloseTo(4, 5);
  });

  it('leaves room alongside a long but light job', () => {
    // Six hours over three days should not block three whole days.
    const hours = computeHoursByDate([{ scheduled_for: '2026-08-04', scheduled_until: '2026-08-06', estimated_hours: 6 }], 8, 0);
    for (const key of ['2026-08-04', '2026-08-05', '2026-08-06']) {
      expect(hours.get(key)!).toBeLessThan(8);
    }
  });

  it('never books a day beyond capacity', () => {
    const hours = computeHoursByDate([{ scheduled_for: '2026-08-04', scheduled_until: '2026-08-05', estimated_hours: 40 }], 8, 0);
    expect(hours.get('2026-08-04')).toBe(8);
    expect(hours.get('2026-08-05')).toBe(8);
  });

  it('keeps the old fill-day-by-day behaviour with no range', () => {
    const hours = computeHoursByDate([{ scheduled_for: '2026-08-04', estimated_hours: 12 }], 8, 0);
    expect(hours.get('2026-08-04')).toBe(8);
    expect(hours.get('2026-08-05')).toBe(4);
    expect(hours.get('2026-08-06')).toBeUndefined();
  });

  it('counts the buffer into the spread', () => {
    const hours = computeHoursByDate([{ scheduled_for: '2026-08-04', scheduled_until: '2026-08-05', estimated_hours: 3 }], 8, 60);
    // (3 + 1) / 2 days.
    expect(hours.get('2026-08-04')).toBeCloseTo(2, 5);
  });
});
