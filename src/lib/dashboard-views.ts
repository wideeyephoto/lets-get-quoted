// Per-browser dashboard view preferences (cookies, not DB columns — no migration
// and they survive sessions). Client-safe: names + normalizers only, no server
// imports, so both server pages and client components can share them.

// Whether the map shows under a section header. Defaults on. The on/off state is
// PER PAGE (each surface gets its own cookie) so turning it off on one page
// doesn't hide it on the others.
export const MAP_VIEW_COOKIE = 'lgq_map_view';
export type MapView = 'off' | 'large';
export type MapSurface = 'leads' | 'jobs' | 'schedule';
export function mapViewCookie(surface: MapSurface): string {
  return `${MAP_VIEW_COOKIE}_${surface}`;
}
export function normalizeMapView(value: unknown): MapView {
  return value === 'off' ? 'off' : 'large';
}

// Map colour scheme (the app is dark, so the map defaults dark too).
export const MAP_THEME_COOKIE = 'lgq_map_theme';
export type MapTheme = 'dark' | 'light';
export function normalizeMapTheme(value: unknown): MapTheme {
  return value === 'light' ? 'light' : 'dark';
}

// Which weekend columns the schedule calendar shows. Plenty of trades never
// work a Sunday, and two dead columns cost a seventh of the grid's width every
// week of the year. Stored as a comma list of the days kept, so "" means a
// Mon–Fri calendar and the absent-cookie default stays "show everything".
export const CALENDAR_WEEKEND_COOKIE = 'lgq_calendar_weekend';
export type WeekendDays = { sat: boolean; sun: boolean };
export function normalizeWeekendDays(value: unknown): WeekendDays {
  // No cookie yet → both on, matching what the calendar has always shown.
  if (typeof value !== 'string') return { sat: true, sun: true };
  const parts = value.split(',');
  return { sat: parts.includes('sat'), sun: parts.includes('sun') };
}
export function serializeWeekendDays(days: WeekendDays): string {
  const kept = [days.sun ? 'sun' : null, days.sat ? 'sat' : null].filter(Boolean).join(',');
  // "none" rather than "": an empty cookie value can be dropped, and a missing
  // cookie means "show everything" — which would silently undo a Mon–Fri week.
  return kept || 'none';
}

// Which Jobs layout the owner last used (List / Board / Table).
export const JOBS_VIEW_COOKIE = 'lgq_jobs_view';
export type JobsView = 'list' | 'board' | 'table';
export const JOBS_VIEWS: JobsView[] = ['list', 'board', 'table'];
export function normalizeJobsView(value: unknown): JobsView {
  return JOBS_VIEWS.includes(value as JobsView) ? (value as JobsView) : 'list';
}
