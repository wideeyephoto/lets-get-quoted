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

// Which shape the schedule calendar is in.
//
// This HAS to be a cookie rather than component state. Month navigation is a
// real navigation (`?month=…`), so a view held in useState was thrown away
// every time someone clicked the arrow — pick Week, step forward a month, and
// you are back in Month with no way to tell why.
export const CALENDAR_VIEW_COOKIE = 'lgq_calendar_view';
export type CalendarView = 'day' | 'week' | 'month' | 'crew' | 'agenda' | 'timeline' | 'year';
export const CALENDAR_VIEWS: CalendarView[] = ['day', 'week', 'month', 'crew', 'agenda', 'timeline', 'year'];

/**
 * WEEK IS THE DEFAULT NOW, NOT MONTH.
 *
 * Month was the default because it always had been. What it actually gave you
 * was a grid of ~95px cells each trying to hold a customer, a time, a price, a
 * crew, a status and a duration, and the honest description of that is six
 * ellipsised half-facts where one whole one would do. A week laid out against a
 * time axis answers the question the page is for — what is happening when, and
 * does any of it collide — and Month is now a capacity overview rather than a
 * place to read job details.
 *
 * Nobody who chose a view is moved: an explicit choice is a cookie, and this is
 * only what an absent cookie means.
 */
export function normalizeCalendarView(value: unknown): CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView) ? (value as CalendarView) : 'week';
}

// Which Jobs layout the owner last used (Smoothie / Focus / List / Board / Table).
export const JOBS_VIEW_COOKIE = 'lgq_jobs_view';
export type JobsView = 'list' | 'board' | 'table' | 'focus' | 'smoothie';
export const JOBS_VIEWS: JobsView[] = ['list', 'board', 'table', 'focus', 'smoothie'];

/**
 * What a new account opens Jobs on.
 *
 * Smoothie, not Focus — the same reasoning as [[DEFAULT_LEADS_VIEW]]. Both are
 * master-detail and they share a stylesheet and a set of detail panels; what
 * differs is the order you meet things in. Smoothie leads with the QUEUE —
 * searchable, stage-filtered, sorted by what is soonest or most owed — where
 * Focus leads with one job under a full-width map. The first question on this
 * page is "what am I doing next and who still owes me", and a map answers
 * neither.
 *
 * An explicit choice is a cookie, so nobody who picked Focus, List, Board or
 * Table is moved off it by this changing.
 */
export const DEFAULT_JOBS_VIEW: JobsView = 'smoothie';

export function normalizeJobsView(value: unknown): JobsView {
  // Unknown values fall back to the deliberate default, so an old cookie from
  // before a view existed never renders a blank workspace.
  return JOBS_VIEWS.includes(value as JobsView) ? (value as JobsView) : DEFAULT_JOBS_VIEW;
}

// Which Clients layout the owner last used.
// List / Cards / Table / Focus all answer "show me my customers" and order by
// name or money. Follow-up orders by silence, which is a different question.
export const CLIENTS_VIEW_COOKIE = 'lgq_clients_view';
// There is no 'map' view. The map lives INSIDE Focus, as a tab on the selected
// customer — a map on its own answers "where is everybody" and then strands you
// there, while a map beside the person you have open answers "where is THIS
// one, and who else is near them", which is the question that changes a route.
export type ClientsView = 'list' | 'cards' | 'table' | 'focus' | 'followup' | 'smoothie';
export const CLIENTS_VIEWS: ClientsView[] = ['list', 'cards', 'table', 'focus', 'followup', 'smoothie'];

/**
 * What a new account opens Clients on.
 *
 * Smoothie, matching [[DEFAULT_LEADS_VIEW]] and [[DEFAULT_JOBS_VIEW]] — the
 * three pipeline pages now open on the same shape, so moving between them does
 * not mean learning a third layout. It leads with the book, searchable and
 * banded by silence, with one customer open beside it.
 *
 * An explicit choice is a cookie, so nobody who picked List, Cards, Table,
 * Focus or Follow up is moved off it by this changing.
 */
export const DEFAULT_CLIENTS_VIEW: ClientsView = 'smoothie';

export function normalizeClientsView(value: unknown): ClientsView {
  // Unknown values fall back to the deliberate default, so an old cookie from
  // before a view existed never renders a blank workspace.
  return CLIENTS_VIEWS.includes(value as ClientsView) ? (value as ClientsView) : DEFAULT_CLIENTS_VIEW;
}

// The text inbox has ONE dressing — Slate — and no picker.
//
// Classic was the other half of a two-way switch: orange replies with an avatar
// beside every incoming run. It is gone rather than hidden, so there is no
// cookie to read, no branch in the page and no second set of thread styles to
// keep in step with the first. The markup carries .inbox-slate unconditionally;
// git has Classic if it is ever wanted back.

