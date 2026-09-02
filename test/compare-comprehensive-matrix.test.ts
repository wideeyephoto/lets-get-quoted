import { describe, it, expect } from 'vitest';
import {
  COMPARE_PLATFORMS,
  MATRIX_CATEGORIES,
  ALL_SERVICES_MATRIX,
  type PlatformKey,
} from '../src/app/compare/compare-data';

describe('Comprehensive Comparison Matrix Data', () => {
  it('defines exactly 6 platforms with LGQ as the flagship', () => {
    expect(COMPARE_PLATFORMS.length).toBe(6);
    const lgq = COMPARE_PLATFORMS.find((p) => p.key === 'lgq');
    expect(lgq).toBeDefined();
    expect(lgq?.isFlagship).toBe(true);
    expect(lgq?.name).toBe("Let's Get Quoted");

    const competitorKeys: PlatformKey[] = ['jobber', 'housecall', 'servicetitan', 'angi', 'thumbtack'];
    competitorKeys.forEach((key) => {
      const p = COMPARE_PLATFORMS.find((plat) => plat.key === key);
      expect(p).toBeDefined();
      expect(p?.slug).toBeTruthy();
    });
  });

  it('defines comparison categories with valid ids and labels', () => {
    expect(MATRIX_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    const catIds = MATRIX_CATEGORIES.map((c) => c.id);
    expect(catIds).toContain('all');
    expect(catIds).toContain('pricing');
    expect(catIds).toContain('marketing');
    expect(catIds).toContain('ai_dispatch');
    expect(catIds).toContain('operations');
    expect(catIds).toContain('payments');
  });

  it('contains at least 20 feature rows across categories with all 6 platforms populated', () => {
    expect(ALL_SERVICES_MATRIX.length).toBeGreaterThanOrEqual(20);

    const platformKeys: PlatformKey[] = ['lgq', 'jobber', 'housecall', 'servicetitan', 'angi', 'thumbtack'];

    ALL_SERVICES_MATRIX.forEach((row) => {
      expect(row.id).toBeTruthy();
      expect(row.feature).toBeTruthy();
      expect(row.category).toBeTruthy();

      platformKeys.forEach((key) => {
        const cell = row.cells[key];
        expect(cell, `Row "${row.id}" missing cell for platform "${key}"`).toBeDefined();
        expect(cell.value).toBeTruthy();
        expect(['positive', 'neutral', 'negative']).toContain(cell.status);
      });
    });
  });

  it('ensures every categorized row corresponds to a defined MATRIX_CATEGORY', () => {
    const validCategoryIds = new Set(MATRIX_CATEGORIES.map((c) => c.id));
    ALL_SERVICES_MATRIX.forEach((row) => {
      expect(validCategoryIds.has(row.category)).toBe(true);
    });
  });
});
