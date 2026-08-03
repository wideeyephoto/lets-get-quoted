import type { SupabaseClient } from '@supabase/supabase-js';
import {
  summariseArrivals, summariseByCrew, arrivalAdvice,
  type ArrivalSummary, type ArrivalTripRow, type CrewArrivalRow,
} from '@/lib/arrival-analytics';

// Loading side of arrival analytics. Kept apart from the maths so the
// definitions in arrival-analytics.ts stay testable without a database.

const ANALYTICS_FIELDS =
  'crew_id, sent_by, status, arrival_start, arrival_end, arrived_at, en_route_at, ' +
  'eta_minutes, suggested_minutes, sms_status, first_viewed_at, view_count';

export type ArrivalAnalytics = {
  windowDays: number;
  summary: ArrivalSummary;
  byCrew: CrewArrivalRow[];
  advice: string | null;
  /** False when the arrival migration hasn't run, so the UI hides rather than
   *  drawing a panel full of zeroes that look like a bad month. */
  available: boolean;
};

export async function loadArrivalAnalytics(
  admin: SupabaseClient,
  accountId: string,
  windowDays = 90,
): Promise<ArrivalAnalytics> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const { data, error } = await admin
    .from('job_tracking')
    .select(ANALYTICS_FIELDS)
    .eq('account_id', accountId)
    .gte('en_route_at', since)
    .order('en_route_at', { ascending: false })
    .limit(2000);

  // An un-migrated database is "no data yet", not a crash on the owner's
  // dashboard — and specifically not "0% on time", which would read as an
  // accusation rather than an absence.
  if (error) {
    return { windowDays, summary: summariseArrivals([]), byCrew: [], advice: null, available: false };
  }

  const rows = (data ?? []) as unknown as ArrivalTripRow[];
  const summary = summariseArrivals(rows);
  return {
    windowDays,
    summary,
    byCrew: summariseByCrew(rows),
    advice: arrivalAdvice(summary),
    available: true,
  };
}
