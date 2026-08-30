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

export type Theme = 'onyx' | 'dark' | 'dim' | 'light' | 'sunlight' | 'clarity' | 'monochrome' | 'parchment';

/**
 * What the PERSON picked, which is not the same as what gets rendered.
 * 'system' resolves to one of the other eight at paint time; it is a standing
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
  return value === 'onyx' ||
    value === 'dark' ||
    value === 'dim' ||
    value === 'light' ||
    value === 'sunlight' ||
    value === 'clarity' ||
    value === 'monochrome' ||
    value === 'parchment'
    ? value
    : null;
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
 * that cookie doesn't exist yet, so the server falls back to dark. The root
 * layout's synchronous bootstrap script corrects that guess before first paint
 * and writes the mirror for future server renders.
 */
export function resolveTheme(cookieValue: string | null | undefined, systemPrefersLight = false): Theme {
  return parseTheme(cookieValue) ?? (systemPrefersLight ? 'sunlight' : 'dark');
}

/** Cycles across the eight modes: onyx -> dark -> dim -> light -> sunlight -> clarity -> monochrome -> parchment -> onyx */
export function nextTheme(theme: Theme): Theme {
  if (theme === 'onyx') return 'dark';
  if (theme === 'dark') return 'dim';
  if (theme === 'dim') return 'light';
  if (theme === 'light') return 'sunlight';
  if (theme === 'sunlight') return 'clarity';
  if (theme === 'clarity') return 'monochrome';
  if (theme === 'monochrome') return 'parchment';
  return 'onyx';
}

/**
 * The one-tap visibility action is deliberately binary.
 *
 * The complete palette belongs in Settings. The floating control is for the
 * moment someone walks into bright sun (or back into a dark room), so it must
 * always land on a legible extreme in one press instead of walking through
 * eight preference options.
 */
export function otherTheme(theme: Theme): Theme {
  return theme === 'sunlight' || theme === 'parchment' ? 'dark' : 'sunlight';
}

/** What the action says it will do, for its tooltip and accessible name. */
export function themeToggleLabel(theme: Theme): string {
  return otherTheme(theme) === 'dark' ? 'Switch to dark mode' : 'Switch to sunlight mode';
}

/** Browser chrome should belong to the active palette, not stay midnight blue. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = {
  onyx: '#000000',
  dark: '#070a11',
  dim: '#1c1a17',
  light: '#141519',
  sunlight: '#eaeef4',
  clarity: '#0b0c0e',
  monochrome: '#0a0a0b',
  parchment: '#f5f0e7',
};

export function themeColor(theme: Theme): string {
  return THEME_COLORS[theme];
}

/**
 * The nine options, in the order they are drawn.
 *
 * Auto sits FIRST because it is the default state and the one you fall back to.
 * The standard lighting ramp comes first (Sunlight → Workbench → Dim → Dark → Onyx),
 * followed by the specialized vision & accessibility suite (Clarity → Monochrome → Parchment).
 */
export const THEME_CHOICES: { value: ThemeChoice; word: string; label: string }[] = [
  { value: 'system', word: 'Auto', label: 'Match my device' },
  { value: 'sunlight', word: 'Sunlight', label: 'High-contrast daylight' },
  { value: 'light', word: 'Workbench', label: 'Dark shell, soft cards (workbench)' },
  { value: 'dim', word: 'Dim', label: 'Warm graphite, easy on the eyes' },
  { value: 'dark', word: 'Dark', label: 'Deep midnight ink' },
  { value: 'onyx', word: 'Onyx', label: 'OLED pure black (AAA)' },
  { value: 'clarity', word: 'Clarity', label: 'Color vision safe (CVD)' },
  { value: 'monochrome', word: 'Mono', label: 'Pure luminance & shape' },
  { value: 'parchment', word: 'Parchment', label: 'Warm paper light mode' },
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
