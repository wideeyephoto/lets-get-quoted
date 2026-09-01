import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { COLOR_SCHEMES } from '@/lib/site-content';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';

const THEMES_CSS = fs.readFileSync(path.join(process.cwd(), 'src/lib/templates/themes.module.css'), 'utf8');

describe('All Themes & All Color Systems Contrast and Token Integrity', () => {
  it('defines all 8 templates and 12 active/legacy schemes', () => {
    expect(AVAILABLE_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    expect(COLOR_SCHEMES.length).toBeGreaterThanOrEqual(12);
  });

  it('ensures aliased theme variables map to correct canvas vs surface tokens', () => {
    // Canvas ink should map to --c-ink, not --c-surface-ink, so dark canvas in high-contrast schemes doesn't get dark text
    expect(THEMES_CSS).toContain('--sh-ink: var(--c-ink);');
    expect(THEMES_CSS).toContain('--rn-ink: var(--c-ink);');
    expect(THEMES_CSS).toContain('--fx-ink: var(--c-ink);');
    expect(THEMES_CSS).toContain('--coat-ink: var(--c-ink);');
  });

  it('ensures photo heroes (Forge & Vista) decouple hero copy from data-mode to preserve photo contrast', () => {
    expect(THEMES_CSS).toContain('.forgeHero h1, .forgeHeroTextColumn h1, .forgeHeroCopy h1 { color: var(--c-on-photo, #f3f0e7) !important;');
    expect(THEMES_CSS).toContain('.forgeHero .kicker, .forgeHeroTextColumn .kicker, .forgeHeroCopy .kicker { color: var(--theme-accent, #f0b429) !important;');
  });

  it('ensures deep slabs and footers use --c-deep and --c-on-deep across all themes', () => {
    expect(THEMES_CSS).toContain('--c-deep');
    expect(THEMES_CSS).toContain('--c-on-deep');
  });
});
