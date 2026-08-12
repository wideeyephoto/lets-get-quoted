import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
/** An assertion that something is ABSENT must not be satisfied — or defeated —
 *  by a comment explaining why it is absent. */
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const COLUMNS = read('src', 'app', 'dashboard', 'schedule', 'CalendarDayColumns.tsx');
const CALENDAR = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
const MONTH = read('src', 'app', 'dashboard', 'schedule', 'ScheduleMonthCapacity.tsx');
const GLOBALS = read('src', 'app', 'globals.css');

/**
 * The weekend switches were two chips in the toolbar. The argument that put
 * them there was right — the fact worth knowing is that there is work on a day
 * you cannot see, and a gear buried it two clicks deep — but the shape was
 * wrong: 224px of a 728px row, permanently, reading "Saturday 0 / Sunday 0" in
 * every month with no weekend work.
 *
 * So the fact and the control are split, and this is the pair of assertions
 * that keeps them split.
 */
describe('the weekend day columns', () => {
  it('replaces the chips with menu rows', () => {
    expect(existsSync(join(process.cwd(), 'src', 'app', 'dashboard', 'schedule', 'CalendarWeekendToggles.tsx'))).toBe(false);
    expect(GLOBALS).not.toContain('.calendar-days-chip');
    expect(COLUMNS).toContain('role="menuitemcheckbox"');
    expect(CALENDAR).toContain('<DayColumnMenuRows');
  });

  /**
   * These do exactly one thing: drop a day COLUMN from a grid. Week and Capacity
   * are the two views built out of day columns; in the other five the control
   * was on screen, pressable and inert — which is worse than absent, because
   * pressing a control and watching nothing happen teaches you it is broken
   * everywhere.
   */
  it('offers them only where there are columns to hide', () => {
    expect(CALENDAR).toContain("const COLUMN_VIEWS = new Set<CalendarView>(['week', 'month'])");
    expect(CALENDAR).toContain('showDayColumns={COLUMN_VIEWS.has(effectiveView)}');
  });

  /**
   * A menu that only opens when you go looking cannot be where "six jobs are
   * booked on a day you cannot see" lives. That is not a setting, it is news,
   * and it gets a line of its own — beside the OTHER line about what the grid is
   * not showing, which is where it fits and where it does not cost the toolbar a
   * second row (nav + notice + views wanted 1,021px of a 728px row).
   */
  it('keeps the one fact worth interrupting for out of the menu', () => {
    expect(CALENDAR).toContain('<HiddenDaysNotice');
    // In the notice area under the toolbar, next to the swapped-view line —
    // not inside .calendar-toolbar.
    const toolbar = CALENDAR.slice(CALENDAR.indexOf('<div className="calendar-toolbar">'), CALENDAR.indexOf('<ScheduleMobileAgenda'));
    expect(toolbar).not.toContain('HiddenDaysNotice');
    expect(COLUMNS).toContain('booked this month on a day the calendar is not showing');
  });

  /** Reading it and undoing it should not be two different gestures. */
  it('carries its own fix', () => {
    expect(COLUMNS).toMatch(/onClick=\{\(\) => onChange\(restored\)\}/);
    expect(COLUMNS).toContain('Show {columns}');
  });

  /** Nothing renders when nothing is hidden, which is most months. */
  it('says nothing when there is nothing to say', () => {
    expect(stripJs(COLUMNS)).toContain('if (hidden.length === 0) return null;');
  });

  /** A tick or an empty box, never colour alone. */
  it('shows the on/off state without relying on colour', () => {
    expect(COLUMNS).toContain('<span className="calendar-col-box"');
    expect(GLOBALS).toContain(".calendar-col-box[data-on]");
  });

  /**
   * August 2026 begins on a Saturday. With both weekend columns off, its first
   * week holds Aug 1 and Aug 2 and nothing else — and the grid drew a full row
   * of empty cells above the 3rd.
   */
  it('drops a week that has nothing left in it', () => {
    expect(MONTH).toContain('weeks.filter((week) => visibleDays.some((dayIndex) => week[dayIndex]))');
  });
});
