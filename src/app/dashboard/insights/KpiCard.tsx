// One KPI tile: label, the figure, an optional ▲/▼ delta against the previous
// equal period, a six-month spark, and a focusable "how it's worked out" hint.
//
// Server component — the only interactivity is the hint tooltip, which is pure
// CSS (:hover/:focus on a real <button>, so it's keyboard-reachable without JS).
// The delta only renders when the header's comparison toggle is on; a null delta
// (a point-in-time balance like Outstanding) never shows one and says why in its
// note instead. Direction is the arrow; good-vs-bad is the colour, and they are
// not the same question — an Outstanding balance going UP is an up-arrow and bad
// news, which is exactly what `upIsGood` on the metric encodes.

import Sparkline from '@/components/sparkline';
import { formatMoney } from '@/lib/jobs';
import type { Delta } from '@/lib/insights';
import type { Kpi } from '@/lib/insights-metrics';

function formatValue(kpi: Kpi): string {
  if (kpi.format === 'money') return formatMoney(kpi.value);
  if (kpi.format === 'percent') return `${kpi.value}%`;
  return kpi.value.toLocaleString('en-US');
}

function KpiDelta({ delta, unit, upIsGood }: { delta: Delta; unit: '%' | 'pp'; upIsGood: boolean }) {
  // No prior basis to compare against — the metric appeared this period.
  if (delta.pct === null) {
    return delta.direction === 'up' ? <span className="ins-kpi-delta is-good">New</span> : null;
  }
  if (delta.direction === 'flat') return <span className="ins-kpi-delta is-flat">— no change</span>;
  const good = upIsGood ? delta.direction === 'up' : delta.direction === 'down';
  const glyph = delta.direction === 'up' ? '▲' : '▼';
  return (
    <span className={`ins-kpi-delta ${good ? 'is-good' : 'is-bad'}`}>
      <span aria-hidden="true">{glyph}</span> {Math.abs(delta.pct)}
      {unit} <em>vs prev</em>
    </span>
  );
}

export default function KpiCard({ kpi, showDelta }: { kpi: Kpi; showDelta: boolean }) {
  return (
    <article className="panel ins-kpi-card">
      <div className="ins-kpi-top">
        <span className="ins-kpi-label">{kpi.label}</span>
        <button type="button" className="ins-kpi-info" aria-label={`How this is calculated: ${kpi.hint}`}>
          <span aria-hidden="true">i</span>
          <span className="ins-kpi-tip" aria-hidden="true">{kpi.hint}</span>
        </button>
      </div>

      <strong className="ins-kpi-value">{formatValue(kpi)}</strong>

      <div className="ins-kpi-foot">
        {showDelta && kpi.delta ? (
          <KpiDelta delta={kpi.delta} unit={kpi.deltaUnit} upIsGood={kpi.upIsGood} />
        ) : (
          <span className="ins-kpi-delta is-flat" aria-hidden="true" />
        )}
        {kpi.spark.length >= 2 ? (
          <Sparkline
            values={kpi.spark}
            gradientId={`kpi-spark-${kpi.key}`}
            className="ins-kpi-spark"
            ariaLabel={`${kpi.label}: monthly trend over the last six months`}
          />
        ) : null}
      </div>

      {kpi.note ? <p className="ins-kpi-note">{kpi.note}</p> : null}
    </article>
  );
}
