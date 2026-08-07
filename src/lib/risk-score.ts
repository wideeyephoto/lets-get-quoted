/**
 * Ranking accounts by how much they warrant a look.
 *
 * The console already had every enforcement control a risk reviewer needs —
 * suspend, lock Quick Stops, reset verification, sign out every session — and
 * no way to find out WHO to point them at. Disputes, refunds and no-shows were
 * each listable, but never aggregated by account, so "which accounts have three
 * or more disputes" could not be asked. A repeat offender was visible one
 * account at a time, to somebody who already suspected them.
 *
 * THE DESIGN CONSTRAINT, and it is the whole reason this file is shaped the way
 * it is: a risk signal is not a violation. A dispute is a customer's assertion,
 * not a finding against the contractor — plenty are resolved in the
 * contractor's favour, and some are the customer's own bank being difficult. A
 * high refund rate can be a business that does careful work and makes it right.
 * Treating either as proof gets an honest business suspended.
 *
 * So every factor carries a `kind`, and the page renders the two groups
 * separately and labels them differently. `confirmed` means an outcome somebody
 * or something already adjudicated — a chargeback the bank ruled on, a
 * suspension staff already applied. `signal` means a number that merely
 * suggests looking. Nothing here decides anything: the output is an ordering
 * and an explanation, and a human still opens the account.
 *
 * Pure. No database, no request — the thresholds are the arguable part, and
 * they should be arguable in a test rather than against production data.
 */

export type RiskSignals = {
  accountId: string;
  /** Payments collected in the window. The denominator for every rate below. */
  paidCount: number;
  paidVolume: number;
  disputedCount: number;
  disputedVolume: number;
  /** Disputes the bank decided against us. Not an allegation — an outcome. */
  chargebacksLost: number;
  refundCount: number;
  refundedVolume: number;
  /** Quick Stops that reached no_show_confirmed. See the caveat on its factor. */
  noShowsConfirmed: number;
  /** Already suspended by staff. The one unambiguous confirmed violation. */
  suspended: boolean;
  accountAgeDays: number;
};

export type RiskFactorKind = 'signal' | 'confirmed';

export type RiskFactor = {
  key: string;
  label: string;
  /** The raw numbers behind the points, so a reviewer can check the score. */
  detail: string;
  points: number;
  kind: RiskFactorKind;
};

export type RiskBand = 'high' | 'elevated' | 'normal';

export type RiskAssessment = {
  score: number;
  band: RiskBand;
  factors: RiskFactor[];
};

/**
 * Below these, a rate is noise. One dispute against two payments is 50% and
 * means nothing; the same rate against eighty payments is a pattern.
 */
const MIN_PAYMENTS_FOR_RATE = 5;
const MIN_VOLUME_FOR_RATE = 500;

const BAND_HIGH = 50;
const BAND_ELEVATED = 20;

const pct = (n: number, d: number): number => (d > 0 ? (n / d) * 100 : 0);
const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

