import { describe, it, expect } from 'vitest';
import { computeBookingDays, computeHoursByDate, expandBlockedDates } from '@/lib/booking';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';

// A booking config with every weekday open and three windows, so the engine's
// day-selection is deterministic and we can isolate the new gates.
function avail(over: Record<string, unknown> = {}) {
  return bookingAvailabilityFromAccount({
    timezone: 'America/New_York',
    booking_weekdays: '0,1,2,3,4,5,6',
    booking_windows: '["08:00","13:00","17:00"]',
    booking_max_per_day: 4,
    booking_lead_days: 0,
    workday_start: '08:00',
    workday_end: '17:00',
    schedule_day_hours: 8,
    job_buffer_minutes: 0,
    ...over,
  });
}

const NOW = new Date('2026-07-01T12:00:00Z'); // noon UTC → same calendar day in ET

describe('computeHoursByDate', () => {
  it('spreads a multi-day job across days, capped at capacity', () => {
    const map = computeHoursByDate([{ scheduled_for: '2026-07-01', estimated_hours: 10 }], 8, 0);
    expect(map.get('2026-07-01')).toBe(8);
    expect(map.get('2026-07-02')).toBe(2);
  });

  it('adds the per-job buffer to the footprint', () => {
    const map = computeHoursByDate([{ scheduled_for: '2026-07-01', estimated_hours: 3 }], 8, 60);
    expect(map.get('2026-07-01')).toBe(4); // 3h + 1h buffer
  });

  it('a zero-hour job with no buffer contributes nothing', () => {
    const map = computeHoursByDate([{ scheduled_for: '2026-07-01', estimated_hours: 0 }], 8, 0);
    expect(map.get('2026-07-01')).toBeUndefined();
  });
});

describe('expandBlockedDates', () => {
  it('expands an inclusive range within the horizon', () => {
    const set = expandBlockedDates([{ start_date: '2026-07-02', end_date: '2026-07-03' }], 21, '2026-07-01');
    expect(set.has('2026-07-01')).toBe(false);
    expect(set.has('2026-07-02')).toBe(true);
    expect(set.has('2026-07-03')).toBe(true);
    expect(set.has('2026-07-04')).toBe(false);
  });
});

describe('computeBookingDays gating', () => {
  it('only offers windows inside working hours (17:00 excluded when workday ends 17:00)', () => {
    const days = computeBookingDays({ availability: avail(), countByDate: new Map(), takenByDate: new Map(), now: NOW });
    expect(days[0].slots.map((s) => s.time)).toEqual(['08:00', '13:00']);
  });

  it('auto-blocks a day once booked hours reach capacity', () => {
    const hoursByDate = new Map([['2026-07-01', 8]]);
    const days = computeBookingDays({ availability: avail(), countByDate: new Map(), hoursByDate, takenByDate: new Map(), now: NOW });
    expect(days.some((d) => d.dateKey === '2026-07-01')).toBe(false);
    expect(days[0].dateKey).toBe('2026-07-02');
  });

  it('skips owner-blocked dates', () => {
    const blockedDates = new Set(['2026-07-01', '2026-07-02']);
    const days = computeBookingDays({ availability: avail(), countByDate: new Map(), takenByDate: new Map(), blockedDates, now: NOW });
    expect(days[0].dateKey).toBe('2026-07-03');
  });

  it('still respects the count cap alongside the hours cap', () => {
    const countByDate = new Map([['2026-07-01', 4]]);
    const days = computeBookingDays({ availability: avail(), countByDate, takenByDate: new Map(), now: NOW });
    expect(days.some((d) => d.dateKey === '2026-07-01')).toBe(false);
  });
});
