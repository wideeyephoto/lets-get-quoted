import { describe, it, expect } from 'vitest';
import { haversineMiles, nearestMiles, coordOf } from '@/lib/distance';

// Reference points (approx): Okemos MI shop, and two nearby towns.
const okemos = { lat: 42.7231, lng: -84.4275 };
const eastLansing = { lat: 42.7369, lng: -84.4839 }; // ~3 mi W
const detroit = { lat: 42.3314, lng: -83.0458 }; // ~80 mi SE

describe('haversineMiles', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMiles(okemos, okemos)).toBeCloseTo(0, 5);
  });
  it('matches a known short hop within a mile', () => {
    const d = haversineMiles(okemos, eastLansing);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(4);
  });
  it('matches a known long hop within tolerance', () => {
    const d = haversineMiles(okemos, detroit);
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(90);
  });
  it('is symmetric', () => {
    expect(haversineMiles(okemos, detroit)).toBeCloseTo(haversineMiles(detroit, okemos), 6);
  });
});

describe('nearestMiles', () => {
  it('returns the closest anchor distance', () => {
    const d = nearestMiles(okemos, [detroit, eastLansing]);
    expect(d).toBeCloseTo(haversineMiles(okemos, eastLansing), 6);
  });
  it('returns null with no anchors', () => {
    expect(nearestMiles(okemos, [])).toBeNull();
  });
});

describe('coordOf', () => {
  it('extracts a LatLng or null', () => {
    expect(coordOf({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(coordOf({ lat: null, lng: 2 })).toBeNull();
    expect(coordOf({})).toBeNull();
  });
});
