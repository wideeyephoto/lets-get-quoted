import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const GLOBALS = read('src', 'app', 'globals.css');
const GEAR = read('src', 'components', 'view-gear.module.css');

/** The declaration block for a selector, so a rule can be asserted in context
 *  rather than by hunting for a string that might belong to anything. */
function block(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) return '';
  return css.slice(at, css.indexOf('}', at) + 1);
}

/**
 * MEASURED, NOT ASSUMED. Every number here came off the running page at 1600px
 * before it was changed: the job-span bars were 26px, the Year rows 30px, the
 * Year month links 20px, the rail's rows 37px, "Plan my day" 39px, the Stripe
 * pill 40px, the view gear 36px, and the queue's way out 17px.
 */
describe('touch targets on the schedule and the shell', () => {
  it('sizes the job-span bars for a finger', () => {
    expect(block(GLOBALS, '.calendar-timeline-bar {')).toContain('height: 44px;');
  });

  it('sizes the Year rows and the month links', () => {
    expect(block(GLOBALS, '.calendar-year-job {')).toContain('min-height: 44px;');
    expect(block(GLOBALS, '.calendar-year-month-link {')).toContain('min-height: 44px;');
  });

  it('sizes the crew role filter', () => {
    expect(block(GLOBALS, '.sched-crew-filter select {')).toContain('min-height: 44px;');
  });

  /**
   * The two raw inputs measure 17px and 20px, and that is fine: each is wrapped
   * in its own <label>, which is 44px and is what receives the click. Verified
   * in a browser — clicking the search pill away from the input focuses it, and
   * clicking the crew label toggles the checkbox.
   */
  it('makes the wrapping labels the target for the two small inputs', () => {
    expect(block(GLOBALS, '.calendar-agenda-search {')).toContain('min-height: 44px;');
    expect(block(GLOBALS, '.sched-crew-filter {')).toContain('min-height: 44px;');
  });

  it('sizes the rail, its two buttons and the account row', () => {
    expect(block(GLOBALS, '.sidenav-link {')).toContain('min-height: 44px;');
    expect(block(GLOBALS, '.sidenav-new {')).toContain('min-height: 44px;');
    expect(block(GLOBALS, '.sidenav-actions .sidenav-plan,')).toContain('min-height: 44px;');
    // 40px here was overriding the Account card's own 44 and quietly making it
    // the second-smallest target in the nav.
    expect(GLOBALS).toContain(".sidenav-foot > .sidenav-account { min-height: 44px; }");
  });

  it('sizes the status pill, the website badge and the view gear', () => {
    expect(block(GLOBALS, '.stripe-status-pill {')).toContain('min-height: 44px;');
    expect(block(GLOBALS, '.website-nav-badge {')).toContain('min-height: 44px;');
    expect(block(GEAR, '.gearBtn {')).toContain('min-height: 44px;');
  });

  /** 17px of underlined text, and the only way out of that panel. */
  it('sizes the queue\u2019s link to the jobs list', () => {
    expect(GLOBALS).toContain('.sched-rows-foot a { display: inline-flex; align-items: center; min-height: 44px;');
  });
});

/**
 * Contrast, measured in both palettes with the background resolved through
 * every translucent layer above it. The schedule page and the crew page come
 * out clean at AA; these are the five that did not.
 */
describe('text contrast on the schedule', () => {
  /** A colour picked for the panel behind it, on a surface that is no longer
   *  the panel: the sticky head paints its own background now. 2.39:1. */
  it('gives the sticky timeline head its own ink', () => {
    expect(block(GLOBALS, '.sched-tl-head {')).toContain('color: var(--text);');
  });

  /** --accent on that white row measured 2.39:1 at 22px, where 3 is the floor.
   *  The inset bar underneath is what marks today; the colour agrees with it. */
  it('marks today with the ink token rather than the raw brand orange', () => {
    expect(GLOBALS).toContain('.sched-tl-day-head.today strong { color: var(--accent-ink); }');
  });

  /** The token is for text on a PANEL, and this is text on a colour. */
  it('writes on the website badge in white, not in panel ink', () => {
    expect(GLOBALS).toContain('.website-nav-live-edit { font-size: 0.62rem; font-weight: 600; color: rgba(255, 255, 255, 0.82); }');
  });

  /** "No duration" is the row's most consequential fact and was its quietest
   *  thing at 3.82:1. */
  it('strengthens the unmeasured-job line in the queue', () => {
    expect(GLOBALS).toContain('.sched-row-missing { color: var(--mute-i62); font-style: italic; }');
  });

  /** 9px text needs the full 4.5:1, and the two orange inks measured 4.49 and
   *  4.48 — near enough to look fixed and not be. */
  it('uses an ink dark enough for the 9px Full flag', () => {
    expect(GLOBALS).toContain(".sched-tl-head-flag.full { background: rgba(255,138,61,.18); color: var(--ink-amber-1); }");
  });
});

