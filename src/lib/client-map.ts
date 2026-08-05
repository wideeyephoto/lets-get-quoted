import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Where your customers are.
 *
 * Clients carry an address but no coordinates, and geocoding forty of them on
 * every page load would be both slow and billable. Jobs ARE geocoded — the
 * schedule and Quick Stops already depend on it — so a customer is pinned at
 * the most recent job we actually drove to for them.
 *
 * That is a better answer than geocoding the client row anyway: it is the place
 * the work happened. A landlord whose profile carries a billing address in
 * another state still pins on the house you worked at.
 *
 * A customer with no geocoded job has no pin, and the map says how many are
 * missing rather than quietly showing a smaller number than the list does.
 */

export type ClientPin = {
  clientId: string;
  lat: number;
  lng: number;
  /** When the job this pin came from was last worked, for the newest-wins pick. */
  at: string;
};

export async function clientPins(
  supabase: SupabaseClient,
  accountId: string,
): Promise<Map<string, ClientPin>> {
  const pins = new Map<string, ClientPin>();

  const { data } = await supabase
    .from('jobs')
    .select('client_id, lat, lng, scheduled_for, created_at')
    .eq('account_id', accountId)
    .not('client_id', 'is', null)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .neq('status', 'archived')
    .limit(4000);

  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    // A row that survived the `not null` filter can still hold a non-numeric
    // string — the column is `numeric`, and a bad import puts anything in it.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // 0,0 is Null Island: what a failed geocode writes when nobody checks.
    if (lat === 0 && lng === 0) continue;

    const at = String(row.scheduled_for ?? row.created_at ?? '');
    const existing = pins.get(clientId);
    if (!existing || at > existing.at) pins.set(clientId, { clientId, lat, lng, at });
  }

  return pins;
}
