import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
/** An assertion that something is ABSENT must not be satisfied — or defeated —
 *  by a comment explaining why it is absent. */
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CALENDAR = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
const PAGE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'page.tsx'));
const GLOBALS = read('src', 'app', 'globals.css');

/**
 * Day, Week and Month are one press each; the other four stay in the menu.
 *
 * Seven views will not fit in a segmented control, which is why the menu exists
 * at all. But these three are the zoom level and get switched constantly, and
 * reaching them was two clicks and a read — open the menu, find the row, press.
 */
describe('the calendar view switcher', () => {
  it('promotes exactly Day, Week and Month out of the menu', () => {
    const quick = CALENDAR.match(/const QUICK_VIEWS = new Set<CalendarView>\(\[([^\]]*)\]\)/);
    expect(quick, 'QUICK_VIEWS is gone').toBeTruthy();
    const ids = [...quick![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual(['day', 'month', 'week']);
  });

  /**
   * The split is by filter over one list, so the two halves are complementary
   * by construction and no view can fall out of both. That only holds while the
   * menu renders MENU_VIEW_OPTIONS rather than the full list — render
   * VIEW_OPTIONS there again and the three appear twice.
   */
  it('leaves the remaining four in the menu, and only those', () => {
    expect(CALENDAR).toMatch(/const QUICK_VIEW_OPTIONS = VIEW_OPTIONS\.filter\(\(option\) => QUICK_VIEWS\.has\(option\.id\)\)/);
    expect(CALENDAR).toMatch(/const MENU_VIEW_OPTIONS = VIEW_OPTIONS\.filter\(\(option\) => !QUICK_VIEWS\.has\(option\.id\)\)/);
    // .filter() before .map(): Projects is dropped from the list when there is
    // no multi-day work to draw (and kept while you are in it) — see
    // hasProjects. The half-and-half split is what this is really asserting.
    expect(CALENDAR).toMatch(/\{MENU_VIEW_OPTIONS\.filter\([\s\S]{0,200}?\)\.map\(/);
    expect(CALENDAR).not.toMatch(/\{VIEW_OPTIONS\.map\(/);
  });

  it('routes the buttons and the menu rows through the same onChange', () => {
    expect(CALENDAR).toMatch(/\{QUICK_VIEW_OPTIONS\.map\(/);
    expect(CALENDAR).toMatch(/onClick=\{\(\) => onChange\(option\.id\)\}/);
  });

  it('styles them as one segmented control', () => {
    expect(GLOBALS).toContain('.calendar-view-quick {');
    expect(GLOBALS).toContain('.calendar-view-quick-btn.active');
  });
});

/**
 * ONE ROW, AND IT TOOK MOVING TWO THINGS OUT OF IT TO GET THERE.
 *
 * Measured before: 85px tall — two rows — at 1920, 1440, 1366 and 1024 alike,
 * because the nav (304px) and the controls (600px) could not both fit a calendar
 * column that is 728px at its widest. Measured after: 46px at every one of them,
 * plus 1760, 768 and 640.
 */
describe('the calendar toolbar is one row', () => {
  /**
   * The compaction rules used to be @media queries, written when the calendar
   * WAS the page. It is a column in a three-column workbench now, so at 1920 the
   * window says "huge" and the calendar has 728px — the labels stayed on at
   * exactly the widths where the row was breaking.
   */
  it('measures itself against the column, not the window', () => {
    expect(GLOBALS).toMatch(/\.calendar-toolbar-wrap\s*\{\s*container:\s*caltoolbar \/ inline-size;/);
    expect(GLOBALS).toContain('@container caltoolbar (max-width: 720px)');
    expect(CALENDAR).toContain('<div className="calendar-toolbar-wrap">');
    // The old window-width version has to be gone, or it fires as well and the
    // labels vanish on a wide window with a wide calendar.
    expect(GLOBALS).not.toContain('@media (max-width: 900px) {\n  .calendar-view-quick-btn');
  });

  /**
   * The container is the toolbar's own box and NOT the panel: `container-type`
   * implies `contain: layout`, which makes the element a containing block for
   * fixed-position descendants — on the panel that would re-anchor the job
   * dialog and the drag ghost onto the calendar.
   */
  it('scopes the container to the toolbar rather than the panel', () => {
    expect(GLOBALS).not.toMatch(/\.schedule-calendar-panel \{[^}]*container-type/);
  });

  /** Nothing in it belongs to a phone: the agenda has its own day nav, its own
   *  Day/Month tabs and its own Today. Hiding three of its four children and
   *  leaving the row was how the phone ended up showing two weekend chips and
   *  nothing else — measured 308px wide at 390. */
  it('does not render on a phone at all', () => {
    expect(GLOBALS).toMatch(/\.calendar-toolbar-wrap\s*\{\s*display:\s*none;/);
    expect(GLOBALS).not.toContain('.calendar-toolbar .calendar-view-menu { display: none; }');
  });

  /** It existed for one caller passing one control, which moved out — and then
   *  nobody passed it, so it rendered `undefined` into the row at every width. */
  it('has no leftover slot for controls nobody passes', () => {
    expect(stripJs(CALENDAR)).not.toContain('toolbarActions');
  });
});

/**
 * The rail toggle is gone. It read "Show jobs (10)" one row under a stat that
 * read "10 · Ready to book" and linked to the same rail — the same number and
 * the same destination, twice.
 */
describe('the schedule toolbar has no rail toggle', () => {
  it('deletes the component', () => {
    expect(existsSync(join(process.cwd(), 'src', 'app', 'dashboard', 'schedule', 'RailToggle.tsx'))).toBe(false);
  });

  it('and mounts nothing in its place', () => {
    expect(PAGE).not.toMatch(/<RailToggle/);
    expect(PAGE).not.toMatch(/toolbarActions=\{/);
  });

  /**
   * The rules have to go too, and this is the one that matters: nothing sets
   * the attribute any more, so if the CSS survived, anyone whose localStorage
   * still said "collapsed" would... actually be fine, because the attribute is
   * what the selector keys on. Leaving dead rules that hide the queue is a trap
   * waiting for the next person who reintroduces a body attribute by that name.
   */
  it('and leaves no rule that could still hide the rail', () => {
    expect(GLOBALS).not.toContain("body[data-sched-rail='collapsed']");
    expect(GLOBALS).not.toContain('.sched-rail-toggle {');
  });

  /**
   * THE STAT THAT MADE THE TOGGLE REDUNDANT HAS SINCE GONE THE SAME WAY.
   *
   * "10 · Ready to book" was kept when RailToggle was deleted, on the grounds
   * that it was the one control saying that number. It was not — it was the
   * fourth, alongside the primary button, the attention banner and the
   * summary-line counter, and it counted a different population from two of
   * them. One bar replaces all four; the queue is still reachable, from it.
   */
  it('says the queue count once, in the bar', () => {
    expect(PAGE).toContain('<ScheduleQueueBar');
    expect(PAGE).not.toContain('Ready to book');
    expect(PAGE).not.toContain('need dates');
    expect(PAGE).not.toMatch(/<UnscheduledBanner/);
    expect(PAGE).not.toMatch(/<ScheduleJobButton/);
  });
});
