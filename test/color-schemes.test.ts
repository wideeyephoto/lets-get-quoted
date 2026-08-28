import { describe, expect, it } from 'vitest';
import {
  COLOR_SCHEMES,
  getActiveColorSchemes,
  getColorScheme,
  getLegacyColorSchemes,
} from '@/lib/site-content';
import {
  getContrastRatio,
  parseHex,
  readableAccentText,
  readableOnAccent,
} from '@/lib/templates/theme-color';

const HEX_6 = /^#[0-9a-fA-F]{6}$/;

describe('COLOR_SCHEMES palette tokens and structure', () => {
  it('has 10 active curated schemes plus 2 legacy schemes', () => {
    const active = getActiveColorSchemes();
    const legacy = getLegacyColorSchemes();

    expect(active.map((s) => s.key)).toEqual([
      'midnight',
      'porcelain',
      'harbor',
      'evergreen',
      'steel',
      'sandstone',
      'copper',
      'concrete',
      'snow',
      'tuxedo',
    ]);
    expect(legacy.map((s) => s.key)).toEqual(['slate', 'forest']);
    expect(COLOR_SCHEMES).toHaveLength(12);
  });

  it('contains valid 6-digit hex strings for every required token across all schemes', () => {
    const tokenKeys = [
      'bg',
      'surface',
      'ink',
      'muted',
      'line',
      'controlLine',
      'deep',
      'onDeep',
      'onPhoto',
      'accent',
      'onAccent',
      'accentText',
    ] as const;

    for (const scheme of COLOR_SCHEMES) {
      expect(scheme.key).toBeTruthy();
      expect(scheme.label).toBeTruthy();
      expect(['light', 'dark']).toContain(scheme.tone);
      expect(['active', 'legacy']).toContain(scheme.status);
      expect(scheme.mood).toBeTruthy();

      for (const token of tokenKeys) {
        const val = scheme[token];
        expect(val, `${scheme.key}.${token} should be a valid 6-digit hex`).toMatch(HEX_6);
        expect(parseHex(val), `${scheme.key}.${token} should parse to RGB`).not.toBeNull();
      }
    }
  });

  it('resolves active and legacy schemes with getColorScheme', () => {
    expect(getColorScheme('midnight')?.key).toBe('midnight');
    expect(getColorScheme('porcelain')?.key).toBe('porcelain');
    expect(getColorScheme('harbor')?.key).toBe('harbor');
    expect(getColorScheme('evergreen')?.key).toBe('evergreen');
    expect(getColorScheme('steel')?.key).toBe('steel');
    expect(getColorScheme('sandstone')?.key).toBe('sandstone');
    expect(getColorScheme('copper')?.key).toBe('copper');
    expect(getColorScheme('concrete')?.key).toBe('concrete');
    expect(getColorScheme('snow')?.key).toBe('snow');
    expect(getColorScheme('tuxedo')?.key).toBe('tuxedo');
    expect(getColorScheme('slate')?.key).toBe('slate');
    expect(getColorScheme('forest')?.key).toBe('forest');
    expect(getColorScheme('unknown_key')).toBeNull();
    expect(getColorScheme(null)).toBeNull();
    expect(getColorScheme(undefined)).toBeNull();
  });
});

