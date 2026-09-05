import { describe, expect, it } from 'vitest';
import {
  dateToKey,
  keyToDate,
  formatDisplayDate,
  buildCalendarCells,
} from '@/components/theme-date-picker';

describe('ThemeDatePicker Helper Logic', () => {
  it('formats dates to YYYY-MM-DD keys without timezone shift', () => {
    const d = new Date(2026, 8, 5); // Month 8 is September (0-indexed)
    expect(dateToKey(d)).toBe('2026-09-05');
  });

  it('parses YYYY-MM-DD keys into local Date objects', () => {
    const parsed = keyToDate('2026-09-05');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(8); // September
    expect(parsed?.getDate()).toBe(5);
  });

  it('formats YYYY-MM-DD keys into user-friendly MM/DD/YYYY display strings', () => {
    expect(formatDisplayDate('2026-09-05')).toBe('09/05/2026');
    expect(formatDisplayDate('2024-12-31')).toBe('12/31/2024');
    expect(formatDisplayDate('')).toBe('MM/DD/YYYY');
  });

  it('builds exact 42-cell calendar grid matching September 2026 screenshot', () => {
    // September 2026 starts on Tuesday (day 2 of the week, where Sunday is 0)
    const sep2026 = new Date(2026, 8, 1);
    const cells = buildCalendarCells(sep2026);

    // Exactly 42 cells (6 rows x 7 days)
    expect(cells).toHaveLength(42);

    // First two days are trailing from August (Aug 30 and Aug 31)
    expect(cells[0].day).toBe(30);
    expect(cells[0].dateKey).toBe('2026-08-30');
    expect(cells[0].isAdjacent).toBe(true);
    expect(cells[0].monthDelta).toBe(-1);

    expect(cells[1].day).toBe(31);
    expect(cells[1].dateKey).toBe('2026-08-31');
    expect(cells[1].isAdjacent).toBe(true);
    expect(cells[1].monthDelta).toBe(-1);

    // September 1 is at index 2
    expect(cells[2].day).toBe(1);
    expect(cells[2].dateKey).toBe('2026-09-01');
    expect(cells[2].isAdjacent).toBe(false);
    expect(cells[2].monthDelta).toBe(0);

    // September 5 (the date in the user's screenshot) is at index 6 (Saturday)
    expect(cells[6].day).toBe(5);
    expect(cells[6].dateKey).toBe('2026-09-05');
    expect(cells[6].isAdjacent).toBe(false);

    // September 30 (Wednesday) is at index 31
    expect(cells[31].day).toBe(30);
    expect(cells[31].dateKey).toBe('2026-09-30');
    expect(cells[31].isAdjacent).toBe(false);

    // October 1 through 10 are leading days from next month
    expect(cells[32].day).toBe(1);
    expect(cells[32].dateKey).toBe('2026-10-01');
    expect(cells[32].isAdjacent).toBe(true);
    expect(cells[32].monthDelta).toBe(1);

    expect(cells[41].day).toBe(10);
    expect(cells[41].dateKey).toBe('2026-10-10');
    expect(cells[41].isAdjacent).toBe(true);
    expect(cells[41].monthDelta).toBe(1);
  });
});
