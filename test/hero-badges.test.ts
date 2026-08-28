import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HERO_BADGE_PRESETS,
  HERO_BADGE_STYLES,
  HERO_BADGE_STYLE_KEYS,
  getHeroBadge,
  getHeroBadgeStyle,
  getHeroSecondBadge,
  getSiteContent,
} from '@/lib/site-content';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const THEMES_CSS = read('src', 'lib', 'templates', 'themes.module.css');
const BUILDER_CODE = read('src', 'app', 'dashboard', 'sites', 'WebsiteBuilder.tsx');

describe('Hero badge presets and offerings', () => {
  it('includes classic and high-converting trust presets', () => {
    const keys = HERO_BADGE_PRESETS.map((p) => p.key);
    expect(keys).toContain('estimates');
    expect(keys).toContain('licensed');
    expect(keys).toContain('sameday');
    expect(keys).toContain('emergency');
    expect(keys).toContain('insured');
    expect(keys).toContain('financing');
    expect(keys).toContain('guarantee');
    expect(keys).toContain('experience');
    expect(keys).toContain('fivestar');
    expect(keys).toContain('fixedprice');
  });

  it('includes all modern visual badge styles in style keys', () => {
    const styleKeys = HERO_BADGE_STYLES.map((s) => s.key);
    expect(styleKeys).toEqual(['solid', 'soft', 'dark', 'darkglass', 'accent', 'gold', 'aurora']);
    expect(HERO_BADGE_STYLE_KEYS.has('accent')).toBe(true);
    expect(HERO_BADGE_STYLE_KEYS.has('gold')).toBe(true);
    expect(HERO_BADGE_STYLE_KEYS.has('aurora')).toBe(true);
    expect(HERO_BADGE_STYLE_KEYS.has('outline')).toBe(true); // backward compatibility
  });

  it('correctly resolves getHeroBadge for presets', () => {
    const badge = getHeroBadge({
      heroBadge: { preset: 'emergency' },
    });
    expect(badge).not.toBeNull();
    expect(badge?.title).toBe('24/7 Emergency Service');
    expect(badge?.icon).toBe('🚨');
  });

  it('supports custom primary hero badges with custom icon and subtitle', () => {
    const customBadge = getHeroBadge({
      heroBadge: {
        preset: 'custom',
        customIcon: '🏆',
        customLabel: 'Veteran Owned',
        customSubtitle: '10% Military Discount',
      },
    });
    expect(customBadge).not.toBeNull();
    expect(customBadge?.icon).toBe('🏆');
    expect(customBadge?.title).toBe('Veteran Owned');
    expect(customBadge?.subtitle).toBe('10% Military Discount');
  });

  it('falls back to default icon when custom icon is omitted', () => {
    const customBadge = getHeroBadge({
      heroBadge: {
        preset: 'custom',
        customLabel: 'Family Owned',
      },
    });
    expect(customBadge).not.toBeNull();
    expect(customBadge?.icon).toBe('✓');
    expect(customBadge?.title).toBe('Family Owned');
  });

  it('correctly resolves getHeroSecondBadge for custom badges', () => {
    const secondBadge = getHeroSecondBadge({
      heroBadge: {
        secondPreset: 'custom',
        secondCustomIcon: '🛡️',
        secondCustomLabel: 'Licensed & Bonded',
        secondCustomSubtitle: 'State Reg #12345',
      },
    });
    expect(secondBadge.mode).toBe('badge');
    if (secondBadge.mode === 'badge') {
      expect(secondBadge.badge.icon).toBe('🛡️');
      expect(secondBadge.badge.title).toBe('Licensed & Bonded');
      expect(secondBadge.badge.subtitle).toBe('State Reg #12345');
    }
  });

  it('safely normalizes heroBadge in getSiteContent', () => {
    const normalized = getSiteContent({
      heroBadge: {
        preset: 'insured',
        style: 'gold',
        customIcon: '★',
        customLabel: 'Custom Top Pro',
        customSubtitle: 'Top Rated in Dallas',
      },
    });
    expect(normalized.heroBadge.preset).toBe('insured');
    expect(normalized.heroBadge.style).toBe('gold');
    expect(normalized.heroBadge.customIcon).toBe('★');
    expect(normalized.heroBadge.customLabel).toBe('Custom Top Pro');
    expect(normalized.heroBadge.customSubtitle).toBe('Top Rated in Dallas');
  });

  it('defines the CSS treatments for accent, gold, and aurora in themes.module.css', () => {
    expect(THEMES_CSS).toContain("[data-badge-style='accent']");
    expect(THEMES_CSS).toContain("[data-badge-style='gold']");
    expect(THEMES_CSS).toContain("[data-badge-style='aurora']");
  });

  it('binds the custom badge icon and subtitle inputs in WebsiteBuilder.tsx', () => {
    expect(BUILDER_CODE).toContain('customBadgeIconInput');
    expect(BUILDER_CODE).toContain('customSubtitle');
    expect(BUILDER_CODE).toContain('secondCustomSubtitle');
  });
});
