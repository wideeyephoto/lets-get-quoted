'use server';

import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { JOBS_VIEW_COOKIE, MAP_THEME_COOKIE, mapViewCookie, normalizeJobsView, normalizeMapTheme, normalizeMapView, type JobsView, type MapSurface, type MapTheme, type MapView } from '@/lib/dashboard-views';

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
