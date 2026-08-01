'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { markerShape, type Forecast } from '@/lib/cash-forecast';

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

const PAD = { top: 18, right: 22, bottom: 30, left: 76 };
// The first and last days sit INSIDE the plot rather than on its edges. A marker
// centred on the clip boundary is drawn as half a diamond, and — worse — the
// day-0 one landed underneath the drag handle for today's balance, so the day
// most likely to have something on it was the one day you couldn't click.
const INSET = 18;

function money(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

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
  const [width, setWidth] = useState(760);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const apply = (next: number) => setWidth(Math.max(300, Math.round(next)));
    apply(element.clientWidth || 760);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) apply(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = width < 560 ? 250 : 340;
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
  const xFor = useCallback((index: number) => PAD.left + INSET + (index / lastIndex) * plotW, [plotW, lastIndex]);
  const yFor = useCallback(
    (value: number) => PAD.top + (1 - (value - domain.lo) / (domain.hi - domain.lo || 1)) * innerH,
    [domain, innerH],
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
      const raw = domain.hi - ((y - PAD.top) / (innerH || 1)) * (domain.hi - domain.lo);
      // Snapped to $100: a buffer of $9,873 was never a decision, it was a pixel.
      return Math.max(0, Math.round(raw / 100) * 100);
    },
    [domain, innerH],
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
              {/* Clear of the balance handle, which lives in the gutter at PAD.left - 8. */}
              <text x={PAD.left - 24} y={yFor(tick)} dy="0.32em" textAnchor="end">
                {money(tick)}
              </text>
            </g>
          ))}
        </g>

        {/* x axis. The last day always gets a label; a regular tick close enough
            to collide with it is dropped, or the two dates overprint. */}
        <g className="cash-axis-x">
          {(() => {
            const step = Math.max(1, Math.round(days.length / (width < 560 ? 4 : 7)));
            return days.map((day, index) => {
              const isLast = index === lastIndex;
              const onTick = index % step === 0 && lastIndex - index >= Math.ceil(step / 2);
              if (!isLast && !onTick) return null;
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
            });
          })()}
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
          <rect className="cash-handle-hit" x={PAD.left} y={bufferY - 9} width={innerW} height={18} />
          <g className="cash-handle" transform={`translate(${PAD.left + innerW - 4}, ${bufferY})`}>
            <rect x={-58} y={-11} width={58} height={22} rx={11} />
            <text x={-29} y={0} dy="0.32em" textAnchor="middle">
              {money(buffer)}
            </text>
          </g>
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
          <rect className="cash-handle-hit" x={PAD.left - 20} y={startY - 13} width={26} height={26} />
        </g>

        {/* Event markers */}
        <g clipPath="url(#cash-plot)">
          {days.map((day, index) => {
            if (day.events.length === 0) return null;
            const net = day.incoming - day.outgoing;
            const anyEstimated = day.events.some((event) => !event.confirmed);
            const unfunded = day.projected < 0;
            const biggest = day.events[0];
            const shape = day.events.length > 1 ? 'cluster' : markerShape(biggest);
            const x = xFor(index);
            const y = yFor(day.projected);
            const tone = unfunded ? 'unfunded' : net >= 0 ? 'in' : 'out';
            const label = `${shortDate(day.dateKey)}: ${day.events.length} event${day.events.length === 1 ? '' : 's'}, net ${money(net)}`;
            return (
              /* Deliberately NOT a tab stop. Thirty markers would put thirty
                 stops between the chart and the next control, and every one of
                 them has a real button in the list below that does the same
                 thing — so the keyboard path is the list, and this is the mouse
                 shortcut to it. */
              <g
                key={day.dateKey}
                className={`cash-marker tone-${tone}${anyEstimated ? ' is-estimated' : ''}${selected === index ? ' is-selected' : ''}`}
                transform={`translate(${x}, ${y})`}
                aria-hidden="true"
                onClick={() => onSelect(selected === index ? null : index)}
              >
                <title>{label}</title>
                <circle className="cash-marker-hit" r={12} />
                {shape === 'diamond' ? <path d="M0,-7 L7,0 L0,7 L-7,0 Z" /> : null}
                {shape === 'up' ? <path d="M0,-7 L6,4 L-6,4 Z" /> : null}
                {shape === 'down' ? <path d="M0,7 L6,-4 L-6,-4 Z" /> : null}
                {shape === 'circle' ? <circle r={5.5} /> : null}
                {shape === 'cluster' ? <rect x={-6} y={-6} width={12} height={12} rx={3} /> : null}
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

      {activeDay ? (
        <div className="cash-readout" aria-live="polite">
          <strong>{shortDate(activeDay.dateKey)}</strong>
          <span>
            Projected <b>{money(activeDay.projected)}</b>
          </span>
          {lines.confirmed ? (
            <span>
              Confirmed only <b>{money(activeDay.confirmedOnly)}</b>
            </span>
          ) : null}
          {lines.worst ? (
            <span>
              If payments run {lateDays} days late <b>{money(activeDay.worstCase)}</b>
            </span>
          ) : null}
          {activeDay.events.length > 0 ? (
            <span>
              {activeDay.events.length} event{activeDay.events.length === 1 ? '' : 's'}, net{' '}
              <b>{money(activeDay.incoming - activeDay.outgoing)}</b>
            </span>
          ) : (
            <span>Nothing scheduled</span>
          )}
        </div>
      ) : (
        <p className="cash-chart-hint">
          Drag the dot on the left to change today&rsquo;s balance, or the dashed line to move your safety buffer. Tap a marker
          to see what happens that day.
        </p>
      )}
    </div>
  );
}
