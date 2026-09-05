import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FAVORITE_FEATURES, FEATURE_CATEGORIES } from '@/lib/features';

describe('Dead-Feature Detector & Favorite Catalog Integrity', () => {
  it('satellite-property-sizing is demoted from headline favorite features', () => {
    const favoriteIds = FAVORITE_FEATURES.map((f) => f.id);
    expect(favoriteIds).not.toContain('satellite-property-sizing');
  });

  it('satellite-property-sizing has active non-test production consumer', () => {
    const quoteDraftAi = readFileSync('src/lib/quote-draft-ai.ts', 'utf8');
    expect(quoteDraftAi).toContain("from '@/lib/satellite-property-sizing'");
  });

  it('all favorite features have defined non-empty names and descriptions', () => {
    expect(FAVORITE_FEATURES.length).toBeGreaterThan(5);
    for (const fav of FAVORITE_FEATURES) {
      expect(fav.id.trim()).not.toBe('');
      expect(fav.name.trim()).not.toBe('');
      expect(fav.desc.trim()).not.toBe('');
      expect(fav.category.trim()).not.toBe('');
    }
  });

  it('catalog descriptions do not claim unintegrated standalone satellite computer vision', () => {
    const featuresSource = readFileSync('src/lib/features.ts', 'utf8');
    const satelliteEntry = FEATURE_CATEGORIES.flatMap((c) => c.features).find(
      (f) => f.id === 'satellite-property-sizing'
    );
    expect(satelliteEntry).toBeDefined();
    expect(satelliteEntry?.desc).toContain('Google Solar and parcel data');
    expect(featuresSource).not.toContain(
      "name: 'Instant Satellite Property Sizing', desc: 'Calculates roof squares, pitch, siding area, gutter footage, and HVAC tonnage from aerial footprint data for accurate brackets.', favorite: true"
    );
  });
});
