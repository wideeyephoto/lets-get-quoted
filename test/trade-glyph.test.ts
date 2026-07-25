import { describe, it, expect } from 'vitest';
import { getTradeGlyph } from '@/lib/site-content';

describe('getTradeGlyph', () => {
  it('maps common trades to a fitting ServiceIcon key', () => {
    expect(getTradeGlyph('Electrician')).toBe('bolt');
    expect(getTradeGlyph('Residential Electrical & Lighting')).toBe('bolt');
    expect(getTradeGlyph('House Painting')).toBe('roller');
    expect(getTradeGlyph('Drywall & Finishing')).toBe('roller');
    expect(getTradeGlyph('Window Cleaning')).toBe('sparkles');
    expect(getTradeGlyph('Lawn Care & Landscaping')).toBe('leaf');
    expect(getTradeGlyph('Tree Service')).toBe('leaf');
    expect(getTradeGlyph('Junk Removal & Hauling')).toBe('truck');
    expect(getTradeGlyph('Pest Control')).toBe('shield');
    expect(getTradeGlyph('Plumbing')).toBe('wrench');
    expect(getTradeGlyph('HVAC')).toBe('wrench');
    expect(getTradeGlyph('Appliance Repair')).toBe('wrench');
    expect(getTradeGlyph('Roofing')).toBe('home');
    expect(getTradeGlyph('Stump Removal')).toBe('home');
    expect(getTradeGlyph('General Contractor')).toBe('home');
  });

  it('falls back to a house for blank or unrecognized trades', () => {
    expect(getTradeGlyph('')).toBe('home');
    expect(getTradeGlyph(null)).toBe('home');
    expect(getTradeGlyph(undefined)).toBe('home');
    expect(getTradeGlyph('Underwater Basket Weaving')).toBe('home');
  });
});