export function assessRisk(signals: RiskSignals): RiskAssessment {
  const factors: RiskFactor[] = [];

  // ---- Confirmed outcomes -------------------------------------------------

  if (signals.suspended) {
    factors.push({
      key: 'suspended',
      label: 'Already suspended',
      detail: 'Staff have suspended this account.',
      // Deliberately zero. A suspended account is not a candidate for review —
      // it has already been reviewed and acted on. It stays visible so nobody
      // re-opens a settled case, but inflating its score would keep it pinned
      // to the top of a queue of accounts that still need a decision.
      points: 0,
      kind: 'confirmed',
    });
  }

  if (signals.chargebacksLost > 0) {
    factors.push({
      key: 'chargebacks_lost',
      label: 'Chargebacks lost',
      detail: `${signals.chargebacksLost} dispute${signals.chargebacksLost === 1 ? '' : 's'} decided against us.`,
      // The heaviest weight here, because it is the only money signal that is
      // an adjudicated outcome rather than an allegation, and we bore the loss.
      //
      // Capped at exactly BAND_HIGH, not below it: this is the one factor that
      // must be able to reach the top band on nothing but itself. A cap of 45
      // meant two adjudicated losses still read as "worth a look" rather than
      // "worth a look now", which puts the strongest evidence the system has
      // below a threshold it can never cross alone.
      points: Math.min(BAND_HIGH, signals.chargebacksLost * 25),
      kind: 'confirmed',
    });
  }

  if (signals.noShowsConfirmed > 0) {
    factors.push({
      key: 'no_shows',
      label: 'Confirmed no-shows',
      // The caveat matters and is carried into the UI: no_show_confirmed is
      // also reachable from the customer's own public report link, not only
      // from a staff adjudication. So this is "confirmed" in the sense that
      // something concluded it, not in the sense that a human here verified it.
      detail: `${signals.noShowsConfirmed} Quick Stop${signals.noShowsConfirmed === 1 ? '' : 's'} ended as a confirmed no-show. Some of these are customer-reported rather than staff-verified.`,
      points: Math.min(30, signals.noShowsConfirmed * 8),
      kind: 'confirmed',
    });
  }

  // ---- Signals ------------------------------------------------------------

  if (signals.disputedCount > 0) {
    factors.push({
      key: 'disputes',
      label: 'Open or past disputes',
      detail: `${signals.disputedCount} disputed payment${signals.disputedCount === 1 ? '' : 's'} totalling ${usd(signals.disputedVolume)}.`,
      points: Math.min(30, signals.disputedCount * 12),
      kind: 'signal',
    });
  }

  const disputeRate = pct(signals.disputedCount, signals.paidCount);
  if (signals.paidCount >= MIN_PAYMENTS_FOR_RATE && disputeRate >= 2) {
    factors.push({
      key: 'dispute_rate',
      label: 'High dispute rate',
      detail: `${disputeRate.toFixed(1)}% of ${signals.paidCount} payments were disputed. Card networks start asking questions around 1%.`,
      points: 20,
      kind: 'signal',
    });
  }

  const refundRate = pct(signals.refundedVolume, signals.paidVolume);
  if (signals.paidVolume >= MIN_VOLUME_FOR_RATE && refundRate >= 25) {
    factors.push({
      key: 'refund_rate',
      label: 'High refund rate',
      // Said plainly, because this factor is the one most likely to be innocent
      // and a reviewer should hesitate before treating it as evidence.
      detail: `${refundRate.toFixed(0)}% of ${usd(signals.paidVolume)} collected was refunded. Often just a business that makes things right.`,
      points: 15,
      kind: 'signal',
    });
  }

  // Fraud that gets caught usually looks like a new account moving real money
  // fast. On its own this is close to meaningless — it also describes a
  // successful launch — so it scores low and only counts alongside something.
  if (signals.accountAgeDays < 30 && signals.paidVolume >= 2000) {
    factors.push({
      key: 'new_and_busy',
      label: 'New account, real volume',
      detail: `${usd(signals.paidVolume)} collected in the first ${Math.max(1, Math.round(signals.accountAgeDays))} days.`,
      points: 10,
      kind: 'signal',
    });
  }

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, band: bandFor(score), factors };
}

export function bandFor(score: number): RiskBand {
  if (score >= BAND_HIGH) return 'high';
  if (score >= BAND_ELEVATED) return 'elevated';
  return 'normal';
}

export const RISK_BAND_LABEL: Record<RiskBand, string> = {
  high: 'Worth a look now',
  elevated: 'Worth a look',
  normal: 'Nothing standing out',
};

/**
 * Wording chosen to describe what the score IS, not what the account is.
 * "High risk account" is a verdict; "several signals worth reviewing" is what
 * the arithmetic can actually support.
 */
export const RISK_BAND_HELP: Record<RiskBand, string> = {
  high: 'Several signals at once, or an adjudicated loss. Open it before deciding anything.',
  elevated: 'One signal above the level where it stops being noise.',
  normal: 'Nothing here crossed a threshold.',
};

/** Only accounts with something to say. Everything else is not a queue item. */
export function isWorthReviewing(assessment: RiskAssessment): boolean {
  return assessment.factors.length > 0;
}
