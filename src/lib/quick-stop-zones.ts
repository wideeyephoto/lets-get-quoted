import { haversineMiles, type LatLng } from '@/lib/distance';

// Priority zones: the areas a contractor has decided are worth a longer drive.
//
// The rule is one sentence — inside a zone, that zone's detour limit applies
// instead of the account's — and it is here, pure and tested, because three
// places need to agree on it: the map that draws the zones, the request card
// that says whether a stop is inside the limit, and the owner reading a number
// back off their own settings.
//
// See the migration for why these are drawn by the contractor and never derived
// from income or demographic data.

export type PriorityZone = {
  id: string;
  label: string;
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  maxDetourMiles: number;
};

export type DetourAllowance = {
  /** Miles of detour permitted for this point. */
  maxDetourMiles: number;
  /** The zone that granted it, when it wasn't the account default. */
  zone: PriorityZone | null;
};

export function zoneContains(zone: PriorityZone, point: LatLng): boolean {
  if (!Number.isFinite(zone.centerLat) || !Number.isFinite(zone.centerLng)) return false;
  if (!(zone.radiusMiles > 0)) return false;
  return haversineMiles({ lat: zone.centerLat, lng: zone.centerLng }, point) <= zone.radiusMiles;
}

/**
 * The detour limit that applies at a point.
 *
 * Overlapping zones take the MOST generous limit. Two zones covering the same
 * street is a contractor saying that ground matters twice over, not a conflict
 * to resolve conservatively — and taking the smaller one would make adding a
 * zone able to REDUCE what was already allowed, which nobody would predict from
 * a control called "priority".
 *
 * A zone is never allowed to lower the account default for the same reason. A
 * zone's job is to widen; if an owner wants a tighter limit somewhere, that is a
 * different feature and should be named like one.
 */
export function detourAllowance(
  point: LatLng | null,
  zones: PriorityZone[],
  accountMaxDetourMiles: number,
): DetourAllowance {
  const base = Number.isFinite(accountMaxDetourMiles) && accountMaxDetourMiles > 0 ? accountMaxDetourMiles : 0;
  if (!point) return { maxDetourMiles: base, zone: null };

  let best: DetourAllowance = { maxDetourMiles: base, zone: null };
  for (const zone of zones) {
    if (!zoneContains(zone, point)) continue;
    if (zone.maxDetourMiles > best.maxDetourMiles) {
      best = { maxDetourMiles: zone.maxDetourMiles, zone };
    }
  }
  return best;
}

/**
 * Whether a measured detour is within what's allowed at that point, and why.
 *
 * Returns null when there is nothing to judge — no measured detour, or no limit
 * set. "Unknown" and "outside" are different answers and the card must not show
 * one as the other.
 */
export function detourVerdict(
  detourMiles: number | null,
  point: LatLng | null,
  zones: PriorityZone[],
  accountMaxDetourMiles: number,
): { within: boolean; limitMiles: number; zone: PriorityZone | null } | null {
  if (detourMiles == null || !Number.isFinite(detourMiles)) return null;
  const allowance = detourAllowance(point, zones, accountMaxDetourMiles);
  if (allowance.maxDetourMiles <= 0) return null;
  return {
    within: detourMiles <= allowance.maxDetourMiles,
    limitMiles: allowance.maxDetourMiles,
    zone: allowance.zone,
  };
}
