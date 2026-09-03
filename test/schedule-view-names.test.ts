import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CALENDAR_VIEWS, normalizeCalendarView } from '@/lib/dashboard-views';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
/** Comments say what the code should do; assertions about ABSENCE must not
 *  match a note explaining why the thing is absent. */
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CALENDAR = read('src', 'app', 'dashboard', 'schedule', 'schedule-calendar.tsx');
const CALENDAR_CODE = stripJs(CALENDAR);
const MOBILE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleMobileAgenda.tsx'));
const CSS = read('src', 'app', 'globals.css');

/** The label literals out of VIEW_OPTIONS, in order. */
function viewLabels(): Array<{ id: string; label: string }> {
  const block = CALENDAR.slice(CALENDAR.indexOf('const VIEW_OPTIONS'), CALENDAR.indexOf('];', CALENDAR.indexOf('const VIEW_OPTIONS')));
  return [...block.matchAll(/\{ id: '([a-z_]+)', label: '([^']+)'/g)].map((match) => ({ id: match[1], label: match[2] }));
}

/* ===========================================================================
   ONE WORD, ONE MEANING, EVERY SCREEN SIZE
   ---------------------------------------------------------------------------
   The names did not describe consistent concepts, and it was the most
   expensive thing about this page:

     "Agenda" was a month-long list on a desktop and a single day on a phone
     "Month"  was a capacity heatmap on a desktop and a grid of counts on a phone
     "Week"   was three days on a tablet, silently

   so a word learned on one screen taught the wrong thing on the other.
   ======================================================================== */
describe('the view names describe what you get', () => {
  it('names each view for its own content', () => {
    expect(viewLabels()).toEqual([
      { id: 'day', label: 'Day' },
      { id: 'week', label: 'Week' },
      { id: 'month', label: 'Capacity' },
      { id: 'resource_timeline', label: 'Timeline' },
      { id: 'timeline_week', label: 'Timeline week' },
      { id: 'crew', label: 'Dispatch' },
      { id: 'agenda', label: 'Month list' },
      { id: 'timeline', label: 'Project timeline' },
      { id: 'year', label: 'Year overview' },
    ]);
  });

  it('never uses one label for two views', () => {
    const labels = viewLabels().map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  /**
   * THE IDS ARE COOKIE VALUES. Renaming them would silently reset the view for
   * everybody who has ever chosen one — `timeline` is still the id of the view
   * now called Projects, and `month` of the one called Capacity.
   */
  it('renames the labels without touching the stored ids', () => {
    expect(CALENDAR_VIEWS).toEqual(['day', 'week', 'month', 'resource_timeline', 'timeline_week', 'crew', 'agenda', 'timeline', 'year']);
    expect(viewLabels().map((option) => option.id)).toEqual(CALENDAR_VIEWS);
    // An old cookie still resolves rather than dumping somebody in the default.
    for (const view of CALENDAR_VIEWS) expect(normalizeCalendarView(view)).toBe(view);
  });

  /** Day, Week, Capacity, Timeline and Timeline week are in the quick switcher. */
  it('promotes the quick switcher views and leaves specialist views in the menu', () => {
    expect(CALENDAR_CODE).toContain("const QUICK_VIEWS = new Set<CalendarView>(['day', 'week', 'month', 'resource_timeline', 'timeline_week']);");
  });
});

/* A tablet has always shown three days when Week is picked and has always gone
   on calling it Week, so there was no telling a deliberate three-day view from
   a broken seven-day one. */
describe('the tablet says three days, because it shows three days', () => {
  it('renames the button from the column count, not from the view id', () => {
    expect(CALENDAR_CODE).toContain("const narrowWeek = option.id === 'week' && columns === 3;");
    expect(CALENDAR_CODE).toContain("const label = narrowWeek ? '3 days' : option.label;");
  });

  it('takes the column count from the same state the grid does', () => {
    expect(CALENDAR_CODE).toContain('columns={span}');
    // `span` is what timelineDayKeys reads to build the columns.
    expect(CALENDAR_CODE).toContain('if (span === 3) return [0, 1, 2].map(');
  });
});

/* "Advanced desktop views silently fall back to Agenda when the layout becomes
   mobile" — a control that appears not to work, with no way back. */
describe('a view swapped out from under you says so', () => {
  it('names both views and offers the override', () => {
    expect(CALENDAR_CODE).toContain('effectiveView !== calendarView ?');
    expect(CALENDAR_CODE).toContain('This window is too narrow for');
    expect(CALENDAR_CODE).toContain('Show {VIEW_OPTIONS.find((option) => option.id === calendarView)?.label} anyway');
    expect(CSS).toContain('.calendar-view-swapped {');
  });

  /** Choosing it deliberately is respected — the fallback is a default, not a
   *  restriction — so the sentence has to disappear once you do. */
  it('and stops saying it the moment the choice is explicit', () => {
    expect(CALENDAR_CODE).toContain('!viewWasChosen && narrow && calendarView === \'month\' ? \'agenda\' : calendarView');
  });
});

/* The toggles do exactly one thing: drop a day COLUMN from a grid. In the five
   views with no day columns they were on screen, pressable and inert. */
describe('the weekend toggles appear where they can do something', () => {
  it('is decided by whether the view has day columns', () => {
    expect(CALENDAR_CODE).toContain("const COLUMN_VIEWS = new Set<CalendarView>(['week', 'month']);");
    expect(CALENDAR_CODE).toContain('{COLUMN_VIEWS.has(effectiveView) ? (');
  });

  /** The old rule named the two views to hide them in, so every view added
   *  since arrived with the control switched on by default. */
  it('no longer lists the exceptions', () => {
    expect(CALENDAR_CODE).not.toContain("effectiveView === 'day' || effectiveView === 'crew' ? null");
  });
});

/* ===========================================================================
   THE PHONE
   ======================================================================== */
describe('the phone uses the desktop’s words', () => {
  it('calls one day Day and the picker Month', () => {
    expect(MOBILE).toContain('>\n            Day\n          </button>');
    expect(MOBILE).toContain('>\n            Month\n          </button>');
    // "Agenda" is the one that has to stay gone: it meant a single day here and
    // a month-long list on the desktop. "Dates" named the panel after what is
    // in it rather than the span it covers, which is not how anyone asks for it.
    expect(MOBILE).not.toContain('>\n            Agenda\n          </button>');
    expect(MOBILE).not.toContain('>\n            Dates\n          </button>');
  });

  /** The internal state names are untouched — they are not on screen, and
   *  churning them would be a rename for its own sake. */
  it('leaves the internal names alone', () => {
    expect(MOBILE).toContain("type MobileView = 'agenda' | 'month';");
  });

  /** The arrows used to keep stepping one day while Month was selected, while
   * the real month links sat below the calendar and usually below the fold. */
  it('makes the heading and arrows control the selected span', () => {
    expect(MOBILE).toContain('function goToMonth(offset: number)');
    expect(MOBILE).toContain("view === 'month' ? goToMonth(-1) : goToDay(");
    expect(MOBILE).toContain("view === 'month' ? 'Previous month'");
    expect(MOBILE).toContain('<h2 className="sched-mobile-date">{monthLabel}</h2>');
    expect(MOBILE).not.toContain('className="sched-mini-foot"');
  });

  /** "The nearby-days strip remains visible above Month, creating two date
   *  pickers simultaneously" — one directly above the other, on 390px. */
  it('shows one date picker at a time', () => {
    expect(MOBILE).toContain("{view === 'agenda' ? (\n      <ol className=\"sched-strip\"");
  });

  /** Mobile Month showed a bare count, so it could say four jobs and not
   *  whether that was a full day or an hour — the number that decides whether
   *  anything else fits. */
  it('carries the same capacity ramp the Capacity view does', () => {
    expect(MOBILE).toContain('data-load={level ?? undefined}');
    expect(MOBILE).toContain('unknownJobs: unknownDurationByDate[cell.dateKey] ?? 0');
    expect(CSS).toContain(".sched-mini-day[data-load='over']");
    // Never colour alone: the band is repeated in the button's own label.
    expect(MOBILE).toContain('CAPACITY_LABEL[level].toLowerCase()');
  });

  /** A wall of green under three empty weeks is noise, and an absent band
   *  already says "nothing booked". */
  it('draws no band for an open day', () => {
    expect(MOBILE).toContain("{level && level !== 'open' ? <span className=\"sched-mini-band\"");
    expect(CSS).not.toContain(".sched-mini-day[data-load='open']");
  });

  /**
   * A DAY OFF AND A DAY FULL ARE NOT THE SAME DAY.
   *
   * `blockedDays` is "cannot take more work", which the page fills from
   * availability blocks AND from days already at capacity. Reading it as
   * "closed" suppressed the band on every full day — measured in the browser as
   * 4 of 31 days banded, and the 27 without were the busy ones. The ramp,
   * exactly backwards.
   */
  it('keeps the band on a full day and drops it only on a day taken off', () => {
    expect(MOBILE).toContain('const closed = blocks.some((block) => cell.dateKey >= block.start_date && cell.dateKey <= block.end_date);');
    expect(MOBILE).toContain('const level = closed\n                ? null');
    // The hatch still marks anything unbookable; only the RAMP is gated on a
    // real block.
    expect(MOBILE).toContain("${unavailable ? ' is-blocked' : ''}");
    // And "blocked off" is only said about days that are.
    expect(MOBILE).toContain("${closed ? ', blocked off' : ''}");
  });
});
