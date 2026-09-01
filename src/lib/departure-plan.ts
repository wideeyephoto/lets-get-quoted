import { estimateEtaMinutes, zonedInstant } from '@/lib/arrival';

// "Leave by 1:45 to make your 2:00."
//
// The single most useful number on a tech's phone in the middle of a day, and
// the one nobody computes because it needs three things at once: where you are
// now, where the next appointment is, and what time you promised.
//
// Straight-line estimates, deliberately. The traffic-aware version costs a
// billed Distance Matrix call per stop per page load, and this number is
// advisory — a tech who knows the road is closed ignores it either way. The
// buffer below is what absorbs the difference.

export type PlannedStop = {
  id: string;
  /** "HH:MM" in the account's timezone. Stops without one can't be planned. */
  scheduledTime: string | null;
  lat: number | null;
  lng: number | null;
};

export type DeparturePlan = {
  id: string;
  /** When to set off from the previous stop, or null when it can't be known. */
  leaveBy: Date | null;
  driveMinutes: number | null;
  /** Already past. This is the state worth interrupting somebody about. */
  overdue: boolean;
  /** Leaving within the next 15 minutes — the "start wrapping up" signal. */
  soon: boolean;
};

export const LEAVE_SOON_MINUTES = 15;

function point(stop: { lat: number | null; lng: number | null }): { lat: number; lng: number } | null {
  return typeof stop.lat === 'number' && Number.isFinite(stop.lat)
    && typeof stop.lng === 'number' && Number.isFinite(stop.lng)
    ? { lat: stop.lat, lng: stop.lng }
    : null;
}

/**
 * When to leave for each stop in a day's route.
 *
 * The origin for stop N is stop N-1 — not wherever the tech happens to be —
 * because this is a plan for the day, computed once, not a live re-route. The
 * first stop measures from `origin` (their start address, or the shop).
 *
 * A stop with no scheduled time gets a null plan rather than a guess: "leave by"
 * is derived from a promise, and there isn't one.
 */
export function departurePlans(
  stops: PlannedStop[],
  options: {
    day: string;
    timeZone: string;
    bufferMinutes?: number;
    origin?: { lat: number; lng: number } | null;
    now?: Date;
    matrix?: Map<string, { miles: number; minutes: number }>;
  },
): DeparturePlan[] {
  const now = options.now ?? new Date();
  const buffer = Math.max(0, options.bufferMinutes ?? 0);
  let previous = options.origin ?? null;
  let prevId = 'start';

  return stops.map((stop) => {
    const here = point(stop);
    const appointment = stop.scheduledTime ? zonedInstant(options.day, stop.scheduledTime, options.timeZone) : null;
    const matrixLeg = options.matrix?.get(`${prevId}->${stop.id}`);
    const driveMinutes = matrixLeg ? Math.round(matrixLeg.minutes) : estimateEtaMinutes(previous, here);
    // Carry the position forward even when this stop can't be planned, so one
    // ungeocoded address in the middle doesn't blank the rest of the day.
    if (here) {
      previous = here;
      prevId = stop.id;
    }

    if (!appointment || driveMinutes === null) {
      return { id: stop.id, leaveBy: null, driveMinutes, overdue: false, soon: false };
    }

    const leaveBy = new Date(appointment.getTime() - (driveMinutes + buffer) * 60_000);
    const minutesUntil = (leaveBy.getTime() - now.getTime()) / 60_000;
    return {
      id: stop.id,
      leaveBy,
      driveMinutes,
      overdue: minutesUntil < 0,
      soon: minutesUntil >= 0 && minutesUntil <= LEAVE_SOON_MINUTES,
    };
  });
}

/**
 * The one stop worth putting at the top of the screen: the soonest departure
 * that hasn't happened yet, or the one already overdue.
 *
 * Only ever one. A list where every row shouts is a list nobody reads.
 */
export function nextDeparture(plans: DeparturePlan[]): DeparturePlan | null {
  const live = plans.filter((plan) => plan.leaveBy !== null);
  if (live.length === 0) return null;
  const overdue = live.filter((plan) => plan.overdue);
  if (overdue.length > 0) {
    // The most overdue is the one that's actually gone wrong.
    return overdue.reduce((worst, plan) => (plan.leaveBy! < worst.leaveBy! ? plan : worst));
  }
  return live.reduce((soonest, plan) => (plan.leaveBy! < soonest.leaveBy! ? plan : soonest));
}
