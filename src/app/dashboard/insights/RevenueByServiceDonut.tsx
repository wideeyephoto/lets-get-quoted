import DonutChart, { type DonutSegment } from '@/components/donut-chart';
import { formatMoney } from '@/lib/jobs';
import { compactMoney } from '@/lib/cash-chart-layout';
import type { RevenueByService, RevenueServiceSlice } from '@/lib/insights-metrics';

// Where the money came from, as a donut — grouped from invoice line-item labels
// on signed/paid invoices raised in the period. It is APPROXIMATE by
// construction: there is no service catalog joined to revenue, so items are
// grouped by their free-text description (top few by value, the long tail folded
// into "Other"). The card says so plainly rather than implying a clean
// service→revenue split the data can't back. The donut center shows a rounded
// total for glancing; every legend row carries the exact dollar figure, so
// nothing anyone acts on is the rounded number. Server-only.

// Vivid palette for the named slices; "Other" always takes the muted ring so a
// grab-bag of one-off labels never out-shouts a real service.
const SLICE_COLORS = ['var(--accent)', '#6aa8ee', '#a78bfa', '#4ade80', '#ffb454'];
const OTHER_COLOR = 'rgba(var(--tint), 0.3)';

function sliceColor(slice: RevenueServiceSlice, index: number): string {
  return slice.label === 'Other' ? OTHER_COLOR : SLICE_COLORS[index % SLICE_COLORS.length];
}

export default function RevenueByServiceDonut({ revenue }: { revenue: RevenueByService }) {
  const { slices, total, hasData } = revenue;
  const segments: DonutSegment[] = slices.map((slice, index) => ({
    key: `${slice.label}-${index}`,
    color: sliceColor(slice, index),
    value: slice.amount,
  }));
  const ariaLabel = hasData
    ? `Revenue by service, approximate: ${slices.map((slice) => `${slice.label} ${formatMoney(slice.amount)}, ${slice.pct}%`).join('; ')}.`
    : 'No revenue by service yet.';

  return (
    <section className="panel ins-card ins-revsvc-card">
      <p className="ins-card-head">
        <span className="ins-chip is-revsvc" aria-hidden="true">◍</span> Revenue by service
        <span className="ins-card-sub">approximate</span>
      </p>

      {!hasData ? (
        <p className="ins-empty-note">
          Once invoices with line items are signed or paid in this period, your revenue splits by service here.
        </p>
      ) : (
        <>
          <div className="ins-revsvc-body">
            <DonutChart
              segments={segments}
              size={168}
              thickness={22}
              centerValue={compactMoney(total)}
              centerLabel="collected"
              ariaLabel={ariaLabel}
            />

            <ul className="ins-revsvc-legend">
              {slices.map((slice, index) => (
                <li className="ins-revsvc-row" key={`${slice.label}-${index}`}>
                  <span className="ins-revsvc-swatch" style={{ background: sliceColor(slice, index) }} aria-hidden="true" />
                  <span className="ins-revsvc-label">{slice.label}</span>
                  <span className="ins-revsvc-amt">{formatMoney(slice.amount)}</span>
                  <span className="ins-revsvc-pct">{slice.pct}%</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="ins-sub ins-revsvc-note">
            Approximate — grouped from invoice line-item labels, not a true service catalog. Two items worded
            differently for the same work count as two services.
          </p>
        </>
      )}
    </section>
  );
}
