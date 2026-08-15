import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapEmptyNote, mapScopeLabel, scopePinsToFilter } from '@/lib/map-pin-scope';

// The WHY comments in these files quote the copy and the props they replaced,
// so a raw read matches the very thing the assertion says is gone.
const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (path: string) => strip(readFileSync(path, 'utf8'));

/**
 * THE PAGE CONTRADICTING ITSELF IN THREE NUMBERS.
 *
 * getMapPins is global on purpose — every lead and every job that has
 * coordinates, because "where is my work" is a question about all of it. Every
 * workspace filtered its own LIST and then handed the map that same global set,
 * so on /dashboard/jobs filtered to Complete the screen read "5 of 39" above a
 * map drawing 33 pins above a legend counting 37 places.
 *
 * None of the three is wrong on its own, which is why it survived. Together,
 * with nothing saying which is which, the page looks broken.
 */

const pin = (id: string) => ({ id, lat: 0, lng: 0 });

describe('scopePinsToFilter', () => {
  const pins = [pin('job-a'), pin('job-b'), pin('job-c'), pin('lead-x'), pin('lead-y')];

  it('leaves the full picture alone when no filter is on', () => {
    // "All" is the view worth having, and the one that was always there.
    expect(scopePinsToFilter(pins, 'job', new Set(['a']), false)).toHaveLength(5);
  });

  it('shows exactly the records the list is showing', () => {
    const scoped = scopePinsToFilter(pins, 'job', new Set(['a', 'c']), true);
    expect(scoped.map((p) => p.id)).toEqual(['job-a', 'job-c']);
  });

  /**
   * A legend counting leads beside a list of complete jobs is the same
   * competing-count problem in a smaller box. Out of scope, not unmatched.
   */
  it('drops pins of the other record type too', () => {
    const scoped = scopePinsToFilter(pins, 'job', new Set(['a']), true);
    expect(scoped.some((p) => p.id.startsWith('lead-'))).toBe(false);
  });

  it('shows an empty map for a filter that matches nothing', () => {
    // Better than a map still full of the records you just filtered away.
    expect(scopePinsToFilter(pins, 'job', new Set(), true)).toEqual([]);
  });

  it('reads lead pins on a leads page and job pins on a jobs page', () => {
    expect(scopePinsToFilter(pins, 'lead', new Set(['x']), true).map((p) => p.id)).toEqual(['lead-x']);
  });

  it('ignores a visible id that has no pin, rather than inventing one', () => {
    // A record with no coordinates is in the list and not on the map. That is
    // the one legitimate reason for the two counts to differ.
    expect(scopePinsToFilter(pins, 'job', new Set(['a', 'nowhere']), true)).toHaveLength(1);
  });

  it('does not mutate what it was given', () => {
    const original = [...pins];
    scopePinsToFilter(pins, 'job', new Set(['a']), true);
    expect(pins).toEqual(original);
  });
});

describe('mapScopeLabel', () => {
  it('says what the number counts', () => {
    // A bare "Map 33" beside "5 of 39" invites arithmetic that does not work.
    expect(mapScopeLabel(33, 39, false)).toBe('33 on the map');
    expect(mapScopeLabel(5, 39, true)).toBe('5 of 39 on the map');
  });
});

describe('mapEmptyNote', () => {
  it('says nothing when no filter is on, so the map keeps its own copy', () => {
    // An empty map on an unfiltered page really does mean nothing is geocoded.
    expect(mapEmptyNote('job', false)).toBeUndefined();
    expect(mapEmptyNote('lead', false)).toBeUndefined();
  });

  it('blames the filter, and names the other reason as well', () => {
    const note = mapEmptyNote('job', true)!;
    expect(note).toContain('filter');
    // Both halves: finished work is never pinned, and neither is an ungeocoded
    // address. Only one of them is the filter, and the reader needs whichever
    // one they are looking at.
    expect(note).toContain('Completed and archived jobs are never pinned');
    expect(note).toContain('no address yet');
  });

  it('says how to get the map back', () => {
    // A dead end needs the way out written on it — and clearing the filter is
    // also what returns the other record type, which scoping drops on purpose.
    expect(mapEmptyNote('job', true)).toContain('Clear the filter');
    expect(mapEmptyNote('lead', true)).toContain('Clear the filter');
  });

  it('names the right records for each page', () => {
    expect(mapEmptyNote('lead', true)).toContain('Won, lost, snoozed and archived leads');
    expect(mapEmptyNote('lead', true)).not.toContain('jobs');
  });
});

