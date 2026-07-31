import { scheduleOrder, type OrderedPlan, type PlanInput, type PlanStop } from '@/lib/route-plan';
import type { RouteStop, SavedPlace } from '@/lib/route-stops';
import type { LatLng } from '@/lib/distance';

// The bridge between the server-rendered day plan and the client component that
// lets the contractor drag it around.
//
// The whole point is that a reorder costs nothing: the drive matrix is fetched
// once on the server for every pair of stops, serialized into the payload, and
// from then on any order the contractor tries can be costed in the browser by
// walking the list. No round trip, no spinner, no quota.

export type DrivePair = { miles: number; minutes: number };

// A Map can't cross the server/client boundary, so the matrix travels as a plain
// object keyed exactly the way the planner keys it: `${fromId}->${toId}`, with
// 'start' for the home base.
export type DriveMatrixPayload = Record<string, DrivePair>;

export type DayPlanPayload = {
  dateKey: string;
  crewId: string | null;
  stops: PlanStop[];
  // The order the optimizer proposed, and the order the calendar is in today.
  optimizedOrder: string[];
  currentOrder: string[];
  homeBase: LatLng | null;
  homeAddress: string | null;
  // Whose address the day is measured from — the shop, or the crew member it's
  // filtered to. Null means neither is set and the route is stop-to-stop.
  anchorSource: 'crew' | 'business' | null;
  anchorCrewName: string | null;
  // The day's non-job stops (dump runs, supply pickups) and the place book they
  // can be quick-added from.
  routeStops: RouteStop[];
  savedPlaces: SavedPlace[];
  workdayStart: string;
  workdayEnd: string;
  bufferMinutes: number;
  defaultVisitMinutes: number;
  matrix: DriveMatrixPayload;
  driveTimeSource: 'drive_matrix' | 'straight_line';
  driveTimeSkipped: 'too_many_stops' | null;
  anchor: 'home_base' | 'first_stop' | null;
  lockedCount: number;
  filteredOutCount: number;
  crewName: string | null;
  /**
   * The stop the contractor means to end this day on, remembered from last
   * time. A preference the optimizer honours — never a lock, so the day can
   * still change around it. Null when nothing is set, or when what was set has
   * since left the day.
   */
  preferredLastId: string | null;
};

export function planInputFrom(payload: DayPlanPayload): PlanInput {
  const matrix = new Map(Object.entries(payload.matrix));
  return {
    stops: payload.stops,
    homeBase: payload.homeBase,
    workdayStart: payload.workdayStart,
    workdayEnd: payload.workdayEnd,
    bufferMinutes: payload.bufferMinutes,
    defaultVisitMinutes: payload.defaultVisitMinutes,
    // An empty matrix must stay absent, not present-and-empty: planDayRoute reads
    // its size to decide whether to claim "real driving distances".
    matrix: matrix.size > 0 ? matrix : undefined,
  };
}

export function costOrder(payload: DayPlanPayload, order: string[]): OrderedPlan {
  return scheduleOrder(order, planInputFrom(payload));
}

// Which stops the contractor is allowed to pick up.
//
// A customer-confirmed stop can't be dragged: its time is the customer's. But it
// CAN be shifted along the list by something moving past it, and that's fine —
// the scheduler pins it to its agreed time regardless of position, and the save
// action never writes a confirmed stop's time at all. What changes is whether
// you'd still make it, which the row says out loud ("Tight — you'd arrive nearer
// 5:20 PM"). Treating position as sacred instead of time made almost every drag
// illegal the moment one appointment was confirmed.
export function isMovable(stop: PlanStop, pinned?: ReadonlySet<string>): boolean {
  return !stop.locked && !pinned?.has(stop.id);
}

// Move `fromIndex` to `toIndex`. Returns null when the move isn't allowed, so the
// caller can leave the list exactly as it was rather than applying a half-legal
// reorder.
//
// `pinned` is the contractor's own "lock this stop here", which — unlike a
// customer confirmation — really is about position: nothing may cross it.
export function reorderStops(
  order: string[],
  byId: Map<string, PlanStop>,
  fromIndex: number,
  toIndex: number,
  pinned?: ReadonlySet<string>,
): string[] | null {
  if (fromIndex === toIndex) return null;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= order.length || toIndex >= order.length) return null;

  const moving = byId.get(order[fromIndex]);
  if (!moving || !isMovable(moving, pinned)) return null;

  const next = [...order];
  const [lifted] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, lifted);

  // A pinned stop holds its index. Splicing past one would slide it, which is the
  // one thing pinning is supposed to prevent.
  if (pinned && pinned.size > 0) {
    for (let index = 0; index < order.length; index++) {
      if (pinned.has(order[index]) && next[index] !== order[index]) return null;
    }
  }

  return next;
}

/**
 * Move the contractor's chosen last stop to the end of an order.
 *
 * A preference, so it only ever rewrites an order somebody asked for — never
 * one they're in the middle of arranging. Returns the input untouched when
 * nothing is preferred or the preferred stop isn't in this list, which is what
 * makes it safe to apply on every read.
 */
export function endOn(order: string[], preferredLastId: string | null): string[] {
  if (!preferredLastId) return order;
  // Already there, or not here at all. Returning the same array rather than an
  // identical copy keeps this idempotent by reference, so applying it on every
  // read can't invalidate a memo that depends on the order.
  if (order[order.length - 1] === preferredLastId || !order.includes(preferredLastId)) return order;
  return [...order.filter((id) => id !== preferredLastId), preferredLastId];
}

/**
 * The colour of one leg of the day.
 *
 * A single blue line tells you where the van goes but not which way, and on a
 * route that crosses itself — which most days do — that is the whole question.
 * Legs run cool to warm across the day, so the first drive and the last are
 * never the same colour and the list beside the map can use the same ramp.
 *
 * Direction itself is carried by arrows on the line, not by the colour: colour
 * says WHICH leg, arrows say WHICH WAY, so neither depends on telling hues
 * apart.
 */
export function legColor(index: number, total: number): string {
  const span = Math.max(1, total - 1);
  const t = Math.min(1, Math.max(0, index / span));
  // 195° (blue) through to 45° (amber).
  return `hsl(${Math.round(195 - t * 150)}, 85%, 58%)`;
}

export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function minutesLabel(total: number): string {
  const mins = Math.abs(Math.round(total));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

// A stop's navigation target — the street address when we have one, coordinates
// otherwise, so Directions always works for a routable stop.
export function navTarget(stop: Pick<PlanStop, 'address' | 'lat' | 'lng'>): string {
  if (stop.address) return stop.address;
  return `${stop.lat},${stop.lng}`;
}

// One Google Maps link for the whole day, with the stops as ordered waypoints and
// the shop as the origin when we know where it is.
export function fullRouteUrl(
  stops: Array<Pick<PlanStop, 'address' | 'lat' | 'lng'>>,
  homeBase: LatLng | null,
  homeAddress: string | null,
): string | null {
  if (stops.length === 0) return null;
  const points = stops.map(navTarget);
  const origin = homeAddress || (homeBase ? `${homeBase.lat},${homeBase.lng}` : points[0]);
  // With a home base the day is a loop: out to every stop and back to the shop.
  const destination = homeBase || homeAddress ? origin : points[points.length - 1];
  const waypoints = homeBase || homeAddress ? points : points.slice(1, -1);
  if (waypoints.length === 0 && origin === destination) return null;

  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
