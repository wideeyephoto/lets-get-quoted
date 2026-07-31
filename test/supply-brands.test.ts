import { describe, it, expect } from 'vitest';
import { GENERIC_SUPPLY, supplyBrand, supplyBrands } from '@/lib/supply-brands';

describe('supply store branding', () => {
  it('recognises the chains a contractor actually stops at', () => {
    expect(supplyBrand('The Home Depot').key).toBe('home-depot');
    expect(supplyBrand("Lowe's Home Improvement").key).toBe('lowes');
    expect(supplyBrand('Menards').key).toBe('menards');
    expect(supplyBrand('Harbor Freight Tools').key).toBe('harbor-freight');
    expect(supplyBrand('Sherwin-Williams Paint Store').key).toBe('sherwin-williams');
    expect(supplyBrand('SiteOne Landscape Supply').key).toBe('siteone');
  });

  it('reads the name however Places happens to write it', () => {
    expect(supplyBrand('Lowes').key).toBe('lowes');
    expect(supplyBrand('LOWE’S'.replace('’', "'")).key).toBe('lowes');
    expect(supplyBrand('home depot').key).toBe('home-depot');
    expect(supplyBrand('Site One Landscape Supply').key).toBe('siteone');
    expect(supplyBrand('84 Lumber').key).toBe('84-lumber');
  });

  it('needs the word hardware before it calls anything Ace', () => {
    expect(supplyBrand('Ace Hardware').key).toBe('ace');
    expect(supplyBrand('Rochester Ace Hardware').key).toBe('ace');
    // The trap: plenty of places contain "ace" and sell nothing.
    expect(supplyBrand('Palace Supply').key).toBe('generic');
    expect(supplyBrand('Ace Cafe').key).toBe('generic');
  });

  it('leaves an independent alone rather than guessing whose it is', () => {
    expect(supplyBrand('Rochester Lumber & Millwork')).toEqual(GENERIC_SUPPLY);
    expect(supplyBrand('')).toEqual(GENERIC_SUPPLY);
    expect(supplyBrand(null)).toEqual(GENERIC_SUPPLY);
    expect(supplyBrand(undefined)).toEqual(GENERIC_SUPPLY);
  });

  it('gives every chain something drawable and legible at 24px', () => {
    for (const brand of supplyBrands()) {
      expect(brand.short.length).toBeGreaterThan(0);
      // Four characters at this size is a smudge.
      expect(brand.short.length).toBeLessThanOrEqual(3);
      expect(brand.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(brand.fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(brand.label.length).toBeGreaterThan(0);
    }
  });

  it('keys are unique, so the marker cache can key on them', () => {
    const keys = supplyBrands().map((brand) => brand.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(GENERIC_SUPPLY.key);
  });

  it('never leaks the matcher into what callers get back', () => {
    expect(supplyBrand('The Home Depot')).not.toHaveProperty('match');
    expect(Object.keys(supplyBrand('Menards')).sort()).toEqual(['bg', 'fg', 'key', 'label', 'short']);
  });
});
