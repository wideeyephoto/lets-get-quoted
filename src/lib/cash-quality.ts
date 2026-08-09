// Whether the forecast is worth the confidence it is drawn with.
//
// The page had a real example of the problem: two recurring rows both called
// "Phone & software", one +$4,000 in and one −$400 out. One of those is almost
// certainly a typo — a direction picked wrong, or a decimal — and the forecast
// drew both without comment, which meant a $4,400 swing a month rested on a
// mistake nobody was ever asked about.
//
// Nothing here deletes or corrects anything. It asks. A forecast that silently
// fixes its inputs is worse than one that draws them wrong, because at least
// the wrong one can be spotted.
//
// The second half is confidence: how much of what is drawn is CONFIRMED versus
// worked out, and how old the balance underneath it is. Both are facts the page
// already had and never said.
//
// PURE and CLOCK-FREE — `todayKey` and the balance's age come in as values.

import type { CashEvent, Forecast } from '@/lib/cash-forecast';

export type CashFlagKind = 'contradictory_pair' | 'duplicate' | 'outsized' | 'stale_balance';

export type CashFlag = {
  kind: CashFlagKind;
  /** The one-line question to put in front of somebody. */
  question: string;
  /** What we can see, so the question can be answered without hunting. */
  detail: string;
  /** Where it gets settled. */
  href: string | null;
};

export type CashConfidence = {
  /** Share of the money moving that is confirmed rather than estimated, 0–1. */
  confirmedShare: number;
  /** 'high' | 'fair' | 'low' — the word for it. */
  level: 'high' | 'fair' | 'low';
  sentence: string;
};

/** Same name, opposite directions — the "Phone & software" case. */
const SAME_NAME = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

export function cashFlags(
  events: CashEvent[],
  options: { base: string; balanceAgeDays: number | null; staleAfterDays?: number },
): CashFlag[] {
  const flags: CashFlag[] = [];
  const staleAfter = options.staleAfterDays ?? 7;

  // One entry per distinct name, carrying what was seen under it. Recurring
  // series land many times in a window, so the same name legitimately repeats —
  // it is the same name in BOTH DIRECTIONS that is the tell.
  const byName = new Map<string, { label: string; in: CashEvent[]; out: CashEvent[] }>();
  for (const event of events) {
    const key = SAME_NAME(event.label);
    if (!key) continue;
    const bucket = byName.get(key) ?? { label: event.label, in: [], out: [] };
    (event.amount >= 0 ? bucket.in : bucket.out).push(event);
    byName.set(key, bucket);
  }

  for (const bucket of byName.values()) {
    if (bucket.in.length === 0 || bucket.out.length === 0) continue;
    const inAmount = Math.abs(bucket.in[0].amount);
    const outAmount = Math.abs(bucket.out[0].amount);
    flags.push({
      kind: 'contradictory_pair',
      question: `Is “${bucket.label}” money in or money out?`,
      detail: `Two entries share this name — one bringing in ${money(inAmount)} and one paying out ${money(outAmount)}. One of them has its direction, or its decimal point, wrong.`,
      href: `${options.base}/cash-flow#cash-bills`,
    });
  }

  if (options.balanceAgeDays !== null && options.balanceAgeDays > staleAfter) {
    flags.push({
      kind: 'stale_balance',
      question: `Is ${options.balanceAgeDays} days ago still today's balance?`,
      detail: 'Every projection on this page is that number plus what has happened since. Open your banking app and put the current one in.',
      href: null,
    });
  }

  return flags;
}

/**
 * How much of the curve is pinned down.
 *
 * Measured on the money that MOVES, not on the count of events: fifty $40
 * subscriptions being certain says nothing useful about a month whose shape is
 * one $30,000 payment that might not come.
 */
export function cashConfidence(forecast: Forecast): CashConfidence {
  const { confirmedIn, confirmedOut, incoming, outgoing } = forecast.totals;
  const moving = incoming + outgoing;
  const confirmedShare = moving > 0 ? Math.round(((confirmedIn + confirmedOut) / moving) * 100) / 100 : 1;

  const level = confirmedShare >= 0.75 ? 'high' : confirmedShare >= 0.45 ? 'fair' : 'low';
  const pct = Math.round(confirmedShare * 100);
  const sentence =
    level === 'high'
      ? `${pct}% of the money moving here is confirmed — dates and amounts that are already set.`
      : level === 'fair'
        ? `${pct}% of the money moving here is confirmed. The rest is worked out from hours logged, quotes on the calendar and payments nobody has made yet.`
        : `Only ${pct}% of the money moving here is confirmed, so treat the line as a shape rather than a schedule.`;

  return { confirmedShare, level, sentence };
}

function money(value: number): string {
  const rounded = Math.round(value);
  return `$${Math.abs(rounded).toLocaleString('en-US')}`;
}
