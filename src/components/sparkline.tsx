// A tile-sized trend line: area fill, stroke, and a dot on the latest point.
//
// There is no charting library in this project and every chart is hand-rolled
// SVG, so this follows the two that already exist — the marketing hero's spark
// for the shape, .ins-line for the conventions (preserveAspectRatio="none" so
// the line stretches to whatever the tile is, non-scaling-stroke so it doesn't
// smear when it does).
//
// Deliberately not a chart: no axes, no ticks, no tooltip. It answers "is this
// going up" and nothing else. The exact figure is always printed beside it.

type Props = {
  values: number[];
  /** Unique per instance — two gradients sharing an id on one page silently merge. */
  gradientId: string;
  className?: string;
  ariaLabel?: string;
};

const W = 100;
const H = 32;

export default function Sparkline({ values, gradientId, className, ariaLabel }: Props) {
  // One point is not a trend, and every-value-equal has no range to scale to.
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * W;
    // A flat series sits on the midline rather than collapsing onto the floor,
    // which would read as "fell to zero" when nothing happened at all.
    const y = span === 0 ? H / 2 : H - ((value - min) / span) * (H - 4) - 2;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      className={`sparkline${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sparkline-stop-top" />
          <stop offset="1" className="sparkline-stop-bottom" />
        </linearGradient>
      </defs>
      <path className="sparkline-area" d={area} fill={`url(#${gradientId})`} />
      <path className="sparkline-line" d={line} />
      {/* The dot is drawn without preserveAspectRatio's stretch by keeping it a
          circle in the same user space — it distorts with the viewBox, which is
          why it is an ellipse-safe radius rather than a visual promise. */}
      <circle className="sparkline-dot" cx={last.x} cy={last.y} r="2" />
    </svg>
  );
}
