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

// Which Jobs layout the owner last used (List / Board / Table / Focus).
export const JOBS_VIEW_COOKIE = 'lgq_jobs_view';
export type JobsView = 'list' | 'board' | 'table' | 'focus';
export const JOBS_VIEWS: JobsView[] = ['list', 'board', 'table', 'focus'];
export function normalizeJobsView(value: unknown): JobsView {
  // Focus is the default for anyone who hasn't chosen: it answers "what's the
  // state of this job" without a page load per job. An explicit choice is a
  // cookie, so nobody who picked List/Board/Table gets moved off it.
  return JOBS_VIEWS.includes(value as JobsView) ? (value as JobsView) : 'focus';
}

// Which Clients layout the owner last used.
// List / Cards / Table / Focus all answer "show me my customers" and order by
// name or money. Follow-up orders by silence, which is a different question.
export const CLIENTS_VIEW_COOKIE = 'lgq_clients_view';
export type ClientsView = 'list' | 'cards' | 'table' | 'focus' | 'followup';
export const CLIENTS_VIEWS: ClientsView[] = ['list', 'cards', 'table', 'focus', 'followup'];
export function normalizeClientsView(value: unknown): ClientsView {
  // List stays the default: it's what this page has always been, and an
  // explicit choice is a cookie, so nobody gets moved off what they picked.
  return CLIENTS_VIEWS.includes(value as ClientsView) ? (value as ClientsView) : 'list';
}

// Which Crew & Labor "Hours & pay" layout the owner last used.
export const CREW_VIEW_COOKIE = 'lgq_crew_view';
export type CrewView = 'table' | 'grouped' | 'rail' | 'focus';
export const CREW_VIEWS: CrewView[] = ['table', 'grouped', 'rail', 'focus'];
export function normalizeCrewView(value: unknown): CrewView {
  // Table is what this tab already is, so an owner who never opens the gear
  // sees exactly what they saw yesterday.
  return CREW_VIEWS.includes(value as CrewView) ? (value as CrewView) : 'table';
}

// Crew & Labor's page theme.
//
// Separate from the two per-tab layout cookies on purpose: Focus is not a table
// layout, it's how the whole screen looks — heavier card surfaces, the action
// rail pulled out with an orange edge, oversized totals, the caveat as a bar at
// the foot. Applying that to one tab and not the other two made the page change
// character as you moved across it.
//
// Picking Focus in EITHER tab's gear switches the theme on, and picking any
// other layout switches it off, so there is one Focus and not two.
export const CREW_THEME_COOKIE = 'lgq_crew_theme';
export type CrewTheme = 'standard' | 'focus';
export function normalizeCrewTheme(value: unknown): CrewTheme {
  return value === 'focus' ? 'focus' : 'standard';
}

// Which "Crew members" roster layout the owner last used. Its own cookie, not
// the one above: the roster and the pay table answer different questions, and
// picking a board on one is no reason to change the other.
export const CREW_ROSTER_VIEW_COOKIE = 'lgq_crew_roster_view';
export type RosterView = 'rows' | 'cards' | 'board' | 'table' | 'focus';
export const ROSTER_VIEWS: RosterView[] = ['rows', 'cards', 'board', 'table', 'focus'];
export function normalizeRosterView(value: unknown): RosterView {
  // Rows is what the roster already is, so nobody who never opens the gear
  // finds their team rearranged.
  return ROSTER_VIEWS.includes(value as RosterView) ? (value as RosterView) : 'rows';
}
