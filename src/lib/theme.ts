// Light / dark for the contractor's own dashboard.
//
// NOT the same thing as a contractor's website theme. That one is content
// (`content.colorScheme`, per site, chosen for their customers); this one is a
// person's preference for the tool they work in all day, and the two must never
// read each other — a plumber liking a light dashboard says nothing about what
// their homeowners should see.
//
// The choice lives in a cookie rather than localStorage for one reason: the
// server has to know it. The root layout stamps data-theme onto <html> during
// the render, so the first paint is already the right theme. Read from
// localStorage instead and every page load flashes dark before correcting
// itself, which is worse than not offering the setting.

export type Theme = 'dark' | 'light';

export const THEME_COOKIE = 'lgq-theme';

/** A year. The preference is not a session, it's a setting. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * The theme to render with.
 *
 * An explicit choice always wins. With no cookie we follow the operating
 * system, because someone who has set their machine to light mode has already
 * answered this question once and shouldn't have to answer it again here. The
 * OS preference is only knowable in the browser, so the server falls back to
 * dark — which is what the app has always been, so a first paint that then
 * corrects itself only ever happens to a light-mode user on their first visit,
 * and only once (the toggle writes the cookie).
 */
export function resolveTheme(cookieValue: string | null | undefined, systemPrefersLight = false): Theme {
  return parseTheme(cookieValue) ?? (systemPrefersLight ? 'light' : 'dark');
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** What the switch says it will do, for the label and the accessible name. */
export function themeToggleLabel(theme: Theme): string {
  return theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}
