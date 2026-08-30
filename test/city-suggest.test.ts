import { describe, it, expect } from 'vitest';
import { suggestCities, normalizeCityQuery, COMMON_US_CITIES } from '@/lib/city-suggest';

describe('city-suggest dataset and matcher', () => {
  it('normalizes queries by stripping spaces, casing, and punctuation', () => {
    expect(normalizeCityQuery('Royal Oak')).toBe('royaloak');
    expect(normalizeCityQuery('St. Louis, MO')).toBe('stlouismo');
    expect(normalizeCityQuery(' Austin! ')).toBe('austin');
  });

  it('matches space-less user typing (e.g. royaloak -> Royal Oak, MI)', () => {
    const results = suggestCities('royaloak');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].label).toBe('Royal Oak, MI');
    expect(results[0].city).toBe('Royal Oak');
    expect(results[0].state).toBe('MI');
  });

  it('matches prefix queries', () => {
    const austin = suggestCities('aust');
    expect(austin.some((c) => c.label === 'Austin, TX')).toBe(true);

    const detroit = suggestCities('det');
    expect(detroit.some((c) => c.label === 'Detroit, MI')).toBe(true);

    const chi = suggestCities('chica');
    expect(chi.some((c) => c.label === 'Chicago, IL')).toBe(true);
  });

  it('handles punctuation-less city abbreviations (e.g. stlouis -> St. Louis, MO)', () => {
    const results = suggestCities('stlouis');
    expect(results.some((c) => c.city === 'St. Louis')).toBe(true);
  });

  it('returns empty for empty or single-character queries', () => {
    expect(suggestCities('')).toEqual([]);
    expect(suggestCities('a')).toEqual([]);
    expect(suggestCities('  ')).toEqual([]);
  });

  it('contains comprehensive coverage of top US trade hubs', () => {
    expect(COMMON_US_CITIES.length).toBeGreaterThan(100);
    const cities = new Set(COMMON_US_CITIES.map((c) => c.city));
    expect(cities.has('Royal Oak')).toBe(true);
    expect(cities.has('Dallas')).toBe(true);
    expect(cities.has('Seattle')).toBe(true);
    expect(cities.has('Miami')).toBe(true);
    expect(cities.has('Phoenix')).toBe(true);
  });
});
