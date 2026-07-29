'use server';

import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { JOBS_VIEW_COOKIE, MAP_THEME_COOKIE, MAP_VIEW_COOKIE, normalizeJobsView, normalizeMapTheme, normalizeMapView, type JobsView, type MapTheme, type MapView } from '@/lib/dashboard-views';

const YEAR = 60 * 60 * 24 * 365;

// Remember whether the dashboard map is shown (toggled from the view gear on
// Leads/Jobs). Cookie, per browser — the page re-reads it to show/hide the map.
export async function setMapViewAction(view: MapView) {
  await requireOwnerContext();
  cookies().set(MAP_VIEW_COOKIE, normalizeMapView(view), { path: '/', maxAge: YEAR, sameSite: 'lax' });
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
