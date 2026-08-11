'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { markerShape, type Forecast } from '@/lib/cash-forecast';
import {
  axisMoney, chartHeight, chartInset, chartPadding, flipInside, fullMoney,
  groupForIndex, groupMarkers, touchSize, MOBILE_MAX, resolveChartWidth, xAxisTicks,
} from '@/lib/cash-chart-layout';

// The projected bank balance, drawn.
//
// Real pixel coordinates rather than a viewBox stretched with
// preserveAspectRatio: markers and axis labels have to keep their shape at every
// width, and a stretched viewBox turns a diamond into a lozenge and the type
// into something nobody asked for.
//
// Two things on this chart are draggable — the safety buffer and today's
// balance — and both are also real sliders to a keyboard: role="slider" with
// arrow-key handling, because a number you can only reach with a mouse is a
// number some people can't set at all.

export type LineKey = 'confirmed' | 'worst' | 'incoming' | 'outgoing' | 'credit' | 'required';

type Props = {
  forecast: Forecast;
  buffer: number;
  creditLine: number;
  lines: Record<LineKey, boolean>;
  lateDays: number;
  onBufferChange: (value: number) => void;
  onBalanceChange: (value: number) => void;
  selected: number | null;
  onSelect: (index: number | null) => void;
};

// Padding and inset are width-dependent now and live in lib/cash-chart-layout,
// where they can be tested as arithmetic. The fixed 76px gutter this replaced
// was fine on a 760px chart and left under a third of a 320px phone for the plot
// itself.

const money = fullMoney;

function shortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** A domain that lands on round numbers, so the gridlines read as money. */
function niceDomain(min: number, max: number, tickCount = 6): { lo: number; hi: number; ticks: number[] } {
  let low = Math.min(min, max);
  let high = Math.max(min, max);
  if (high - low < 1) {
    high = low + 1;
    low -= 1;
  }
  const raw = (high - low) / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  // Deliberately finer than the usual 1/2/5 ladder. Rounding a $13k range up to
  // a $5,000 step gave four gridlines and a dead band of empty chart under the
  // zero line, which reads as "you're about to go negative" when nothing is.
  const step = (normalized <= 1 ? 1 : normalized <= 1.5 ? 1.5 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10) * magnitude;
  low = Math.floor(low / step) * step;
  high = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(Math.round(value * 100) / 100);
  return { lo: low, hi: high, ticks };
}