// Which Leads layout the owner last used.
//
// Lives here rather than in @/lib/leads because the view picker is a client
// component and that module reaches the database — one value import from it
// and the browser bundle fails on "Can't resolve 'fs'". @/lib/leads re-exports
// these, so every server caller is unaffected.
export const LEADS_VIEW_COOKIE = 'lgq_leads_view';
export type LeadsView = 'board' | 'inbox' | 'table' | 'split' | 'focus' | 'smoothie';
export const LEADS_VIEWS: LeadsView[] = ['board', 'inbox', 'table', 'split', 'focus', 'smoothie'];

/**
 * What a new account opens Leads on.
 *
 * Smoothie, not Focus. Both are master-detail and they look the same; what
 * differs is the order you meet things in. Smoothie leads with the QUEUE —
 * searchable, stage-filtered, priority-sorted — where Focus leads with one
 * lead under a full-width map. The first question on this page is "who do I
 * call next", and a map cannot answer it.
 *
 * An explicit choice is a cookie, so nobody who picked Focus, the board or
 * anything else is moved off it by this changing.
 *
 * Exported so the picker's "Reset to default" row and normalizeLeadsView below
 * cannot drift apart — they were two literals in two files before.
 */
export const DEFAULT_LEADS_VIEW: LeadsView = 'smoothie';

export function normalizeLeadsView(value: unknown): LeadsView {
  // Unknown values fall back to the default, so an old cookie from before a
  // view existed — or a hand-edited one — never renders a blank workspace.
  return LEADS_VIEWS.includes(value as LeadsView) ? (value as LeadsView) : DEFAULT_LEADS_VIEW;
}

// How the Recurring page is dressed.
//
// Cards is the page as built: a hero with the map of the book, then one card per
// plan with its actions on show. Operations is the same data as a control room —
// no hero, the map behind a tab, and each plan on one dense row so twenty of
// them fit on a screen instead of four.
//
// One cookie rather than two, because nothing here composes: Operations is not
// Cards with a different colour, it is a different amount of page.
export const RECURRING_VIEW_COOKIE = 'lgq_recurring_view';
export type RecurringView = 'cards' | 'ops';
export const RECURRING_VIEWS: RecurringView[] = ['cards', 'ops'];
export function normalizeRecurringView(value: unknown): RecurringView {
  // Cards is what this page already is, so nobody who never opens the gear
  // finds their plans rearranged.
  return RECURRING_VIEWS.includes(value as RecurringView) ? (value as RecurringView) : 'cards';
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
//
// 'overview' is the third: the Clients page's Focus shape — a scrolling list on
// the left, one thing open beside it — worn by all THREE tabs at once. It lives
// here rather than in the per-tab enums for exactly the reason above, and
// because Labor by job has no layout cookie of its own to put it in.
//
// Overview deliberately does NOT overwrite the per-tab layout cookies when it
// is switched on, so turning it off puts you back in the layout you were in
// rather than in that tab's default.
export const CREW_THEME_COOKIE = 'lgq_crew_theme';
export type CrewTheme = 'standard' | 'focus' | 'overview';
export const CREW_THEMES: CrewTheme[] = ['standard', 'focus', 'overview'];
export function normalizeCrewTheme(value: unknown): CrewTheme {
  // Overview is the page Crew & Labor OPENS on, so an owner who never touches
  // the gear lands in a list with one person beside it rather than in a bare
  // table — the same shape all three tabs share, which is the point of it.
  //
  // Note what this makes the absence of the cookie mean. It used to be
  // indistinguishable from an explicit 'standard'; now they are different
  // states, and the difference is what makes turning Overview OFF stick. The
  // two writers that clear it — setCrewOverviewAction(false) and syncCrewFocus
  // — both write the literal 'standard', so an owner who has chosen the plain
  // page keeps it and is not put back into Overview on their next visit.
  return CREW_THEMES.includes(value as CrewTheme) ? (value as CrewTheme) : 'overview';
}

// The page's SKIN — its colours and surfaces — kept in its own cookie rather
// than folded into CrewTheme above.
//
// CrewTheme decides the SHAPE of the page: 'focus' switches Hours & pay to
// master-detail and widens the shell. A skin decides nothing about layout. Put
// them in one enum and picking Blueprint would silently throw away somebody's
// master-detail, which is not what choosing a colour should do. Separate, they
// compose: Focus in Blueprint is a real combination.
export const CREW_SKIN_COOKIE = 'lgq_crew_skin';
export type CrewSkin = 'standard' | 'daylight' | 'blueprint';
export const CREW_SKINS: CrewSkin[] = ['standard', 'daylight', 'blueprint'];
export function normalizeCrewSkin(value: unknown): CrewSkin {
  return CREW_SKINS.includes(value as CrewSkin) ? (value as CrewSkin) : 'standard';
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
