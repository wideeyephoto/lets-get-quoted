import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLOR_SCHEMES } from '@/lib/site-content';
import { getContrastRatio } from '@/lib/templates/theme-color';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const THEMES_CSS = read('src', 'lib', 'templates', 'themes.module.css');

describe('Forge photo hero text contrast and decoupling', () => {
  it('defines --c-on-photo on Forge and decouples photo hero text from data-mode', () => {
    expect(THEMES_CSS).toContain('--c-on-photo: #f3f0e7;');
    expect(THEMES_CSS).toContain('.forgeHeader, .forgeHero { color: var(--c-on-photo, #f3f0e7); }');
  });

  it('keeps high contrast over the dark photo scrim regardless of the selected color scheme', () => {
    // The photo scrim is a fixed dark overlay with gradient base approx #0a0a09
    const photoScrimBg = '#0a0a09';

    for (const scheme of COLOR_SCHEMES) {
      // Even with light schemes (Porcelain, Harbor, Slate), onPhoto stays bright
      const ratio = getContrastRatio(scheme.onPhoto, photoScrimBg);
      expect(
        ratio,
        `Scheme ${scheme.key} onPhoto (${scheme.onPhoto}) contrast over photo scrim (${photoScrimBg})`,
      ).toBeGreaterThanOrEqual(14.0);
    }
  });
});