export default function CashChart({
  forecast,
  buffer,
  creditLine,
  lines,
  lateDays,
  onBufferChange,
  onBalanceChange,
  selected,
  onSelect,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<'buffer' | 'balance' | null>(null);
  // 320 rather than 760: the first paint happens before the observer has
  // measured anything, and starting at a desktop width means a phone renders one
  // frame of a chart wider than its own screen. Starting narrow is the safe
  // guess — it grows to fit, it never overflows on the way.
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    // resolveChartWidth floors it only far enough to keep the arithmetic safe on
    // a zero-width container. The floor deliberately sits BELOW the ~198px this
    // chart actually gets at a 320px viewport — a higher one makes the SVG wider
    // than its own box, which the wrap's overflow:hidden then crops.
    const apply = (next: number) => setWidth(resolveChartWidth(next));
    apply(element.clientWidth || 320);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) apply(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isPhone = width < MOBILE_MAX;
  const PAD = chartPadding(width);
  const INSET = chartInset(width);
  const height = chartHeight(width);
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = Math.max(10, height - PAD.top - PAD.bottom);
  const days = forecast.days;
  const lastIndex = Math.max(1, days.length - 1);

  const domain = useMemo(() => {
    const values: number[] = [0, buffer];
    for (const day of days) {
      values.push(day.projected);
      if (lines.confirmed) values.push(day.confirmedOnly);
      if (lines.worst) values.push(day.worstCase);
      if (lines.incoming) values.push(day.cumulativeIn);
      if (lines.outgoing) values.push(day.cumulativeOut);
      if (lines.required) values.push(day.minimumRequired);
    }
    if (lines.credit && creditLine > 0) values.push(-creditLine);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, (max - min) * 0.08);
    // Headroom above, but never padding BELOW zero when nothing goes below zero.
    // An empty red band under the line says "nearly overdrawn" about a month
    // that never is.
    return niceDomain(min >= 0 ? 0 : min - pad, max + pad);
  }, [days, buffer, creditLine, lines]);

  const plotW = Math.max(10, innerW - INSET * 2);
  const padLeft = PAD.left;
  const padTop = PAD.top;
  const xFor = useCallback((index: number) => padLeft + INSET + (index / lastIndex) * plotW, [padLeft, INSET, plotW, lastIndex]);
  const yFor = useCallback(
    (value: number) => padTop + (1 - (value - domain.lo) / (domain.hi - domain.lo || 1)) * innerH,
    [padTop, domain, innerH],
  );

  const pathFor = useCallback(
    (pick: (day: (typeof days)[number]) => number) =>
      days.map((day, index) => `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(1)},${yFor(pick(day)).toFixed(1)}`).join(' '),
    [days, xFor, yFor],
  );

  // -- Dragging the two horizontal handles ------------------------------------

  const valueAtClientY = useCallback(
    (clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const y = clientY - rect.top;
      const raw = domain.hi - ((y - padTop) / (innerH || 1)) * (domain.hi - domain.lo);
      // Snapped to $100: a buffer of $9,873 was never a decision, it was a pixel.
      return Math.max(0, Math.round(raw / 100) * 100);
    },
    [padTop, domain, innerH],
  );

  const startDrag = (which: 'buffer' | 'balance') => (event: React.PointerEvent) => {
    event.preventDefault();
    dragRef.current = which;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  // Day 0 already has its own events applied, so the dot sits at
  // start + today's movements. Dragging it to a point on screen means "make the
  // balance END today at this" — without backing that out, the dot slides away
  // from the pointer by exactly today's net.
  const day0Delta = days[0] ? days[0].incoming - days[0].outgoing : 0;

  const moveDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    const value = valueAtClientY(event.clientY);
    if (dragRef.current === 'buffer') onBufferChange(value);
    else onBalanceChange(Math.max(0, Math.round((value - day0Delta) / 100) * 100));
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    const target = event.currentTarget as Element;
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };

  const nudge = (current: number, apply: (value: number) => void) => (event: React.KeyboardEvent) => {
    const big = event.shiftKey ? 10 : 1;
    const step = 100 * big;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      apply(current + step);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      apply(Math.max(0, current - step));
    } else if (event.key === 'Home') {
      apply(0);
    } else {
      return;
    }
    event.preventDefault();
  };

  // -- Hover / selection ------------------------------------------------------

  const indexAtClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = (clientX - rect.left - PAD.left - INSET) / (plotW || 1);
    return Math.max(0, Math.min(lastIndex, Math.round(ratio * lastIndex)));
  };

  const active = selected ?? hover;
  const activeDay = active === null ? null : days[active];

  /**
   * The markers actually drawn.
   *
   * Days whose markers would land closer together than a touch target are folded
   * into one that carries the count. This used to be handled by shrinking the
   * target instead — scaled down to as little as 6px — which kept every marker
   * on screen and made most of them impossible to hit: at 90 days on a phone
   * they sit 2.4px apart, so the day you tapped was whichever rendered last.
   *
   * Presentational only. Every day keeps its own projection and its own events;
   * the group just carries the list so the panel below can show all of them.
   */
  // The grouping gap and the hit target are the same number on purpose: two
  // markers closer together than a thumb cannot both be hit, so they become one.
  const touch = touchSize(width);
  const groups = useMemo(() => groupMarkers(days, xFor, touch), [days, xFor, touch]);
  // Two different things, and conflating them was a bug. `activeGroup` follows
  // hover-or-selection and drives the panel; `selectedGroup` follows selection
  // ALONE and drives the ring. Because focusing a marker sets hover, a ring keyed
  // off `active` stayed lit after Escape had genuinely cleared the selection —
  // the chart said something was chosen when nothing was.
  const activeGroup = groupForIndex(groups, active);
  const selectedGroup = groupForIndex(groups, selected);

  // A real target now, not a scaled-down one — the grouping above is what makes
  // that affordable. 44 under a thumb, 32 under a pointer.
  const hitRadius = touch / 2;

  // -- Markers from the keyboard ----------------------------------------------
  //
  // Roving tabindex: the marker layer is ONE tab stop, and arrow keys move
  // between markers inside it. The markers used to be aria-hidden and
  // unreachable, on the reasoning that thirty of them would be thirty tab stops
  // between the chart and the next control — which was right about the problem
  // and wrong about the fix. This keeps the single stop and makes the chart
  // operable; the transaction list below still works exactly as it did.
  const markerRefs = useRef<(SVGGElement | null)[]>([]);
  const [focusOrder, setFocusOrder] = useState(0);

  // Keep the roving stop pointing at something real when the forecast changes
  // under it — a filter that removes days must not leave the tab stop on a
  // marker that no longer exists, which would drop the keyboard user out of the
  // chart entirely.
  useEffect(() => {
    setFocusOrder((current) => (current < groups.length ? current : 0));
  }, [groups.length]);

  const focusMarker = (order: number) => {
    setFocusOrder(order);
    markerRefs.current[order]?.focus();
  };

  const onMarkerKey = (event: React.KeyboardEvent, order: number, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      focusMarker(Math.min(groups.length - 1, order + 1));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      focusMarker(Math.max(0, order - 1));
    } else if (event.key === 'Home') {
      focusMarker(0);
    } else if (event.key === 'End') {
      focusMarker(groups.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      onSelect(selected === index ? null : index);
    } else if (event.key === 'Escape') {
      onSelect(null);
    } else {
      return;
    }
    // Only for keys we handled: swallowing everything would take Tab with it and
    // trap the focus inside the chart.
    event.preventDefault();
    event.stopPropagation();
  };

  const bufferY = yFor(buffer);
  const zeroY = yFor(0);
  const startY = yFor(days[0]?.projected ?? 0);
  const startBalance = days[0] ? days[0].projected - day0Delta : 0;

  return (
    <div className="cash-chart-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="cash-chart"
        width={width}
        height={height}
        /* group, not img: role="img" makes everything inside presentational,
           which would silently hide the two sliders living in here. */
        role="group"
        aria-label={`Projected bank balance over ${days.length} days. Lowest ${money(forecast.lowest.balance)} on ${shortDate(
          forecast.lowest.dateKey,
        )}. Ending ${money(forecast.ending)}.`}
      >
        <defs>
          <clipPath id="cash-plot">
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* Bands, not a gradient: "above your buffer", "into your buffer" and
            "overdrawn" are three different situations, and a smooth fade would
            blur the two lines that matter into a mood. */}
        <g clipPath="url(#cash-plot)">
          <rect className="cash-zone ok" x={PAD.left} y={PAD.top} width={innerW} height={Math.max(0, bufferY - PAD.top)} />
          {buffer > 0 ? (
            <rect className="cash-zone caution" x={PAD.left} y={bufferY} width={innerW} height={Math.max(0, zeroY - bufferY)} />
          ) : null}
          <rect className="cash-zone danger" x={PAD.left} y={zeroY} width={innerW} height={Math.max(0, PAD.top + innerH - zeroY)} />
        </g>

        {/* The hover/click surface goes HERE, under everything interactive.
            Later elements paint on top and take their own pointer events, so
            markers and handles stay clickable; the lines and gridlines above it
            are pointer-events:none so they don't eat the hover. */}
        <rect
          className="cash-hover-surface"
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          onPointerMove={(event) => {
            if (dragRef.current) return;
            setHover(indexAtClientX(event.clientX));
          }}
          onPointerLeave={() => setHover(null)}
          onClick={(event) => {
            const index = indexAtClientX(event.clientX);
            onSelect(selected === index ? null : index);
          }}
        />

        {/* Gridlines + y axis */}
        <g className="cash-grid">
          {domain.ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={yFor(tick)} y2={yFor(tick)} />
              {/* Clear of the balance handle, which lives in the gutter at
                  PAD.left - 8. Tighter on a phone, where the whole gutter is
                  54px and the label is abbreviated to fit it. */}
              <text x={PAD.left - (isPhone ? 18 : 24)} y={yFor(tick)} dy="0.32em" textAnchor="end">
                {axisMoney(tick, width)}
              </text>
            </g>
          ))}
        </g>

        {/* x axis. Which days get a label is decided in lib/cash-chart-layout —
            three on a phone, seven on a desktop, with the first and last always
            kept and anything that would overprint the last one dropped. */}
        <g className="cash-axis-x">
          {xAxisTicks(days.length, width).map((index) => {
            const day = days[index];
            if (!day) return null;
            const isLast = index === lastIndex;
            return (
              <text
                key={day.dateKey}
                x={xFor(index)}
                y={PAD.top + innerH + 20}
                textAnchor={index === 0 ? 'start' : isLast ? 'end' : 'middle'}
              >
                {shortDate(day.dateKey)}
              </text>
            );
          })}
        </g>

        <g clipPath="url(#cash-plot)">
          {/* Zero first, so nothing hides it. Below this line is somebody else's money. */}
          <line className="cash-line-zero" x1={PAD.left} x2={PAD.left + innerW} y1={zeroY} y2={zeroY} />

          {lines.credit && creditLine > 0 ? (
            <line className="cash-line-credit" x1={PAD.left} x2={PAD.left + innerW} y1={yFor(-creditLine)} y2={yFor(-creditLine)} />
          ) : null}

          {lines.incoming ? <path className="cash-line-in" d={pathFor((day) => day.cumulativeIn)} /> : null}
          {lines.outgoing ? <path className="cash-line-out" d={pathFor((day) => day.cumulativeOut)} /> : null}
          {lines.required ? <path className="cash-line-required" d={pathFor((day) => day.minimumRequired)} /> : null}
          {lines.worst ? <path className="cash-line-worst" d={pathFor((day) => day.worstCase)} /> : null}
          {lines.confirmed ? <path className="cash-line-confirmed" d={pathFor((day) => day.confirmedOnly)} /> : null}
          <path className="cash-line-projected" d={pathFor((day) => day.projected)} />
        </g>

        {/* The buffer, draggable. Drawn after the lines so the handle is grabbable. */}
        <g
          className="cash-handle-group"
          role="slider"
          tabIndex={0}
          aria-label="Safety buffer"
          aria-valuenow={buffer}
          aria-valuetext={`Safety buffer ${money(buffer)}`}
          aria-valuemin={0}
          aria-valuemax={Math.max(buffer, Math.round(domain.hi))}
          onKeyDown={nudge(buffer, onBufferChange)}
          onPointerDown={startDrag('buffer')}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <line className="cash-line-buffer" x1={PAD.left} x2={PAD.left + innerW} y1={bufferY} y2={bufferY} />
          {/* Sized off the same touch figure as the markers: the buffer line is
              a 1px dash, and its grab area is the only thing making it a
              control. */}
          <rect className="cash-handle-hit" x={PAD.left} y={bufferY - touch / 2} width={innerW} height={touch} />
          {/* The one floating label left inside the plot, and it now checks the
              boundary rather than assuming there is room. Pinned to the right
              edge it hung over the axis on a narrow chart — 58px of pill inside
              a 220px plot, drawn outside the clip, over the Y labels. */}
          {(() => {
            const pillW = isPhone ? 52 : 58;
            const { x } = flipInside(PAD.left + innerW - 4, pillW, PAD.left, PAD.left + innerW);
            return (
              <g className="cash-handle" transform={`translate(${x}, ${bufferY})`}>
                <rect x={0} y={-11} width={pillW} height={22} rx={11} />
                <text x={pillW / 2} y={0} dy="0.32em" textAnchor="middle">
                  {axisMoney(buffer, width)}
                </text>
              </g>
            );
          })()}
        </g>

        {/* Today's balance, draggable — in the gutter beside the axis rather than
            on the day-0 point itself, which is where the day-0 event marker has
            to be. Two grab targets on one pixel means one of them loses. */}
        <g
          className="cash-handle-group cash-handle-start"
          role="slider"
          tabIndex={0}
          aria-label="Starting bank balance"
          aria-valuenow={Math.round(startBalance)}
          aria-valuetext={`Starting balance ${money(startBalance)}`}
          aria-valuemin={0}
          aria-valuemax={Math.max(Math.round(startBalance) * 2, Math.round(domain.hi))}
          onKeyDown={nudge(startBalance, onBalanceChange)}
          onPointerDown={startDrag('balance')}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <line className="cash-start-tick" x1={PAD.left - 8} x2={xFor(0)} y1={startY} y2={startY} />
          <circle className="cash-start-dot" cx={PAD.left - 8} cy={startY} r={7} />
          <rect
            className="cash-handle-hit"
            x={PAD.left - 8 - touch / 2}
            y={startY - touch / 2}
            width={touch}
            height={touch}
          />
        </g>

        {/* Event markers.
            NOT clipped: a touch target is half a target wide either side of its
            point, and the first and last markers sit one inset from the plot
            edge, so a clip would cut their targets in half. The inset is sized
            off the same touch figure precisely so nothing has to be clipped to
            stay tidy. */}
        <g
          className="cash-markers"
          role="group"
          aria-label={`${groups.length} day${groups.length === 1 ? '' : 's'} with transactions. Use arrow keys to move between them.`}
        >
          {groups.map((group, order) => {
            const day = days[group.index];
            const net = group.days.reduce((sum, entry) => sum + entry.incoming - entry.outgoing, 0);
            const anyEstimated = group.days.some((entry) => entry.events.some((event) => !event.confirmed));
            const last = group.days[group.days.length - 1];
            const unfunded = last.projected < 0;
            const shape = group.grouped ? 'cluster' : markerShape(day.events[0]);
            const x = xFor(group.index);
            const y = yFor(day.projected);
            const tone = unfunded ? 'unfunded' : net >= 0 ? 'in' : 'out';
            // Selection, not hover — see the note where selectedGroup is built.
            const isOn = selectedGroup?.index === group.index;
            const isHot = activeGroup?.index === group.index;
            const span =
              group.days.length > 1
                ? `${shortDate(group.days[0].dateKey)} to ${shortDate(last.dateKey)}`
                : shortDate(day.dateKey);
            const label = group.grouped
              ? `${span}: ${group.eventCount} transactions, net ${money(net)}. Balance after ${money(last.projected)}.`
              : `${span}: ${day.events[0].label}, ${money(day.events[0].amount)}. Balance after ${money(day.projected)}.`;
            return (
              /* ONE tab stop for the whole layer, not one per marker — thirty
                 markers would be thirty stops between the chart and the next
                 control. Arrow keys move between them (roving tabindex), Enter
                 and Space select. The list below is still there and still works;
                 this makes the chart itself operable rather than decorative. */
              <g
                key={day.dateKey}
                className={`cash-marker tone-${tone}${anyEstimated ? ' is-estimated' : ''}${isOn ? ' is-selected' : ''}${isHot && !isOn ? ' is-active' : ''}${group.grouped ? ' is-grouped' : ''}`}
                transform={`translate(${x}, ${y})`}
                role="button"
                tabIndex={order === focusOrder ? 0 : -1}
                aria-label={label}
                aria-pressed={isOn}
                ref={(node) => { markerRefs.current[order] = node; }}
                onClick={() => onSelect(selected === group.index ? null : group.index)}
                onFocus={() => { setFocusOrder(order); setHover(group.index); }}
                onBlur={() => setHover(null)}
                onKeyDown={(event) => onMarkerKey(event, order, group.index)}
              >
                <title>{label}</title>
                {/* The touch target, and nothing else. It carries its own class
                    so no paint rule can reach it — as a bare <circle> it was
                    picked up by the tone/estimated strokes and drawn as a fat
                    ring around every marker, which is what made a month of them
                    look like a chain. */}
                <circle className="cash-marker-hit" r={hitRadius} />
                {/* Focus is drawn by us, not by the UA. A browser outline on an
                    SVG <g> whose only sized child is a transparent circle lands
                    somewhere unhelpful, and on some engines nowhere at all. */}
                <circle className="cash-marker-focus" r={13} />
                {/* Selection is a ring OUTSIDE the shape rather than a fill or a
                    size change: it has to be visible without covering the point
                    next to it or moving the thing you just aimed at. */}
                {isOn ? <circle className="cash-marker-ring" r={11} /> : null}
                {shape === 'diamond' ? <path className="cash-marker-shape" d="M0,-5 L5,0 L0,5 L-5,0 Z" /> : null}
                {shape === 'up' ? <path className="cash-marker-shape" d="M0,-5 L4.4,2.8 L-4.4,2.8 Z" /> : null}
                {shape === 'down' ? <path className="cash-marker-shape" d="M0,5 L4.4,-2.8 L-4.4,-2.8 Z" /> : null}
                {shape === 'circle' ? <circle className="cash-marker-shape" r={4} /> : null}
                {/* A grouped marker is a disc carrying the count. Shape AND
                    color still separate in from out on the ungrouped ones; a
                    group is neither, so it says how many instead. */}
                {shape === 'cluster' ? (
                  <>
                    <circle className="cash-marker-shape cash-marker-cluster" r={9} />
                    <text className="cash-marker-count" y={0} dy="0.34em" textAnchor="middle">
                      {group.eventCount}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
        </g>

        {/* Crosshair */}
        {active !== null && activeDay ? (
          <g className="cash-crosshair" clipPath="url(#cash-plot)">
            <line x1={xFor(active)} x2={xFor(active)} y1={PAD.top} y2={PAD.top + innerH} />
          </g>
        ) : null}

      </svg>

      {/* What the selected marker is, BELOW the plot rather than floating over
          it. A pill inside the chart covers the very data it describes, and on a
          320px screen there is nowhere for it to go that isn't on top of
          something. Down here it can say four things instead of two. */}
      {activeDay ? (
        (() => {
          const group = activeGroup;
          const shown = group ? group.days : [activeDay];
          const events = shown.flatMap((entry) => entry.events);
          const last = shown[shown.length - 1];
          const net = shown.reduce((sum, entry) => sum + entry.incoming - entry.outgoing, 0);
          const single = events.length === 1 ? events[0] : null;
          const spanLabel =
            shown.length > 1
              ? `${shortDate(shown[0].dateKey)} – ${shortDate(last.dateKey)}`
              : shortDate(activeDay.dateKey);

          return (
            <div className="cash-detail" aria-live="polite">
              <div className="cash-detail-head">
                <span className="cash-detail-date">{spanLabel}</span>
                {events.length > 0 ? (
                  <span className={`cash-detail-amount ${net >= 0 ? 'is-in' : 'is-out'}`}>
                    {net >= 0 ? '+' : '−'}${Math.abs(Math.round(net)).toLocaleString('en-US')}
                  </span>
                ) : null}
              </div>

              <p className="cash-detail-name">
                {single
                  ? single.label
                  : events.length > 0
                    ? `${events.length} transactions`
                    : 'Nothing scheduled'}
              </p>

              {events.length > 0 ? (
                <p className="cash-detail-after">
                  Projected balance after {events.length === 1 ? 'this' : 'these'}: <b>{money(last.projected)}</b>
                </p>
              ) : (
                <p className="cash-detail-after">
                  Projected balance: <b>{money(activeDay.projected)}</b>
                </p>
              )}

              {/* The grouped case gets the transactions themselves — a count with
                  no way to see what is in it is a dead end. Capped, with the
                  remainder named rather than silently dropped. */}
              {events.length > 1 ? (
                <ul className="cash-detail-list">
                  {events.slice(0, 4).map((event) => (
                    <li key={event.id}>
                      <span className="cash-detail-item-name">{event.label}</span>
                      <span className={`cash-detail-item-amount ${event.amount >= 0 ? 'is-in' : 'is-out'}`}>
                        {money(event.amount)}
                      </span>
                    </li>
                  ))}
                  {events.length > 4 ? (
                    <li className="cash-detail-more">
                      and {events.length - 4} more — see the list below
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {/* Kept, because they are alternative readings of the same day and
                  they only appear when the owner has asked for those lines. */}
              {lines.confirmed || lines.worst ? (
                <p className="cash-detail-alt">
                  {lines.confirmed ? <>Confirmed only <b>{money(activeDay.confirmedOnly)}</b>. </> : null}
                  {lines.worst ? <>If payments run {lateDays} days late <b>{money(activeDay.worstCase)}</b>.</> : null}
                </p>
              ) : null}
            </div>
          );
        })()
      ) : null}

      {/* Below the panel, and always present — it explains the controls, which
          are still there whether or not anything is selected. */}
      {/* "Drag" and "Tap" each name one input device, and this chart is worked
          by all three — the handles take arrow keys, the markers are a roving
          tabindex. Naming the action instead of the gesture is true whichever
          one somebody is using. */}
      <p className="cash-chart-hint">
        {activeDay
          ? 'Select any marker to see that day’s transaction details. Grouped markers keep the graph readable on small screens.'
          : 'Adjust the dot on the left to change today’s balance, or the dashed line to move your safety buffer. Select a marker to see what happens that day.'}
      </p>
    </div>
  );
}
