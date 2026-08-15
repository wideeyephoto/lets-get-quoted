'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import FloatingPanel from '@/components/floating-panel';
import SaveButton from '@/components/save-button';
import ServiceIcon from '@/lib/templates/ServiceIcon';
import { isRouteStopId, KIND_GLYPH, KIND_LABEL, routeStopUuid, type RouteStop } from '@/lib/route-stops';
import RouteMap, { type MapStop, type NearbyPlace } from './RouteMap';
import AddRouteStop from './AddRouteStop';
import StopArrival, { type StopArrivalProps } from './StopArrival';
import RescheduleOffer from './RescheduleOffer';
import { applyDayPlanAction, deleteRouteStopAction, setPreferredLastAction } from './actions';
import { formatClockLabel, formatTimeLabel, formatTimeMinutes, parseTimeMinutes, type PlannedStop } from '@/lib/route-plan';
import { coordOf } from '@/lib/distance';
import { formatHours } from '@/lib/job-day-load';
import { isWorthMoving, savingFromRemoving } from '@/lib/reschedule-offers';
import {
  costOrder,
  endOn,
  fullRouteUrl,
  legColor,
  minutesLabel,
  navTarget,
  reorderStops,
  sameOrder,
  type DayPlanPayload,
} from '@/lib/day-plan-view';

// The interactive half of Plan my day.
//
// Everything the contractor does here is a proposal. The order lives in React
// state, every number on the page is derived from that order, and the calendar is
// not touched until Save schedule. That's what makes dragging safe: the worst a
// wrong drag can do is look wrong, and Undo puts it back.
//
// Recomputing is free because the server already fetched the drive matrix for
// every pair of stops, so costOrder() is a walk down the list — no request, no
// quota, no spinner. Only the road route on the map needs the network, and it
// says so itself.

type Props = {
  payload: DayPlanPayload;
  mapsApiKey: string | null;
  /**
   * Everything an "I'm on my way" needs, per job, built on the server.
   *
   * Keyed rather than folded into the payload because two of the values are
   * bound server actions: they cross the boundary as action references, not as
   * data, and DayPlanPayload is a plain object the page also reasons about.
   * A supply stop has no customer to text, so it simply has no entry.
   */
  arrivalByJobId: Record<string, StopArrivalProps>;
};

const MENU_WIDTH = 232;

