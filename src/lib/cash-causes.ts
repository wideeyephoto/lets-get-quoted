// What made the low, and what can be done about it.
//
// The page could tell you the account dips to $2,029 on Sep 3 and then stopped,
// which leaves the actual work — scrolling a ledger of eighty rows to find the
// four that matter, then working out which of them you have any control over —
// entirely on the reader. A warning you have to do research on is a worry, not
// a warning.
//
// So: name the movements that dug the hole, and put the thing you would do
// about each one next to it. The actions are deliberately specific to the KIND
// of money. You cannot defer payroll. You can chase an invoice, move a bill,
// or draw on a line of credit — and which of those is available depends on
// what is actually in the hole.
//
// PURE and CLOCK-FREE.

import { daysBetween } from '@/lib/pay-day';
import type { CashEvent, CashEventKind, Forecast } from '@/lib/cash-forecast';

export type CashActionKind =
  | 'chase_payment'
  | 'record_payment'
  | 'edit_payroll'
  | 'move_bill'
  | 'invoice_work'
  | 'draw_credit';

export type CashAction = {
  kind: CashActionKind;
  label: string;
  /** Where it goes. Null when the action is advice rather than a destination. */
  href: string | null;
  /** Why this one is offered here. */
  why: string;
};

export type CashCause = {
  /** The event that dug the hole. */
  event: CashEvent;
  /** How much of the drop this one movement accounts for, 0–1. */
  share: number;
  actions: CashAction[];
};

export type CashLowPanel = {
  dateKey: string;
  daysAway: number;
  balance: number;
  /** How far the day fell from the running balance before it. */
  drop: number;
  /** "Crew payroll causes the Sep 3 low." */
  headline: string;
  causes: CashCause[];
};

/** Where each kind of money is edited. `base` is /dashboard or /demo. */
function actionsFor(event: CashEvent, base: string): CashAction[] {
  const kind: CashEventKind = event.kind;

  if (event.amount > 0) {
    // Money that has not arrived. The lever is the date, not the amount.
    return [
      {
        kind: 'chase_payment',
        label: 'Update the expected date',
        href: event.href ?? `${base}/jobs`,
        why: 'If this is really landing later, the warning moves with it — better to know now.',
      },
      {
        kind: 'record_payment',
        label: 'Record money already received',
        href: `${base}/jobs`,
        why: 'Anything paid outside the app is missing from this line entirely.',
      },
    ];
  }

  if (kind === 'payroll') {
    return [
      {
        kind: 'edit_payroll',
        label: 'Check hours and pay',
        href: `${base}/crew`,
        why: 'Unapproved hours are priced from what is logged, so this figure moves when they are approved.',
      },
      {
        kind: 'draw_credit',
        label: 'Model a credit draw',
        href: null,
        why: 'Payroll is the one bill that cannot be moved. If the day is short, the money has to come from somewhere else.',
      },
    ];
  }

  if (kind === 'tax') {
    return [
      {
        kind: 'move_bill',
        label: 'Edit this payment',
        href: `${base}/cash-flow#cash-bills`,
        why: 'A tax date is fixed, but the amount here is an estimate you set.',
      },
    ];
  }

  return [
    {
      kind: 'move_bill',
      label: 'Defer or edit this bill',
      href: `${base}/cash-flow#cash-bills`,
      why: 'A week either side of the low is often all it takes.',
    },
  ];
}

/**
 * The day worth acting on, and what is in it.
 *
 * The low point rather than the first buffer breach: the breach is where the
 * trouble starts, the low is where it is worst, and the movements that made
 * the low are the ones with something to do about them.
 *
 * `topN` causes, biggest first, because a day with a $9,000 payroll and a $40
 * subscription in it has exactly one story.
 */
export function cashLowPanel(
  forecast: Forecast,
  options: { todayKey: string; base: string; buffer: number; topN?: number },
): CashLowPanel | null {
  const low = forecast.lowest;
  const day = forecast.days[low.index];
  if (!day) return null;

  // Nothing to explain when the account never gets near the floor.
  if (low.balance >= options.buffer && !forecast.firstBelowBuffer) return null;

  // What the day itself took out. The low is a running total, but the day that
  // holds it is where the last of the damage was done.
  const outgoing = day.events.filter((event) => event.amount < 0);
  const drop = outgoing.reduce((sum, event) => sum + -event.amount, 0);

  const causes: CashCause[] = outgoing
    .slice(0, Math.max(1, options.topN ?? 3))
    .map((event) => ({
      event,
      share: drop > 0 ? Math.round((-event.amount / drop) * 100) / 100 : 0,
      actions: actionsFor(event, options.base),
    }));

  return {
    dateKey: day.dateKey,
    daysAway: daysBetween(options.todayKey, day.dateKey),
    balance: low.balance,
    drop: Math.round(drop * 100) / 100,
    headline: lowHeadline(causes, day.dateKey),
    causes,
  };
}

/** "Crew payroll causes the Sep 3 low." */
export function lowHeadline(causes: CashCause[], dateKey: string): string {
  const when = shortDay(dateKey);
  if (causes.length === 0) return `Nothing lands on ${when} — the low is what everything before it added up to.`;
  const [first] = causes;
  // Two thirds is where one movement stops being "a factor" and starts being
  // "the reason". Below that, naming it alone would be misleading.
  if (first.share >= 0.66) return `${first.event.label} causes the ${when} low.`;
  if (causes.length === 1) return `${first.event.label} is what lands on ${when}.`;
  return `${first.event.label} and ${causes.length - 1} more land on ${when}.`;
}

function shortDay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
