// A reusable SVG donut — a ring of proportional arc segments with an optional
// figure in the hole. Net-new, and deliberately generic: Schedule Utilization
// draws a two-segment gauge (booked vs open) with it, and Revenue by Service a
// many-segment breakdown, so nothing about a specific card lives in here.
//
// Drawn with stroke-dasharray on stacked circles rather than arc <path> maths:
// one circle per segment, each showing only its slice of the circumference and
// rotated to start where the previous one ended. Crisp at any size, and a single
// segment of 100% is a whole ring with no seam. Colors arrive as CSS values on
// each segment (e.g. 'var(--accent)') and are applied through style so a token
// resolves; the component owns no palette.
//
// role="img" with a required aria-label — the ring itself is decorative, the
// label is the data. Callers render their own legend alongside.

export type DonutSegment = {
  key: string;
  /** Any CSS color, including a token like 'var(--accent)'. */
  color: string;
  value: number;
};

type Props = {
  segments: DonutSegment[];
  ariaLabel: string;
  size?: number;
  thickness?: number;
  /** Big figure in the hole, e.g. "62%" or "$8,400". */
  centerValue?: string;
  /** Small caption under the figure. */
  centerLabel?: string;
  className?: string;
};

export default function DonutChart({
  segments,
  ariaLabel,
  size = 160,
  thickness = 22,
  centerValue,
  centerLabel,
  className,
}: Props) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  // Where each segment begins, as a fraction of the whole turn. Built up front so
  // a zero-value segment simply contributes nothing and doesn't shift the rest.
  let cursor = 0;
  const arcs = segments.map((segment) => {
    const fraction = total > 0 ? Math.max(0, segment.value) / total : 0;
    const arc = { key: segment.key, color: segment.color, fraction, offset: cursor };
    cursor += fraction;
    return arc;
  });

  return (
    <svg
      className={`ins-donut${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Track: the empty ring everything is drawn over, so a part-full donut
          still reads as a whole dial rather than a floating sliver. */}
      <circle className="ins-donut-track" cx={center} cy={center} r={radius} fill="none" strokeWidth={thickness} />

      {/* Rotate -90° so the first segment starts at twelve o'clock, not three. */}
      <g transform={`rotate(-90 ${center} ${center})`}>
        {arcs.map((arc) =>
          arc.fraction > 0 ? (
            <circle
              key={arc.key}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={thickness}
              style={{ stroke: arc.color }}
              strokeDasharray={`${(arc.fraction * circumference).toFixed(2)} ${circumference.toFixed(2)}`}
              strokeDashoffset={`${(-arc.offset * circumference).toFixed(2)}`}
            />
          ) : null,
        )}
      </g>

      {centerValue ? (
        <text className="ins-donut-value" x={center} y={center} textAnchor="middle" dy={centerLabel ? '-0.05em' : '0.34em'}>
          {centerValue}
        </text>
      ) : null}
      {centerLabel ? (
        <text className="ins-donut-label" x={center} y={center} textAnchor="middle" dy="1.25em">
          {centerLabel}
        </text>
      ) : null}
    </svg>
  );
}
