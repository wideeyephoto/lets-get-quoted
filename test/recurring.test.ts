import { describe, it, expect } from 'vitest';
import { advanceDate } from '@/lib/recurring';

describe('advanceDate — weekly', () => {
  it('adds 7 days', () => {
    expect(advanceDate('2026-07-25', 'weekly')).toBe('2026-08-01');
  });
  it('crosses a month boundary', () => {
    expect(advanceDate('2026-01-28', 'weekly')).toBe('2026-02-04');
  });
  it('crosses a year boundary', () => {
    expect(advanceDate('2026-12-28', 'weekly')).toBe('2027-01-04');
  });
});

describe('advanceDate — biweekly', () => {
  it('adds 14 days', () => {
    expect(advanceDate('2026-07-25', 'biweekly')).toBe('2026-08-08');
  });
  it('crosses a year boundary', () => {
    expect(advanceDate('2026-12-25', 'biweekly')).toBe('2027-01-08');
  });
});

describe('advanceDate — monthly', () => {
  it('adds one calendar month', () => {
    expect(advanceDate('2026-01-15', 'monthly')).toBe('2026-02-15');
  });
  it('rolls over the year', () => {
    expect(advanceDate('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
  it('clamps Jan 31 to Feb 28 in a non-leap year', () => {
    expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    expect(advanceDate('2028-01-31', 'monthly')).toBe('2028-02-29');
  });
  it('clamps the 31st to a 30-day month', () => {
    expect(advanceDate('2026-03-31', 'monthly')).toBe('2026-04-30');
  });
  it('clamps Dec 31 correctly into January (still 31 days)', () => {
    expect(advanceDate('2026-12-31', 'monthly')).toBe('2027-01-31');
  });
  it('does not roll a clamped date into the following month', () => {
    // The bug this guards: naive +1 month on Jan 30 could land in March.
    expect(advanceDate('2026-01-30', 'monthly')).toBe('2026-02-28');
  });
});
