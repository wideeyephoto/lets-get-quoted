'use server';

import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { CALENDAR_VIEW_COOKIE, CALENDAR_WEEKEND_COOKIE, CLIENTS_VIEW_COOKIE, CREW_ROSTER_VIEW_COOKIE, CREW_SKIN_COOKIE, CREW_THEME_COOKIE, CREW_VIEW_COOKIE, JOBS_VIEW_COOKIE, MAP_THEME_COOKIE, RECURRING_VIEW_COOKIE, mapViewCookie, normalizeCalendarView, normalizeClientsView, normalizeCrewSkin, normalizeCrewView, normalizeJobsView, normalizeMapTheme, normalizeCrewTheme, normalizeMapView, normalizeRecurringView, normalizeRosterView, serializeWeekendDays, type CalendarView, type ClientsView, type CrewSkin, type CrewView, type JobsView, type MapSurface, type MapTheme, type MapView, type RecurringView, type RosterView, type WeekendDays } from '@/lib/dashboard-views';

const YEAR = 60 * 60 * 24 * 365;

// Remember whether the map is shown — PER PAGE (leads / jobs / schedule each
// keep their own cookie), toggled from that page's view gear.
export async function setMapViewAction(view: MapView, surface: MapSurface) {
  await requireOwnerContext();
  cookies().set(mapViewCookie(surface), normalizeMapView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember the map color scheme (dark / light).
export async function setMapThemeAction(theme: MapTheme) {
  await requireOwnerContext();
  cookies().set(MAP_THEME_COOKIE, normalizeMapTheme(theme), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember the owner's chosen Jobs layout (List / Board / Table).
export async function setJobsViewAction(view: JobsView) {
  await requireOwnerContext();
  cookies().set(JOBS_VIEW_COOKIE, normalizeJobsView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember the calendar's shape (Month / Week / Year / Agenda / Timeline).
// Month navigation is a real navigation, so without this the view resets to
// Month every time the owner steps a month forward.
export async function setCalendarViewAction(view: CalendarView) {
  await requireOwnerContext();
  cookies().set(CALENDAR_VIEW_COOKIE, normalizeCalendarView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember whether the schedule calendar shows Saturday and Sunday columns.
export async function setCalendarWeekendAction(days: WeekendDays) {
  await requireOwnerContext();
  cookies().set(CALENDAR_WEEKEND_COOKIE, serializeWeekendDays(days), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember the owner's chosen Clients layout (List / Cards / Table / Focus).
export async function setClientsViewAction(view: ClientsView) {
  await requireOwnerContext();
  cookies().set(CLIENTS_VIEW_COOKIE, normalizeClientsView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember how the Recurring page is dressed (Cards / Operations).
export async function setRecurringViewAction(view: RecurringView) {
  await requireOwnerContext();
  cookies().set(RECURRING_VIEW_COOKIE, normalizeRecurringView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Focus is ONE page-level mode for Crew & Labor, not a layout each tab picks
// separately. Turning it on anywhere puts every tab into its Focus layout and
// dresses the shell; turning it off anywhere puts the others back to their
// defaults. Two tabs disagreeing about whether the page is in Focus was the
// thing that made it feel like a per-tab setting in the first place.
//
// The theme lives in its own cookie so Labor by job — which has no picker —
// still knows which way the page is dressed.
const jar = () => cookies();
const write = (name: string, value: string) => jar().set(name, value, { path: '/', maxAge: YEAR, sameSite: 'lax' });

function syncCrewFocus(focus: boolean, keep: 'hours' | 'roster'): void {
  write(CREW_THEME_COOKIE, normalizeCrewTheme(focus ? 'focus' : 'standard'));
  if (keep !== 'hours') write(CREW_VIEW_COOKIE, focus ? 'focus' : 'table');
  if (keep !== 'roster') write(CREW_ROSTER_VIEW_COOKIE, focus ? 'focus' : 'rows');
}

/**
 * Overview on or off, for the whole page.
 *
 * Writes the page mode and NOTHING else, which is the difference between this
 * and the two actions below. Overview is not a layout any one tab owns — all
 * three wear it together — so there is no per-tab cookie to keep in step, and
 * leaving the ones that exist untouched is what lets turning Overview off put
 * somebody back in the Board or the Review rail they were in before.
 *
 * Turning it off is only ever done from the Labor by job gear, which has no
 * layout of its own to fall back to. The other two tabs clear it by picking one
 * of their own layouts, which goes through syncCrewFocus above.
 */
export async function setCrewOverviewAction(on: boolean) {
  await requireOwnerContext();
  write(CREW_THEME_COOKIE, on ? 'overview' : 'standard');
}

// Remember the owner's chosen Hours & pay layout (Table / Grouped / Rail / Focus).
export async function setCrewViewAction(view: CrewView) {
  await requireOwnerContext();
  const next = normalizeCrewView(view);
  write(CREW_VIEW_COOKIE, next);
  syncCrewFocus(next === 'focus', 'hours');
}

// Remember the owner's chosen Crew members layout (Rows / Cards / Board / Table / Focus).
export async function setRosterViewAction(view: RosterView) {
  await requireOwnerContext();
  const next = normalizeRosterView(view);
  write(CREW_ROSTER_VIEW_COOKIE, next);
  syncCrewFocus(next === 'focus', 'roster');
}

// Remember the Crew & Labor skin (Standard / Daylight / Blueprint).
//
// Deliberately does NOT touch the Focus cookies the way the two above do: a
// skin says nothing about layout, so picking one must leave whatever layout
// the owner is in exactly where it was.
export async function setCrewSkinAction(skin: CrewSkin) {
  await requireOwnerContext();
  write(CREW_SKIN_COOKIE, normalizeCrewSkin(skin));
}
