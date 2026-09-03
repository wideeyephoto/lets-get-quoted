import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getSiteContent } from '@/lib/site-content';
import {
  assessDays,
  daysWorthFlagging,
  sensitivityFor,
  sensitivityForTrade,
  suggestReplacements,
  type Assessment,
  type Forecast,
  type Sensitivity,
} from '@/lib/weather';
import { fetchForecast, forecastCacheKey } from '@/lib/weather-nws';

/** How long a cached forecast is worth trusting. NWS updates roughly hourly. */
export const CACHE_MINUTES = 90;

/**
 * A forecast for a point, from cache when it's fresh.
 *
 * Two requests per point per lookup would otherwise mean two per JOB, and a
 * contractor with eight jobs on one street would fetch the same grid cell eight
 * times. The cache is keyed by rounded coordinate, not by account, because a
 * public forecast for a grid square isn't anybody's private data.
 *
 * A stale cached forecast beats no forecast: if NWS is down, we serve what we
 * have rather than showing a contractor an empty week.
 */
export async function getForecast(admin: SupabaseClient, lat: number, lng: number): Promise<Forecast[]> {
  const key = forecastCacheKey(lat, lng);
  const { data: cached } = await admin.from('weather_cache').select('forecasts, fetched_at').eq('cache_key', key).maybeSingle();

  const fresh =
    cached?.fetched_at && Date.now() - Date.parse(cached.fetched_at as string) < CACHE_MINUTES * 60_000;
  if (fresh) return (cached?.forecasts as Forecast[]) ?? [];

  const result = await fetchForecast(lat, lng);
  if (!result) return (cached?.forecasts as Forecast[]) ?? [];

  try {
    await admin
      .from('weather_cache')
      .upsert({ cache_key: key, forecasts: result.forecasts, fetched_at: new Date().toISOString() });
  } catch (error) {
    console.error('Weather cache write failed:', error instanceof Error ? error.message : error);
  }
  return result.forecasts;
}

export type WeatherJob = {
  id: string;
  ref: string | null;
  clientName: string;
  clientPhone: string | null;
  scheduledFor: string;
  lat: number;
  lng: number;
};

export type JobRisk = {
  job: WeatherJob;
  assessment: Assessment;
  alternatives: Assessment[];
  sensitivity: Sensitivity;
};

/**
 * The account's weather profile, and whether it's switched on at all.
 *
 * Falls back to guessing from the trade on their website. A roofer who never
 * opened these settings still gets roofing thresholds, which is far more useful
 * than a generic profile that flags nothing.
 */
export async function weatherSettings(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ enabled: boolean; sensitivity: Sensitivity }> {
  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('weather_alerts_enabled, weather_profile').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('content').eq('account_id', accountId).maybeSingle(),
  ]);

  const explicit = (account?.weather_profile as string | null) ?? null;
  const sensitivity = explicit
    ? sensitivityFor(explicit)
    : sensitivityForTrade(getSiteContent(site?.content as Record<string, unknown> | null).trade);

  return { enabled: Boolean(account?.weather_alerts_enabled), sensitivity };
}

/**
 * Scheduled jobs at risk over the next couple of weeks.
 *
 * Only jobs with coordinates — an ungeocoded job has no forecast, and inventing
 * one from the account's own address would flag work fifty miles away on the
 * wrong weather.
 *
 * Jobs explicitly marked weather_sensitive = false are skipped even for an
 * outdoor trade. A roofer doing an attic inspection doesn't care about rain.
 */
export async function jobsAtRisk(
  supabase: SupabaseClient,
  accountId: string,
  options?: { fromDay?: string; days?: number },
): Promise<JobRisk[]> {
  const { sensitivity } = await weatherSettings(supabase, accountId);
  const from = options?.fromDay ?? new Date().toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + (options?.days ?? 14) * 86_400_000).toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from('jobs')
    .select('id, ref, client_name, client_phone, scheduled_for, lat, lng, weather_sensitive')
    .eq('account_id', accountId)
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', from)
    .lte('scheduled_for', to)
    .neq('status', 'archived')
    .neq('status', 'complete')
    .limit(200);

  const admin = createAdminClient();
  const risks: JobRisk[] = [];
  // Cache within the sweep too: several jobs on one street share a grid cell,
  // and getForecast would otherwise re-read the row for each of them.
  const seen = new Map<string, Forecast[]>();

  for (const row of rows ?? []) {
    if (row.weather_sensitive === false) continue;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const key = forecastCacheKey(lat, lng);
    let forecasts = seen.get(key);
    if (!forecasts) {
      forecasts = await getForecast(admin, lat, lng);
      seen.set(key, forecasts);
    }
    if (forecasts.length === 0) continue;

    const assessments = assessDays(forecasts, sensitivity);
    const day = row.scheduled_for as string;
    const onTheDay = assessments.find((a) => a.day === day);
    // Beyond the forecast horizon there is nothing to say, and saying it anyway
    // would be a warning invented from no data.
    if (!onTheDay) continue;
    if (daysWorthFlagging([onTheDay]).length === 0) continue;

    risks.push({
      job: {
        id: row.id as string,
        ref: (row.ref as string | null) ?? null,
        clientName: (row.client_name as string) ?? 'Customer',
        clientPhone: (row.client_phone as string | null) ?? null,
        scheduledFor: day,
        lat,
        lng,
      },
      assessment: onTheDay,
      alternatives: suggestReplacements(assessments, day),
      sensitivity,
    });
  }

  return risks.sort((a, b) => a.job.scheduledFor.localeCompare(b.job.scheduledFor));
}

/**
 * The next few days of weather for the account's own patch, assessed.
 *
 * WHY NOT PER JOB. jobsAtRisk already answers "which booked work is in
 * trouble", and it fetches a forecast per grid cell across up to 200 jobs — the
 * right shape for a digest, the wrong one for a header. The Day view is asking
 * a smaller question: what is the weather doing on the day I am looking at. One
 * point (the service center) answers it, and a contractor's days are mostly
 * within one NWS grid square of each other anyway.
 *
 * ONE CACHED READ, USUALLY NO NETWORK. getForecast serves from weather_cache
 * and only reaches NWS when the row is stale, so the common case is a single
 * indexed select. Callers still gate on weather_alerts_enabled before calling,
 * so an account with the feature off pays nothing at all.
 *
 * Empty when it cannot answer — no coordinates, no forecast, feature off. The
 * Day view shows nothing rather than a shrug.
 */
export async function outlookByDay(
  supabase: SupabaseClient,
  accountId: string,
  point: { lat: number | null; lng: number | null },
): Promise<Record<string, Assessment>> {
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};

  const { enabled, sensitivity } = await weatherSettings(supabase, accountId);
  if (!enabled) return {};

  const forecasts = await getForecast(createAdminClient(), lat, lng);
  if (forecasts.length === 0) return {};

  const out: Record<string, Assessment> = {};
  for (const assessment of assessDays(forecasts, sensitivity)) out[assessment.day] = assessment;
  return out;
}
