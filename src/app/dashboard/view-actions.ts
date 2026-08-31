'use server';

import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { CALENDAR_VIEW_COOKIE, CALENDAR_WEEKEND_COOKIE, CLIENTS_VIEW_COOKIE, CREW_ROSTER_VIEW_COOKIE, CREW_SKIN_COOKIE, CREW_THEME_COOKIE, CREW_VIEW_COOKIE, JOB_DETAIL_LAYOUT_COOKIE, JOBS_VIEW_COOKIE, MAP_THEME_COOKIE, RECURRING_VIEW_COOKIE, mapViewCookie, normalizeCalendarView, normalizeClientsView, normalizeCrewSkin, normalizeCrewView, normalizeJobDetailLayout, normalizeJobsView, normalizeMapTheme, normalizeCrewTheme, normalizeMapView, normalizeRecurringView, normalizeRosterView, serializeWeekendDays, type CalendarView, type ClientsView, type CrewSkin, type CrewView, type JobDetailLayout, type JobsView, type MapSurface, type MapTheme, type MapView, type RecurringView, type RosterView, type WeekendDays } from '@/lib/dashboard-views';

const YEAR = 60 * 60 * 24 * 365;

const write = async (name: string, value: string) => {
  const jar = await cookies();
  jar.set(name, value, { path: '/', maxAge: YEAR, sameSite: 'lax' });
};

// Remember the owner's chosen Job Details layout (Tabs / Classic).
export async function setJobDetailLayoutAction(layout: JobDetailLayout) {
  await requireOwnerContext();
  await write(JOB_DETAIL_LAYOUT_COOKIE, normalizeJobDetailLayout(layout));
}

// Remember whether the map is shown — PER PAGE (leads / jobs / schedule each
// keep their own cookie), toggled from that page's view gear.
export async function setMapViewAction(view: MapView, surface: MapSurface) {
  await requireOwnerContext();
  await write(mapViewCookie(surface), normalizeMapView(view));
}

// Remember the map color scheme (dark / light).
export async function setMapThemeAction(theme: MapTheme) {
  await requireOwnerContext();
  await write(MAP_THEME_COOKIE, normalizeMapTheme(theme));
}

// Remember the owner's chosen Jobs layout (List / Board / Table).
export async function setJobsViewAction(view: JobsView) {
  await requireOwnerContext();
  await write(JOBS_VIEW_COOKIE, normalizeJobsView(view));
}

// Remember the calendar's shape (Month / Week / Year / Agenda / Timeline).
// Month navigation is a real navigation, so without this the view resets to
// Month every time the owner steps a month forward.
export async function setCalendarViewAction(view: CalendarView) {
  await requireOwnerContext();
  await write(CALENDAR_VIEW_COOKIE, normalizeCalendarView(view));
}

// Remember whether the schedule calendar shows Saturday and Sunday columns.
export async function setCalendarWeekendAction(days: WeekendDays) {
  await requireOwnerContext();
  await write(CALENDAR_WEEKEND_COOKIE, serializeWeekendDays(days));
}

// Remember the owner's chosen Clients layout (List / Cards / Table / Focus).
export async function setClientsViewAction(view: ClientsView) {
  await requireOwnerContext();
  await write(CLIENTS_VIEW_COOKIE, normalizeClientsView(view));
}

// Remember how the Recurring page is dressed (Cards / Operations).
export async function setRecurringViewAction(view: RecurringView) {
  await requireOwnerContext();
  await write(RECURRING_VIEW_COOKIE, normalizeRecurringView(view));
}

// Focus is ONE page-level mode for Crew & Labor, not a layout each tab picks
// separately. Turning it on anywhere puts every tab into its Focus layout and
// dresses the shell; turning it off anywhere puts the others back to their
// defaults. Two tabs disagreeing about whether the page is in Focus was the
// thing that made it feel like a per-tab setting in the first place.
//
// The theme lives in its own cookie so Labor by job — which has no picker —
// still knows which way the page is dressed.
async function syncCrewFocus(focus: boolean, keep: 'hours' | 'roster'): Promise<void> {
  await write(CREW_THEME_COOKIE, normalizeCrewTheme(focus ? 'focus' : 'standard'));
  if (keep !== 'hours') await write(CREW_VIEW_COOKIE, focus ? 'focus' : 'table');
  if (keep !== 'roster') await write(CREW_ROSTER_VIEW_COOKIE, focus ? 'focus' : 'rows');
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
  await write(CREW_THEME_COOKIE, on ? 'overview' : 'standard');
}

// Remember the owner's chosen Hours & pay layout (Table / Grouped / Rail / Focus).
export async function setCrewViewAction(view: CrewView) {
  await requireOwnerContext();
  const next = normalizeCrewView(view);
  await write(CREW_VIEW_COOKIE, next);
  await syncCrewFocus(next === 'focus', 'hours');
}

// Remember the owner's chosen Crew members layout (Rows / Cards / Board / Table / Focus).
export async function setRosterViewAction(view: RosterView) {
  await requireOwnerContext();
  const next = normalizeRosterView(view);
  await write(CREW_ROSTER_VIEW_COOKIE, next);
  await syncCrewFocus(next === 'focus', 'roster');
}

// Remember the Crew & Labor skin (Standard / Daylight / Blueprint).
//
// Deliberately does NOT touch the Focus cookies the way the two above do: a
// skin says nothing about layout, so picking one must leave whatever layout
// the owner is in exactly where it was.
export async function setCrewSkinAction(skin: CrewSkin) {
  await requireOwnerContext();
  await write(CREW_SKIN_COOKIE, normalizeCrewSkin(skin));
}
