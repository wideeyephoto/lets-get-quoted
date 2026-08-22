import 'server-only';

import { formatOverage } from '@/lib/billing/usage-overage';
import type { OverageSummary } from '@/lib/billing/overage-summary';
import type { WorkspacePlanRead } from '@/lib/billing/plan-usage';

/**
 * WHAT THIS PERIOD WILL COST, projected.
 *
 * A money figure was designed into the glance strip, then dropped, and the
 * reason it was dropped is worth keeping because it decided the shape of this
 * module. The dropped tile said "Estimated this month". That is a unit bug: an
 * annual subscriber's `basePriceCents` is a per-YEAR number, so a monthly
 * estimate on a Growth annual plan would have read $1,188 for a month costing
 * $99. The fix is not arithmetic, it is the frame. A billing PERIOD is exactly
 * the span `basePriceCents` covers -- a month for monthly, a year for annual --
 * so "this period" makes the units line up by construction and there is no
 * conversion to get wrong.
 *
 * WHAT IT DELIBERATELY DOES NOT KNOW. There is no upcoming-invoice read
 * anywhere in this codebase, so this cannot see proration, tax, discounts or
 * account credits, and it does not pretend to. The platform fee is excluded on
 * purpose rather than by omission: that fee is netted out of the payments a
 * contractor collects, not charged to their card, and adding it to "what you
 * will be billed" would sum two different money flows into a number that
 * matches neither. The caller states both exclusions beside the figure.
 *
 * FAILURE DIRECTION. Every branch that cannot see something says so through
 * `basis` rather than quietly leaving it out of the total. A forecast that
 * silently omits extra usage is worse than no forecast, because it is a small
 * confident number rather than an admission.
 */

/**
 * The most we will ever multiply what we know by. Below this much of the period
 * elapsed, linear extrapolation stops forecasting and starts amplifying noise:
 * eight hours into a month, one $2 accrual becomes a $180 projection. At one
 * sixth, the multiplier is capped at six.
 */
export const MIN_ELAPSED_FRACTION = 1 / 6;

export type ForecastBasis =
  /** The plan itself could not be read. Nothing can be said. */
  | 'unreadable'
  /** A pinned or custom agreement whose price this surface cannot see. */
  | 'price_unknown'
  /** Plan price alone. Nothing variable applies, or nothing has accrued. */
  | 'plan_only'
  /** Plan price, and extra usage that could NOT be read. The real figure is >=. */
  | 'plan_plus_unknown'
  /** Plan price plus what is already on the meter, with no projection made. */
  | 'plan_plus_accrued'
  /** Plan price plus extra usage extrapolated to the end of the period. */
  | 'plan_plus_projected'
  /** The projection ran past the authorized cap, so the cap is the answer. */
  | 'plan_plus_capped';

export type PeriodForecast = Readonly<{
  /** Null means no figure may be shown at all -- never render this as zero. */
  millicents: number | null;
  basis: ForecastBasis;
}>;

const frozen = (millicents: number | null, basis: ForecastBasis): PeriodForecast =>
  Object.freeze({ millicents, basis });

/**
 * How far through the billing period we are, or null when the dates cannot
 * support the question.
 *
 * Null is returned for a period that has already ended as well as for one that
 * has not started or whose dates will not parse. All three mean the same thing
 * to the caller: there is nothing to project INTO, so report what is known.
 * `period_start` moves mid-month when the subscription projector rewrites it
 * from Stripe, which is why this is read from the entitlement the accruals are
 * keyed by rather than assumed to be a calendar month.
 */
function elapsedFraction(start: string | null, end: string | null, now: number): number | null {
  if (!start || !end) return null;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  const span = to - from;
  if (span <= 0) return null;

  const elapsed = now - from;
  if (elapsed <= 0) return null;
  if (elapsed >= span) return null;

  return elapsed / span;
}

export function forecastPeriodCost(
  plan: WorkspacePlanRead,
  overage: OverageSummary | null,
  now: number,
): PeriodForecast {
  if (plan.kind !== 'ready') return frozen(null, 'unreadable');

  // Enterprise and any workspace pinned to a superseded catalog price. Showing
  // a projection built on a price we cannot see would be a guess wearing a
  // dollar sign.
  if (plan.basePriceCents === null) return frozen(null, 'price_unknown');

  // The single unit conversion in this module, done once and in view of both
  // operands. Cents against millicents is the mismatch that produces a bill a
  // thousand times too big.
  const baseMillicents = plan.basePriceCents * 1000;

  if (overage === null) return frozen(baseMillicents, 'plan_only');
  if (!overage.readable) return frozen(baseMillicents, 'plan_plus_unknown');

  const accrued = overage.totalMillicents;

  // With overage switched off nothing further can accrue, so whatever is on the
  // meter is the whole of it and there is no projection to make. Accruals from
  // before it was switched off are still real and still shown.
  if (!overage.enabled) {
    return accrued > 0
      ? frozen(baseMillicents + accrued, 'plan_plus_accrued')
      : frozen(baseMillicents, 'plan_only');
  }

  if (accrued <= 0) return frozen(baseMillicents, 'plan_only');

  const fraction = elapsedFraction(overage.periodStart, overage.periodEnd, now);

  // Too early in the period, or the dates will not answer. Report what has
  // actually accrued and let `basis` say that is what this is. Note the accrued
  // figure is NOT clamped to the cap: if something has already run past the
  // authorized ceiling that is a real number a contractor needs to see, not one
  // to round down into looking compliant.
  if (fraction === null || fraction < MIN_ELAPSED_FRACTION) {
    return frozen(baseMillicents + accrued, 'plan_plus_accrued');
  }

  // Dividing by a fraction in (0, 1) can only grow the figure, so a projection
  // can never come in under what has already been spent.
  const projected = Math.round(accrued / fraction);
  const capMillicents = overage.capCents === null ? null : overage.capCents * 1000;

  if (capMillicents !== null && projected > capMillicents) {
    // The meters will refuse past the cap, so the cap is the ceiling on what
    // this period can cost. Projecting past it would forecast a charge the
    // system is built to prevent.
    return frozen(baseMillicents + Math.max(capMillicents, accrued), 'plan_plus_capped');
  }

  return frozen(baseMillicents + projected, 'plan_plus_projected');
}

/**
 * `$1,188.00`, from millicents. Delegates to the overage formatter rather than
 * rounding again here, so one projection cannot print two ways on one page --
 * the failure that put rounded dollars in the invoice email while the page it
 * was generated from showed cents.
 */
export function formatForecast(millicents: number): string {
  return formatOverage(millicents);
}
