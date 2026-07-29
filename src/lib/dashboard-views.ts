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

// Which Jobs layout the owner last used (List / Board / Table).
export const JOBS_VIEW_COOKIE = 'lgq_jobs_view';
export type JobsView = 'list' | 'board' | 'table';
export const JOBS_VIEWS: JobsView[] = ['list', 'board', 'table'];
export function normalizeJobsView(value: unknown): JobsView {
  return JOBS_VIEWS.includes(value as JobsView) ? (value as JobsView) : 'list';
}
