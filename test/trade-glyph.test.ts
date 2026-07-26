import { describe, it, expect } from 'vitest';
import { getTradeGlyph } from '@/lib/site-content';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/ServiceIcon';

describe('getTradeGlyph', () => {
  it('maps common trades to a fitting, trade-specific icon key', () => {
    expect(getTradeGlyph('Electrician')).toBe('bolt');
    expect(getTradeGlyph('Residential Electrical & Lighting')).toBe('bolt');
    expect(getTradeGlyph('House Painting')).toBe('roller');
    expect(getTradeGlyph('Drywall & Finishing')).toBe('roller');
    expect(getTradeGlyph('Window Cleaning')).toBe('sparkles');
    expect(getTradeGlyph('Pressure Washing')).toBe('spray');
    expect(getTradeGlyph('Lawn Care & Landscaping')).toBe('leaf');
    expect(getTradeGlyph('Tree Service')).toBe('tree');
    expect(getTradeGlyph('Stump Removal')).toBe('tree');
    expect(getTradeGlyph('Junk Removal & Hauling')).toBe('truck');
    expect(getTradeGlyph('Pest Control')).toBe('bug');
    expect(getTradeGlyph('Plumbing')).toBe('droplet');
    expect(getTradeGlyph('HVAC')).toBe('wind');
    expect(getTradeGlyph('Appliance Repair')).toBe('wrench');
    expect(getTradeGlyph('Roofing')).toBe('home');
    expect(getTradeGlyph('Concrete & Masonry')).toBe('hardhat');
    expect(getTradeGlyph('Handyman')).toBe('hammer');
    expect(getTradeGlyph('Flooring & Tile')).toBe('grid');
    expect(getTradeGlyph('General Contractor')).toBe('hardhat');
  });

  it('falls back to a house for blank or unrecognized trades', () => {
    expect(getTradeGlyph('')).toBe('home');
    expect(getTradeGlyph(null)).toBe('home');
    expect(getTradeGlyph(undefined)).toBe('home');
    expect(getTradeGlyph('Underwater Basket Weaving')).toBe('home');
  });

  it('only ever returns keys that exist in the icon set', () => {
    const trades = ['Electrician', 'Plumbing', 'HVAC', 'Roofing', 'Painting', 'Pest Control', 'Tree Service', 'Handyman', 'General Contractor', '', 'nonsense'];
    for (const trade of trades) {
      expect(SERVICE_ICON_GLYPHS[getTradeGlyph(trade)]).toBeDefined();
    }
  });
});
