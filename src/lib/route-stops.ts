import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanStop } from '@/lib/route-plan';

// Stops on a day that aren't jobs: the dump, the supply house, fuel.
//
// They route exactly like a job — real coordinates, real minutes, a proposed
// arrival time — but they belong to nobody, invoice nothing, and never appear on
// a customer's screen. Keeping them in their own table rather than as ghost jobs
// is what stops them leaking into job counts, revenue, the client feed, and
// every other place "a job" means "work someone is paying for".

export const ROUTE_STOP_KINDS = ['supply', 'dump', 'fuel', 'other'] as const;
export type RouteStopKind = (typeof ROUTE_STOP_KINDS)[number];

export const KIND_LABEL: Record<RouteStopKind, string> = {
  supply: 'Supply run',
  dump: 'Dump / disposal',
  fuel: 'Fuel',
  other: 'Other stop',
};

// The glyph key each kind draws with, from the same icon set the price book and
// the website templates use.
export const KIND_GLYPH: Record<RouteStopKind, string> = {
  supply: 'toolscross',
  dump: 'trash',
  fuel: 'droplet',
  other: 'package',
};

export type RouteStop = {
  id: string;
  account_id: string;
  crew_id: string | null;
  saved_place_id: string | null;
  scheduled_for: string;
  scheduled_time: string | null;
  label: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  minutes: number;
  kind: RouteStopKind;
  note: string | null;
};

export type SavedPlace = {
  id: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  kind: RouteStopKind;
  default_minutes: number;
  use_count: number;
};

const STOP_FIELDS =
  'id, account_id, crew_id, saved_place_id, scheduled_for, scheduled_time, label, address, lat, lng, minutes, kind, note';
const PLACE_FIELDS = 'id, label, address, lat, lng, kind, default_minutes, use_count';

// A route stop's id inside the planner is prefixed so the save action can tell
// at a glance which table a stop's proposed time belongs to. Job ids are bare
// uuids; anything with this prefix is not a job and must never be written as one.
export const ROUTE_STOP_PREFIX = 'rs:';

export function isRouteStopId(id: string): boolean {
  return id.startsWith(ROUTE_STOP_PREFIX);
}

export function routeStopUuid(id: string): string {
  return id.slice(ROUTE_STOP_PREFIX.length);
}

export function normalizeKind(value: unknown): RouteStopKind {
  const kind = String(value ?? '');
  return (ROUTE_STOP_KINDS as readonly string[]).includes(kind) ? (kind as RouteStopKind) : 'other';
}

export function toPlanStop(stop: RouteStop): PlanStop {
  return {
    id: `${ROUTE_STOP_PREFIX}${stop.id}`,
    label: stop.label,
    address: stop.address,
    lat: stop.lat != null ? Number(stop.lat) : null,
    lng: stop.lng != null ? Number(stop.lng) : null,
    scheduledTime: stop.scheduled_time,
    // A stop with no minutes on it is still a stop; 20 is the table default and
    // the sane floor for "park, walk in, walk out".
    visitMinutes: Number(stop.minutes) > 0 ? Number(stop.minutes) : 20,
    // Nobody confirmed a dump run, so it's always free to move.
    locked: false,
  };
}

// The day's non-job stops. Unassigned stops (crew_id null) stay in every crew's
// plan — the same rule unassigned jobs follow, because somebody still has to go.
export async function listDayRouteStops(
  supabase: SupabaseClient,
  accountId: string,
  dateKey: string,
  crewId?: string | null,
): Promise<RouteStop[]> {
  const { data, error } = await supabase
    .from('route_stops')
    .select(STOP_FIELDS)
    .eq('account_id', accountId)
    .eq('scheduled_for', dateKey)
    .order('scheduled_time', { ascending: true, nullsFirst: false });

  // Pre-migration, or a read failure: a day with no supply stops is the correct
  // degradation. The route is still right, it just doesn't include the dump run.
  if (error) return [];

  const all = (data ?? []) as RouteStop[];
  const stops = crewId ? all.filter((stop) => !stop.crew_id || stop.crew_id === crewId) : all;
  return stops.map((stop) => ({ ...stop, kind: normalizeKind(stop.kind) }));
}

export async function listSavedPlaces(supabase: SupabaseClient, accountId: string): Promise<SavedPlace[]> {
  const { data, error } = await supabase
    .from('saved_places')
    .select(PLACE_FIELDS)
    .eq('account_id', accountId)
    .order('use_count', { ascending: false })
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .limit(24);

  if (error) return [];
  return ((data ?? []) as SavedPlace[]).map((place) => ({ ...place, kind: normalizeKind(place.kind) }));
}

// Remember a place the first time it's used, and count every use after that, so
// the quick-add list sorts itself by what this contractor actually does.
export async function rememberPlace(
  supabase: SupabaseClient,
  accountId: string,
  place: { label: string; address: string; lat: number | null; lng: number | null; kind: RouteStopKind; minutes: number },
): Promise<string | null> {
  const label = place.label.trim();
  const address = place.address.trim();
  if (!label || !address) return null;

  // The unique index is on lower(label)+lower(address), so match the same way
  // rather than creating a near-duplicate that differs only in capitals.
  const { data: existing } = await supabase
    .from('saved_places')
    .select('id, use_count')
    .eq('account_id', accountId)
    .ilike('label', label)
    .ilike('address', address)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('saved_places')
      .update({ use_count: Number(existing.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq('id', existing.id);
    return existing.id as string;
  }

  const { data: inserted } = await supabase
    .from('saved_places')
    .insert({
      account_id: accountId,
      label,
      address,
      lat: place.lat,
      lng: place.lng,
      kind: place.kind,
      default_minutes: place.minutes,
      use_count: 1,
      last_used_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  return (inserted?.id as string) ?? null;
}
