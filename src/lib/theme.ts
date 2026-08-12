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

/**
 * What the PERSON picked, which is not the same as what gets rendered.
 * 'system' resolves to one of the other two at paint time; it is a standing
 * instruction ("follow the phone"), not a colour.
 */
export type ThemeChoice = Theme | 'system';

export const THEME_COOKIE = 'lgq-theme';

/**
 * The device's own light/dark setting, mirrored into a cookie by the browser.
 *
 * The server cannot ask a request what the operating system prefers — that
 * answer only exists in the browser, behind a media query. Without it "follow
 * my device" can only ever render dark first and correct itself, which is a
 * flash on every single page load, i.e. the exact failure the cookie above
 * exists to avoid. So the client writes what it sees here once, and from the
 * next navigation onwards the server can resolve 'system' correctly on the
 * first paint like any other choice.
 *
 * It is a mirror, never a preference: the media query is the truth, this is
 * last-known. It is re-written on every mount and whenever the OS flips.
 */
export const THEME_SYSTEM_COOKIE = 'lgq-sys';

/** A year. The preference is not a session, it's a setting. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** Like parseTheme, but 'system' is a legal answer rather than junk. */
export function parseThemeChoice(value: string | null | undefined): ThemeChoice | null {
  return value === 'system' ? 'system' : parseTheme(value);
}

/**
 * The theme to render with.
 *
 * An explicit choice always wins. Anything else — no cookie, an explicit
 * 'system', or junk — follows the operating system, because someone who has set
 * their machine to light mode has already answered this question once and
 * shouldn't have to answer it again here. The OS preference reaches the server
 * through THEME_SYSTEM_COOKIE; on the very first request of a very first visit
 * that cookie doesn't exist yet, so the server falls back to dark — which is
 * what the app has always been, and ThemeSync corrects it in the same session.
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

/**
 * The three options, in the order they are drawn.
 *
 * Auto sits FIRST because it is the default state and the one you fall back to,
 * not a third alternative bolted on the end — and because left-to-right the row
 * then reads auto → light → dark, which is the same order of increasing
 * commitment the labels describe.
 */
export const THEME_CHOICES: { value: ThemeChoice; word: string; label: string }[] = [
  { value: 'system', word: 'Auto', label: 'Match my device' },
  { value: 'light', word: 'Light', label: 'Always light' },
  { value: 'dark', word: 'Dark', label: 'Always dark' },
];

/** The accessible name for a control that is currently on `choice`. */
export function themeChoiceLabel(choice: ThemeChoice): string {
  return THEME_CHOICES.find((c) => c.value === choice)?.label ?? 'Match my device';
}

/** One place that knows the cookie flags, because two places drifted. */
export function themeCookieString(name: string, value: string): string {
  // SameSite=Lax so it rides along on ordinary navigation, which is exactly
  // when the server needs to read it.
  return `${name}=${value}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
