import { haversineMiles, minutesFromMiles, type LatLng } from '@/lib/distance';

// "Plan my day" — orders one day's stops into the shortest sensible route and
// hands back arrival times the contractor can apply to the calendar in one tap.
//
// Pure and I/O-free so it can be unit tested and so the distance source is
// swappable: pass a `matrix` (real Distance-Matrix legs) and it uses that,
// otherwise it falls back to straight-line haversine at ~30 mph — the same
// assumption Extra Stop detours use.
//
// Two promises shape the whole design:
//   1. A stop the customer already CONFIRMED never gets moved. Those are
//      `locked`: they keep their committed time, and the free stops are routed
//      around them. Saving the contractor 20 minutes is not worth making a
//      customer wait on a porch.
//   2. Nothing is written until the contractor applies it. The plan is a
//      proposal with an honest before/after, including when it saves nothing.

export type PlanStop = {
  id: string;
  label: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  // Current committed time, "HH:MM" or "HH:MM:SS". Null = "anytime" that day.
  scheduledTime: string | null;
  // How long the visit itself takes, before the travel buffer.
  visitMinutes: number;
  // Customer confirmed this appointment → pin it to `scheduledTime`.
  locked: boolean;
};

export type PlannedStop = {
  stop: PlanStop;
  order: number; // 1-based position in the day
  arrivalMinutes: number; // minutes from local midnight
  arrivalTime: string; // "HH:MM"
  departMinutes: number; // arrival + visit + buffer
  legMiles: number; // travel from the previous anchor to here
  legMinutes: number;
  // Proposed arrival differs from the committed time AND we're allowed to change
  // it. Always false for a locked stop: its calendar time is never rewritten, so
  // showing it as "moving" would promise something applying will refuse to do.
  moved: boolean;
  // A locked stop's agreed time. `arrivalMinutes` stays the realistic arrival, so
  // the two together say "promised 8:05, you'd get there 5:20 PM".
  committedMinutes: number | null;
  // A locked stop we cannot reach by its committed time — surfaced, never
  // silently absorbed.
  late: boolean;
  // Idle time before a locked stop we'd otherwise reach early.
  waitMinutes: number;
};

export type RoutePlan = {
  planned: PlannedStop[];
  // Stops with no usable coordinates — they can't be routed, so they keep their
  // times and are shown separately with a nudge to add an address.
  unroutable: PlanStop[];
  currentMiles: number;
  currentMinutes: number;
  plannedMiles: number;
  plannedMinutes: number;
  savedMiles: number;
  savedMinutes: number;
  // Where the day starts from. 'first_stop' means there's no geocoded home base,
  // so the earliest stop anchors the route instead.
  anchor: 'home_base' | 'first_stop' | null;
  // Minutes the plan runs past the end of the workday (0 when it fits).
  overflowMinutes: number;
  driveTimeSource: 'drive_matrix' | 'straight_line';
  // True when the day is already in the best order we can find.
  alreadyOptimal: boolean;
};

export type PlanInput = {
  stops: PlanStop[];
  // Geocoded shop/home address the day starts from, when set.
  homeBase: LatLng | null;
  // "HH:MM" bounds of the working day.
  workdayStart: string;
  workdayEnd: string;
  // Travel/lunch padding added after every stop.
  bufferMinutes: number;
  // Visit length for jobs with no estimate on them.
  defaultVisitMinutes: number;
  // Real drive legs, keyed `${fromId}->${toId}` with 'start' for the anchor.
  // Absent keys fall back to straight-line for that leg alone.
  matrix?: Map<string, { miles: number; minutes: number }>;
};

const ANCHOR_KEY = 'start';

