// Was the last forecast right?
//
// Pure. The comparison is deliberately narrow: it takes what the page DREW on an
// earlier day and the balance the owner has just typed in, and reports the gap.
// It does not try to explain the gap, because it can't — a contractor's bank
// account also carries cash jobs, owner draws, transfers and card spend that
// this app never sees. Pretending otherwise would turn a useful number into an
// accusation.
//
// So the honest output is: here is what we said, here is what happened, here is
// the difference, and the screen says out loud that some of it was never ours to
// predict.

import { daysBetween } from '@/lib/pay-day';

export type CashSnapshot = {
  takenOn: string;
  balance: number;
  buffer: number;
  horizonDays: number;
  /** The curve as drawn that day. */
  projected: { d: string; p: number }[];
};

export type ForecastAccuracy = {
  takenOn: string;
  daysAgo: number;
  /** What the curve said today would be. */
  predicted: number;
  /** What the owner says it actually is. */
  actual: number;
  /** actual − predicted. Positive means better off than forecast. */
  delta: number;
  /** Size of the miss against the predicted figure, or null when it predicted zero. */
  pct: number | null;
  direction: 'ahead' | 'behind' | 'on';
  /** What the balance was when that forecast was made. */
  startedAt: number;
};

/** Under this, a miss isn't a miss — it's the change in somebody's pocket. */
const ON_TARGET = 50;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compare one earlier forecast against today's real balance.
 *
 * Returns null when there's nothing honest to say: no snapshot, one taken today
 * (it would be comparing a number to itself), or one whose curve never reached
 * today — a 30-day forecast from six weeks ago has no opinion about now, and
 * extrapolating one would invent the answer.
 */
export function compareForecast(
  snapshot: CashSnapshot | null,
  input: { todayKey: string; actualBalance: number },
): ForecastAccuracy | null {
  if (!snapshot) return null;
  const daysAgo = daysBetween(snapshot.takenOn, input.todayKey);
  if (daysAgo <= 0) return null;

  const point = snapshot.projected.find((entry) => entry.d === input.todayKey);
  if (!point || !Number.isFinite(point.p)) return null;

  const predicted = round(point.p);
  const actual = round(input.actualBalance);
  const delta = round(actual - predicted);

  return {
    takenOn: snapshot.takenOn,
    daysAgo,
    predicted,
    actual,
    delta,
    pct: predicted === 0 ? null : Math.round((Math.abs(delta) / Math.abs(predicted)) * 100),
    direction: Math.abs(delta) < ON_TARGET ? 'on' : delta > 0 ? 'ahead' : 'behind',
    startedAt: round(snapshot.balance),
  };
}

/**
 * The sentence to put in front of it.
 *
 * Written so that being wrong reads as information rather than as a failure —
 * because most of the time it IS information: money that didn't arrive is the
 * thing the owner needs to go and chase.
 */
export function accuracySentence(accuracy: ForecastAccuracy): string {
  const money = (value: number) =>
    `${value < 0 ? '−' : ''}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`;
  const when = accuracy.daysAgo === 1 ? 'Yesterday' : `${accuracy.daysAgo} days ago`;

  if (accuracy.direction === 'on') {
    return `${when} this said you'd be at ${money(accuracy.predicted)} today. You're at ${money(accuracy.actual)} — near enough.`;
  }
  const word = accuracy.direction === 'ahead' ? 'better off' : 'short';
  return `${when} this said you'd be at ${money(accuracy.predicted)} today. You're at ${money(
    accuracy.actual,
  )} — ${money(Math.abs(accuracy.delta))} ${word}.`;
}
