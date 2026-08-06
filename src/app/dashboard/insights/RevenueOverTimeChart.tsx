'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/lib/jobs';
import { axisMoney, chartInset, chartPadding, MOBILE_MAX, resolveChartWidth, xAxisTicks } from '@/lib/cash-chart-layout';
import type { RevenueTrend } from '@/lib/insights-metrics';

// Revenue collected over the selected window, drawn as a line — this period
// solid, the previous equal period a dashed ghost behind it when the header's
// comparison toggle is on.
//
// Real pixel coordinates rather than a stretched viewBox, and the axis geometry
// is the cash-flow chart's own (chartPadding / chartInset / xAxisTicks / axisMoney
// from lib/cash-chart-layout, all pure and already unit-tested), so the money
// labels keep their shape at every width instead of shearing on a phone. The one
// difference from the cash chart: collected revenue is never negative, so the
// domain floor is a hard zero and there's no red band to reason about.
//
// A client component only for the hover read-out; with no pointer it degrades to
// a titled figure and a labelled line, and the SVG carries a full spoken summary
// (total, buckets, and the previous-period figure) for a screen reader.

type Props = {
  trend: RevenueTrend;
  windowLabel: string;
  sentenceLabel: string;
  /** The header's "compare to previous period" toggle — reveals the dashed overlay. */
  showPrevious: boolean;
};

const GROUP_NOUN: Record<RevenueTrend['grouping'], string> = { day: 'day', week: 'week', month: 'month' };

/** A top-of-axis that lands on a round number, so the gridlines read as money. */
function niceScale(max: number, tickCount = 4): { hi: number; ticks: number[] } {
  if (max <= 0) return { hi: 1, ticks: [0] };
  const raw = max / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= hi + step / 2; value += step) ticks.push(Math.round(value * 100) / 100);
  return { hi, ticks };
}

function revHeight(width: number): number {
  return width < MOBILE_MAX ? 190 : 240;
}

