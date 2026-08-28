import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HERO_TEXT_SHADOW_STYLES,
  HERO_TEXT_SHADOW_STYLE_KEYS,
  getHeroTextShadow,
  getSiteContent,
} from '@/lib/site-content';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const THEMES_CSS = read('src', 'lib', 'templates', 'themes.module.css');
const TEMPLATES = [
  'forge.tsx',
  'handy.tsx',
  'coat.tsx',
  'fixit.tsx',
  'modern.tsx',
  'professional.tsx',
  'reno.tsx',
  'shine.tsx',
].map((filename) => ({
  name: filename,
  content: read('src', 'lib', 'templates', filename),
}));

describe('Hero text shadow & readability treatments', () => {
  it('defines the expected hero text shadow styles and keys', () => {
    expect(HERO_TEXT_SHADOW_STYLES.map((s) => s.key)).toEqual([
      'none',
      'soft',
      'bold',
      'glow',
      'scrim',
    ]);
    expect(HERO_TEXT_SHADOW_STYLE_KEYS.has('glow')).toBe(true);
    expect(HERO_TEXT_SHADOW_STYLE_KEYS.has('bold')).toBe(true);
    expect(HERO_TEXT_SHADOW_STYLE_KEYS.has('soft')).toBe(true);
    expect(HERO_TEXT_SHADOW_STYLE_KEYS.has('scrim')).toBe(true);
  });

  it('safely parses and falls back to none', () => {
    expect(getHeroTextShadow(null)).toBe('none');
    expect(getHeroTextShadow(undefined)).toBe('none');
    expect(getHeroTextShadow({ heroTextShadow: 'glow' })).toBe('glow');
    expect(getHeroTextShadow({ heroTextShadow: 'bold' })).toBe('bold');
    expect(getHeroTextShadow({ heroTextShadow: 'soft' })).toBe('soft');
    expect(getHeroTextShadow({ heroTextShadow: 'scrim' })).toBe('scrim');
    expect(getHeroTextShadow({ heroTextShadow: 'invalid-treatment' })).toBe('none');
  });

  it('normalizes heroTextShadow in getSiteContent', () => {
    const siteContent = getSiteContent({ heroTextShadow: 'glow' });
    expect(siteContent.heroTextShadow).toBe('glow');

    const emptyContent = getSiteContent({});
    expect(emptyContent.heroTextShadow).toBe('none');
  });

  it('binds data-hero-shadow across all 8 template components', () => {
    for (const template of TEMPLATES) {
      expect(
        template.content,
        `Expected ${template.name} to bind data-hero-shadow`
      ).toContain('data-hero-shadow={content.heroTextShadow');
    }
  });

  it('includes CSS rules for all hero text shadow treatments in themes.module.css', () => {
    expect(THEMES_CSS).toContain(".site[data-hero-shadow='soft']");
    expect(THEMES_CSS).toContain(".site[data-hero-shadow='bold']");
    expect(THEMES_CSS).toContain(".site[data-hero-shadow='glow']");
    expect(THEMES_CSS).toContain(".site[data-hero-shadow='scrim']");
  });
});
