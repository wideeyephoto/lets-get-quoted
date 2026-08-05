import { describe, it, expect } from 'vitest';
import {
  capacityStatus,
  crewLabel,
  dayStrip,
  jobCountLabel,
  longDateLabel,
  monthKeyOf,
  parseDateKey,
  relativeDayLabel,
  shiftDateKey,
  shortCrewName,
  toDateKey,
  weekdayShort,
} from '@/lib/schedule-agenda';

describe('date keys are local, not UTC', () => {
  // The bug this exists to stop: `new Date('2026-08-08')` is midnight UTC, so
  // in Michigan it is the evening of the 7th and every label is a day early.
  it('reads a key as the day it says', () => {
    const date = parseDateKey('2026-08-08');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(8);
  });

  it('round-trips', () => {
    expect(toDateKey(parseDateKey('2026-01-01'))).toBe('2026-01-01');
    expect(toDateKey(parseDateKey('2026-12-31'))).toBe('2026-12-31');
  });

  it('names the right weekday', () => {
    expect(weekdayShort('2026-08-08')).toBe('Sat');
    expect(longDateLabel('2026-08-08')).toBe('Saturday, August 8');
  });
});

describe('stepping a day', () => {
  it('crosses a month', () => {
    expect(shiftDateKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDateKey('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('crosses a year', () => {
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('crosses February in a leap year', () => {
    expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDateKey('2028-02-29', 1)).toBe('2028-03-01');
  });

  // The month key is what decides whether stepping a day is local state or a
  // navigation, so it has to change on exactly the right step.
  it('gives the month a day belongs to', () => {
    expect(monthKeyOf('2026-08-31')).toBe('2026-08');
    expect(monthKeyOf(shiftDateKey('2026-08-31', 1))).toBe('2026-09');
  });
});

describe('the five-day strip', () => {
  it('centres on the day you are looking at', () => {
    expect(dayStrip('2026-08-08')).toEqual([
      '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10',
    ]);
  });

  // Centred, not forward-only: a strip you can only walk one way is a preview,
  // and the day you are on would sit permanently against its left edge.
  it('always puts the selected day in the middle', () => {
    const strip = dayStrip('2026-08-08');
    expect(strip[2]).toBe('2026-08-08');
  });

  it('walks off the end of a month without breaking', () => {
    expect(dayStrip('2026-08-31')).toEqual([
      '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
    ]);
  });
});

describe('near days are named, far ones are not', () => {
  it('says Today, Tomorrow and Yesterday', () => {
    expect(relativeDayLabel('2026-08-08', '2026-08-08')).toBe('Today');
    expect(relativeDayLabel('2026-08-09', '2026-08-08')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-08-07', '2026-08-08')).toBe('Yesterday');
  });

  // No "in 9 days" — the heading already says which day it is, and the arithmetic
  // adds nothing you cannot read off it.
  it('says nothing at all past that', () => {
    expect(relativeDayLabel('2026-08-17', '2026-08-08')).toBeNull();
    expect(relativeDayLabel('2026-07-30', '2026-08-08')).toBeNull();
  });
});

describe('how full a day is', () => {
  it('states it in words, not only a bar', () => {
    expect(capacityStatus(0, 8).word).toBe('Nothing booked');
    expect(capacityStatus(3, 8).word).toBe('Room to spare');
    expect(capacityStatus(6, 8).word).toBe('Nearly full');
    expect(capacityStatus(8, 8).word).toBe('Full');
    expect(capacityStatus(9.5, 8).word).toBe('Over capacity');
  });

  it('says the numbers as well', () => {
    expect(capacityStatus(6.5, 8).detail).toBe('6.5h of 8h booked');
    expect(capacityStatus(4, 8).detail).toBe('4h of 8h booked');
  });

  // The bar cannot go past its own end, but "Full" and "Over capacity" are not
  // the same thing to somebody deciding whether to take another job.
  it('clamps the bar but not the verdict', () => {
    const over = capacityStatus(12, 8);
    expect(over.pct).toBe(100);
    expect(over.state).toBe('over');
    expect(capacityStatus(8, 8).state).toBe('full');
  });

  it('treats a missing capacity as a working day, not as zero', () => {
    // Dividing by a zero capacity would make every day Infinity per cent full.
    expect(capacityStatus(4, 0).capacity).toBe(8);
    expect(capacityStatus(4, 0).pct).toBe(50);
  });

  it('never reports negative hours', () => {
    expect(capacityStatus(-3, 8).booked).toBe(0);
    expect(capacityStatus(-3, 8).state).toBe('empty');
  });
});

describe('crew on a card', () => {
  it('is a name, not a puzzle', () => {
    expect(shortCrewName('Marco Rivera')).toBe('Marco R.');
    expect(shortCrewName('Ty')).toBe('Ty');
    expect(shortCrewName('Ana Maria Ruiz')).toBe('Ana R.');
  });

  it('shows two and counts the rest', () => {
    expect(crewLabel([])).toBeNull();
    expect(crewLabel(['Marco Rivera'])).toBe('Marco R.');
    expect(crewLabel(['Marco Rivera', 'Ty Brooks'])).toBe('Marco R., Ty B.');
    expect(crewLabel(['Marco Rivera', 'Ty Brooks', 'Ana Ruiz', 'Sam Coe'])).toBe('Marco R., Ty B. +2');
  });
});

describe('counting the day', () => {
  it('says nothing rather than zero', () => {
    expect(jobCountLabel(0)).toBe('Nothing scheduled');
    expect(jobCountLabel(1)).toBe('1 job');
    expect(jobCountLabel(3)).toBe('3 jobs');
  });
});