// Minutes from midnight for "HH:MM" / "HH:MM:SS"; null when unparseable.
export function parseTimeMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Minutes from midnight back to "HH:MM", clamped into a single day so a route
// that spills past midnight still renders a real time.
export function formatTimeMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// "8:30 AM" for display.
export function formatTimeLabel(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(clamped % 60).padStart(2, '0')} ${period}`;
}

// -- Arrival windows ---------------------------------------------------------

/** How far either side of the estimate a customer-facing arrival window runs. */
export const ARRIVAL_WINDOW_MINUTES = 60;

export type ArrivalWindow = { startMinutes: number; endMinutes: number; label: string };

/**
 * The window to give a customer for an estimated arrival.
 *
 * A single time is a promise nobody can keep — one slow job and every text sent
 * that morning was wrong. A window is the honest version of the same fact.
 *
 * The early edge is clamped to when the crew actually starts. Telling somebody
 * "7:07 AM" for the first job of an 8 AM day promises an hour that doesn't
 * exist, and it's the first customer of the day — the one most likely to be
 * standing at the window waiting. Clamping shortens the window rather than
 * sliding it, because the late edge is the part they're planning around.
 */
export function arrivalWindow(
  arrivalMinutes: number,
  options?: { spreadMinutes?: number; earliestMinutes?: number | null },
): ArrivalWindow {
  const spread = Math.max(0, options?.spreadMinutes ?? ARRIVAL_WINDOW_MINUTES);
  const arrival = Math.max(0, Math.min(23 * 60 + 59, Math.round(arrivalMinutes)));

  // Never before the crew starts — and never after the estimate itself, which
  // would leave a window that doesn't contain the time we actually expect.
  const earliest = options?.earliestMinutes;
  const floor = typeof earliest === 'number' && Number.isFinite(earliest) ? Math.max(0, Math.round(earliest)) : 0;
  const startMinutes = Math.min(arrival, Math.max(arrival - spread, floor));
  // Windows don't run into tomorrow.
  const endMinutes = Math.min(23 * 60 + 59, arrival + spread);

  return {
    startMinutes,
    endMinutes,
    label: `${formatTimeLabel(startMinutes)} to ${formatTimeLabel(endMinutes)}`,
  };
}

function coordOfStop(stop: PlanStop): LatLng | null {
  return typeof stop.lat === 'number' && typeof stop.lng === 'number' ? { lat: stop.lat, lng: stop.lng } : null;
}

function visitMinutesOf(stop: PlanStop, fallback: number): number {
  return stop.visitMinutes > 0 ? stop.visitMinutes : fallback;
}

type Leg = { miles: number; minutes: number };

// Travel between two route nodes, preferring a real Distance-Matrix leg and
// falling back to straight-line per leg (so a partial matrix still helps).
function legBetween(
  fromId: string,
  from: LatLng | null,
  toId: string,
  to: LatLng,
  matrix?: Map<string, Leg>,
): Leg {
  const real = matrix?.get(`${fromId}->${toId}`);
  if (real) return real;
  if (!from) return { miles: 0, minutes: 0 };
  const miles = haversineMiles(from, to);
  return { miles, minutes: minutesFromMiles(miles) };
}

// Total travel for a given visit order, measured from the anchor.
function routeCost(
  order: Array<{ id: string; coord: LatLng }>,
  anchorId: string,
  anchor: LatLng | null,
  matrix?: Map<string, Leg>,
): Leg {
  let miles = 0;
  let minutes = 0;
  let prevId = anchorId;
  let prev = anchor;
  for (const node of order) {
    const leg = legBetween(prevId, prev, node.id, node.coord, matrix);
    miles += leg.miles;
    minutes += leg.minutes;
    prevId = node.id;
    prev = node.coord;
  }
  return { miles, minutes };
}

// Nearest-neighbour seed, then 2-opt until no swap helps. Exact TSP is overkill
// for a contractor's day (rarely more than a dozen stops) and 2-opt lands within
// a few percent while staying instant and deterministic.
function optimizeOrder(
  nodes: Array<{ id: string; coord: LatLng }>,
  anchorId: string,
  anchor: LatLng | null,
  matrix?: Map<string, Leg>,
): Array<{ id: string; coord: LatLng }> {
  if (nodes.length <= 2) return [...nodes];

  const remaining = [...nodes];
  const seeded: Array<{ id: string; coord: LatLng }> = [];
  let currentId = anchorId;
  let current = anchor;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestMinutes = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const leg = legBetween(currentId, current, remaining[i].id, remaining[i].coord, matrix);
      // No anchor ⇒ every first leg costs 0; index order breaks the tie so the
      // seed stays deterministic.
      if (leg.minutes < bestMinutes) {
        bestMinutes = leg.minutes;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    seeded.push(next);
    currentId = next.id;
    current = next.coord;
  }

  let best = seeded;
  let bestCost = routeCost(best, anchorId, anchor, matrix).minutes;
  // Bounded so a pathological day can never spin: each pass is O(n²) and the
  // cost strictly decreases, so this converges well inside the cap.
  for (let pass = 0; pass < 24; pass++) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const cost = routeCost(candidate, anchorId, anchor, matrix).minutes;
        if (cost < bestCost - 1e-9) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

// Merge the optimized free stops with the locked ones, keeping locked stops in
// their committed chronological order: at each step, take the next locked stop if
// its committed time has already arrived, otherwise take the next free stop.
function mergeLocked(
  free: Array<{ id: string; coord: LatLng }>,
  locked: Array<{ id: string; coord: LatLng; at: number }>,
  anchorId: string,
  anchor: LatLng | null,
  startMinutes: number,
  visitOf: (id: string) => number,
  bufferMinutes: number,
  matrix?: Map<string, Leg>,
): Array<{ id: string; coord: LatLng }> {
  const merged: Array<{ id: string; coord: LatLng }> = [];
  const freeQueue = [...free];
  const lockedQueue = [...locked].sort((a, b) => a.at - b.at);
  let clock = startMinutes;
  let prevId = anchorId;
  let prev = anchor;

  while (freeQueue.length > 0 || lockedQueue.length > 0) {
    const nextLocked = lockedQueue[0];
    const nextFree = freeQueue[0];

    let takeLocked: boolean;
    if (!nextFree) takeLocked = true;
    else if (!nextLocked) takeLocked = false;
    else {
      // Could we finish the free stop and still make the locked appointment?
      const toFree = legBetween(prevId, prev, nextFree.id, nextFree.coord, matrix);
      const freeDone = clock + toFree.minutes + visitOf(nextFree.id) + bufferMinutes;
      const freeToLocked = legBetween(nextFree.id, nextFree.coord, nextLocked.id, nextLocked.coord, matrix);
      takeLocked = freeDone + freeToLocked.minutes > nextLocked.at;
    }

    const committedAt = takeLocked ? nextLocked!.at : null;
    const node = takeLocked ? lockedQueue.shift()! : freeQueue.shift()!;
    const leg = legBetween(prevId, prev, node.id, node.coord, matrix);
    const arrival = committedAt != null ? Math.max(clock + leg.minutes, committedAt) : clock + leg.minutes;
    merged.push({ id: node.id, coord: node.coord });
    clock = arrival + visitOf(node.id) + bufferMinutes;
    prevId = node.id;
    prev = node.coord;
  }

  return merged;
}

// Walk a visit order forward from the day's start, producing arrival times.
function schedule(
  order: Array<{ id: string; coord: LatLng }>,
  byId: Map<string, PlanStop>,
  anchorId: string,
  anchor: LatLng | null,
  startMinutes: number,
  defaultVisitMinutes: number,
  bufferMinutes: number,
  matrix?: Map<string, Leg>,
): { planned: PlannedStop[]; miles: number; minutes: number } {
  const planned: PlannedStop[] = [];
  let clock = startMinutes;
  let prevId = anchorId;
  let prev = anchor;
  let miles = 0;
  let minutes = 0;

  order.forEach((node, index) => {
    const stop = byId.get(node.id)!;
    const leg = legBetween(prevId, prev, node.id, node.coord, matrix);
    miles += leg.miles;
    minutes += leg.minutes;

    const earliest = clock + leg.minutes;
    const committed = stop.locked ? parseTimeMinutes(stop.scheduledTime) : null;
    const arrival = committed != null ? Math.max(earliest, committed) : earliest;
    const visit = visitMinutesOf(stop, defaultVisitMinutes);
    const currentMinutes = parseTimeMinutes(stop.scheduledTime);

    planned.push({
      stop,
      order: index + 1,
      arrivalMinutes: arrival,
      arrivalTime: formatTimeMinutes(arrival),
      departMinutes: arrival + visit + bufferMinutes,
      legMiles: Math.round(leg.miles * 10) / 10,
      legMinutes: Math.round(leg.minutes),
      moved: stop.locked ? false : currentMinutes == null || Math.round(currentMinutes) !== Math.round(arrival),
      committedMinutes: committed,
      late: committed != null && earliest > committed,
      waitMinutes: committed != null && committed > earliest ? Math.round(committed - earliest) : 0,
    });

    clock = arrival + visit + bufferMinutes;
    prevId = node.id;
    prev = node.coord;
  });

  return { planned, miles, minutes };
}

// ---------------------------------------------------------------------------
// Costing an order the contractor chose
// ---------------------------------------------------------------------------

export type OrderedPlan = {
  planned: PlannedStop[];
  miles: number;
  minutes: number;
  // Time on site across the day, excluding travel and buffers.
  workMinutes: number;
  // When the last stop's work ends. The trailing buffer is travel padding to a
  // next stop that doesn't exist, so it isn't counted — the day is over.
  finishMinutes: number;
  // Minutes past the end of the working day (0 when it fits).
  overflowMinutes: number;
};

// Cost one specific visit order, rather than searching for a better one.
//
// planDayRoute() answers "what order should today be?". This answers "what does
// THIS order cost?" — which is what the page needs after the contractor drags a
// stop, and what it needs to describe the day already on the calendar. Pure, and
// cheap enough to run on every pointer move: with a full matrix it's a walk down
// the list, so reordering recomputes arrivals, legs, and the finish time without
// a round trip.
export function scheduleOrder(orderedIds: string[], input: PlanInput): OrderedPlan {
  const { stops, homeBase, workdayStart, workdayEnd, bufferMinutes, defaultVisitMinutes, matrix } = input;
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const startMinutes = parseTimeMinutes(workdayStart) ?? 8 * 60;
  const endMinutes = parseTimeMinutes(workdayEnd) ?? 17 * 60;

  // Unknown ids and stops with no coordinates are dropped rather than guessed at:
  // a stop we can't place can't be costed, and inventing a leg for it would put a
  // fabricated distance into the day's totals.
  const order = orderedIds
    .map((id) => {
      const stop = byId.get(id);
      const coord = stop ? coordOfStop(stop) : null;
      return stop && coord ? { id, coord } : null;
    })
    .filter((node): node is { id: string; coord: LatLng } => node !== null);

  const result = schedule(
    order,
    byId,
    ANCHOR_KEY,
    homeBase ?? null,
    startMinutes,
    defaultVisitMinutes,
    bufferMinutes,
    matrix,
  );

  const workMinutes = result.planned.reduce(
    (sum, entry) => sum + visitMinutesOf(entry.stop, defaultVisitMinutes),
    0,
  );
  const last = result.planned[result.planned.length - 1];
  const finishMinutes = last
    ? last.arrivalMinutes + visitMinutesOf(last.stop, defaultVisitMinutes)
    : startMinutes;

  return {
    planned: result.planned,
    miles: Math.round(result.miles * 10) / 10,
    minutes: Math.round(result.minutes),
    workMinutes,
    finishMinutes,
    overflowMinutes: Math.max(0, Math.round(finishMinutes - endMinutes)),
  };
}

// ---------------------------------------------------------------------------
// Applying a plan
// ---------------------------------------------------------------------------

// A single start-time move the contractor is about to commit.
export type ScheduleChange = { jobId: string; label: string; from: string | null; to: string };

export type ScheduleChangeset = {
  changes: ScheduleChange[];
  // Confirmed appointments the submitted plan tried to move. Counted, never applied.
  keptConfirmed: number;
  // Stops already sitting at the proposed time.
  unchanged: number;
  // Entries that don't correspond to a job on this day for this account, or that
  // carry an unparseable time. Dropped rather than guessed at.
  ignored: number;
};

export type ApplyCandidate = {
  id: string;
  client_name: string;
  scheduled_time: string | null;
  appointment_confirmed_at: string | null;
};

// Resolves submitted "<jobId>:<HH:MM>" entries against the day's real jobs into
// the exact set of writes to perform — with every rule applied UP FRONT, before
// anything is written. Doing this as one pure pass is what lets the caller decide
// to write all of it or none of it, instead of discovering a problem halfway
// through and leaving the day half-reordered.
//
// The submitted times are the contractor's, but nothing in them is trusted: a job
// must genuinely be on the day, the time must parse, and a confirmed appointment
// can never be moved off the time the customer agreed to — whatever the form says.
export function buildScheduleChangeset(jobs: ApplyCandidate[], entries: string[]): ScheduleChangeset {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const changes: ScheduleChange[] = [];
  const seen = new Set<string>();
  let keptConfirmed = 0;
  let unchanged = 0;
  let ignored = 0;

  for (const entry of entries) {
    const separator = entry.indexOf(':');
    if (separator < 0) {
      ignored += 1;
      continue;
    }
    const jobId = entry.slice(0, separator);
    const time = entry.slice(separator + 1);
    const job = byId.get(jobId);
    const minutes = parseTimeMinutes(time);
    if (!job || minutes == null || seen.has(jobId)) {
      ignored += 1;
      continue;
    }
    seen.add(jobId);

    const current = parseTimeMinutes(job.scheduled_time);
    if (job.appointment_confirmed_at) {
      if (current !== minutes) keptConfirmed += 1;
      continue;
    }
    if (current === minutes) {
      unchanged += 1;
      continue;
    }
    changes.push({
      jobId,
      label: job.client_name,
      from: job.scheduled_time,
      to: `${formatTimeMinutes(minutes)}:00`,
    });
  }

  return { changes, keptConfirmed, unchanged, ignored };
}

export function planDayRoute(input: PlanInput): RoutePlan {
  const { stops, homeBase, workdayStart, workdayEnd, bufferMinutes, defaultVisitMinutes, matrix } = input;

  const routable = stops.filter((stop) => coordOfStop(stop) !== null);
  const unroutable = stops.filter((stop) => coordOfStop(stop) === null);
  const driveTimeSource: RoutePlan['driveTimeSource'] = matrix && matrix.size > 0 ? 'drive_matrix' : 'straight_line';
  const startMinutes = parseTimeMinutes(workdayStart) ?? 8 * 60;
  const endMinutes = parseTimeMinutes(workdayEnd) ?? 17 * 60;

  const empty: RoutePlan = {
    planned: [],
    unroutable,
    currentMiles: 0,
    currentMinutes: 0,
    plannedMiles: 0,
    plannedMinutes: 0,
    savedMiles: 0,
    savedMinutes: 0,
    anchor: null,
    overflowMinutes: 0,
    driveTimeSource,
    alreadyOptimal: true,
  };
  if (routable.length === 0) return empty;

  const byId = new Map(routable.map((stop) => [stop.id, stop]));
  const nodes = routable.map((stop) => ({ id: stop.id, coord: coordOfStop(stop)! }));

  // Today's order as it stands: by committed time, untimed stops last (stable).
  const currentOrder = [...nodes].sort((a, b) => {
    const aTime = parseTimeMinutes(byId.get(a.id)!.scheduledTime);
    const bTime = parseTimeMinutes(byId.get(b.id)!.scheduledTime);
    if (aTime == null && bTime == null) return 0;
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    return aTime - bTime;
  });

  // Anchor: the geocoded home base, else the day's current first stop (the route
  // still gets tightened, we just can't cost the drive out from the shop).
  const anchorCoord = homeBase ?? null;
  const anchor: RoutePlan['anchor'] = homeBase ? 'home_base' : 'first_stop';

  const visitOf = (id: string) => visitMinutesOf(byId.get(id)!, defaultVisitMinutes);
  const lockedNodes = nodes
    .filter((node) => byId.get(node.id)!.locked && parseTimeMinutes(byId.get(node.id)!.scheduledTime) != null)
    .map((node) => ({ ...node, at: parseTimeMinutes(byId.get(node.id)!.scheduledTime)! }));
  const lockedIds = new Set(lockedNodes.map((node) => node.id));
  const freeNodes = nodes.filter((node) => !lockedIds.has(node.id));

  const optimizedFree = optimizeOrder(freeNodes, ANCHOR_KEY, anchorCoord, matrix);
  const plannedOrder = lockedNodes.length
    ? mergeLocked(optimizedFree, lockedNodes, ANCHOR_KEY, anchorCoord, startMinutes, visitOf, bufferMinutes, matrix)
    : optimizedFree;

  const current = schedule(currentOrder, byId, ANCHOR_KEY, anchorCoord, startMinutes, defaultVisitMinutes, bufferMinutes, matrix);
  const proposed = schedule(plannedOrder, byId, ANCHOR_KEY, anchorCoord, startMinutes, defaultVisitMinutes, bufferMinutes, matrix);

  // Never propose a route that drives further than the day already does — with
  // locked stops in play the merge can legitimately lose to today's order, and in
  // that case today's order IS the answer.
  const worseThanCurrent = proposed.minutes > current.minutes + 1e-9;
  const final = worseThanCurrent ? current : proposed;
  const finalOrder = worseThanCurrent ? currentOrder : plannedOrder;

  const sameOrder =
    finalOrder.length === currentOrder.length && finalOrder.every((node, index) => node.id === currentOrder[index].id);

  const lastDepart = final.planned.length ? final.planned[final.planned.length - 1].departMinutes : startMinutes;

  return {
    planned: final.planned,
    unroutable,
    currentMiles: Math.round(current.miles * 10) / 10,
    currentMinutes: Math.round(current.minutes),
    plannedMiles: Math.round(final.miles * 10) / 10,
    plannedMinutes: Math.round(final.minutes),
    savedMiles: Math.round((current.miles - final.miles) * 10) / 10,
    savedMinutes: Math.round(current.minutes - final.minutes),
    anchor,
    overflowMinutes: Math.max(0, Math.round(lastDepart - bufferMinutes - endMinutes)),
    driveTimeSource,
    alreadyOptimal: sameOrder,
  };
}
