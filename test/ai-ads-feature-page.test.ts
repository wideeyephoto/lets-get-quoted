import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { metadata } from '@/app/features/ai-ads/page';
import { FEATURE_CATEGORIES, ALL_FEATURES } from '@/lib/features';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('AI Ads Autopilot Public Feature Page (/features/ai-ads)', () => {
  const PAGE_SRC = read('src/app/features/ai-ads/page.tsx');
  const SIMULATOR_SRC = read('src/app/features/ai-ads/AiAdsSimulator.tsx');
  const CATALOG_EXPLORER = read('src/app/features/FeaturesCatalogExplorer.tsx');

  it('declares correct canonical metadata and OpenGraph tags', () => {
    expect(metadata.title).toContain('AI Advertising Autopilot');
    expect(metadata.alternates?.canonical).toBe('https://letsgetquoted.com/features/ai-ads');
    expect(metadata.openGraph?.images).toBeDefined();
  });

  it('renders FeatureDetailLayout with AiAdsSimulator and Proof points', () => {
    expect(PAGE_SRC).toContain('<FeatureDetailLayout');
    expect(PAGE_SRC).toContain('<AiAdsSimulator');
    expect(PAGE_SRC).toContain('100% Direct Ad Spend');
    expect(PAGE_SRC).toContain('Speed-to-Lead Auto-SMS');
    expect(PAGE_SRC).toContain('Weather Surge');
    expect(PAGE_SRC).toContain('Closed-Loop Conversion Sync');
  });

  it('supports interactive trade/city controls and smart bundle switching in simulator', () => {
    expect(SIMULATOR_SRC).toContain('DEMO_TRADES');
    expect(SIMULATOR_SRC).toContain('DEMO_CITIES');
    expect(SIMULATOR_SRC).toContain('SMART_BUNDLES');
    expect(SIMULATOR_SRC).toContain('Google Search Ad');
    expect(SIMULATOR_SRC).toContain('Instagram & Facebook');
    expect(SIMULATOR_SRC).toContain('Display Retargeting');
    expect(SIMULATOR_SRC).toContain('Weather Surge:');
    expect(SIMULATOR_SRC).toContain('Capacity Guard:');
    expect(SIMULATOR_SRC).toContain('Speed-to-Lead:');
  });

  it('integrates cleanly with the features catalog and deep links', () => {
    const marketingCat = FEATURE_CATEGORIES.find((c) => c.slug === 'marketing');
    expect(marketingCat).toBeDefined();
    expect(marketingCat?.features.some((f) => f.id === 'ai-ads-autopilot')).toBe(true);
    expect(marketingCat?.features.some((f) => f.id === 'speed-to-lead-sms')).toBe(true);
    expect(marketingCat?.features.some((f) => f.id === 'message-match-hero')).toBe(true);
    expect(marketingCat?.features.some((f) => f.id === 'weather-ad-surge')).toBe(true);
    expect(marketingCat?.features.some((f) => f.id === 'closed-loop-conversions')).toBe(true);

    expect(CATALOG_EXPLORER).toContain("marketing: '/features/ai-ads'");
    expect(CATALOG_EXPLORER).toContain("'ai-ads-autopilot': '/features/ai-ads'");
  });
});