describe('the map says why it is empty', () => {
  const MAP = read('src/components/pin-map.tsx');

  it('takes the reason from the page that emptied it', () => {
    expect(MAP).toContain('emptyNote?: string');
    expect(MAP).toContain('{emptyNote ?? NOTHING_MAPPED}');
  });

  it('keeps the new-account copy as the default', () => {
    // "Addresses are geocoded as leads and jobs come in" is true of an empty
    // account and a lie under a filter. It is still right for the first case.
    expect(MAP).toContain("const NOTHING_MAPPED = 'No mapped locations yet");
  });

  it('does not read out keyboard instructions for pins that are not there', () => {
    // "0 places on this map. Press Tab to reach the pins, then the arrow keys
    // to move between them" — a guided tour of an empty room. The emptiness is
    // checked inside the help paragraph, ahead of the instructions.
    // Guarded: a missing needle makes indexOf return -1, and a slice to -1 is a
    // string that would quietly satisfy the assertions below.
    expect(MAP.indexOf('-help`}')).toBeGreaterThan(0);
    expect(MAP.indexOf('Press Tab to reach the pins')).toBeGreaterThan(0);
    const help = MAP.slice(MAP.indexOf('-help`}'), MAP.indexOf('Press Tab to reach the pins'));
    expect(help).toContain('pins.length === 0');
    expect(help).toContain('visibleCount === 0');
    expect(help).toContain("{visibleCount} {visibleCount === 1 ? 'place' : 'places'}");
    expect(help).toContain('emptyNote ?? NOTHING_MAPPED');
  });
});

describe('the leads queue filters its own map', () => {
  const SMOOTHIE = read('src/app/dashboard/leads/LeadSmoothieView.tsx');

  it('scopes the pins to the leads the queue is showing', () => {
    expect(SMOOTHIE).toContain("scopePinsToFilter(mapPins, 'lead', shownLeadIds, true)");
    expect(SMOOTHIE).toContain('new Set(shown.map((lead) => lead.id))');
  });

  it('hands the scoped set to the map and to the count beside it', () => {
    expect(SMOOTHIE).toContain('pins={scopedPins}');
    // The pane switch reads "Map 7" off this; counting pins the map is not
    // drawing is how the mismatch was visible in the first place.
    expect(SMOOTHIE).toContain('const openPinCount = scopedPins.length');
    const body = SMOOTHIE.slice(SMOOTHIE.indexOf('const scopedPins'));
    expect(body).not.toContain('pins={mapPins}');
  });

  it('explains its scope and both ways the queue map can be empty', () => {
    expect(SMOOTHIE).toContain('Only leads visible in this queue with a mapped address.');
    expect(SMOOTHIE).toContain('No leads match these filters.');
    expect(SMOOTHIE).toContain('None of these leads has a mapped address yet.');
    expect(SMOOTHIE.indexOf('styles.mapNote')).toBeGreaterThan(0);
  });
});

describe('the leads map toggle says what its number counts', () => {
  const WORKSPACE = read('src/app/dashboard/leads/LeadsWorkspace.tsx');

  it('labels and renders the lead-only count', () => {
    expect(WORKSPACE).toContain("scopePinsToFilter(mapPins, 'lead', visibleLeadIds, true)");
    expect(WORKSPACE).toContain('pins={leadPins}');
    expect(WORKSPACE).toContain('aria-label={`Map — ${leadPins.length} lead');
  });
});

describe('the customer bands filter the customer map', () => {
  const SMOOTHIE = read('src/app/dashboard/clients/ClientSmoothieView.tsx');

  it('hands the map the filtered book, not the whole one', () => {
    expect(SMOOTHIE).toContain('<ClientsMap clients={shown}');
    expect(SMOOTHIE).not.toContain('<ClientsMap clients={clients}');
  });

  it('covers the empty filter, which could not happen before', () => {
    // ClientsMap returns null for an empty list, and a blank pane under a
    // heading is worse than either honest answer.
    expect(SMOOTHIE).toContain('shown.length === 0 ? (');
    expect(SMOOTHIE).toContain('No customers match that filter');
  });
});

