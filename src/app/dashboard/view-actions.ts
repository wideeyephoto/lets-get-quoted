'use server';

import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { CALENDAR_WEEKEND_COOKIE, CLIENTS_VIEW_COOKIE, CREW_ROSTER_VIEW_COOKIE, CREW_VIEW_COOKIE, JOBS_VIEW_COOKIE, MAP_THEME_COOKIE, mapViewCookie, normalizeClientsView, normalizeCrewView, normalizeJobsView, normalizeMapTheme, normalizeMapView, normalizeRosterView, serializeWeekendDays, type ClientsView, type CrewView, type JobsView, type MapSurface, type MapTheme, type MapView, type RosterView, type WeekendDays } from '@/lib/dashboard-views';

const YEAR = 60 * 60 * 24 * 365;

// Remember whether the map is shown — PER PAGE (leads / jobs / schedule each
// keep their own cookie), toggled from that page's view gear.
export async function setMapViewAction(view: MapView, surface: MapSurface) {
  await requireOwnerContext();
  cookies().set(mapViewCookie(surface), normalizeMapView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember the map colour scheme (dark / light).
export async function setMapThemeAction(theme: MapTheme) {
  await requireOwnerContext();
  cookies().set(MAP_THEME_COOKIE, normalizeMapTheme(theme), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember the owner's chosen Jobs layout (List / Board / Table).
export async function setJobsViewAction(view: JobsView) {
  await requireOwnerContext();
  cookies().set(JOBS_VIEW_COOKIE, normalizeJobsView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
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

// Remember the owner's chosen Hours & pay layout (Table / Grouped / Rail).
export async function setCrewViewAction(view: CrewView) {
  await requireOwnerContext();
  cookies().set(CREW_VIEW_COOKIE, normalizeCrewView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}

// Remember the owner's chosen Crew members layout (Rows / Cards / Board / Table).
export async function setRosterViewAction(view: RosterView) {
  await requireOwnerContext();
  cookies().set(CREW_ROSTER_VIEW_COOKIE, normalizeRosterView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
}
