'use client';

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  parseTheme,
  parseThemeChoice,
  resolveTheme,
  themeColor,
  themeCookieString,
  THEME_COOKIE,
  THEME_SYSTEM_COOKIE,
  type Theme,
  type ThemeChoice,
} from '@/lib/theme';

// The one client-side owner of "what theme are we in".
//
// There are now two controls for this on screen at once — the floating action
// and the full palette in Settings. <html> remains the paint-time source of
// truth, while ThemeProvider gives every control the same render state and owns
// the single pair of global listeners.

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

function stampThemeColor(theme: Theme): void {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute('content', themeColor(theme)));
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
  const theme = resolveTheme(choice === 'system' ? null : choice, systemPrefersLight());
  root.dataset.theme = theme;
  root.dataset.themeChoice = choice;
  stampThemeColor(theme);
  document.cookie = themeCookieString(THEME_COOKIE, choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

type ThemeContextValue = Readonly<{
  choice: ThemeChoice;
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
}>;

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  enabled,
  initialChoice,
  initialTheme,
}: {
  children: ReactNode;
  enabled: boolean;
  initialChoice: ThemeChoice;
  initialTheme: Theme;
}) {
  const [state, setState] = useState<{ choice: ThemeChoice; theme: Theme }>({
    choice: initialChoice,
    theme: initialTheme,
  });

  useEffect(() => {
    if (!enabled) return;

    const sync = () => setState(readStampedTheme());
    window.addEventListener(CHANGE_EVENT, sync);

    // The inline layout bootstrap has already corrected first paint. Re-read
    // that stamp now so controls agree with it, and repeat the cookie write as
    // a resilient fallback if scripts were reordered by an extension or CSP.
    rememberSystemPreference();
    if (readStampedTheme().choice === 'system') applyThemeChoice('system');
    else sync();

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
  }, [enabled]);

  return createElement(
    ThemeContext.Provider,
    { value: { ...state, setChoice: applyThemeChoice } },
    children,
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