export default function RevenueOverTimeChart({ trend, windowLabel, sentenceLabel, showPrevious }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Start narrow: the first paint happens before the observer has measured, and
  // guessing desktop-wide makes a phone render one frame wider than its screen.
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const apply = (next: number) => setWidth(resolveChartWidth(next));
    apply(element.clientWidth || 320);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next) apply(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const points = trend.points;
  const maxIndex = Math.max(0, points.length - 1);
  const isPhone = width < MOBILE_MAX;
  const PAD = chartPadding(width);
  const INSET = chartInset(width);
  const height = revHeight(width);
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = Math.max(10, height - PAD.top - PAD.bottom);
  const plotW = Math.max(10, innerW - INSET * 2);

  const scale = useMemo(() => {
    let peak = 0;
    for (const point of points) {
      peak = Math.max(peak, point.current);
      if (showPrevious) peak = Math.max(peak, point.previous);
    }
    return niceScale(peak);
  }, [points, showPrevious]);

  const xFor = useCallback(
    (index: number) => PAD.left + INSET + (maxIndex === 0 ? plotW / 2 : (index / maxIndex) * plotW),
    [PAD.left, INSET, plotW, maxIndex],
  );
  const yFor = useCallback(
    (value: number) => PAD.top + (1 - value / (scale.hi || 1)) * innerH,
    [PAD.top, scale.hi, innerH],
  );

  const linePath = useCallback(
    (pick: (point: RevenueTrend['points'][number]) => number) =>
      points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(1)},${yFor(pick(point)).toFixed(1)}`).join(' '),
    [points, xFor, yFor],
  );

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const baseline = yFor(0).toFixed(1);
    const top = points.map((point, index) => `L${xFor(index).toFixed(1)},${yFor(point.current).toFixed(1)}`).join(' ');
    return `M${xFor(0).toFixed(1)},${baseline} ${top} L${xFor(maxIndex).toFixed(1)},${baseline} Z`;
  }, [points, xFor, yFor, maxIndex]);

  const indexAtClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = (clientX - rect.left - PAD.left - INSET) / (plotW || 1);
    return Math.max(0, Math.min(maxIndex, Math.round(ratio * maxIndex)));
  };

  const active = hover;
  const activePoint = active === null ? null : points[active];

  if (!trend.hasData || points.length === 0) {
    return (
      <p className="ins-empty-note">
        Once payments start landing, the money you collect {sentenceLabel} is charted here — day by day, then
        by week and by month as the window grows.
      </p>
    );
  }

  const noun = GROUP_NOUN[trend.grouping];
  const summary = `Revenue collected ${sentenceLabel}: ${formatMoney(trend.total)} across ${points.length} ${noun}${
    points.length === 1 ? '' : 's'
  }${showPrevious ? `, versus ${formatMoney(trend.previousTotal)} the period before.` : '.'}`;

  return (
    <>
      <div className="ins-revtime-top">
        <div>
          <strong className="ins-big">{formatMoney(trend.total)}</strong>
          <span className="ins-sub">Collected {windowLabel} · grouped by {noun}</span>
        </div>
        {showPrevious ? (
          <span className="ins-revtime-prev">
            Previous <strong>{formatMoney(trend.previousTotal)}</strong>
          </span>
        ) : null}
      </div>

      <div className="ins-revtime-wrap" ref={wrapRef}>
        <svg ref={svgRef} className="ins-revtime-svg" width={width} height={height} role="img" aria-label={summary}>
          <defs>
            <linearGradient id="ins-revtime-fill" x1="0" y1="0" x2="0" y2="1">
              <stop className="ins-revtime-fill-top" offset="0%" />
              <stop className="ins-revtime-fill-bottom" offset="100%" />
            </linearGradient>
            <clipPath id="ins-revtime-plot">
              <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
            </clipPath>
          </defs>

          {/* Gridlines + y axis */}
          <g className="ins-revtime-grid">
            {scale.ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={yFor(tick)} y2={yFor(tick)} />
                <text x={PAD.left - (isPhone ? 8 : 12)} y={yFor(tick)} dy="0.32em" textAnchor="end">
                  {axisMoney(tick, width)}
                </text>
              </g>
            ))}
          </g>

          <g clipPath="url(#ins-revtime-plot)">
            <path className="ins-revtime-area" d={areaPath} />
            {showPrevious ? <path className="ins-revtime-line is-prev" d={linePath((point) => point.previous)} /> : null}
            <path className="ins-revtime-line" d={linePath((point) => point.current)} />
            {points.map((point, index) => (
              <circle key={point.key} className="ins-revtime-dot" cx={xFor(index)} cy={yFor(point.current)} r={2.6} />
            ))}
          </g>

          {/* x axis — which buckets get a label is the cash chart's own spacing. */}
          <g className="ins-revtime-axis-x">
            {xAxisTicks(points.length, width).map((index) => {
              const point = points[index];
              if (!point) return null;
              const isLast = index === maxIndex;
              return (
                <text key={point.key} x={xFor(index)} y={PAD.top + innerH + 18} textAnchor={index === 0 ? 'start' : isLast ? 'end' : 'middle'}>
                  {point.label}
                </text>
              );
            })}
          </g>

          {/* The pointer surface sits on top; the lines above it are painted
              pointer-events:none so this catches the hover across the whole plot. */}
          <rect
            className="ins-revtime-hit"
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            onPointerMove={(event) => setHover(indexAtClientX(event.clientX))}
            onPointerLeave={() => setHover(null)}
          />

          {active !== null && activePoint
            ? (() => {
                const cx = xFor(active);
                const cy = yFor(activePoint.current);
                const tipW = isPhone ? 116 : 138;
                const tipH = showPrevious ? 56 : 40;
                const tx = Math.max(PAD.left, Math.min(cx - tipW / 2, PAD.left + innerW - tipW));
                const ty = cy - tipH - 12 < PAD.top ? cy + 12 : cy - tipH - 12;
                return (
                  <g className="ins-revtime-cursor" pointerEvents="none">
                    <line className="ins-revtime-crosshair" x1={cx} x2={cx} y1={PAD.top} y2={PAD.top + innerH} />
                    {showPrevious ? <circle className="ins-revtime-dot is-prev" cx={cx} cy={yFor(activePoint.previous)} r={3.4} /> : null}
                    <circle className="ins-revtime-dot is-active" cx={cx} cy={cy} r={4.5} />
                    <g transform={`translate(${tx.toFixed(1)}, ${ty.toFixed(1)})`}>
                      <rect className="ins-revtime-tip-box" x={0} y={0} width={tipW} height={tipH} rx={9} />
                      <text className="ins-revtime-tip-label" x={11} y={16}>{activePoint.label}</text>
                      <text className="ins-revtime-tip-value" x={11} y={showPrevious ? 33 : 31}>{formatMoney(activePoint.current)}</text>
                      {showPrevious ? (
                        <text className="ins-revtime-tip-prev" x={11} y={49}>prev {formatMoney(activePoint.previous)}</text>
                      ) : null}
                    </g>
                  </g>
                );
              })()
            : null}
        </svg>
      </div>

      {showPrevious ? (
        <div className="ins-revtime-legend">
          <span><i className="ins-revtime-key" /> This period</span>
          <span><i className="ins-revtime-key is-prev" /> Previous period</span>
        </div>
      ) : null}
    </>
  );
}
