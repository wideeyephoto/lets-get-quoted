'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import FloatingPanel from '@/components/floating-panel';
import SaveButton from '@/components/save-button';
import RouteMap, { type MapStop } from './RouteMap';
import { applyDayPlanAction } from './actions';
import { formatTimeLabel, formatTimeMinutes, parseTimeMinutes, type PlannedStop } from '@/lib/route-plan';
import {
  costOrder,
  fullRouteUrl,
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
};

const MENU_WIDTH = 232;

export default function DayPlanner({ payload, mapsApiKey }: Props) {
  const byId = useMemo(() => new Map(payload.stops.map((stop) => [stop.id, stop])), [payload.stops]);

  // The calendar's own order is the starting point. Showing the optimizer's order
  // by default would mean the page never matches the day the contractor actually
  // has — and "apply" would be the only way to see their real schedule.
  const [order, setOrder] = useState<string[]>(payload.currentOrder);
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
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [overtimeDismissed, setOvertimeDismissed] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);

  const plan = useMemo(() => costOrder(payload, order), [payload, order]);
  const optimized = useMemo(() => costOrder(payload, payload.optimizedOrder), [payload]);
  const current = useMemo(() => costOrder(payload, payload.currentOrder), [payload]);

  const isOptimized = sameOrder(order, payload.optimizedOrder);
  const isCurrent = sameOrder(order, payload.currentOrder);
  const optimizerHelps = !sameOrder(payload.currentOrder, payload.optimizedOrder) && optimized.miles < current.miles - 0.05;

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
    if (sameOrder(order, payload.optimizedOrder)) return;
    commit(payload.optimizedOrder);
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
  const workdayEndLabel = formatTimeLabel(parseTimeMinutes(payload.workdayEnd) ?? 17 * 60);
  const manualDeltaMiles = Math.round((plan.miles - optimized.miles) * 10) / 10;
  const manualDeltaMinutes = Math.round(plan.minutes - optimized.minutes);

  return (
    <>
      <section className="panel plan-panel plan-route-panel">
        <div className="plan-route-grid">
          <RouteMap stops={mapStops} homeBase={payload.homeBase} apiKey={mapsApiKey} deferRoute={dragId !== null} />

          <div className="plan-route-side">
            <RouteStatus
              isOptimized={isOptimized}
              isCurrent={isCurrent}
              optimizerHelps={optimizerHelps}
              stopCount={plan.planned.length}
              savedMiles={Math.round((current.miles - optimized.miles) * 10) / 10}
              savedMinutes={Math.round(current.minutes - optimized.minutes)}
              driveTimeSource={payload.driveTimeSource}
              driveTimeSkipped={payload.driveTimeSkipped}
              onApplyOptimized={() => commit(payload.optimizedOrder)}
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
                <dd>{formatTimeLabel(plan.finishMinutes)}</dd>
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
              <strong>Schedule runs {minutesLabel(plan.overflowMinutes)} past your {workdayEndLabel} finish</strong>
              <p>The last stop is expected to finish around {formatTimeLabel(plan.finishMinutes)}.</p>
            </div>
          </div>
          <div className="plan-overtime-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Adjust the day
            </button>
            {plan.planned.length > 0 ? (
              <Link href={`/dashboard/jobs/${plan.planned[plan.planned.length - 1].stop.id}`} className="btn secondary">
                Move the last job
              </Link>
            ) : null}
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
                anchoredToHome={payload.anchor === 'home_base'}
                menuOpen={menuFor === entry.stop.id}
                onMenu={(open) => setMenuFor(open ? entry.stop.id : null)}
                onTogglePin={() => togglePin(entry.stop.id)}
                onNudge={(direction) => nudge(index, direction)}
                onDragStart={() => handleDragStart(entry.stop.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(pointerY, rect) => handleDragOver(entry.stop.id, pointerY, rect)}
                onDrop={handleDrop}
              />
            ))}
          </ol>
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
                  {formatTimeLabel(plan.finishMinutes)}
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
              {plan.planned[0] ? (
                <li><Link href={`/dashboard/jobs/${plan.planned[0].stop.id}`}>Change the first arrival time</Link></li>
              ) : null}
              {plan.planned[plan.planned.length - 1] ? (
                <li>
                  <Link href={`/dashboard/jobs/${plan.planned[plan.planned.length - 1].stop.id}`}>
                    Move the last job to another day
                  </Link>
                </li>
              ) : null}
              <li><Link href="/dashboard/settings#schedule">Change your working hours</Link></li>
            </ul>
          </section>
        </aside>
      </div>

      {pendingChanges.length > 0 || history.length > 0 ? (
        <form action={applyDayPlanAction} className="plan-savebar">
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
                : `${pendingChanges.length} arrival time${pendingChanges.length === 1 ? '' : 's'} will change`}
            </strong>
            <span>
              {history.length > 0 && manualDeltaMiles !== 0
                ? `Your order drives ${manualDeltaMiles > 0 ? '+' : ''}${manualDeltaMiles} mi (${manualDeltaMinutes > 0 ? '+' : ''}${minutesLabel(manualDeltaMinutes)}) versus the optimized one.`
                : 'Nothing on your calendar has changed yet.'}
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

function RouteStatus({
  isOptimized,
  isCurrent,
  optimizerHelps,
  stopCount,
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
            ? 'Nothing to optimize'
            : isOptimized
              ? 'Route optimized'
              : optimizerHelps
                ? `Better route found — saves ${savedMiles > 0 ? `${savedMiles} mi` : ''}${savedMiles > 0 && savedMinutes > 0 ? ' and ' : ''}${savedMinutes > 0 ? minutesLabel(savedMinutes) : ''}`
                : isCurrent
                  ? 'Your order, kept as it is'
                  : 'Your order'}
        </strong>
        <p>
          {stopCount < 2
            ? 'A single stop has no order to improve.'
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
  overflowMinutes: number;
  workdayEndLabel: string;
  manualDeltaMiles: number;
  manualDeltaMinutes: number;
}) {
  const notes: Array<{ tone: 'good' | 'info' | 'warn'; text: string }> = [];

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
    tone: 'info',
    text:
      payload.anchor === 'home_base'
        ? 'The day starts and ends at your business address.'
        : 'No mapped business address yet, so the route is measured stop to stop. Add one in Settings → Business to include the drive out and back.',
  });

  if (payload.lockedCount > 0) {
    notes.push({
      tone: 'good',
      text: `${payload.lockedCount} confirmed ${payload.lockedCount === 1 ? 'appointment keeps its' : 'appointments keep their'} agreed time and can't be dragged.`,
    });
  }

  notes.push({
    tone: overtime ? 'warn' : 'good',
    text: overtime
      ? `The day runs ${minutesLabel(overflowMinutes)} past your ${workdayEndLabel} finish.`
      : `Everything fits inside your working hours, finishing by ${workdayEndLabel}.`,
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
  anchoredToHome,
  menuOpen,
  onMenu,
  onTogglePin,
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
  anchoredToHome: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onTogglePin: () => void;
  onNudge: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (pointerY: number, rect: DOMRect) => void;
  onDrop: () => void;
}) {
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
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
        <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-name">{stop.label}</Link>
        <p className="plan-stop-addr">{stop.address || 'No address on file'}</p>
      </div>

      <div className="plan-stop-when">
        <span className="plan-stop-time">
          <small>Arrive</small>
          <strong>{formatTimeLabel(arrival)}</strong>
        </span>
        <span className="plan-stop-time">
          <small>Finish around</small>
          <strong>{formatTimeLabel(finish)}</strong>
        </span>
      </div>

      <div className="plan-stop-flags">
        <span className="plan-stop-drive">
          {index === 0 && !anchoredToHome
            ? 'First stop of the day'
            : `${entry.legMiles} mi · ${minutesLabel(entry.legMinutes)} drive`}
        </span>
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
        {entry.late ? (
          <span className="plan-badge warn">Tight — you&apos;d arrive nearer {formatTimeLabel(entry.arrivalMinutes)}</span>
        ) : null}
        {entry.waitMinutes >= 15 ? (
          <span className="plan-badge">{minutesLabel(entry.waitMinutes)} gap before this</span>
        ) : null}
      </div>

      <div className="plan-stop-actions">
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
          onClick={() => onMenu(!menuOpen)}
        >
          ⋮
        </button>
        <FloatingPanel anchorRef={menuButtonRef} open={menuOpen} onClose={() => onMenu(false)} className="plan-stop-menu" width={MENU_WIDTH}>
          <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-menu-item" onClick={() => onMenu(false)}>
            View job
          </Link>
          <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-menu-item" onClick={() => onMenu(false)}>
            Change arrival time
          </Link>
          <Link href={`/dashboard/jobs/${stop.id}`} className="plan-stop-menu-item" onClick={() => onMenu(false)}>
            Move to another day
          </Link>
          {!stop.locked ? (
            <button type="button" className="plan-stop-menu-item" onClick={onTogglePin}>
              {pinned ? 'Unlock this stop' : 'Lock this stop here'}
            </button>
          ) : null}
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
