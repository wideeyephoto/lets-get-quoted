import { describe, it, expect } from 'vitest';
import {
  assessRisk,
  bandFor,
  isWorthReviewing,
  RISK_BAND_LABEL,
  type RiskSignals,
} from '@/lib/risk-score';

// The thresholds here are the arguable part of the whole feature, so they are
// argued about in this file rather than against production data. The property
// that matters most is the one the product owner asked for out loud: a signal
// must never be presented as a violation.

const signals = (over: Partial<RiskSignals> = {}): RiskSignals => ({
  accountId: 'a1',
  paidCount: 0,
  paidVolume: 0,
  disputedCount: 0,
  disputedVolume: 0,
  chargebacksLost: 0,
  refundCount: 0,
  refundedVolume: 0,
  noShowsConfirmed: 0,
  suspended: false,
  accountAgeDays: 400,
  ...over,
});

const keys = (s: RiskSignals) => assessRisk(s).factors.map((f) => f.key);
const factor = (s: RiskSignals, key: string) => assessRisk(s).factors.find((f) => f.key === key);

describe('a clean account', () => {
  it('produces nothing at all, and is not a queue item', () => {
    const assessment = assessRisk(signals({ paidCount: 200, paidVolume: 90_000 }));
    expect(assessment.factors).toEqual([]);
    expect(assessment.score).toBe(0);
    expect(isWorthReviewing(assessment)).toBe(false);
  });
});

describe('signals are kept apart from confirmed outcomes', () => {
  // The stated design constraint. If this ever collapses into one list, a
  // customer's assertion starts reading as a finding against the contractor.
  it('classifies a dispute as a signal, not a violation', () => {
    expect(factor(signals({ disputedCount: 2, disputedVolume: 800 }), 'disputes')?.kind).toBe('signal');
  });

  it('classifies an adjudicated chargeback loss as confirmed', () => {
    expect(factor(signals({ chargebacksLost: 1 }), 'chargebacks_lost')?.kind).toBe('confirmed');
  });

  it('weighs the adjudicated outcome above the allegation', () => {
    const lost = factor(signals({ chargebacksLost: 1 }), 'chargebacks_lost')!.points;
    const alleged = factor(signals({ disputedCount: 1 }), 'disputes')!.points;
    expect(lost).toBeGreaterThan(alleged);
  });

  // Every factor has to be readable on its own: the score is only trustworthy
  // if a reviewer can check the arithmetic behind it.
  it('always explains itself with the underlying numbers', () => {
    const all = assessRisk(signals({
      disputedCount: 3, disputedVolume: 1200, paidCount: 40, paidVolume: 20_000,
      refundedVolume: 9000, refundCount: 8, chargebacksLost: 1, noShowsConfirmed: 2,
    }));
    for (const f of all.factors) {
      expect(f.detail.length).toBeGreaterThan(10);
      expect(f.label.length).toBeGreaterThan(0);
    }
  });

  // The no-show state is reachable from the customer's own public report link,
  // not only from a staff adjudication, and the UI must not overclaim.
  it('admits that a confirmed no-show may not be staff-verified', () => {
    expect(factor(signals({ noShowsConfirmed: 1 }), 'no_shows')?.detail).toMatch(/customer-reported/i);
  });
});

describe('rates need a denominator worth dividing by', () => {
  // One dispute against two payments is 50% and means nothing.
  it('ignores a dispute rate on too few payments', () => {
    expect(keys(signals({ paidCount: 2, disputedCount: 1, paidVolume: 400 }))).not.toContain('dispute_rate');
  });

  it('counts it once there are enough payments to mean something', () => {
    expect(keys(signals({ paidCount: 40, disputedCount: 4, paidVolume: 20_000 }))).toContain('dispute_rate');
  });

  it('ignores a refund rate on trivial volume', () => {
    // 100% refunded, but of $200 — a single job that got called off.
    expect(keys(signals({ paidCount: 1, paidVolume: 200, refundedVolume: 200, refundCount: 1 }))).not.toContain('refund_rate');
  });

  it('counts it once real money is involved', () => {
    expect(keys(signals({ paidCount: 20, paidVolume: 20_000, refundedVolume: 9000, refundCount: 6 }))).toContain('refund_rate');
  });
});

describe('a suspended account', () => {
  const suspended = signals({ suspended: true, disputedCount: 1, disputedVolume: 300 });

  it('is shown, so nobody reopens a settled case', () => {
    expect(keys(suspended)).toContain('suspended');
  });

  // It has already been reviewed and acted on. Scoring it would pin it to the
  // top of a queue of accounts that still need a decision.
  it('scores nothing for the suspension itself', () => {
    expect(factor(suspended, 'suspended')!.points).toBe(0);
  });
});

describe('the bands', () => {
  it('escalate at 20 and 50', () => {
    expect(bandFor(0)).toBe('normal');
    expect(bandFor(19)).toBe('normal');
    expect(bandFor(20)).toBe('elevated');
    expect(bandFor(49)).toBe('elevated');
    expect(bandFor(50)).toBe('high');
  });

  // A band name that reads as a verdict on the business ("high risk account")
  // is exactly what the separation of signal from violation exists to prevent.
  it('describe the score rather than judging the account', () => {
    for (const label of Object.values(RISK_BAND_LABEL)) {
      expect(label.toLowerCase()).not.toContain('fraud');
      expect(label.toLowerCase()).not.toContain('risk');
    }
  });

  // The strongest evidence the system has must be able to reach the top band on
  // nothing but itself. One loss is a bad month; two is a pattern.
  it('puts two lost chargebacks into the top band on their own', () => {
    expect(assessRisk(signals({ chargebacksLost: 1 })).band).toBe('elevated');
    expect(assessRisk(signals({ chargebacksLost: 2 })).band).toBe('high');
  });

  it('leaves one mild signal on its own below the top band', () => {
    expect(assessRisk(signals({ disputedCount: 1, disputedVolume: 200 })).band).toBe('normal');
  });
});

describe('caps', () => {
  // Without these, one pathological account buries everything else in the queue
  // and the ordering stops being useful.
  it('stop any single factor from dominating the score', () => {
    expect(factor(signals({ chargebacksLost: 50 }), 'chargebacks_lost')!.points).toBe(50);
    expect(factor(signals({ disputedCount: 50, disputedVolume: 1 }), 'disputes')!.points).toBe(30);
    expect(factor(signals({ noShowsConfirmed: 50 }), 'no_shows')!.points).toBe(30);
  });
});

describe('a new account moving real money', () => {
  it('is noted, but weakly — it also describes a good launch', () => {
    const f = factor(signals({ accountAgeDays: 10, paidCount: 12, paidVolume: 8000 }), 'new_and_busy');
    expect(f?.kind).toBe('signal');
    expect(f!.points).toBeLessThan(20);
    // On its own it must not be enough to flag anybody for review.
    expect(assessRisk(signals({ accountAgeDays: 10, paidCount: 12, paidVolume: 8000 })).band).toBe('normal');
  });

  it('is not raised for an established account', () => {
    expect(keys(signals({ accountAgeDays: 400, paidVolume: 80_000, paidCount: 100 }))).not.toContain('new_and_busy');
  });
});

describe('division by zero', () => {
  it('never produces NaN on an account that has collected nothing', () => {
    const assessment = assessRisk(signals({ disputedCount: 1, disputedVolume: 500, paidCount: 0, paidVolume: 0 }));
    expect(Number.isFinite(assessment.score)).toBe(true);
    expect(assessment.score).toBeGreaterThan(0);
  });
});
