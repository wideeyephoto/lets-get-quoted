import { describe, it, expect } from 'vitest';
import { normalizeAddress } from '../src/lib/location-context/normalize-address';

describe('Location Context - Address Normalization', () => {
  it('parses standard comma-separated US addresses accurately', () => {
    const parsed = normalizeAddress('211 S Williams St, Royal Oak, MI 48067');
    expect(parsed.isValid).toBe(true);
    expect(parsed.streetNumber).toBe('211');
    expect(parsed.streetName).toBe('S Williams St');
    expect(parsed.city).toBe('Royal Oak');
    expect(parsed.state).toBe('MI');
    expect(parsed.postalCode).toBe('48067');
  });

  it('normalizes full state names to two-letter state abbreviations', () => {
    const parsed = normalizeAddress('100 Main St, Royal Oak, Michigan 48067');
    expect(parsed.isValid).toBe(true);
    expect(parsed.state).toBe('MI');
    expect(parsed.city).toBe('Royal Oak');
  });

  it('extracts apartment, suite, or unit details cleanly', () => {
    const parsed = normalizeAddress('450 W 4th St Apt 302, Royal Oak, MI 48067');
    expect(parsed.isValid).toBe(true);
    expect(parsed.streetNumber).toBe('450');
    expect(parsed.unitOrApt).toBe('Apt 302');
    expect(parsed.city).toBe('Royal Oak');
    expect(parsed.state).toBe('MI');
  });

  it('handles addresses with single-line format and no commas', () => {
    const parsed = normalizeAddress('123 Main St Royal Oak MI 48067');
    expect(parsed.isValid).toBe(true);
    expect(parsed.state).toBe('MI');
    expect(parsed.postalCode).toBe('48067');
  });

  it('safely handles empty, null, or whitespace inputs without throwing', () => {
    expect(normalizeAddress(null).isValid).toBe(false);
    expect(normalizeAddress(undefined).isValid).toBe(false);
    expect(normalizeAddress('   ').isValid).toBe(false);
  });
});
