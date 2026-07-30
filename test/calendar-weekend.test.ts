import { describe, it, expect } from 'vitest';
import { normalizeWeekendDays, serializeWeekendDays, type WeekendDays } from '@/lib/dashboard-views';

describe('calendar weekend columns', () => {
  it('shows both days when no cookie has been set', () => {
    expect(normalizeWeekendDays(undefined)).toEqual({ sat: true, sun: true });
    expect(normalizeWeekendDays(null)).toEqual({ sat: true, sun: true });
  });

  it('round-trips every combination', () => {
    const cases: WeekendDays[] = [
      { sat: true, sun: true },
      { sat: true, sun: false },
      { sat: false, sun: true },
      { sat: false, sun: false },
    ];
    for (const days of cases) {
      expect(normalizeWeekendDays(serializeWeekendDays(days))).toEqual(days);
    }
  });

  it('never serializes to an empty string', () => {
    // An empty cookie value can be dropped by the client, and a MISSING cookie
    // means "show everything" — which would silently undo a Mon–Fri calendar.
    expect(serializeWeekendDays({ sat: false, sun: false })).toBe('none');
    expect(normalizeWeekendDays('none')).toEqual({ sat: false, sun: false });
  });

  it('treats junk as both hidden rather than throwing', () => {
    expect(normalizeWeekendDays('')).toEqual({ sat: false, sun: false });
    expect(normalizeWeekendDays('garbage')).toEqual({ sat: false, sun: false });
    expect(normalizeWeekendDays(42)).toEqual({ sat: true, sun: true });
  });
});
