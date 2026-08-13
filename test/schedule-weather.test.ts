import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const LIB = read('src', 'lib', 'weather-data.ts');
const PAGE = read('src', 'app', 'dashboard', 'schedule', 'page.tsx');
const SUMMARY = read('src', 'app', 'dashboard', 'schedule', 'ScheduleDaySummary.tsx');
const GLOBALS = read('src', 'app', 'globals.css');

/**
 * The header deliberately has no weather card: a thirty-day count of "weather
 * conflicts" is not a number anybody acts on. The forecast belongs on the day
 * you are looking at, which is what this is.
 */
describe('weather on the Day view', () => {
  /** An account with the feature off must not pay for a query it will not use,
   *  so the gate is on a column the page already selects. */
  it('costs nothing when the account has it switched off', () => {
    expect(PAGE).toContain('weatherAccount?.weather_alerts_enabled');
    expect(PAGE).toContain('weather_alerts_enabled, service_center_lat, service_center_lng');
  });

  /**
   * jobsAtRisk already answers "which booked work is in trouble" and fetches a
   * forecast per grid cell across up to 200 jobs — a digest's shape. One point
   * answers the Day view's smaller question.
   */
  it('asks about one point, not about every job', () => {
    expect(LIB).toContain('export async function outlookByDay(');
    const fn = LIB.slice(LIB.indexOf('export async function outlookByDay('));
    expect(fn).toContain('const forecasts = await getForecast(createAdminClient(), lat, lng);');
    expect(fn).not.toContain('from(\'jobs\')');
  });

  /** No coordinates, no forecast, feature off — the Day view shows nothing
   *  rather than a shrug. */
  it('returns nothing rather than an unknown', () => {
    const fn = LIB.slice(LIB.indexOf('export async function outlookByDay('));
    expect(fn).toContain('if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};');
    expect(fn).toContain('if (!enabled) return {};');
    expect(fn).toContain('if (forecasts.length === 0) return {};');
  });

  /** Keyed by date, because the anchor day is client state — stepping a day
   *  must not need a round trip. */
  it('is keyed by day so stepping the day is free', () => {
    expect(PAGE).toContain('weatherByDay={weatherByDay}');
    expect(read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx'))
      .toContain('weather={weatherByDay[anchorDayKey] ?? null}');
  });

  /**
   * 'clear' is the answer on most days, and a line reading "Looks fine" every
   * day is furniture you stop seeing — which is what makes the one bad Tuesday
   * invisible.
   */
  it('says nothing on a day worth saying nothing about', () => {
    expect(SUMMARY).toContain("{weather && weather.level !== 'clear' ? (");
  });

  /** "1.1in of rain" and "gusts to 31mph" are what decides whether the crew
   *  goes out; the NWS sentence is kept in the title. */
  it('prints the reasons rather than the poetry', () => {
    expect(SUMMARY).toContain("{weather.reasons.join(' · ') || weather.summary}");
    expect(SUMMARY).toContain('title={weather.summary}');
  });

  /** "Don't plan on it" is the one state where the answer is to move the work,
   *  so it is a different signal and not a louder amber. */
  it('separates the day to watch from the day to move', () => {
    expect(GLOBALS).toContain(".sched-daysum-weather[data-level='unworkable']");
  });
});

/**
 * A media query adds no specificity, so one written ABOVE the declaration it
 * means to override loses on source order and never fires. Three grids in this
 * file had exactly that, and the booking page had already found it and patched
 * around it inside .book-scope while noting the shared fix was owed.
 */
describe('the narrow-screen grid collapses actually fire', () => {
  it('collapses .form-grid below the rule that sets two columns', () => {
    const base = GLOBALS.indexOf('.form-grid { display: grid; grid-template-columns: 1fr 1fr;');
    const collapse = GLOBALS.indexOf('.form-grid { grid-template-columns: minmax(0, 1fr); }');
    expect(base).toBeGreaterThan(0);
    expect(collapse).toBeGreaterThan(base);
  });

  /** `1fr` is `minmax(auto, 1fr)`, so the track cannot go under its content's
   *  min-content — and a bare <input> will not shrink below 20 characters. */
  it('lets the fields inside it actually shrink', () => {
    expect(GLOBALS).toContain('.form-grid > * { min-width: 0; }');
  });

  it('collapses the job intake schedule grid too', () => {
    const base = GLOBALS.indexOf('.job-intake-schedule-grid { display: grid;');
    const collapse = GLOBALS.indexOf('.job-intake-schedule-grid { grid-template-columns: minmax(0, 1fr); }');
    expect(base).toBeGreaterThan(0);
    expect(collapse).toBeGreaterThan(base);
  });

  /** The dead entry is gone from the block that never applied it, so nobody
   *  reads that list and believes .form-grid is handled there. */
  it('drops the entry that never did anything', () => {
    const block = GLOBALS.slice(GLOBALS.indexOf('@media (max-width: 900px) {\n  .hero-grid,'), GLOBALS.indexOf('.hours-metric { grid-column: auto; }'));
    expect(block).not.toContain('\n  .form-grid,');
  });
});
