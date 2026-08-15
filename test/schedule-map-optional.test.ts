import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeMapView } from '@/lib/dashboard-views';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const MAP = stripJs(read('src', 'app', 'dashboard', 'schedule', 'ScheduleMap.tsx'));
const PAGE = stripJs(read('src', 'app', 'dashboard', 'schedule', 'page.tsx'));
const CSS = read('src', 'app', 'globals.css');

/* ===========================================================================
   THE MAP WAS THE LARGEST THING LEFT ON THE PAGE
   ---------------------------------------------------------------------------
   A Google map, its script, its tiles and its markers, mounted under a calendar
   on every load of a screen an owner opens dozens of times a day. The gear
   could turn it off, which is a control you have to already know about to
   escape a cost you did not choose.
   ======================================================================== */
describe('the map is opened rather than dismissed', () => {
  /**
   * ONLY ON THIS PAGE. Leads and Customers are screens where the map IS the
   * content; changing normalizeMapView itself would have shut those too.
   */
  it('changes what an absent cookie means here and nowhere else', () => {
    expect(PAGE).toContain("const mapView = mapCookie ? normalizeMapView(mapCookie) : 'off';");
    // The shared default is untouched, so the other surfaces still open theirs.
    expect(normalizeMapView(undefined)).toBe('large');
    expect(normalizeMapView('off')).toBe('off');
  });

  /** An explicit choice still persists both ways — only the meaning of "never
   *  chose" changed. Closing it is the gear's "Map → None" now that the Hide
   *  button beside the tabs is gone, so the off path runs through onSetMapView
   *  rather than a click handler of its own. */
  it('remembers a deliberate open', () => {
    expect(MAP).toContain("onClick={() => setMap('large')}");
    expect(MAP).toContain('onSetMapView={setMap}');
    expect(MAP).toContain("await setMapViewAction(next, 'schedule');");
  });

  /**
   * NOT HIDDEN WITH CSS. PinMap in a display:none container initialises Google
   * Maps into a 0x0 box, and the script and tiles are fetched either way.
   * Measured closed: 0 requests to Google's map hosts. Open: 18.
   */
  it('does not mount the map while it is closed', () => {
    const shut = MAP.slice(MAP.indexOf("if (mapView === 'off') {"), MAP.indexOf('return (\n    <div className="sched-map-open-wrap"'));
    expect(shut).not.toContain('<PinMap');
    expect(shut).toContain('sched-map-shut');
  });

  /** Nor fetch the pins for a map nobody asked for. */
  it('does not fetch pins for it either', () => {
    const assignment = PAGE.slice(PAGE.indexOf('const mapPins ='), PAGE.indexOf('return (', PAGE.indexOf('const mapPins =')));
    expect(assignment).toContain("const mapPins = mapView !== 'off'");
    expect(assignment).toContain('await getMapPins(supabase, accountId)');
    expect(assignment).toContain(': [];');
  });

  /** "Show map" alone does not say whether there is anything on it, and opening
   *  an empty map is the sort of thing you only do once. */
  it('says how much is on it before you pay for it', () => {
    expect(MAP).toContain("`Show map · ${pins.length} ${pins.length === 1 ? 'place' : 'places'}`");
  });

  /** The gear has to survive both states or there is no way back. */
  it('keeps the gear reachable when the map is shut', () => {
    const shut = MAP.slice(MAP.indexOf("if (mapView === 'off') {"), MAP.indexOf('return (\n    <div className="sched-map-open-wrap"'));
    expect(shut).toContain('{gear}');
  });
});

/* Pins answer "where" and nothing else. You cannot sort a map by value, or scan
   one for the two jobs in a town, and a screen reader cannot use it at all. */
describe('the same month, as rows', () => {
  it('is a tab beside the map rather than a second block under it', () => {
    expect(MAP).toContain('role="tablist"');
    expect(MAP).toContain("aria-selected={tab === 'map'}");
    expect(MAP).toContain("aria-selected={tab === 'list'}");
    expect(CSS).toContain('.sched-map-tab {');
  });

  it('sorts by the four things you would compare', () => {
    expect(MAP).toContain("type SortKey = 'date' | 'client' | 'city' | 'value';");
    for (const option of ['Date', 'Customer', 'Place', 'Value']) {
      expect(MAP, option).toContain(`>${option}</option>`);
    }
  });

  /** "No address on file" is a fact about the job, not a town called nothing. */
  it('sorts unplaced work last rather than under a blank heading', () => {
    expect(MAP).toContain("(a.city_label ?? '￿').localeCompare(b.city_label ?? '￿')");
  });

  /** A label is what gets shown; the number behind it is only ever used to
   *  order rows, so an unquoted job sorts last rather than as zero. */
  it('reads money out of the label without pretending null is nothing', () => {
    expect(MAP).toContain('if (!label) return -1;');
  });

  /**
   * MEASURED IN THE BROWSER: calendarJobs holds every scheduled occurrence
   * there is, not a month's worth — the grid does the narrowing. Passing it
   * whole put 124 rows under a heading reading "August 2026", opening on three
   * jobs from April, June and October.
   */
  it('shows the month it says it is showing', () => {
    expect(PAGE).toContain('job.scheduled_for.startsWith(monthPrefix)');
    expect(PAGE).toContain('const monthLocationJobs = Array.from(');
    expect(PAGE).toContain('new Map<string, (typeof calendarJobs)[number]>()');
    expect(MAP).toContain('monthLabel');
  });
});

/**
 * Two jobs at one address drew one marker on top of another and the lower one
 * could not be clicked, hovered or reached at all — not crowded, missing.
 */
describe('pins on the same spot are all reachable', () => {
  it('opts into the fan-out PinMap already had', () => {
    expect(MAP).toContain('<PinMap pins={pins} theme={mapTheme} spreadOverlap />');
    expect(read('src', 'components', 'pin-map.tsx')).toContain('spreadOverlap?: boolean;');
  });
});
