// Per-browser dashboard view preferences (cookies, not DB columns — no migration
// and they survive sessions). Client-safe: names + normalizers only, no server
// imports, so both server pages and client components can share them.

// How the jobs/leads map shows on Leads/Jobs: off, a large section at the top,
// or a small circle beside the section header. Defaults to large (also maps the
// legacy 'on' value forward).
export const MAP_VIEW_COOKIE = 'lgq_map_view';
export type MapView = 'off' | 'large' | 'mini';
export function normalizeMapView(value: unknown): MapView {
  return value === 'off' ? 'off' : value === 'mini' ? 'mini' : 'large';
}

// Which Jobs layout the owner last used (List / Board / Table).
export const JOBS_VIEW_COOKIE = 'lgq_jobs_view';
export type JobsView = 'list' | 'board' | 'table';
export const JOBS_VIEWS: JobsView[] = ['list', 'board', 'table'];
export function normalizeJobsView(value: unknown): JobsView {
  return JOBS_VIEWS.includes(value as JobsView) ? (value as JobsView) : 'list';
}
