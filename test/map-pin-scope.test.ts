import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapScopeLabel, scopePinsToFilter } from '@/lib/map-pin-scope';

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

describe('the jobs workspace uses it', () => {
  const WORKSPACE = readFileSync('src/app/dashboard/jobs/JobsWorkspace.tsx', 'utf8');

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