export default function DayPlanner({ payload, mapsApiKey, arrivalByJobId }: Props) {
  const byId = useMemo(() => new Map(payload.stops.map((stop) => [stop.id, stop])), [payload.stops]);
  // Supply stops keep their own record so the row can show what kind of stop it
  // is and offer to remove it — a job is never removed from a day here.
  const routeStopById = useMemo(
    () => new Map(payload.routeStops.map((stop) => [stop.id, stop])),
    [payload.routeStops],
  );

  // The calendar's own order is the starting point. Showing the optimizer's order
  // by default would mean the page never matches the day the contractor actually
  // has — and "apply" would be the only way to see their real schedule.
  //
  // With one exception: a last stop they told us about. Opening the day with
  // that stop back in the middle, under an amber "this isn't last any more"
  // badge, would greet somebody who planned last night with a warning about
  // their own decision.
  const [order, setOrder] = useState<string[]>(() => endOn(payload.currentOrder, payload.preferredLastId));
  const [history, setHistory] = useState<string[][]>([]);
  // The stop being held, by id rather than index — during a live drag its index
  // changes constantly, which is the whole point.
  const [dragId, setDragId] = useState<string | null>(null);
  // The order as it stood when the drag began, so a drag abandoned outside the
  // list snaps back instead of leaving a half-considered arrangement behind.
  const dragOriginRef = useRef<string[] | null>(null);
  const didDropRef = useRef(false);
  // Stops the contractor pinned for this session. Unlike a customer-confirmed
  // lock this doesn't protect a promised time — it just stops a stop sliding
  // around while they rearrange the rest.
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  // The stop the contractor wants to end the day on — the dump run, the supply
  // pickup on the way home. Deliberately a PREFERENCE and not a lock: the
  // optimizer puts it last and the toggle moves it there, but nothing stops a
  // job being dragged after it, because the day changes. When it stops being
  // last the row says so out loud instead of quietly rearranging itself.
  //
  // Seeded from the server and written back on every change, so a route planned
  // the night before is still planned in the morning. Kept in state as well so
  // the badge moves on the click rather than after the round trip.
  const [preferredLastId, setPreferredLastId] = useState<string | null>(payload.preferredLastId);
  const [, startPrefSave] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The stop the contractor is offering to move, if any.
  const [offerFor, setOfferFor] = useState<string | null>(null);
  // A supply store picked off the map, waiting to be turned into a real stop.
  const [prefill, setPrefill] = useState<NearbyPlace | null>(null);
  const [overtimeDismissed, setOvertimeDismissed] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);

  // useState only reads its initial value on mount, so a server action that adds
  // or removes a stop re-renders this component with a payload the order state
  // has never heard of — the new stop simply wouldn't appear, and a removed one
  // would linger, until a full page load. Reconcile instead of resetting: the
  // contractor's arrangement survives, gaining what appeared and losing what went.
  const stopSignature = useMemo(
    () => [...payload.stops.map((stop) => stop.id)].sort().join('|'),
    [payload.stops],
  );
  const knownSignature = useRef(stopSignature);
  useEffect(() => {
    if (knownSignature.current === stopSignature) return;
    knownSignature.current = stopSignature;
    setOrder((current) => {
      const live = new Set(payload.stops.map((stop) => stop.id));
      const kept = current.filter((id) => live.has(id));
      const keptSet = new Set(kept);
      // New arrivals land where the calendar would put them, which for a stop
      // with no time is the end.
      const added = payload.currentOrder.filter((id) => !keptSet.has(id));
      // The SERVER's preference, not the state — a change of signature is
      // usually a change of day, and this effect runs before the one that syncs
      // the preference, so local state is still yesterday's answer here.
      return endOn([...kept, ...added], payload.preferredLastId);
    });
  }, [stopSignature, payload.stops, payload.currentOrder, payload.preferredLastId]);

  // The server is the source of truth once it answers — and it also answers
  // when the day or the crew filter changes, which is a different day's
  // preference entirely. useState only reads its initial value, so without this
  // the previous day's last stop would follow you around.
  const serverPreferredLast = payload.preferredLastId;
  const knownPref = useRef(serverPreferredLast);
  useEffect(() => {
    if (knownPref.current === serverPreferredLast) return;
    knownPref.current = serverPreferredLast;
    setPreferredLastId(serverPreferredLast);
  }, [serverPreferredLast]);

  // A stop taken off the day can't still be the one you're ending on.
  useEffect(() => {
    if (preferredLastId && !payload.stops.some((stop) => stop.id === preferredLastId)) setPreferredLastId(null);
  }, [payload.stops, preferredLastId]);

  // A preferred last stop is honoured by the optimizer's offer, so the route it
  // proposes is one the contractor would actually accept — and the miles and
  // minutes shown against it are the real cost of ending there.
  const endLast = useCallback((ids: string[]) => endOn(ids, preferredLastId), [preferredLastId]);

  const plan = useMemo(() => costOrder(payload, order), [payload, order]);
  const optimizedOrder = useMemo(() => endLast(payload.optimizedOrder), [endLast, payload.optimizedOrder]);
  const optimized = useMemo(() => costOrder(payload, optimizedOrder), [payload, optimizedOrder]);
  const current = useMemo(() => costOrder(payload, payload.currentOrder), [payload]);

  const isOptimized = sameOrder(order, optimizedOrder);
  const isCurrent = sameOrder(order, payload.currentOrder);
  // The optimizer minimizes driving MINUTES, so judging its offer on miles alone
  // meant a genuinely quicker order could be dismissed with "we couldn't find a
  // shorter route" while we were holding one. Offer it when it wins on either.
  const optimizerHelps =
    !sameOrder(payload.currentOrder, optimizedOrder) &&
    (optimized.minutes < current.minutes - 0.5 || optimized.miles < current.miles - 0.05);

  // What Save schedule would actually write. A confirmed appointment is never in
  // here: its time is the customer's, not ours.
  const pendingChanges = useMemo(
    () =>
      plan.planned.filter((entry) => {
        if (entry.stop.locked) return false;
        const stored = parseTimeMinutes(entry.stop.scheduledTime);
        return stored == null || Math.round(stored) !== Math.round(entry.arrivalMinutes);
      }),
    [plan.planned],
  );

  const movableCount = plan.planned.filter((entry) => !entry.stop.locked && !pinned.has(entry.stop.id)).length;

  /**
   * LOOKING AT A DAY IS NOT EDITING IT.
   *
   * scheduleOrder lays every day out from the workday start, back to back, and
   * never consults the time a stop is actually booked at. So on a day nobody
   * has planned yet, the plan differs from the calendar the moment it renders -
   * and the save bar announced that as "1 arrival time will change", with a
   * Save button, before the contractor had touched anything. Opening next
   * Thursday looked like it had already moved next Thursday.
   *
   * `history` is the record of real edits: a drag, a pin, a reset. Empty means
   * this is the planner's opening offer, and the bar says so instead.
   */
  const untouched = history.length === 0;
  /** Whole days from the account's today to the day on screen. */
  const daysAhead = Math.round(
    (Date.parse(`${payload.dateKey}T00:00:00`) - Date.parse(`${payload.todayKey}T00:00:00`)) / 86_400_000,
  );

  // -- Offering a customer a discount to take a different day -----------------
  //
  // What today gets back is computed HERE, off the order on screen, not on the
  // server. The whole page works this way — the arrangement in front of the
  // contractor is a proposal that has not been saved — so the saving quoted in
  // the offer has to be measured against the same proposal. Reading it from the
  // calendar would quote a number for a route they can see they have changed.
  const pendingOfferJobIds = useMemo(() => new Set(payload.pendingRescheduleJobIds ?? []), [payload.pendingRescheduleJobIds]);

  const savingByStopId = useMemo(() => {
    const saved = new Map<string, { miles: number; minutes: number }>();
    plan.planned.forEach((entry, index) => {
      const previous = index === 0 ? payload.homeBase : coordOf(plan.planned[index - 1].stop);
      const next = index === plan.planned.length - 1 ? payload.homeBase : coordOf(plan.planned[index + 1].stop);
      saved.set(entry.stop.id, savingFromRemoving({ stop: coordOf(entry.stop), previous, next }));
    });
    return saved;
  }, [plan.planned, payload.homeBase]);

  // A supply run has no customer to ask, and a locked stop is a time the
  // customer already confirmed — the honest move there is to ring them, not to
  // text an offer about an appointment they have already agreed to. Both are
  // excluded rather than shown and then refused.
  /**
   * Whether it is fair to ask this customer to take another day.
   *
   * TWO REASONS TO ASK, AND ONLY ONE OF THEM IS ABOUT DRIVING. The default test
   * is whether moving the stop saves enough of the day to justify the ask — a
   * detour worth four minutes is not worth a text and a discount. A stop the day
   * cannot FINISH is a different case: the reason to move it is that it does not
   * fit, and gating that on mileage meant the one row on the page reading
   * "cannot be finished today" was the row with no way to act on it.
   *
   * A customer-confirmed time still blocks both. They agreed to a slot; the
   * page says so and the fix there is a conversation, not a button.
   */
  const canOfferMove = useCallback(
    (stopId: string, reason: 'saves_driving' | 'stranded' = 'saves_driving') => {
      if (!payload.rescheduleAvailable) return false;
      if (isRouteStopId(stopId)) return false;
      const stop = byId.get(stopId);
      if (!stop || stop.locked) return false;
      if (reason === 'stranded') return true;
      const saving = savingByStopId.get(stopId);
      return Boolean(saving && isWorthMoving(saving));
    },
    [payload.rescheduleAvailable, byId, savingByStopId],
  );

  const openOffer = useCallback((stopId: string) => setOfferFor(stopId), []);

  const canDrag = useCallback(
    (stopId: string) => {
      const stop = byId.get(stopId);
      return Boolean(stop && !stop.locked && !pinned.has(stopId));
    },
    [byId, pinned],
  );

  const commit = useCallback((next: string[], from?: string[]) => {
    setHistory((past) => [...past.slice(-19), from ?? order]);
    setOrder(next);
  }, [order]);

  function handleDragStart(stopId: string) {
    dragOriginRef.current = order;
    didDropRef.current = false;
    setDragId(stopId);
  }

  // The list rearranges under the cursor rather than waiting for the drop, so the
  // card is always sitting where it would land — and because every number on the
  // page is derived from the order, the arrival and finish times on it are the
  // real ones for that position. You see the consequence before committing to it.
  //
  // Everything is resolved by stop id inside a functional update: dragover fires
  // faster than React re-renders, so an index captured at render time can already
  // be one swap out of date by the time it's read.
  function handleDragOver(targetId: string, pointerY: number, rect: DOMRect) {
    if (!dragId || targetId === dragId) return;
    setOrder((current) => {
      const from = current.indexOf(dragId);
      const to = current.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return current;

      // Only swap once the pointer is past the middle of the row it's over, in
      // the direction of travel. Reordering on first contact makes rows of
      // different heights oscillate: the swap moves the row out from under the
      // cursor, which immediately triggers the opposite swap back.
      const midpoint = rect.top + rect.height / 2;
      if (to > from ? pointerY < midpoint : pointerY > midpoint) return current;

      return reorderStops(current, byId, from, to, pinned) ?? current;
    });
  }

  function handleDragEnd() {
    // Dropped outside any row (or onto something that refused it): put it back.
    if (!didDropRef.current && dragOriginRef.current) setOrder(dragOriginRef.current);
    dragOriginRef.current = null;
    setDragId(null);
  }

  function handleDrop() {
    didDropRef.current = true;
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    setDragId(null);
    // The list already shows the result; all that's left is to make the whole
    // drag one undo step rather than one per row it passed over.
    if (origin && !sameOrder(origin, order)) setHistory((past) => [...past.slice(-19), origin]);
  }

  // Keyboard equivalent, because a route you can only reorder with a mouse is a
  // route half the people using this app can't reorder at all.
  function nudge(index: number, direction: -1 | 1) {
    const next = reorderStops(order, byId, index, index + direction, pinned);
    if (next) commit(next);
  }

  function undo() {
    setHistory((past) => {
      if (past.length === 0) return past;
      setOrder(past[past.length - 1]);
      return past.slice(0, -1);
    });
  }

  function resetToOptimized() {
    if (sameOrder(order, optimizedOrder)) return;
    commit(optimizedOrder);
  }

  // Setting a preferred last stop moves it there now — a toggle that changed a
  // label and nothing else would leave the contractor to do the drag anyway.
  //
  // The badge flips immediately and the write happens behind it. If the write
  // fails the next render puts it back to whatever the server actually holds,
  // which is the honest outcome: a preference that didn't save shouldn't look
  // saved the night before you rely on it.
  function togglePreferredLast(stopId: string) {
    setMenuFor(null);
    const next = preferredLastId === stopId ? null : stopId;
    setPreferredLastId(next);
    if (next) moveToEnd(stopId);
    // Keep the ref in step so the sync effect doesn't immediately undo this
    // when the revalidated payload arrives carrying the same value.
    knownPref.current = next;
    startPrefSave(() => {
      void setPreferredLastAction(payload.dateKey, payload.crewId, next);
    });
  }

  function moveToEnd(stopId: string) {
    setMenuFor(null);
    const next = [...order.filter((id) => id !== stopId), stopId];
    if (!sameOrder(next, order)) commit(next);
  }

  function togglePin(stopId: string) {
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(stopId)) next.delete(stopId);
      else next.add(stopId);
      return next;
    });
    setMenuFor(null);
  }

  const mapStops: MapStop[] = plan.planned
    .filter((entry) => entry.stop.lat != null && entry.stop.lng != null)
    .map((entry) => ({
      id: entry.stop.id,
      label: entry.stop.label,
      lat: entry.stop.lat!,
      lng: entry.stop.lng!,
      locked: entry.stop.locked,
    }));

  const routeUrl = fullRouteUrl(
    plan.planned.map((entry) => entry.stop),
    payload.homeBase,
    payload.homeAddress,
  );

  const overtime = plan.overflowMinutes > 0;
  /**
   * The day cannot hold what is on it — which is a different statement from
   * "it runs late", and the one the contractor needs.
   *
   * "Runs 9 hr 2 min past your 5:00 PM finish" invites somebody to squint at
   * the last stop and wonder whether to work the evening. The cause of a 2 AM
   * finish is usually not one long stop: it is two multi-day jobs on one day,
   * each of which dayLoad gave a full working day because it computes each job
   * in isolation and nothing reconciles the total. 16 hours of work in a
   * 9-hour day is not an overrun, it is an impossible day, and the fix is to
   * move one of them rather than to start later.
   */
  const dayMinutes = plan.dayMinutes;
  const committedMinutes = plan.workMinutes + Math.round(plan.minutes);
  const overCapacity = dayMinutes > 0 && committedMinutes > dayMinutes;
  // The stops still being worked when the day ends. Only ever shown on a row
  // while the day is over capacity: on a day that merely runs twenty minutes
  // late the banner has already said so, and a badge on the last stop would be
  // the same sentence twice.
  const strandedIds = new Set(overCapacity ? plan.unfinishedByDayEnd : []);
  const stranded = plan.planned.filter((entry) => strandedIds.has(entry.stop.id));
  const workdayEndLabel = formatTimeLabel(parseTimeMinutes(payload.workdayEnd) ?? 17 * 60);
  // Only jobs have a page to open. A supply stop's id would build a /dashboard/
  // jobs/rs:… link that 404s, so every "open the job" affordance resolves to the
  // nearest actual job instead.
  const jobEntries = plan.planned.filter((entry) => !isRouteStopId(entry.stop.id));
  const firstJob = jobEntries[0] ?? null;
  const lastJob = jobEntries[jobEntries.length - 1] ?? null;
  /**
   * THE JOB WORTH MOVING, WHICH IS NOT ALWAYS "THE LAST ONE".
   *
   * The banner offered "Move the last job" — a link to a job page, where you
   * then have to find the date field yourself. On a day holding two multi-day
   * jobs the last stop and the stranded stop are often different rows, and the
   * one that matters is the one the day cannot finish. Falls back to the last
   * job on a day that merely runs late, where there is no stranded stop at all.
   */
  const strandedJob = stranded.filter((entry) => !isRouteStopId(entry.stop.id)).pop() ?? lastJob;
  const manualDeltaMiles = Math.round((plan.miles - optimized.miles) * 10) / 10;
  const manualDeltaMinutes = Math.round(plan.minutes - optimized.minutes);

  return (
    <>
      <section className="panel plan-panel plan-route-panel">
        <div className="plan-route-grid">
          <RouteMap
            stops={mapStops}
            homeBase={payload.homeBase}
            apiKey={mapsApiKey}
            deferRoute={dragId !== null}
            onAddPlace={(place) => {
              setPrefill(place);
              listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }}
          />

          <div className="plan-route-side">
            <RouteStatus
              isOptimized={isOptimized}
              isCurrent={isCurrent}
              optimizerHelps={optimizerHelps}
              stopCount={plan.planned.length}
              timeChangeCount={pendingChanges.length}
              savedMiles={Math.round((current.miles - optimized.miles) * 10) / 10}
              savedMinutes={Math.round(current.minutes - optimized.minutes)}
              driveTimeSource={payload.driveTimeSource}
              driveTimeSkipped={payload.driveTimeSkipped}
              onApplyOptimized={() => commit(optimizedOrder)}
            />

            <dl className="plan-stat-row">
              <div className="plan-stat">
                <dt>Stops</dt>
                <dd>{plan.planned.length}</dd>
              </div>
              <div className="plan-stat">
                <dt>Total distance</dt>
                <dd>{plan.miles} mi</dd>
              </div>
              <div className="plan-stat">
                <dt>Driving time</dt>
                <dd>{minutesLabel(plan.minutes)}</dd>
              </div>
              <div className={`plan-stat${overtime ? ' is-over' : ''}`}>
                <dt>Finish around</dt>
                <dd>{formatClockLabel(plan.finishMinutes)}</dd>
              </div>
            </dl>

            <div className="plan-route-actions">
              {routeUrl ? (
                <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="btn secondary">
                  Open in Google Maps
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {overtime && !overtimeDismissed ? (
        <section className="panel plan-panel plan-overtime">
          <div className="plan-overtime-head">
            <span className="plan-overtime-icon" aria-hidden="true">!</span>
            <div>
              <strong>
                {overCapacity
                  ? `${minutesLabel(committedMinutes)} of work and driving on a ${minutesLabel(dayMinutes)} day`
                  : `Schedule runs ${minutesLabel(plan.overflowMinutes)} past your ${workdayEndLabel} finish`}
              </strong>
              <p>
                {overCapacity ? (
                  <>
                    This day is {minutesLabel(committedMinutes - dayMinutes)} more than it holds, so
                    the plan runs to {formatClockLabel(plan.finishMinutes)}. Something has to move —
                    starting earlier cannot fix it.
                    {stranded.length > 0 ? (
                      <>
                        {' '}
                        {stranded.length === 1 ? 'One stop' : `${stranded.length} stops`} cannot be{' '}
                        <em>finished</em> before your {workdayEndLabel} finish:{' '}
                        {stranded.map((entry) => entry.stop.label).join(', ')}.
                      </>
                    ) : null}
                  </>
                ) : (
                  <>The last stop is expected to finish around {formatClockLabel(plan.finishMinutes)}.</>
                )}
              </p>
            </div>
          </div>
          {/* THE NEXT STEP, NAMED. This was "Adjust the day" (scroll down) and
              "Move the last job" (open a job page and find the date field) —
              two ways of telling somebody to go and solve it. The day already
              knows which stop it cannot finish, and there is a whole flow for
              asking that customer to take another day, with the days that have
              room and a discount if you want one. So it is offered here, on the
              job it is about. */}
          <div className="plan-overtime-actions">
            {strandedJob
            && canOfferMove(strandedJob.stop.id, strandedIds.has(strandedJob.stop.id) ? 'stranded' : 'saves_driving')
            && !pendingOfferJobIds.has(strandedJob.stop.id) ? (
              <button type="button" className="btn primary" onClick={() => openOffer(strandedJob.stop.id)}>
                Ask {strandedJob.stop.label} to move day
              </button>
            ) : null}
            {strandedJob ? (
              <Link href={`/dashboard/jobs/${strandedJob.stop.id}`} className="btn secondary">
                {pendingOfferJobIds.has(strandedJob.stop.id)
                  ? `${strandedJob.stop.label} — offer sent, open the job`
                  : `Move ${strandedJob.stop.label} myself`}
              </Link>
            ) : null}
            <button
              type="button"
              className="btn secondary"
              onClick={() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Adjust the day
            </button>
            <button type="button" className="linklike" onClick={() => setOvertimeDismissed(true)}>
              Keep this schedule
            </button>
          </div>
        </section>
      ) : null}

      <div className="plan-body">
        <section className="panel plan-panel plan-stops-panel">
          <div className="plan-stops-head">
            <div>
              <p className="eyebrow">{isCurrent ? 'Scheduled stops' : 'Proposed route'}</p>
              <h2>
                {plan.planned.length} stop{plan.planned.length === 1 ? '' : 's'}
                {payload.crewName ? ` · ${payload.crewName}` : ''}
              </h2>
            </div>
            {movableCount > 1 ? (
              <p className="plan-drag-hint">
                {dragId ? 'Let go to keep this order — times update as you move.' : 'Drag a stop to reorder the day.'}
              </p>
            ) : null}
          </div>

          {/* The gaps between rows are part of the list too. Without this a drop
              landing in a 0.5rem gutter counts as "dropped nowhere" and snaps the
              whole arrangement back, which feels like the app lost the drag. */}
          <ol
            className={`plan-stop-list${dragId ? ' is-dragging' : ''}`}
            ref={listRef}
            onDragOver={(event) => {
              if (!dragId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              if (!dragId) return;
              event.preventDefault();
              handleDrop();
            }}
          >
            {plan.planned.map((entry, index) => (
              <StopRow
                key={entry.stop.id}
                entry={entry}
                index={index}
                total={plan.planned.length}
                draggable={canDrag(entry.stop.id)}
                isDragging={dragId === entry.stop.id}
                dragActive={dragId !== null}
                blocksDrag={dragId !== null && dragId !== entry.stop.id && pinned.has(entry.stop.id)}
                pinned={pinned.has(entry.stop.id)}
                preferredLast={preferredLastId === entry.stop.id}
                actuallyLast={index === plan.planned.length - 1}
                anchoredToHome={payload.anchor === 'home_base'}
                legColor={legColor(index, plan.planned.length + (payload.homeBase ? 1 : 0))}
                routeStop={isRouteStopId(entry.stop.id) ? routeStopById.get(routeStopUuid(entry.stop.id)) ?? null : null}
                dateKey={payload.dateKey}
                crewId={payload.crewId}
                onMyWay={arrivalByJobId[entry.stop.id] ?? null}
                startsAfterDayEnd={strandedIds.has(entry.stop.id)}
                menuOpen={menuFor === entry.stop.id}
                onMenu={(open) => setMenuFor(open ? entry.stop.id : null)}
                onTogglePin={() => togglePin(entry.stop.id)}
                onTogglePreferredLast={() => togglePreferredLast(entry.stop.id)}
                onMoveToEnd={() => moveToEnd(entry.stop.id)}
                onOfferMove={
                  canOfferMove(entry.stop.id, strandedIds.has(entry.stop.id) ? 'stranded' : 'saves_driving')
                    ? () => openOffer(entry.stop.id)
                    : null
                }
                offerPending={pendingOfferJobIds.has(entry.stop.id)}
                onNudge={(direction) => nudge(index, direction)}
                onDragStart={() => handleDragStart(entry.stop.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(pointerY, rect) => handleDragOver(entry.stop.id, pointerY, rect)}
                onDrop={handleDrop}
              />
            ))}
          </ol>

          {/* Sits under the list rather than inside the row's menu: it carries a
              day picker, a discount picker and the text itself, and a 232px
              popover is not where somebody should be deciding to give away
              money. */}
          {offerFor && byId.get(offerFor) ? (
            <RescheduleOffer
              jobId={offerFor}
              stopLabel={byId.get(offerFor)!.label}
              dateKey={payload.dateKey}
              crewId={payload.crewId}
              businessName={payload.businessName}
              saved={savingByStopId.get(offerFor) ?? { miles: 0, minutes: 0 }}
              onClose={() => setOfferFor(null)}
            />
          ) : null}

          <AddRouteStop
            dateKey={payload.dateKey}
            crewId={payload.crewId}
            savedPlaces={payload.savedPlaces}
            stopCount={payload.routeStops.length}
            prefill={prefill}
            onPrefillUsed={() => setPrefill(null)}
            bias={payload.homeBase}
          />
        </section>

        <aside className="plan-aside">
          <section className="panel plan-panel plan-summary">
            <h3>Day summary</h3>
            <dl>
              <div><dt>Total stops</dt><dd>{plan.planned.length}</dd></div>
              <div><dt>Total distance</dt><dd>{plan.miles} mi</dd></div>
              <div><dt>Driving time</dt><dd>{minutesLabel(plan.minutes)}</dd></div>
              <div><dt>Time on site</dt><dd>{minutesLabel(plan.workMinutes)}</dd></div>
              <div className={overtime ? 'is-over' : undefined}>
                <dt>Estimated finish</dt>
                <dd>
                  {formatClockLabel(plan.finishMinutes)}
                  {overtime ? <span className="plan-over-flag" title={`${minutesLabel(plan.overflowMinutes)} past ${workdayEndLabel}`}> ⚠</span> : null}
                </dd>
              </div>
            </dl>
          </section>

          <RouteInsights
            payload={payload}
            isOptimized={isOptimized}
            isCurrent={isCurrent}
            optimizerHelps={optimizerHelps}
            overtime={overtime}
            overCapacity={overCapacity}
            dayMinutes={dayMinutes}
            committedMinutes={committedMinutes}
            overflowMinutes={plan.overflowMinutes}
            workdayEndLabel={workdayEndLabel}
            manualDeltaMiles={manualDeltaMiles}
            manualDeltaMinutes={manualDeltaMinutes}
          />

          <section className="panel plan-panel plan-quick">
            <h3>Quick actions</h3>
            <ul>
              <li>
                <Link href={`/dashboard/schedule?date=${payload.dateKey}`}>Open this day on the calendar</Link>
              </li>
              {firstJob ? (
                <li><Link href={`/dashboard/jobs/${firstJob.stop.id}`}>Change the first arrival time</Link></li>
              ) : null}
              {lastJob && lastJob !== firstJob ? (
                <li><Link href={`/dashboard/jobs/${lastJob.stop.id}`}>Move the last job to another day</Link></li>
              ) : null}
              {payload.crewId ? (
                <li><Link href="/dashboard/crew">Set where this crew member starts</Link></li>
              ) : null}
              <li><Link href="/dashboard/schedule/settings">Change your working hours</Link></li>
            </ul>
          </section>
        </aside>
      </div>

      {pendingChanges.length > 0 || history.length > 0 ? (
        <form action={applyDayPlanAction} className={`plan-savebar${untouched ? ' is-offer' : ''}`}>
          <input type="hidden" name="dateKey" value={payload.dateKey} />
          <input type="hidden" name="crewId" value={payload.crewId ?? ''} />
          {/* Confirmed appointments are deliberately not submitted. The server
              re-checks this too, so a mistake here still can't move one. */}
          {plan.planned
            .filter((entry) => !entry.stop.locked)
            .map((entry) => (
              <input key={entry.stop.id} type="hidden" name="stop" value={`${entry.stop.id}:${entry.arrivalTime}`} />
            ))}

          <div className="plan-savebar-copy">
            <strong>
              {pendingChanges.length === 0
                ? 'No time changes to save'
                : untouched
                  ? // Not "will change" - nothing has been decided. These are
                    // the planner's times sitting beside the calendar's.
                    `${pendingChanges.length === 1 ? 'This time is' : 'These times are'} the plan’s, not your calendar’s`
                  : `${pendingChanges.length} arrival time${pendingChanges.length === 1 ? '' : 's'} will change`}
            </strong>
            {/* WHY IT DIFFERS, not just THAT it differs.
                These two lines have been wrong twice. First they contradicted
                each other — "Nothing on your calendar has changed yet" printed
                directly under "2 arrival times will change". Then they agreed,
                and were both alarming: a day nobody had touched announced a
                pending change, because the plan lays every day out from the
                workday start and a day that has never been planned always
                reads differently from what is booked.
                So the untouched case explains the mechanism, and names how far
                out the day is when that is the reason nobody has planned it. */}
            <span>
              {history.length > 0 && manualDeltaMiles !== 0
                ? `Your order drives ${manualDeltaMiles > 0 ? '+' : ''}${manualDeltaMiles} mi (${manualDeltaMinutes > 0 ? '+' : ''}${minutesLabel(manualDeltaMinutes)}) versus the optimized one.`
                : pendingChanges.length === 0
                  ? 'Nothing on your calendar has changed yet.'
                  : untouched && daysAhead > 1
                    ? // Said out loud, because it is the whole explanation: the
                      // plan runs the day from your start time, and a day this
                      // far out has not been planned against that yet. Nothing
                      // here is a change until you make one.
                      `You’re ${daysAhead} days ahead of today, and this day hasn’t been planned yet — the plan runs it from your start time, so it reads differently from what’s booked. Nothing moves unless you save.`
                    : untouched
                      ? 'The plan runs the day from your start time, so it reads differently from what’s booked. Nothing moves unless you save.'
                      : 'These are the times this plan works out. Your calendar keeps its current times until you save.'}
            </span>
          </div>

          <div className="plan-savebar-actions">
            {history.length > 0 ? (
              <button type="button" className="btn ghost" onClick={undo}>Undo</button>
            ) : null}
            {!isOptimized && plan.planned.length > 1 ? (
              <button type="button" className="btn ghost" onClick={resetToOptimized}>Reset to optimized</button>
            ) : null}
            <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">Save schedule</SaveButton>
          </div>
        </form>
      ) : null}
    </>
  );
}

/**
 * The verdict on today's ORDER — which is not the same question as today's
 * TIMES, and saying so is the whole job of this component.
 *
 * With one stop there is no order to improve, so this used to read "Nothing to
 * optimize" while the save bar three feet below announced "1 arrival time will
 * change" and offered a Save. Both were true. Neither said what it was about,
 * so together they read as the page arguing with itself. `timeChangeCount` is
 * here so the single-stop case can name the other thing rather than deny it.
 */
function RouteStatus({
  isOptimized,
  isCurrent,
  optimizerHelps,
  stopCount,
  timeChangeCount,
  savedMiles,
  savedMinutes,
  driveTimeSource,
  driveTimeSkipped,
  onApplyOptimized,
}: {
  isOptimized: boolean;
  isCurrent: boolean;
  optimizerHelps: boolean;
  stopCount: number;
  timeChangeCount: number;
  savedMiles: number;
  savedMinutes: number;
  driveTimeSource: 'drive_matrix' | 'straight_line';
  driveTimeSkipped: 'too_many_stops' | null;
  onApplyOptimized: () => void;
}) {
  const estimated = driveTimeSource === 'straight_line';
  const tone = isOptimized ? 'good' : optimizerHelps ? 'offer' : 'neutral';

  return (
    <div className={`plan-verdict ${tone}`}>
      <span className="plan-verdict-mark" aria-hidden="true">{isOptimized ? '✓' : optimizerHelps ? '↻' : '•'}</span>
      <div>
        <strong>
          {stopCount < 2
            ? 'Nothing to reorder'
            : isOptimized
              ? 'Route optimized'
              : optimizerHelps
                ? savedMiles > 0 || savedMinutes > 0
                  ? `Better route found — saves ${savedMiles > 0 ? `${savedMiles} mi` : ''}${savedMiles > 0 && savedMinutes > 0 ? ' and ' : ''}${savedMinutes > 0 ? minutesLabel(savedMinutes) : ''}`
                  : 'A tighter order exists'
                : isCurrent
                  ? 'Your order, kept as it is'
                  : 'Your order'}
        </strong>
        <p>
          {stopCount < 2
            ? timeChangeCount > 0
              ? // The arrival time still moves, and this is where that gets
                // explained. A lone 8:00 job becoming 8:09 looks like a glitch
                // until you know the plan is timing the drive out from your
                // start address rather than assuming you teleport there.
                'A single stop has no order to improve — but its arrival time still shifts, because the plan allows for the drive out from your start address. That is what Save would write.'
              : 'A single stop has no order to improve.'
            : isOptimized
              ? 'This is the most efficient order we can find for today.'
              : optimizerHelps
                ? 'Reordering the day would cut this much driving.'
                : "We couldn't find a shorter route than this one."}
          {estimated
            ? driveTimeSkipped === 'too_many_stops'
              ? ' Distances are straight-line estimates — too many stops for one driving-distance lookup.'
              : ' Distances are straight-line estimates at about 30 mph.'
            : ''}
        </p>
        {optimizerHelps && !isOptimized ? (
          <button type="button" className="btn secondary" onClick={onApplyOptimized}>Use the optimized order</button>
        ) : null}
      </div>
    </div>
  );
}

function RouteInsights({
  payload,
  isOptimized,
  isCurrent,
  optimizerHelps,
  overtime,
  overCapacity,
  dayMinutes,
  committedMinutes,
  overflowMinutes,
  workdayEndLabel,
  manualDeltaMiles,
  manualDeltaMinutes,
}: {
  payload: DayPlanPayload;
  isOptimized: boolean;
  isCurrent: boolean;
  optimizerHelps: boolean;
  overtime: boolean;
  /** More work and driving on the day than the working day is long. */
  overCapacity: boolean;
  dayMinutes: number;
  committedMinutes: number;
  overflowMinutes: number;
  workdayEndLabel: string;
  manualDeltaMiles: number;
  manualDeltaMinutes: number;
}) {
  /**
   * `fix` is the setting the note is ABOUT, on this same page.
   *
   * "Everything fits inside your working hours, finishing by 6:00 PM" is a
   * statement about two numbers the contractor can change, and the panel that
   * changes them is a few hundred pixels further down this very screen —
   * unlinked, so the way to act on the sentence was to know it was there.
   */
  const notes: Array<{ tone: 'good' | 'info' | 'warn'; text: string; fix?: { href: string; label: string } }> = [];

  if (isOptimized) {
    notes.push({ tone: 'good', text: 'This is the shortest driving order we could find for these stops.' });
  } else if (optimizerHelps) {
    notes.push({ tone: 'info', text: 'A shorter order exists — use the optimized order above to take it.' });
  } else if (!isCurrent) {
    notes.push({
      tone: manualDeltaMiles > 0 ? 'info' : 'good',
      text:
        manualDeltaMiles > 0
          ? `Your order drives ${manualDeltaMiles} mi (${minutesLabel(manualDeltaMinutes)}) more than the optimized one.`
          : 'Your order drives no further than the optimized one.',
    });
  }

  notes.push({
    tone: payload.anchorSource ? 'info' : 'warn',
    text:
      payload.anchorSource === 'crew'
        ? `The day starts and ends at ${payload.anchorCrewName ?? 'this crew member'}'s own address, not the shop.`
        : payload.anchorSource === 'business'
          ? 'The day starts and ends at your business address.'
          : 'No mapped business address, so the route is measured stop to stop — the drive out and back isn’t counted.',
  });

  const errandCount = payload.routeStops.length;
  if (errandCount > 0) {
    notes.push({
      tone: 'info',
      text: `${errandCount} supply ${errandCount === 1 ? 'stop is' : 'stops are'} routed into this day alongside the jobs.`,
    });
  }

  if (payload.lockedCount > 0) {
    notes.push({
      tone: 'good',
      text: `${payload.lockedCount} confirmed ${payload.lockedCount === 1 ? 'appointment keeps its' : 'appointments keep their'} agreed time and can't be dragged.`,
    });
  }

  notes.push({
    tone: overtime ? 'warn' : 'good',
    text: overCapacity
      ? `This day holds ${minutesLabel(dayMinutes)} and has ${minutesLabel(committedMinutes)} of work and driving on it. Multi-day jobs each take a full day's share, so two of them on one day will always overrun.`
      : overtime
        ? `The day runs ${minutesLabel(overflowMinutes)} past your ${workdayEndLabel} finish.`
        : `Everything fits inside your working hours, finishing by ${workdayEndLabel}.`,
    // All three sentences are about the working day and the daily capacity, and
    // both are set in the panel below.
    fix: { href: '#working-hours', label: 'Working hours' },
  });

  if (payload.filteredOutCount > 0) {
    notes.push({
      tone: 'info',
      text: `${payload.filteredOutCount} ${payload.filteredOutCount === 1 ? 'job is' : 'jobs are'} assigned to other crew and left out of this route.`,
    });
  }

  return (
    <section className="panel plan-panel plan-insights">
      <h3>Route insights</h3>
      <ul>
        {notes.map((note, index) => (
          <li key={index} className={note.tone}>
            <span className="plan-insight-mark" aria-hidden="true">
              {note.tone === 'good' ? '✓' : note.tone === 'warn' ? '!' : 'i'}
            </span>
            {note.text}
            {note.fix ? (
              <>
                {' '}
                <a className="plan-insight-fix" href={note.fix.href}>
                  {note.fix.label}
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// A 1×1 transparent image used to suppress the browser's floating drag ghost.
// The list itself rearranges live now, so the ghost is a second, contradictory
// copy of the same card sliding over the rows underneath it.
let ghostImage: HTMLImageElement | null = null;
function emptyDragImage(): HTMLImageElement | null {
  if (typeof window === 'undefined') return null;
  if (!ghostImage) {
    ghostImage = new window.Image();
    ghostImage.src =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }
  return ghostImage.complete ? ghostImage : null;
}

function StopRow({
  entry,
  index,
  total,
  draggable,
  isDragging,
  dragActive,
  blocksDrag,
  pinned,
  preferredLast,
  actuallyLast,
  anchoredToHome,
  legColor: legColour,
  routeStop,
  dateKey,
  crewId,
  onMyWay,
  startsAfterDayEnd,
  menuOpen,
  onMenu,
  onTogglePin,
  onTogglePreferredLast,
  onMoveToEnd,
  onOfferMove,
  offerPending,
  onNudge,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  entry: PlannedStop;
  index: number;
  total: number;
  draggable: boolean;
  isDragging: boolean;
  dragActive: boolean;
  blocksDrag: boolean;
  pinned: boolean;
  /** The contractor wants to end the day here. A preference, not a lock. */
  preferredLast: boolean;
  /** Whether it IS last right now — which, being a preference, it may not be. */
  actuallyLast: boolean;
  anchoredToHome: boolean;
  /** Matches the leg drawn on the map, so a row and its line are the same color. */
  legColor: string;
  // Set when this row is a supply stop rather than a job.
  routeStop: RouteStop | null;
  dateKey: string;
  crewId: string | null;
  /** Null on a supply stop, which has no customer to tell. */
  onMyWay: StopArrivalProps | null;
  /** The plan does not reach this stop until after the working day has ended. */
  startsAfterDayEnd: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onTogglePin: () => void;
  onTogglePreferredLast: () => void;
  onMoveToEnd: () => void;
  /** Null when this stop can't be offered a move — a supply run, or no phone. */
  onOfferMove: (() => void) | null;
  /** An ask is already out on this stop and we are waiting on the answer. */
  offerPending: boolean;
  onNudge: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (pointerY: number, rect: DOMRect) => void;
  onDrop: () => void;
}) {
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  // One per stop, and the panel is portaled to the end of <body>, so the id is
  // the only thing tying the two together.
  const stopMenuId = useId();
  const stop = entry.stop;
  // A locked stop shows the time the customer agreed to; arrivalMinutes is when
  // we'd realistically get there, and the two disagreeing is the "tight" warning.
  const arrival = stop.locked && entry.committedMinutes != null ? entry.committedMinutes : entry.arrivalMinutes;
  const finish = arrival + stop.visitMinutes;
  const target = stop.address || (stop.lat != null && stop.lng != null) ? navTarget(stop) : null;

  const classes = [
    'plan-stop',
    isDragging ? 'is-lifted' : '',
    dragActive && !isDragging ? 'is-shifting' : '',
    blocksDrag ? 'is-blocking' : '',
    stop.locked ? 'is-locked' : '',
    pinned ? 'is-pinned' : '',
    preferredLast && !actuallyLast ? 'is-adrift' : '',
    routeStop ? 'is-errand' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={classes}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', stop.id);
        const ghost = emptyDragImage();
        if (ghost) event.dataTransfer.setDragImage(ghost, 0, 0);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!dragActive) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        onDragOver(event.clientY, event.currentTarget.getBoundingClientRect());
      }}
      onDrop={(event) => {
        if (!dragActive) return;
        event.preventDefault();
        onDrop();
      }}
    >
      <span className="plan-stop-num" aria-hidden="true">{index + 1}</span>

      <div className="plan-stop-who">
        {routeStop ? (
          <span className="plan-stop-name is-errand">
            <ServiceIcon name={KIND_GLYPH[routeStop.kind]} />
            {stop.label}
          </span>
        ) : (
          <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-name">{stop.label}</Link>
        )}
        <p className="plan-stop-addr">{stop.address || 'No address on file'}</p>
      </div>

      <div className="plan-stop-when">
        <span className="plan-stop-time">
          <small>Arrive</small>
          <strong>{formatClockLabel(arrival)}</strong>
        </span>
        <span className="plan-stop-time">
          <small>Finish around</small>
          <strong>{formatClockLabel(finish)}</strong>
        </span>
      </div>

      <div className="plan-stop-flags">
        <span className="plan-stop-drive">
          {/* The same color as this leg on the map — the numbers already pair
              the two, this pairs the drive between them. */}
          {index === 0 && !anchoredToHome ? null : (
            <i className="plan-leg-key" style={{ background: legColour }} aria-hidden="true" />
          )}
          {index === 0 && !anchoredToHome
            ? 'First stop of the day'
            : `${entry.legMiles} mi · ${minutesLabel(entry.legMinutes)} drive`}
        </span>
        {routeStop ? (
          <span className="plan-badge errand" title="Not a job — a stop on the way. It costs time and miles but bills nobody.">
            {KIND_LABEL[routeStop.kind]}
          </span>
        ) : null}
        {/* A job the contractor is on site for part of, on several days. Without
            this the row shows a four-hour visit for work they know is a two-day
            job, which reads as the app having halved it. */}
        {stop.span ? (
          <span
            className="plan-badge span"
            title={
              stop.span.totalHours
                ? `${stop.span.totalHours} hrs over ${stop.span.of} days — about ${formatHours(stop.span.totalHours / stop.span.of)} hrs on site today. Change the dates or the hours on the job.`
                : `Runs across ${stop.span.of} days. Add estimated hours to the job and this will say how much of each day that is.`
            }
          >
            Day {stop.span.day} of {stop.span.of}
            {stop.span.totalHours ? ` · ~${formatHours(stop.span.totalHours / stop.span.of)} hrs today` : ''}
          </span>
        ) : null}
        {/* THE NUMBER THIS STOP WAS PLANNED ON IS NOT THIS JOB'S.
            It has no estimated hours, so the router used the account default —
            it cannot order a day around a stop of unknown length. That is
            defensible; doing it silently was not. The same job counts as ZERO
            hours on the Schedule page's capacity, which is how a day came to
            read "0 of 136 hours" while the route below it had already spent
            two. A link, not a badge, because the thing that settles it is one
            field on the job. */}
        {stop.assumedVisit ? (
          <Link
            href={`/dashboard/jobs/${stop.id}`}
            className="plan-badge assumed"
            title={`This job has no estimated hours, so the route assumed your default of ${minutesLabel(stop.visitMinutes)}. It counts as zero hours against the day's capacity until you set one. Open the job to add it.`}
          >
            Assumed: {minutesLabel(stop.visitMinutes)}
          </Link>
        ) : null}
        {/* A preference, so it can be wrong — and when it is, saying so is the
            whole value. Silently dragging it back would be the same as not
            letting the day change, which days do. */}
        {preferredLast ? (
          actuallyLast ? (
            <span className="plan-badge last" title="Where you want to end the day. The optimizer keeps it here, but you can still put something after it.">
              Last stop
            </span>
          ) : (
            <button
              type="button"
              className="plan-badge last is-adrift"
              onClick={onMoveToEnd}
              title="You wanted to finish here, but something is scheduled after it now. Click to move it back to the end."
            >
              Meant to be last — move it back
            </button>
          )
        ) : null}
        {stop.locked ? (
          <span
            className="plan-badge locked"
            title="The customer agreed to this time, so it keeps it wherever it lands in the day — and it can't be dragged."
          >
            Customer-confirmed
          </span>
        ) : pinned ? (
          <span className="plan-badge pinned" title="You locked this stop to this position. Nothing can move past it.">
            Locked here
          </span>
        ) : (
          <span className="plan-badge flexible" title="This stop can be dragged anywhere in the day.">Flexible</span>
        )}
        {/* Not "finishes late" — that is the whole day's overrun. This one
            cannot be STARTED, which is a different conversation and the one
            that ends with moving a job rather than working an evening.

            AND IT IS THE BUTTON, because a label is not a next step. The row
            that says the day cannot hold it is exactly where somebody wants to
            act on it, and the action was three taps away behind ⋮ — on the one
            badge on the page whose whole content is "something has to move".
            Same panel the menu item opens; nothing new is being offered here,
            it is being offered WHERE the problem is stated. */}
        {startsAfterDayEnd ? (
          onOfferMove && !offerPending ? (
            <button
              type="button"
              className="plan-badge warn is-action"
              onClick={onOfferMove}
              title="This stop is still being worked after your day ends. Ask the customer to take another day — they see the new dates and reply, and nothing moves until they do."
            >
              Cannot be finished today — ask them to move
            </button>
          ) : (
            <span
              className="plan-badge warn"
              title={
                offerPending
                  ? 'This stop is still being worked after your day ends. You have asked them to move — nothing changes until they reply.'
                  : 'This stop is still being worked after your day ends. Move a job to another day, or shorten one — starting earlier will not fit it.'
              }
            >
              {offerPending ? 'Cannot be finished today — waiting on their reply' : 'Cannot be finished today'}
            </span>
          )
        ) : null}
        {entry.late ? (
          <span className="plan-badge warn">Tight — you&apos;d arrive nearer {formatTimeLabel(entry.arrivalMinutes)}</span>
        ) : null}
        {entry.waitMinutes >= 15 ? (
          <span className="plan-badge">{minutesLabel(entry.waitMinutes)} gap before this</span>
        ) : null}
      </div>

      <div className="plan-stop-actions">
        {/* First in the row because it is first in the day: you tell them you
            are coming, then you drive. */}
        {onMyWay ? <StopArrival {...onMyWay} /> : null}
        {target ? (
          <a
            className="btn secondary"
            href={`https://maps.google.com/?q=${encodeURIComponent(target)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Directions
          </a>
        ) : null}
        <button
          ref={menuButtonRef}
          type="button"
          className="plan-stop-menu-btn"
          aria-label={`More actions for ${stop.label}`}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? stopMenuId : undefined}
          onClick={() => onMenu(!menuOpen)}
        >
          ⋮
        </button>
        {/* group, not menu: these are links and submit buttons, and role="menu"
            is a promise of menuitem children and arrow-key movement that none
            of them keep. The name is the part that was missing. */}
        <FloatingPanel
          id={stopMenuId}
          role="group"
          label={`Actions for ${stop.label}`}
          anchorRef={menuButtonRef}
          open={menuOpen}
          onClose={() => onMenu(false)}
          className="plan-stop-menu"
          width={MENU_WIDTH}
        >
          {routeStop ? (
            // A supply stop has no job page to open and nothing to invoice. The
            // only thing to do with one is take it off the day.
            <form action={deleteRouteStopAction}>
              <input type="hidden" name="dateKey" value={dateKey} />
              <input type="hidden" name="crewId" value={crewId ?? ''} />
              <input type="hidden" name="stopId" value={routeStop.id} />
              <button type="submit" className="plan-stop-menu-item danger">Remove this stop</button>
            </form>
          ) : (
            <>
              <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-menu-item" onClick={() => onMenu(false)}>
                View job
              </Link>
              <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-menu-item" onClick={() => onMenu(false)}>
                Change arrival time
              </Link>
              {/* Was a bare link to the job page, which is where you move a job
                  when the customer has already agreed. This is the other case,
                  and the common one on this screen: the day is overloaded, this
                  stop is the one dragging it sideways, and the customer has no
                  reason to move unless you give them one. */}
              {onOfferMove ? (
                <button
                  type="button"
                  className="plan-stop-menu-item"
                  onClick={() => {
                    onMenu(false);
                    onOfferMove();
                  }}
                >
                  {offerPending ? 'Move offer — waiting on reply' : 'Ask them to move day…'}
                </button>
              ) : null}
              <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-menu-item" onClick={() => onMenu(false)}>
                Move to another day
              </Link>
            </>
          )}
          {!stop.locked ? (
            <button type="button" className="plan-stop-menu-item" onClick={onTogglePin}>
              {pinned ? 'Unlock this stop' : 'Lock this stop here'}
            </button>
          ) : null}
          {/* Offered on a customer-confirmed stop too: a 4 PM appointment is
              often exactly the one you mean to end on, and saying so costs
              nothing — this never moves a confirmed time, only the order. */}
          <button type="button" className="plan-stop-menu-item" onClick={onTogglePreferredLast}>
            {preferredLast ? 'Not my last stop' : 'Make this my last stop'}
          </button>
          {target ? (
            <a
              className="plan-stop-menu-item"
              href={`https://maps.google.com/?q=${encodeURIComponent(target)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onMenu(false)}
            >
              Directions
            </a>
          ) : null}
          {/* The drag handle is a mouse affordance; these are the same move for
              anyone on a keyboard or a screen reader. */}
          {draggable && total > 1 ? (
            <div className="plan-stop-menu-nudge">
              <button type="button" onClick={() => { onNudge(-1); onMenu(false); }} disabled={index === 0}>
                ↑ Move earlier
              </button>
              <button type="button" onClick={() => { onNudge(1); onMenu(false); }} disabled={index === total - 1}>
                ↓ Move later
              </button>
            </div>
          ) : null}
        </FloatingPanel>
      </div>

      {draggable ? <span className="plan-stop-grip" aria-hidden="true" title="Drag to reorder">⠿</span> : null}
    </li>
  );
}

// Re-exported so the page can render the same time format in its header.
export { formatTimeMinutes };
