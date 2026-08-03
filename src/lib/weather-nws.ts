// Forecasts from the US National Weather Service.
//
// Chosen because it costs nothing, needs no key, has no quota, and is the same
// data every US forecast is ultimately derived from. The trade-off is that it's
// US-only and takes two requests — but a paid provider would be a recurring bill
// for a feature that flags a handful of days a month.
//
// api.weather.gov asks for a User-Agent identifying the caller so they can get
// in touch about abuse. Sending one is the price of the free tier and we send it.

import type { Forecast } from '@/lib/weather';

const USER_AGENT = '(letsgetquoted.com, hello@letsgetquoted.com)';
/** NWS grids are ~2.5km. Rounding to 2dp (~1.1km) keeps the right cell and
 *  collapses every job on a street onto one cache key. */
const COORD_PRECISION = 2;

export type ForecastResult = { forecasts: Forecast[]; cacheKey: string } | null;

function roundCoord(value: number): number {
  const factor = 10 ** COORD_PRECISION;
  return Math.round(value * factor) / factor;
}

export function forecastCacheKey(lat: number, lng: number): string {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

async function nwsFetch(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
      // NWS is a free public service. A slow response must not hold a page open.
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(`NWS request failed (${response.status}): ${url}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('NWS request errored:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** "10 to 20 mph" → 20. The high end, because that's what stops the work. */
export function parseWindMph(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const numbers = [...value.matchAll(/\d+/g)].map((match) => Number(match[0])).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : null;
}

type NwsPeriod = {
  startTime?: string;
  isDaytime?: boolean;
  temperature?: number;
  probabilityOfPrecipitation?: { value?: number | null };
  windSpeed?: string;
  shortForecast?: string;
};

/**
 * Collapse NWS's day/night periods into one row per calendar day.
 *
 * NWS returns "Tuesday" and "Tuesday Night" separately. A contractor thinks in
 * days, and the parts that matter come from different halves: the HIGH and the
 * rain chance from the daytime period, the LOW from the night. Taking only the
 * daytime period would miss the overnight freeze that ruins a pour.
 */
export function periodsToForecasts(periods: NwsPeriod[]): Forecast[] {
  const byDay = new Map<string, Forecast>();

  for (const period of periods) {
    const start = period.startTime;
    if (typeof start !== 'string') continue;
    // The local date NWS itself stamped, offset and all — converting through a
    // Date would re-interpret it in the server's zone and shift the day.
    const day = start.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;

    const existing = byDay.get(day) ?? { day, highF: null, lowF: null, precipChance: null, windMph: null, summary: '' };
    const temp = typeof period.temperature === 'number' ? period.temperature : null;
    const precip = typeof period.probabilityOfPrecipitation?.value === 'number' ? period.probabilityOfPrecipitation.value : null;
    const wind = parseWindMph(period.windSpeed);

    if (period.isDaytime) {
      existing.highF = temp;
      existing.summary = period.shortForecast ?? existing.summary;
      if (wind !== null) existing.windMph = Math.max(existing.windMph ?? 0, wind);
    } else {
      existing.lowF = temp;
      if (!existing.summary) existing.summary = period.shortForecast ?? '';
    }
    // Worst chance across both halves: rain overnight still wets the deck.
    if (precip !== null) existing.precipChance = Math.max(existing.precipChance ?? 0, precip);

    byDay.set(day, existing);
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Fetch a forecast for a point. Returns null on any failure — no forecast is a
 * better answer than a guessed one, and every caller treats null as "we don't
 * know" rather than as "it's fine".
 */
export async function fetchForecast(lat: number, lng: number): Promise<ForecastResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = forecastCacheKey(lat, lng);

  // Step one: the point resolves to a grid cell and hands back a forecast URL.
  const point = (await nwsFetch(`https://api.weather.gov/points/${key}`)) as
    | { properties?: { forecast?: string } }
    | null;
  const forecastUrl = point?.properties?.forecast;
  // Outside the US there is no grid, and that's an expected answer rather than
  // an error worth shouting about.
  if (typeof forecastUrl !== 'string') return null;

  const forecast = (await nwsFetch(forecastUrl)) as { properties?: { periods?: NwsPeriod[] } } | null;
  const periods = forecast?.properties?.periods;
  if (!Array.isArray(periods)) return null;

  return { forecasts: periodsToForecasts(periods), cacheKey: key };
}
