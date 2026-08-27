import { describe, it, expect } from 'vitest';
import {
  CHANGELOG_RELEASES,
  CHANGELOG_CATEGORIES,
  LATEST_RELEASE,
  isNewReleaseAvailable,
} from '@/lib/changelog';
import { ARTICLES, getArticle } from '@/lib/resources';

describe('Changelog Module', () => {
  it('has valid releases with required fields', () => {
    expect(CHANGELOG_RELEASES.length).toBeGreaterThan(0);
    expect(LATEST_RELEASE).toBeDefined();
    expect(LATEST_RELEASE.id).toBe(CHANGELOG_RELEASES[0].id);

    CHANGELOG_RELEASES.forEach((release) => {
      expect(release.id).toBeTruthy();
      expect(release.version).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(release.title).toBeTruthy();
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.summary).toBeTruthy();
      expect(release.highlights.length).toBeGreaterThan(0);
      expect(CHANGELOG_CATEGORIES).toContain(release.category);
    });
  });

  it('correctly calculates new release availability against stored date', () => {
    expect(isNewReleaseAvailable(null)).toBe(true);
    expect(isNewReleaseAvailable('2020-01-01')).toBe(true);
    expect(isNewReleaseAvailable(LATEST_RELEASE.date)).toBe(false);
    expect(isNewReleaseAvailable('2099-01-01')).toBe(false);
  });

  it('includes new launch resource articles', () => {
    const aiArticle = getArticle('ai-phone-receptionist-guide');
    expect(aiArticle).toBeDefined();
    expect(aiArticle?.title).toContain('AI');

    const crewArticle = getArticle('crew-gps-geofenced-timesheets-guide');
    expect(crewArticle).toBeDefined();
    expect(crewArticle?.title).toContain('Geofenced');

    const cleanEnergyArticle = getArticle('clean-energy-rebates-permit-intel-guide');
    expect(cleanEnergyArticle).toBeDefined();
    expect(cleanEnergyArticle?.title).toContain('Clean energy');
  });
});
