import type { SupabaseClient } from '@supabase/supabase-js';
import type { PriorityZone } from '@/lib/quick-stop-zones';

// Reading the owner's priority zones.
//
// A missing table is an empty list, not an error: the feature ships before the
// migration is applied, and the map falling back to the plain detour limit is a
// far better failure than the Quick Stops page refusing to render.

type ZoneRow = {
  id: string;
  label: string | null;
  center_lat: number | string | null;
  center_lng: number | string | null;
  radius_miles: number | string | null;
  max_detour_miles: number | string | null;
};

function num(value: number | string | null): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function loadPriorityZones(supabase: SupabaseClient, accountId: string): Promise<PriorityZone[]> {
  try {
    const { data, error } = await supabase
      .from('quick_stop_priority_zones')
      .select('id, label, center_lat, center_lng, radius_miles, max_detour_miles')
      .eq('account_id', accountId)
      .eq('active', true)
      .order('created_at', { ascending: true });
    if (error) return [];

    const zones: PriorityZone[] = [];
    for (const row of (data ?? []) as ZoneRow[]) {
      // numeric columns come back as strings from PostgREST; a silently NaN
      // center would place a zone at the origin, which is in the Atlantic.
      const centerLat = num(row.center_lat);
      const centerLng = num(row.center_lng);
      const radiusMiles = num(row.radius_miles);
      const maxDetourMiles = num(row.max_detour_miles);
      if (![centerLat, centerLng, radiusMiles, maxDetourMiles].every(Number.isFinite)) continue;
      zones.push({
        id: row.id,
        label: (row.label ?? '').trim() || 'Priority area',
        centerLat,
        centerLng,
        radiusMiles,
        maxDetourMiles,
      });
    }
    return zones;
  } catch {
    return [];
  }
}

/**
 * Whether the zones table exists yet.
 *
 * Separate from loadPriorityZones because "no zones" and "the feature isn't
 * deployed here" need different UI: the first offers a button to draw one, the
 * second must not offer a button that would throw on submit.
 */
export async function priorityZonesAvailable(supabase: SupabaseClient, accountId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('quick_stop_priority_zones')
      .select('id', { head: true, count: 'exact' })
      .eq('account_id', accountId);
    return !error;
  } catch {
    return false;
  }
}
