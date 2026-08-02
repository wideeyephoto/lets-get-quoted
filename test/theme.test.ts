import { describe, expect, it } from 'vitest';
import { otherTheme, parseTheme, resolveTheme, themeToggleLabel } from '@/lib/theme';

describe('parseTheme', () => {
  it('accepts only the two real values', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
  });

  it('rejects anything else rather than guessing', () => {
    // The cookie is user-writable; a junk value must fall through to the
    // default, never render an undefined data-theme.
    for (const raw of [null, undefined, '', 'Dark', 'LIGHT', 'auto', 'system', '1', 'true']) {
      expect(parseTheme(raw), String(raw)).toBeNull();
    }
  });
});

describe('resolveTheme', () => {
  it('an explicit choice always wins over the system', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
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

describe('otherTheme / label', () => {
  it('flips', () => {
    expect(otherTheme('dark')).toBe('light');
    expect(otherTheme('light')).toBe('dark');
  });

  it('the label says what pressing it will DO, not what it currently is', () => {
    expect(themeToggleLabel('dark')).toBe('Switch to light mode');
    expect(themeToggleLabel('light')).toBe('Switch to dark mode');
  });
});
