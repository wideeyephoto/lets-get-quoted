import { describe, expect, it } from 'vitest';
import {
  nextTheme,
  otherTheme,
  parseTheme,
  parseThemeChoice,
  resolveTheme,
  THEME_CHOICES,
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
  it('an explicit choice always wins over the system', () => {
    expect(resolveTheme('sunlight', false)).toBe('sunlight');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dim', false)).toBe('dim');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('onyx', true)).toBe('onyx');
    expect(resolveTheme('clarity', true)).toBe('clarity');
    expect(resolveTheme('monochrome', true)).toBe('monochrome');
    expect(resolveTheme('parchment', true)).toBe('parchment');
  });

  it('follows the operating system when nothing has been chosen', () => {
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme(null, false)).toBe('dark');
    expect(resolveTheme(undefined, true)).toBe('light');
  });

  it('falls back to dark on the server, where the OS is unknowable', () => {
    // The app has always been dark, so this is the no-surprise answer — and the
    // toggle writes the cookie, so a light-mode user only meets it once.
    expect(resolveTheme(null)).toBe('dark');
    expect(resolveTheme('nonsense')).toBe('dark');
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

describe('system as a choice', () => {
  it('renders whatever the device says, not a colour of its own', () => {
    // The caller passes null for 'system'; the cookie value itself is never a
    // theme, which is the whole reason parseTheme keeps rejecting it.
    expect(parseTheme('system')).toBeNull();
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme(null, false)).toBe('dark');
  });

  it('is the first option offered, and every option has a label', () => {
    expect(THEME_CHOICES.map((c) => c.value)).toEqual([
      'system',
      'sunlight',
      'light',
      'dim',
      'dark',
      'onyx',
      'clarity',
      'monochrome',
      'parchment',
    ]);
    for (const c of THEME_CHOICES) expect(themeChoiceLabel(c.value)).toBe(c.label);
  });
});

describe('themeCookieString', () => {
  it('writes a year-long, path-wide, Lax cookie — the server has to see it on navigation', () => {
    const cookie = themeCookieString('lgq-theme', 'system');
    expect(cookie).toContain('lgq-theme=system');
    expect(cookie).toContain('path=/');
    expect(cookie).toContain('max-age=31536000');
    expect(cookie).toContain('samesite=lax');
  });
});

describe('nextTheme / otherTheme / label', () => {
  it('cycles across the eight themes: onyx -> dark -> dim -> light -> sunlight -> clarity -> monochrome -> parchment -> onyx', () => {
    expect(nextTheme('onyx')).toBe('dark');
    expect(nextTheme('dark')).toBe('dim');
    expect(nextTheme('dim')).toBe('light');
    expect(nextTheme('light')).toBe('sunlight');
    expect(nextTheme('sunlight')).toBe('clarity');
    expect(nextTheme('clarity')).toBe('monochrome');
    expect(nextTheme('monochrome')).toBe('parchment');
    expect(nextTheme('parchment')).toBe('onyx');

    expect(otherTheme('onyx')).toBe('dark');
    expect(otherTheme('dark')).toBe('dim');
    expect(otherTheme('dim')).toBe('light');
    expect(otherTheme('light')).toBe('sunlight');
    expect(otherTheme('sunlight')).toBe('clarity');
    expect(otherTheme('clarity')).toBe('monochrome');
    expect(otherTheme('monochrome')).toBe('parchment');
    expect(otherTheme('parchment')).toBe('onyx');
  });

  it('the label says what pressing it will DO, not what it currently is', () => {
    expect(themeToggleLabel('onyx')).toBe('Switch to dark mode');
    expect(themeToggleLabel('dark')).toBe('Switch to dim mode');
    expect(themeToggleLabel('dim')).toBe('Switch to light mode');
    expect(themeToggleLabel('light')).toBe('Switch to sunlight mode');
    expect(themeToggleLabel('sunlight')).toBe('Switch to clarity mode');
    expect(themeToggleLabel('clarity')).toBe('Switch to monochrome mode');
    expect(themeToggleLabel('monochrome')).toBe('Switch to parchment mode');
    expect(themeToggleLabel('parchment')).toBe('Switch to onyx mode');
  });
});
