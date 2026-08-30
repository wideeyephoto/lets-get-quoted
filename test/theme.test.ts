import { describe, expect, it } from 'vitest';
import {
  nextTheme,
  otherTheme,
  parseTheme,
  parseThemeChoice,
  resolveTheme,
  THEME_COLORS,
  THEME_CHOICES,
  themeColor,
  themeChoiceLabel,
  themeCookieString,
  themeToggleLabel,
} from '@/lib/theme';

describe('parseTheme', () => {
  it('accepts only the eight real values', () => {
    expect(parseTheme('onyx')).toBe('onyx');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('dim')).toBe('dim');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('sunlight')).toBe('sunlight');
    expect(parseTheme('clarity')).toBe('clarity');
    expect(parseTheme('monochrome')).toBe('monochrome');
    expect(parseTheme('parchment')).toBe('parchment');
  });

  it('rejects anything else rather than guessing', () => {
    // The cookie is user-writable; a junk value must fall through to the
    // default, never render an undefined data-theme.
    for (const raw of [null, undefined, '', 'Dark', 'DIM', 'LIGHT', 'ONYX', 'SUNLIGHT', 'CLARITY', 'MONOCHROME', 'PARCHMENT', 'auto', 'system', '1', 'true']) {
      expect(parseTheme(raw), String(raw)).toBeNull();
    }
  });
});

describe('resolveTheme', () => {
  it('an explicit choice always wins', () => {
    expect(resolveTheme('sunlight', false)).toBe('sunlight');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dim', false)).toBe('dim');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('onyx', true)).toBe('onyx');
    expect(resolveTheme('clarity', true)).toBe('clarity');
    expect(resolveTheme('monochrome', true)).toBe('monochrome');
    expect(resolveTheme('parchment', true)).toBe('parchment');
  });

  it('defaults to dark when nothing has been chosen', () => {
    expect(resolveTheme(null, false)).toBe('dark');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme(undefined, false)).toBe('dark');
  });

  it('falls back to dark for invalid or unselected values', () => {
    expect(resolveTheme(null)).toBe('dark');
    expect(resolveTheme('nonsense')).toBe('dark');
  });

  it('follows the operating system when explicitly set to system', () => {
    expect(resolveTheme('system', true)).toBe('sunlight');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});

describe('parseThemeChoice', () => {
  it('accepts the nine real answers', () => {
    expect(parseThemeChoice('sunlight')).toBe('sunlight');
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dim')).toBe('dim');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice('onyx')).toBe('onyx');
    expect(parseThemeChoice('clarity')).toBe('clarity');
    expect(parseThemeChoice('monochrome')).toBe('monochrome');
    expect(parseThemeChoice('parchment')).toBe('parchment');
    expect(parseThemeChoice('system')).toBe('system');
  });

  it('still rejects junk, so a hand-edited cookie falls through to the default', () => {
    for (const raw of [null, undefined, '', 'Auto', 'SYSTEM', 'auto', 'true']) {
      expect(parseThemeChoice(raw), String(raw)).toBeNull();
    }
  });
});

describe('THEME_CHOICES palette and order in settings', () => {
  it('contains DARK -> WORKBENCH -> LIGHT -> DIM in exact order', () => {
    expect(THEME_CHOICES.map((c) => c.value)).toEqual([
      'dark',
      'light',
      'sunlight',
      'dim',
    ]);
    expect(THEME_CHOICES.map((c) => c.word)).toEqual([
      'Dark',
      'Workbench',
      'Light',
      'Dim',
    ]);
    for (const c of THEME_CHOICES) expect(themeChoiceLabel(c.value)).toBe(c.label);
  });
});

describe('themeCookieString', () => {
  it('writes a year-long, path-wide, Lax cookie — the server has to see it on navigation', () => {
    const cookie = themeCookieString('lgq-theme', 'dark');
    expect(cookie).toContain('lgq-theme=dark');
    expect(cookie).toContain('path=/');
    expect(cookie).toContain('max-age=31536000');
    expect(cookie).toContain('samesite=lax');
  });
});

describe('exact theme rotation: DARK -> WORKBENCH -> LIGHT -> DIM -> DARK', () => {
  it('rotates across the four primary modes in exact order', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('sunlight');
    expect(nextTheme('sunlight')).toBe('dim');
    expect(nextTheme('dim')).toBe('dark');
  });

  it('otherTheme matches nextTheme rotation', () => {
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('sunlight');
    expect(otherTheme('sunlight')).toBe('dim');
    expect(otherTheme('dim')).toBe('dark');
    expect(otherTheme('onyx')).toBe('dark');
  });

  it('provides accessible action labels for each next state', () => {
    expect(themeToggleLabel('dark')).toBe('Switch to Workbench theme');
    expect(themeToggleLabel('light')).toBe('Switch to Light theme');
    expect(themeToggleLabel('sunlight')).toBe('Switch to Dim theme');
    expect(themeToggleLabel('dim')).toBe('Switch to Dark theme');
  });
});

describe('browser theme colors', () => {
  it('tracks the canvas of every rendered theme', () => {
    expect(THEME_COLORS).toEqual({
      onyx: '#000000',
      dark: '#070a11',
      dim: '#1c1a17',
      light: '#141519',
      sunlight: '#eaeef4',
      clarity: '#0b0c0e',
      monochrome: '#0a0a0b',
      parchment: '#f5f0e7',
    });
    for (const [theme, color] of Object.entries(THEME_COLORS)) {
      expect(themeColor(theme as keyof typeof THEME_COLORS)).toBe(color);
    }
  });
});
