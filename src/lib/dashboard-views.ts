// Per-browser dashboard view preferences (cookies, not DB columns — no migration
// and they survive sessions). Client-safe: names + normalizers only, no server
// imports, so both server pages and client components can share them.

// Whether the jobs/leads map section shows at the top of Leads/Jobs. Default on.
export const MAP_VIEW_COOKIE = 'lgq_map_view';
export type MapView = 'on' | 'off';
export function normalizeMapView(value: unknown): MapView {
  return value === 'off' ? 'off' : 'on';
}

// Which Jobs layout the owner last used (List / Board / Table).
export const JOBS_VIEW_COOKIE = 'lgq_jobs_view';
export type JobsView = 'list' | 'board' | 'table';
export const JOBS_VIEWS: JobsView[] = ['list', 'board', 'table'];
export function normalizeJobsView(value: unknown): JobsView {
  return JOBS_VIEWS.includes(value as JobsView) ? (value as JobsView) : 'list';
}