describe('the schedule states which set each tab holds', () => {
  const MAP = read('src/app/dashboard/schedule/ScheduleMap.tsx');

  it('stops calling the pair two readings of the month', () => {
    // The map is the whole territory; only the list is the month.
    expect(MAP).not.toContain('How to read the month');
    expect(MAP).toContain('aria-label="Map or list"');
  });

  it('gives both tabs a count and says what each one counts', () => {
    expect(MAP).toContain('Map <span aria-hidden="true">· {pins.length}</span>');
    expect(MAP).toContain('List <span aria-hidden="true">· {jobs.length}</span>');
    expect(MAP).toContain('active ${pins.length === 1');
    expect(MAP).toContain('scheduled ${jobs.length === 1');
    expect(MAP).toContain('in ${monthLabel}');
  });

  /* The scope sentence under the map ("Every active job and lead with an
     address — not just August 2026") was removed on request. The tab labels
     above are the only place the difference is stated now, which is what the
     two assertions above cover. */
  it('no longer repeats it in a line under the map', () => {
    expect(MAP).not.toContain('sched-map-scope');
  });

  it('leaves the map itself unnarrowed', () => {
    // Nobody filtered this map — the month is the calendar's state, not a
    // control here — and an unfiltered map keeps its full picture. Narrowing it
    // would also leave two of the three legend filters permanently dead.
    expect(MAP).toContain('<PinMap pins={pins}');
    expect(MAP).not.toContain('scopePinsToFilter');
  });
});

describe('the jobs queue filters its own map', () => {
  const SMOOTHIE = read('src/app/dashboard/jobs/JobSmoothieView.tsx');

  /**
   * THE ONE THE FIRST PASS MISSED, ON THE DEFAULT VIEW.
   *
   * JobsWorkspace scopes off ITS status filter — the toolbar the other five
   * layouts share. Smoothie keeps its own chips and its own search in its own
   * state and passed the pins through untouched, so the map obeyed a filter
   * nobody could see and ignored the one they were pressing. Caught in the
   * browser: "Complete 53 of 86" in the queue, "Map 27" beside it, unmoved.
   */
  it('scopes the pins to the jobs the queue is showing', () => {
    expect(SMOOTHIE).toContain("const queueFiltered = stage !== 'all' || query.trim() !== ''");
    expect(SMOOTHIE).toContain("scopePinsToFilter(mapPins, 'job', shownJobIds, queueFiltered)");
    expect(SMOOTHIE).toContain('new Set(shown.map((job) => job.id))');
  });

  it('hands the scoped set to the map and to the count beside it', () => {
    expect(SMOOTHIE).toContain('pins={scopedPins}');
    expect(SMOOTHIE).toContain("scopedPins.filter((pin) => pin.kind !== 'lead')");
    expect(SMOOTHIE).toContain("emptyNote={mapEmptyNote('job', queueFiltered)}");
  });
});

/**
 * The sweep that would have caught the miss above without a browser.
 *
 * Three queues, three sets of stage chips, three maps in a pane — and the two
 * that were wired went through a DIFFERENT component from the one that was not.
 * Whatever a view calls its filter, the map beside it cannot be handed the
 * prop it arrived on.
 */
describe('no queue hands its map the unscoped set', () => {
  const SMOOTHIES = [
    'src/app/dashboard/jobs/JobSmoothieView.tsx',
    'src/app/dashboard/leads/LeadSmoothieView.tsx',
  ];

  it.each(SMOOTHIES)('%s scopes before it draws', (path) => {
    const source = read(path);
    expect(source).toContain('scopePinsToFilter(');
    expect(source).not.toContain('pins={mapPins}');
  });

  it('the customer queue does the same through its own map component', () => {
    // ClientsMap filters pins against the list it is handed, so the scoping is
    // in which list that is — but the failure and the fix are identical.
    const source = read('src/app/dashboard/clients/ClientSmoothieView.tsx');
    expect(source).toContain('<ClientsMap clients={shown}');
  });
});

describe('the jobs workspace uses it', () => {
  const WORKSPACE = read('src/app/dashboard/jobs/JobsWorkspace.tsx');

  it('scopes the pins to the same list the views get', () => {
    expect(WORKSPACE).toContain("scopePinsToFilter(mapPins, 'job', visibleJobIds, status !== 'all')");
    expect(WORKSPACE).toContain('new Set(filtered.map((job) => job.id))');
  });

  it('hands the scoped set to every consumer, not the raw one', () => {
    expect(WORKSPACE).toContain('<PinMap pins={scopedPins}');
    // Smoothie draws its own map from the same prop.
    expect(WORKSPACE).toContain('mapPins={scopedPins}');
    // Nothing still reaches past it for the global set.
    const body = WORKSPACE.slice(WORKSPACE.indexOf('const scopedPins'));
    expect(body).not.toContain('pins={mapPins}');
    expect(body).not.toContain('mapPins={mapPins}');
  });
});
