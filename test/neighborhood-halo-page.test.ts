import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { metadata } from '@/app/features/neighborhood-halo/page';
import { FEATURE_CATEGORIES } from '@/lib/features';
import { CHANGELOG_RELEASES } from '@/lib/changelog';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('Neighborhood Halo Public Feature Page (/features/neighborhood-halo)', () => {
  const PAGE_SRC = read('src/app/features/neighborhood-halo/page.tsx');
  const SIMULATOR_SRC = read('src/app/features/neighborhood-halo/NeighborhoodHaloSimulator.tsx');
  const RADAR_SRC = read('src/app/features/neighborhood-halo/HaloRadarMap.tsx');
  const PRIVACY_SRC = read('src/app/features/neighborhood-halo/HaloPrivacyVisualizer.tsx');
  const CATALOG_EXPLORER = read('src/app/features/FeaturesCatalogExplorer.tsx');
  const SITEMAP_SRC = read('src/app/sitemap.ts');

  it('declares valid canonical metadata and OpenGraph configuration', () => {
    expect(existsSync('src/app/features/neighborhood-halo/page.tsx')).toBe(true);
    expect(metadata.title).toContain('Neighborhood Halo');
    expect(metadata.alternates?.canonical).toBe('https://letsgetquoted.com/features/neighborhood-halo');
    expect(metadata.openGraph?.images).toBeDefined();
    expect(metadata.openGraph?.url).toBe('https://letsgetquoted.com/features/neighborhood-halo');
  });

  it('renders FeatureDetailLayout with simulator, privacy visualizer, proof points, and FAQs', () => {
    expect(PAGE_SRC).toContain('<FeatureDetailLayout');
    expect(PAGE_SRC).toContain('<NeighborhoodHaloSimulator');
    expect(PAGE_SRC).toContain('<HaloPrivacyVisualizer');
    expect(PAGE_SRC).toContain('<HaloJourneySequence');
    expect(PAGE_SRC).toContain('<HaloRoiCalculator');
    expect(PAGE_SRC).toContain('1-Mile Geofence Precision');
    expect(PAGE_SRC).toContain('Address Privacy Shield');
    expect(PAGE_SRC).toContain('$25 / 5-Day Micro-Budgets');
    expect(PAGE_SRC).toContain('Sub-60s Speed-to-Lead SMS');
    expect(PAGE_SRC).toContain('Frequently asked questions about Neighborhood Halo ads');
    expect(PAGE_SRC).toContain('THE ROUTE DENSITY MULTIPLIER');
  });

  it('provides interactive simulator with real sanitization, multi-channel previews, radar map, and auto-kill guard', () => {
    expect(SIMULATOR_SRC).toContain('extractStreetAndNeighborhood');
    expect(SIMULATOR_SRC).toContain('buildHaloCreativeBundle');
    expect(SIMULATOR_SRC).toContain('<HaloRadarMap');
    expect(RADAR_SRC).toContain('1.0 MILE GEOFENCE BOUNDARY');
    expect(RADAR_SRC).toContain('LIVE GEOFENCE RADAR');
    expect(SIMULATOR_SRC).toContain('Meta Ad');
    expect(SIMULATOR_SRC).toContain('Google Ads');
    expect(SIMULATOR_SRC).toContain('Street Cluster');
    expect(SIMULATOR_SRC).toContain('Speed-to-Lead');
    expect(SIMULATOR_SRC).toContain('72-Hour Auto-Kill Rule');
    expect(SIMULATOR_SRC).toContain('Storm Surge (+30%)');
  });

  it('demonstrates privacy protection in HaloPrivacyVisualizer', () => {
    expect(PRIVACY_SRC).toContain('Private Contractor CRM Record');
    expect(PRIVACY_SRC).toContain('Public Neighborhood Halo Ad');
    expect(PRIVACY_SRC).toContain('Omitted entirely');
    expect(PRIVACY_SRC).toContain('Real street clout. Zero homeowner privacy leaks.');
  });

  it('integrates seamlessly with the features catalog, sitemap, and changelog', () => {
    // Feature catalog
    const marketingCat = FEATURE_CATEGORIES.find((c) => c.slug === 'marketing');
    expect(marketingCat).toBeDefined();
    expect(marketingCat?.features.some((f) => f.id === 'neighborhood-halo')).toBe(true);

    // Deep link
    expect(CATALOG_EXPLORER).toContain("'neighborhood-halo': '/features/neighborhood-halo'");

    // Sitemap
    expect(SITEMAP_SRC).toContain("'neighborhood-halo'");

    // Changelog v2.6.0
    const haloRelease = CHANGELOG_RELEASES.find((r) => r.id === 'release-2026-08-street-cluster-satellite-halo');
    expect(haloRelease).toBeDefined();
    expect(haloRelease?.primaryAction?.href).toBe('/features/neighborhood-halo');
    expect(haloRelease?.primaryAction?.label).toBe('Explore Neighborhood Halo');
  });
});