describe('COLOR_SCHEMES accessibility & contrast verification', () => {
  it('ensures primary text (ink) meets at least 4.5:1 against bg and surface (and >= 13:1 on active schemes)', () => {
    for (const scheme of COLOR_SCHEMES) {
      const bgContrast = getContrastRatio(scheme.ink, scheme.bg);
      const surfaceContrast = getContrastRatio(scheme.ink, scheme.surface);

      expect(bgContrast, `${scheme.key} ink on bg`).toBeGreaterThanOrEqual(4.5);
      expect(surfaceContrast, `${scheme.key} ink on surface`).toBeGreaterThanOrEqual(4.5);

      if (scheme.status === 'active') {
        expect(bgContrast, `Active ${scheme.key} ink on bg target >= 13:1`).toBeGreaterThanOrEqual(13.0);
      }
    }
  });

  it('ensures muted text meets at least 4.5:1 against bg and surface', () => {
    for (const scheme of COLOR_SCHEMES) {
      const bgContrast = getContrastRatio(scheme.muted, scheme.bg);
      const surfaceContrast = getContrastRatio(scheme.muted, scheme.surface);

      expect(bgContrast, `${scheme.key} muted on bg`).toBeGreaterThanOrEqual(4.5);
      expect(surfaceContrast, `${scheme.key} muted on surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ensures button text (onAccent) meets at least 4.5:1 against accent fill', () => {
    for (const scheme of COLOR_SCHEMES) {
      const ratio = getContrastRatio(scheme.onAccent, scheme.accent);
      expect(ratio, `${scheme.key} onAccent on accent`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ensures accent text (accentText) meets at least 4.5:1 against bg and surface', () => {
    for (const scheme of COLOR_SCHEMES) {
      const bgContrast = getContrastRatio(scheme.accentText, scheme.bg);
      const surfaceContrast = getContrastRatio(scheme.accentText, scheme.surface);

      expect(bgContrast, `${scheme.key} accentText on bg`).toBeGreaterThanOrEqual(4.5);
      expect(surfaceContrast, `${scheme.key} accentText on surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ensures deep surface text (onDeep) meets at least 4.5:1 against deep ground', () => {
    for (const scheme of COLOR_SCHEMES) {
      const ratio = getContrastRatio(scheme.onDeep, scheme.deep);
      expect(ratio, `${scheme.key} onDeep on deep`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('ensures controlLine meets at least 3.0:1 interactive boundary contrast against bg or surface', () => {
    for (const scheme of COLOR_SCHEMES) {
      const bgContrast = getContrastRatio(scheme.controlLine, scheme.bg);
      const surfaceContrast = getContrastRatio(scheme.controlLine, scheme.surface);

      expect(
        Math.max(bgContrast, surfaceContrast),
        `${scheme.key} controlLine boundary contrast`,
      ).toBeGreaterThanOrEqual(3.0);
    }
  });
});

describe('custom accent derivation: readableAccentText & readableOnAccent', () => {
  const PRESETS = [
    '#2563eb', '#0d9488', '#059669', '#65a30d', '#f59e0b', '#ea580c',
    '#dc2626', '#e11d48', '#7c3aed', '#4f46e5', '#475569', '#1f2937',
  ];

  it('guarantees readableOnAccent chooses high-contrast text for any accent', () => {
    for (const hex of PRESETS) {
      const onAccent = readableOnAccent(hex);
      const ratio = getContrastRatio(onAccent, hex);
      expect(ratio, `onAccent for ${hex}`).toBeGreaterThanOrEqual(4.5);
    }

    // Extremes
    expect(readableOnAccent('#ffffff')).toBe('#111');
    expect(readableOnAccent('#000000')).toBe('#fff');
  });

  it('derives readable accent text for all presets on light and dark schemes', () => {
    const testBackgrounds = [
      ['#ffffff', '#f7f5f1'], // Light backgrounds (Porcelain / Harbor / White)
      ['#0e1116', '#191d25'], // Dark backgrounds (Midnight)
      ['#10251a', '#193424'], // Dark green backgrounds (Evergreen)
    ];

    for (const bgPair of testBackgrounds) {
      for (const hex of PRESETS) {
        const derived = readableAccentText(hex, bgPair, 4.5);
        expect(derived).toMatch(HEX_6);

        for (const bg of bgPair) {
          const ratio = getContrastRatio(derived, bg);
          expect(ratio, `readableAccentText(${hex}) on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('handles extreme and edge case colors safely', () => {
    const backgrounds = ['#ffffff', '#f4f7fb'];

    // Pure colors & extremes
    const testCases = ['#000000', '#ffffff', '#808080', '#ffff00', '#ff0000', '#00ff00', '#00ffff', '#0000ff', '#EA580C'];

    for (const hex of testCases) {
      const derived = readableAccentText(hex, backgrounds, 4.5);
      expect(derived).toMatch(HEX_6);
      for (const bg of backgrounds) {
        expect(getContrastRatio(derived, bg), `${hex} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }

    // Invalid & 3-digit hex fallback safety
    expect(readableAccentText('invalid', backgrounds)).toMatch(HEX_6);
    expect(readableAccentText('#abc', backgrounds)).toMatch(HEX_6);
    expect(readableAccentText('', backgrounds)).toMatch(HEX_6);
    expect(readableAccentText(null, backgrounds)).toMatch(HEX_6);
  });
});
