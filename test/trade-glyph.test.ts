import { describe, it, expect } from 'vitest';
import { getTradeGlyph, getTradeGlyphOptions, glyphForContent, getSiteContent } from '@/lib/site-content';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/ServiceIcon';

const TRADES = [
  'Electrician', 'Residential Electrical & Lighting', 'House Painting', 'Drywall & Finishing',
  'Window Cleaning', 'Pressure Washing', 'Lawn Care & Landscaping', 'Tree Service', 'Stump Removal',
  'Junk Removal & Hauling', 'Pest Control', 'Plumbing', 'HVAC', 'Appliance Repair', 'Roofing',
  'Concrete & Masonry', 'Handyman', 'Flooring & Tile', 'General Contractor', 'Security & Alarm',
  '', 'Underwater Basket Weaving',
];

describe('getTradeGlyph', () => {
  it('maps common trades to a fitting default icon key', () => {
    expect(getTradeGlyph('Electrician')).toBe('bolt');
    expect(getTradeGlyph('House Painting')).toBe('roller');
    expect(getTradeGlyph('Window Cleaning')).toBe('sparkles');
    expect(getTradeGlyph('Pressure Washing')).toBe('spray');
    expect(getTradeGlyph('Tree Service')).toBe('tree');
    expect(getTradeGlyph('Pest Control')).toBe('bug');
    expect(getTradeGlyph('Plumbing')).toBe('droplet');
    expect(getTradeGlyph('HVAC')).toBe('wind');
    expect(getTradeGlyph('Roofing')).toBe('home');
    expect(getTradeGlyph('Handyman')).toBe('hammer');
    expect(getTradeGlyph('General Contractor')).toBe('hardhat');
  });

  it('falls back to a house for blank or unrecognized trades', () => {
    expect(getTradeGlyph('')).toBe('home');
    expect(getTradeGlyph(null)).toBe('home');
    expect(getTradeGlyph('Underwater Basket Weaving')).toBe('home');
  });
});

describe('getTradeGlyphOptions', () => {
  it('offers at least 5 distinct, valid options for every trade', () => {
    for (const trade of TRADES) {
      const opts = getTradeGlyphOptions(trade);
      expect(opts.length).toBeGreaterThanOrEqual(5);
      expect(new Set(opts).size).toBe(opts.length); // no duplicates
      for (const key of opts) expect(SERVICE_ICON_GLYPHS[key]).toBeDefined();
    }
  });

  it("uses the trade default (getTradeGlyph) as its first option", () => {
    for (const trade of TRADES) {
      expect(getTradeGlyphOptions(trade)[0]).toBe(getTradeGlyph(trade));
    }
  });

  it('gives trade-specific alternatives (electrical vs plumbing differ)', () => {
    expect(getTradeGlyphOptions('Electrician')).toContain('lightbulb');
    expect(getTradeGlyphOptions('Plumbing')).toContain('showerhead');
    expect(getTradeGlyphOptions('HVAC')).toContain('snowflake');
    expect(getTradeGlyphOptions('Roofing')).not.toContain('showerhead');
  });
});

describe('glyphForContent', () => {
  const content = (fields: Record<string, unknown>) => getSiteContent(fields);

  it("uses the owner's picked glyph when it is valid", () => {
    expect(glyphForContent(content({ trade: 'Plumbing', brandGlyph: 'wrench' }))).toBe('wrench');
  });

  it('falls back to the trade default when no glyph is picked', () => {
    expect(glyphForContent(content({ trade: 'Plumbing' }))).toBe('droplet');
  });

  it('ignores an invalid stored glyph and uses the trade default', () => {
    // getSiteContent already drops an unknown brandGlyph, so it never reaches render.
    expect(content({ trade: 'Plumbing', brandGlyph: 'not-a-real-key' }).brandGlyph).toBe('');
    expect(glyphForContent(content({ trade: 'Plumbing', brandGlyph: 'not-a-real-key' }))).toBe('droplet');
  });
});