/**
 * Day, Week and the Job list print the status in words on the chip. Projects,
 * Year and the Crew lanes carried it in the fill alone — unreadable in
 * greyscale, on a projector, and to anyone who cannot separate the amber from
 * the green.
 */
describe('status is a shape as well as a color', () => {
  const LEGEND = read('src', 'app', 'dashboard', 'schedule', 'CalendarLegend.tsx');
  const CALENDAR = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
  const CREW = read('src', 'app', 'dashboard', 'schedule', 'ScheduleCrewLanes.tsx');

  /** Hollow, filled, tick, dash — a progression at 10px, where "B" and "C"
   *  would be two capitals of the same weight. */
  it('gives each status a mark', () => {
    expect(LEGEND).toContain('export const STATUS_MARK: Record<string, string> = {');
    for (const status of ['new_lead', 'in_progress', 'complete', 'archived']) {
      expect(LEGEND).toContain(`${status}:`);
    }
  });

  it('marks the three views that had only color', () => {
    // Projects bars, Year rows, Crew lanes.
    expect(CALENDAR.match(/calendar-status-mark/g)?.length).toBeGreaterThanOrEqual(2);
    expect(CREW).toContain('className="calendar-status-mark"');
  });

  /** In the caption as well as on the chips, or it is a private code. */
  it('puts the same marks in the legend', () => {
    expect(LEGEND).toContain('<span className="calendar-legend-mark" aria-hidden="true">{STATUS_MARK[status.key]}</span>');
  });

  /** The mark is for eyes that see shape but not color; a screen reader gets
   *  the word, not the glyph. */
  it('hides the glyphs from screen readers and gives them the word', () => {
    expect(CALENDAR).toContain('<span className="calendar-status-mark" aria-hidden="true">');
    expect(CALENDAR).toContain('<span className="sr-only">{STATUS_WORD[job.status] ?? job.status}</span>');
    expect(CREW).toContain('<span className="sr-only">{STATUS_WORD[job.status] ?? job.status}</span>');
  });
});

/**
 * The markers ARE keyboard reachable and always were: Google gives the marker
 * layer one tab stop and roves between markers on the arrow keys. Verified end
 * to end — Tab lands on the first pin, ArrowRight/Down walk the rest, Enter
 * opens the card. What was missing is that nothing said so.
 */
describe('the map tells you how to walk it', () => {
  const MAP = read('src', 'components', 'pin-map.tsx');

  it('describes the arrow-key path and the list beside it', () => {
    expect(MAP).toContain('arrow keys to move between them and Enter to open one');
    expect(MAP).toContain('aria-describedby={`${mapId}-help`}');
  });

  /** Two maps on a page must not share one id. */
  it('scopes that description per instance', () => {
    expect(MAP).toContain('const mapId = useId();');
  });

  it('names the map and says how much is on it', () => {
    expect(MAP).toContain("aria-label={`Map, ${visibleCount} visible");
  });
});

/**
 * The open job was one scroll: facts, a row of four buttons with the crew
 * picker hidden inside it as a fifth, a reschedule form, a remove box.
 */
describe('the open job is three named sections', () => {
  const CALENDAR = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');

  it('names them Overview, Schedule and Crew', () => {
    expect(CALENDAR).toContain('id="schedule-job-overview">Overview<');
    expect(CALENDAR).toContain('id="schedule-job-when">Schedule<');
    expect(CALENDAR).toContain('id="schedule-job-who">Crew<');
  });

  /** Landmarks, so the dialog can be walked rather than scrolled. */
  it('makes each one a labelled region', () => {
    expect(CALENDAR.match(/<section className="schedule-job-section" aria-labelledby=/g)?.length).toBe(3);
  });

  /** "Move this job" and "take it off the calendar" are the same decision made
   *  two different ways, and the crew picker sat between them. */
  it('keeps the reschedule form and the remove box together', () => {
    const when = CALENDAR.slice(CALENDAR.indexOf('id="schedule-job-when"'), CALENDAR.indexOf('id="schedule-job-who"'));
    expect(when).toContain('schedule-job-reschedule-form');
    expect(when).toContain('schedule-remove-box');
  });
});
