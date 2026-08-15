import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'page.tsx'));
const SETTINGS = read('src', 'app', 'dashboard', 'schedule', 'settings', 'page.tsx');
const PLANNER = stripJs(read('src', 'app', 'dashboard', 'schedule', 'plan', 'DayPlanner.tsx'));
const CSS = read('src', 'app', 'globals.css');

/* ===========================================================================
   WHAT CONFIGURES SCHEDULING, AWAY FROM WHAT IS SCHEDULED
   ---------------------------------------------------------------------------
   A booking link, a working-hours panel, a weather panel and a reminders switch
   sat at the foot of the calendar under a heading trying to explain what the
   four had in common. They are the reason the page ran ~2,700px on a desktop,
   and none of them is something you touch while dispatching: working hours
   change twice a year, the calendar changes every hour.
   ======================================================================== */
describe('the schedule settings have their own route', () => {
  it('exists and is reachable from the calendar', () => {
    expect(existsSync(join(process.cwd(), 'src', 'app', 'dashboard', 'schedule', 'settings', 'page.tsx'))).toBe(true);
    expect(PAGE).toContain('href="/dashboard/schedule/settings"');
    expect(PLANNER).toContain('href="/dashboard/schedule/settings"');
  });

  it('carries all four surfaces', () => {
    expect(SETTINGS).toContain('<WorkingHoursPanel');
    expect(SETTINGS).toContain('<WeatherPanel');
    expect(SETTINGS).toContain('id="booking-availability"');
    expect(SETTINGS).toContain('label="Appointment reminders"');
  });

  it('and the calendar carries none of them', () => {
    expect(PAGE).not.toContain('<WorkingHoursPanel');
    expect(PAGE).not.toContain('<WeatherPanel');
    expect(PAGE).not.toContain('<AutomationLink');
    expect(PAGE).not.toContain('id="booking-availability"');
  });

  /** The map is a route tool about work that is already booked. It annotates
   *  the calendar, so it stays beside it. */
  it('keeps the map on the calendar', () => {
    expect(PAGE).toContain('<ScheduleMap');
    expect(SETTINGS).not.toContain('<ScheduleMap');
  });

  /** Somebody who arrived here from the calendar is mid-task on the calendar,
   *  and the browser's back button is not a control this page offers. */
  it('offers a way back', () => {
    expect(SETTINGS).toContain('className="sched-settings-back" href="/dashboard/schedule"');
    expect(CSS).toContain('.sched-settings-back {');
  });
});

/**
 * A SECOND accounts SELECT USED TO RUN ON EVERY CALENDAR LOAD — eleven booking
 * columns, feeding one folded status pill at the very bottom of the page. The
 * pill reads them on the settings route now.
 */
describe('the calendar stopped fetching what it no longer shows', () => {
  it('makes one fewer round trip', () => {
    expect(PAGE).not.toContain('instant_book_geo_mode');
    expect(PAGE).not.toContain('bookingAvailabilityFromAccount');
    expect(PAGE).not.toContain('weatherSettings');
  });

  /** getAvailableBookingDays survives, and for one reason only: the pending
   *  booking-requests panel needs to know whether a second choice is still
   *  free. Losing that would silently change what that panel can say. */
  it('but still reads what the booking-requests panel needs', () => {
    expect(PAGE).toContain('const bookingDays = bookingUrl ? await getAvailableBookingDays(supabase, accountId) : [];');
    expect(PAGE).toContain('openSlots={');
  });

  /** The settings route computes its own rather than importing a snapshot. */
  it('and the settings route reads them itself', () => {
    expect(SETTINGS).toContain('bookingAvailabilityFromAccount');
    expect(SETTINGS).toContain('weatherSettings(supabase, accountId)');
  });
});

/** Measured at 17px high on a phone — a link you hit by luck. Both controls at
 *  the foot of a 700px calendar are navigations off the page. */
describe('the way out is a target you can hit', () => {
  it('gives the foot links a 44px floor', () => {
    const block = CSS.slice(CSS.indexOf('.schedule-panel-foot-links > a {'));
    expect(block.slice(0, block.indexOf('}'))).toContain('min-height: 44px;');
  });

  /** It used to be "Schedule settings ↓", which was honest when the settings
   *  were 1,500px below on the same page. */
  it('and stops promising a jump down the page', () => {
    expect(PAGE).not.toContain('Schedule settings &darr;');
    expect(PAGE).not.toContain('href="#schedule-settings"');
  });
});
