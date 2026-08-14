import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { anchorServiceArea, bareTown } from '@/lib/site-area';
import { placeNameFor, areaLabelFor } from '@/lib/geocode';

/**
 * THE FAILURE THIS EXISTS FOR.
 *
 * A plumbing business in Royal Oak, Michigan generated a website whose "Areas
 * we serve" listed Maplewood, Springfield and Sunnyvale, and whose service area
 * read "your local area". Every one of those is a real, correctly-spelled US
 * place name; none is anywhere near ZIP 48067. gpt-4o-mini had been asked to
 * resolve the ZIP from memory, and a small model asked for a five-digit lookup
 * produces something ZIP-shaped and confident.
 *
 * The ZIP is a lookup now. These are the rules that hold whatever the model
 * says next time.
 */

const ROYAL_OAK = 'Royal Oak, MI';

describe('anchorServiceArea', () => {
  it('puts the resolved town first when the model left it out entirely', () => {
    const { cities, serviceArea } = anchorServiceArea({
      primaryCity: ROYAL_OAK,
      modelCities: ['Maplewood', 'Springfield', 'Sunnyvale'],
      modelServiceArea: 'your local area',
      locationKnown: true,
    });
    expect(cities[0]).toBe('Royal Oak');
    // The model's list is kept behind it rather than thrown away — being wrong
    // about the primary city does not make every suggestion useless, and the
    // owner edits this screen before publishing.
    expect(cities).toContain('Maplewood');
    // But the area itself is replaced: it named nowhere real.
    expect(serviceArea).toBe(ROYAL_OAK);
    expect(serviceArea).not.toContain('your local area');
  });

  it('leaves a correct answer alone', () => {
    const { cities, serviceArea } = anchorServiceArea({
      primaryCity: ROYAL_OAK,
      modelCities: ['Royal Oak', 'Berkley', 'Ferndale', 'Clawson'],
      modelServiceArea: 'Royal Oak and the surrounding Metro Detroit suburbs',
      locationKnown: true,
    });
    expect(cities).toEqual(['Royal Oak', 'Berkley', 'Ferndale', 'Clawson']);
    expect(serviceArea).toBe('Royal Oak and the surrounding Metro Detroit suburbs');
  });

  it('does not list the town twice when the model spelled it with its state', () => {
    const { cities } = anchorServiceArea({
      primaryCity: ROYAL_OAK,
      modelCities: ['Royal Oak, MI', 'Berkley'],
      modelServiceArea: 'Royal Oak area',
      locationKnown: true,
    });
    expect(cities).toEqual(['Royal Oak, MI', 'Berkley']);
    expect(cities.filter((c) => c.toLowerCase().startsWith('royal oak'))).toHaveLength(1);
  });

  it('matches the town regardless of case', () => {
    const { cities } = anchorServiceArea({
      primaryCity: ROYAL_OAK,
      modelCities: ['ROYAL OAK', 'Berkley'],
      modelServiceArea: 'royal oak and nearby',
      locationKnown: true,
    });
    expect(cities).toHaveLength(2);
  });

  it('never grows the list past twelve', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `Town ${i}`);
    const { cities } = anchorServiceArea({
      primaryCity: ROYAL_OAK,
      modelCities: twelve,
      modelServiceArea: 'somewhere else',
      locationKnown: true,
    });
    expect(cities).toHaveLength(12);
    expect(cities[0]).toBe('Royal Oak');
  });

  /**
   * The rule that was already right and has to stay right: no location in, no
   * location out. Twelve invented towns are worse than none.
   */
  it('says nothing at all when there is no location to say', () => {
    expect(
      anchorServiceArea({
        primaryCity: '',
        modelCities: ['Springfield', 'Sunnyvale'],
        modelServiceArea: 'your local area',
        locationKnown: false,
      }),
    ).toEqual({ cities: [], serviceArea: '' });
  });

  /** No key, or a ZIP Google could not resolve. The old behavior, unchanged —
   *  there is nothing better to fall back to. */
  it('falls back to the model when the ZIP could not be resolved', () => {
    const { cities, serviceArea } = anchorServiceArea({
      primaryCity: '',
      modelCities: ['Berkley', 'Ferndale'],
      modelServiceArea: 'Metro Detroit',
      locationKnown: true,
    });
    expect(cities).toEqual(['Berkley', 'Ferndale']);
    expect(serviceArea).toBe('Metro Detroit');
  });

  it('fills an empty area with the resolved town rather than leaving it blank', () => {
    const { serviceArea } = anchorServiceArea({
      primaryCity: ROYAL_OAK,
      modelCities: [],
      modelServiceArea: '',
      locationKnown: true,
    });
    expect(serviceArea).toBe(ROYAL_OAK);
  });
});

describe('bareTown', () => {
  it('drops the state', () => {
    expect(bareTown('Royal Oak, MI')).toBe('Royal Oak');
    expect(bareTown('Royal Oak')).toBe('Royal Oak');
    expect(bareTown('  Lee’s Summit , MO ')).toBe('Lee’s Summit');
    expect(bareTown('')).toBe('');
  });
});

/**
 * placeNameFor answers a different question from areaLabelFor, and the
 * difference is the whole reason it exists.
 */
describe('placeNameFor', () => {
  const royalOak = {
    formatted_address: 'Royal Oak, MI 48067, USA',
    address_components: [
      { long_name: '48067', short_name: '48067', types: ['postal_code'] },
      { long_name: 'Royal Oak', short_name: 'Royal Oak', types: ['locality', 'political'] },
      { long_name: 'Michigan', short_name: 'MI', types: ['administrative_area_level_1', 'political'] },
      { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
    ],
  };

  it('names the town without the ZIP', () => {
    expect(placeNameFor(royalOak)).toBe('Royal Oak, MI');
  });

  it('is not the same thing as the list label, which keeps the digits', () => {
    // Somebody who typed 48067 wants to read it back on their own settings row.
    // A website sentence does not.
    expect(areaLabelFor(royalOak)).toContain('48067');
    expect(placeNameFor(royalOak)).not.toContain('48067');
  });

  it('gives nothing rather than a guess when there are no components', () => {
    expect(placeNameFor({ formatted_address: 'somewhere' })).toBe('');
  });
});

/**
 * The prompt still carries the instruction, because a resolved fact stated in
 * the input is worth more than a rule stated in the system text — but neither
 * is what makes this correct.
 */
describe('the generator wires the lookup in', () => {
  const ACTIONS = readFileSync('src/app/dashboard/sites/actions.ts', 'utf8');

  it('resolves the ZIP before it asks the model anything', () => {
    expect(ACTIONS).toContain('const resolvedZipPlace = zip ? await geocodeArea(zip) : null;');
    expect(ACTIONS.indexOf('resolvedZipPlace')).toBeLessThan(ACTIONS.indexOf('api.openai.com'));
  });

  it('tells the model the answer instead of asking for it', () => {
    expect(ACTIONS).toContain('has ALREADY been resolved and the business is in');
  });

  it('and enforces it on the way out', () => {
    expect(ACTIONS).toContain('anchorServiceArea({');
  });
});
