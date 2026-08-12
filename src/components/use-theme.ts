'use client';

import { useEffect, useState } from 'react';
import {
  parseTheme,
  parseThemeChoice,
  resolveTheme,
  themeCookieString,
  THEME_COOKIE,
  THEME_SYSTEM_COOKIE,
  type Theme,
  type ThemeChoice,
} from '@/lib/theme';

// The one client-side owner of "what theme are we in".
//
// There are now two controls for this on screen at once — the floating switch
// on a phone and the Auto/Light/Dark row in the account menu — and before this
// existed each of them read <html data-theme> once on mount and never again, so
// flipping one left the other showing the old answer. <html> is still the
// source of truth (the server stamps it, so there is nothing to hydrate); this
// module just makes every subscriber re-read it when it changes.

const CHANGE_EVENT = 'lgq-theme-change';
const SYSTEM_QUERY = '(prefers-color-scheme: light)';

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(SYSTEM_QUERY).matches;
}

/** What <html> currently says, which is what the user is currently looking at. */
export function readStampedTheme(): { choice: ThemeChoice; theme: Theme } {
  const root = document.documentElement;
  return {
    choice: parseThemeChoice(root.dataset.themeChoice) ?? 'system',
    theme: parseTheme(root.dataset.theme) ?? 'dark',
  };
}

/** Mirror the device's setting so the SERVER can resolve 'system' next time. */
export function rememberSystemPreference(): void {
  document.cookie = themeCookieString(THEME_SYSTEM_COOKIE, systemPrefersLight() ? 'light' : 'dark');
}

/**
 * Apply a choice: repaint, persist, and tell the other controls.
 *
 * All three happen in the same tick, so the change is instant AND the next page
 * load already renders correct from the server — no flash, and no round trip to
 * save a preference.
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(choice === 'system' ? null : choice, systemPrefersLight());
  root.dataset.themeChoice = choice;
  document.cookie = themeCookieString(THEME_COOKIE, choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useTheme(): { choice: ThemeChoice; theme: Theme; setChoice: (choice: ThemeChoice) => void } {
  // Dark is the render-time guess, matching the server's own fallback; the
  // effect below corrects it from <html> before paint in practice, and these
  // controls draw state rather than text, so there is nothing to flicker.
  const [state, setState] = useState<{ choice: ThemeChoice; theme: Theme }>({ choice: 'system', theme: 'dark' });

  useEffect(() => {
    const sync = () => setState(readStampedTheme());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);

    // Someone on Auto whose phone crosses into night mode while a page is open
    // should watch it change, not find out on their next navigation.
    const media = window.matchMedia(SYSTEM_QUERY);
    const onSystemChange = () => {
      rememberSystemPreference();
      if (readStampedTheme().choice === 'system') applyThemeChoice('system');
    };
    media.addEventListener('change', onSystemChange);

    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      media.removeEventListener('change', onSystemChange);
    };
  }, []);

  return { ...state, setChoice: applyThemeChoice };
}
