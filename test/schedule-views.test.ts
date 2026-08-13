import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const CALENDAR = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
const PAGE = read('src', 'app', 'dashboard', 'schedule', 'page.tsx');
const SUMMARY = read('src', 'app', 'dashboard', 'schedule', 'ScheduleDaySummary.tsx');
const GLOBALS = read('src', 'app', 'globals.css');

/**
 * A seven-column week cost a Mon–Fri business two columns of nothing and paid
 * for them out of the five that matter: measured ~78px a weekday at 1920, which
 * is where this pass's clipped labels came from. Mon–Fri measured 134px.
 */
describe('the week the calendar opens on', () => {
  it('follows the working week the business already configured', () => {
    expect(PAGE).toContain('sat: workingWeekdays.includes(6)');
    expect(PAGE).toContain('sun: workingWeekdays.includes(0)');
  });

  /** Only the default. A cookie wins in both directions, so anyone who has ever
   *  pressed one of these keeps exactly what they chose. */
  it('never overrides a choice already made', () => {
    expect(PAGE).toContain('const weekendCookie = cookies().get(CALENDAR_WEEKEND_COOKIE)?.value;');
    expect(PAGE).toMatch(/weekendCookie\s*\n?\s*\? normalizeWeekendDays\(weekendCookie\)/);
  });

  /**
   * The step was the column count, which was right while a week meant seven
   * columns. At five: from Monday the 10th, +5 is Saturday the 15th, which snaps
   * back to the week of the 9th — press Next twice, see the same five days.
   */
  it('steps a whole week even when it draws five days', () => {
    expect(CALENDAR).toContain("const stepDays = effectiveView === 'week' && span === 7 ? 7 : timelineDayKeys.length > 1 ? timelineDayKeys.length : 1;");
  });

  /**
   * The notice that reports work on a hidden column has to look at the hidden
   * columns. Reading the filtered list counted them as zero, which made the one
   * state it exists for the one state it could never report.
   */
  it('counts weekend work over all seven days, not the five on screen', () => {
    expect(CALENDAR).toContain('const weekDayKeys = useMemo(');
    const counts = CALENDAR.slice(CALENDAR.indexOf('const weekendJobCounts = useMemo('), CALENDAR.indexOf('const weekendRangeWord'));
    expect(counts).toContain('for (const dateKey of weekDayKeys) count(dateKey);');
    expect(counts).not.toContain('visibleWeeks');
  });

  /** Week counts the seven days on screen and Capacity counts the month, so a
   *  fixed "this month" would be wrong half the time about a number the reader
   *  is being asked to act on. */
  it('says which range it counted', () => {
    expect(CALENDAR).toContain("const weekendRangeWord = effectiveView === 'week' ? 'this week' : 'this month';");
  });
});

/**
 * The one view about a single day was the only one that said nothing about it.
 * Capacity colors every cell by how full it is and the phone prints "2h of 8h
 * booked" over the day it shows; the desktop Day view drew eleven hours of
 * ruled lines and left the addition to you.
 */
describe('the Day view summary', () => {
  it('uses the same capacity words as the phone', () => {
    expect(SUMMARY).toContain("from '@/lib/schedule-agenda'");
    expect(SUMMARY).toContain('capacityStatus(bookedHours, capacityHours, unknownJobs)');
    expect(SUMMARY).toContain('className="sched-cap"');
  });

  /** In Week the same strip would be summarising seven days through one. */
  it('renders in Day and nowhere else', () => {
    expect(CALENDAR).toContain("{effectiveView === 'day' ? (\n          <ScheduleDaySummary");
  });

  /** Who is NOT on the day is the useful half: it answers "can I take this on". */
  it('says how many people are free, not who is busy', () => {
    expect(SUMMARY).toContain('const free = crew.filter((member) => !working.has(member.id));');
    expect(SUMMARY).toContain("{free.length === 1 ? 'person' : 'people'} free");
  });

  /** An empty prompt pointing at an empty list is worse than silence. */
  it('offers the queue only when there is something in it', () => {
    expect(SUMMARY).toContain('queueCount > 0 ? (');
    expect(PAGE).toContain('queueCount={approvedUnscheduled}');
  });
});

/**
 * `blockedDays` is the drag guard's reason map and holds every day that is
 * merely at CAPACITY as well. The timeline read it as "closed", so a fully
 * booked weekday came up flagged `Closed · 5` with a tooltip claiming five jobs
 * were scheduled outside working hours — and the `Full` branch one line below
 * was unreachable. Measured on a real account: five of five weekdays.
 */
describe('closed days and busy days are not the same day', () => {
  it('gives the timeline blocks, not the drag guard map', () => {
    expect(CALENDAR).toContain('blockedDays={closedDays}');
    expect(CALENDAR).toContain('const closedDays = useMemo(');
    expect(CALENDAR).toContain('function blockReasonFor(dateKey: string): string | null {');
  });
});

/**
 * A @container block carries no extra specificity, so one written ABOVE the
 * rule it overrides loses on source order and measures as if it were not there
 * — which is exactly what happened here first: the toolbar stayed 365px wide
 * with the rule present and correct 30 lines higher up.
 */
describe('the toolbar container queries', () => {
  it('sit after the rules they override', () => {
    const base = GLOBALS.indexOf('.calendar-view-trigger-text { display: flex;');
    const query = GLOBALS.indexOf('@container caltoolbar (max-width: 780px)');
    expect(base).toBeGreaterThan(0);
    expect(query).toBeGreaterThan(base);
  });

  it('drop the menu button words before the three view labels', () => {
    const quick = GLOBALS.indexOf('@container caltoolbar (max-width: 720px)');
    const trigger = GLOBALS.indexOf('@container caltoolbar (max-width: 780px)');
    expect(quick).toBeGreaterThan(0);
    expect(trigger).toBeGreaterThan(0);
  });
});
