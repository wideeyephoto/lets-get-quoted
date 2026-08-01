// Projecting the bank balance forward.
//
// This is the math only: it takes a list of dated, signed money movements and
// turns them into balance curves. It knows nothing about jobs, payroll or
// Supabase — cash-forecast-data.ts does that part — which is what lets the
// browser re-run it on every drag of the starting-balance slider instead of
// round-tripping to the server for each pixel.
//
// PURE and CLOCK-FREE. `todayKey` is passed in. Date keys are 'YYYY-MM-DD' and
// all arithmetic goes through UTC, because parsing a bare date key as local time
// shifts it a day for anyone west of Greenwich.

import { addDays, daysBetween } from '@/lib/pay-day';

export type CashEventKind =
  // Outgoing
  | 'payroll'
  | 'materials'
  | 'equipment'
  | 'bill'
  | 'tax'
  | 'loan'
  | 'other'
  // Incoming
  | 'deposit'
  | 'final'
  | 'installment'
  | 'recurring'
  | 'job'
  | 'other_in';

export const OUTGOING_KINDS: CashEventKind[] = ['payroll', 'materials', 'equipment', 'bill', 'tax', 'loan', 'other'];

/** A single dated movement of money. Positive is in, negative is out. */
export type CashEvent = {
  id: string;
  dateKey: string;
  /** "Crew payroll", "Johnson deposit" — the thing itself. */
  label: string;
  /** "Payroll · week of 27 Jul" — where it came from. */
  detail: string;
  /** SIGNED. Positive money in, negative money out. */
  amount: number;
  kind: CashEventKind;
  /**
   * True when this will happen for this amount on this date unless something
   * goes wrong — a bill with a due date, an approved payroll run, a charge
   * already in flight. False when we worked it out: unapproved hours, a quote
   * that hasn't been invoiced, a payment link nobody has clicked yet.
   */
  confirmed: boolean;
  /**
   * Customer money, which can arrive later than hoped. Only ever set on
   * incoming events — an outgoing bill doesn't slip, it bounces.
   */
  slips: boolean;
  /** Part of a repeating series. Drawn as a circle rather than an arrow. */
  repeating: boolean;
  href: string | null;
};

export type ForecastOptions = {
  todayKey: string;
  /** How many days the window covers, including today. */
  days: number;
  startingBalance: number;
  /** The floor the owner wants to stay above. */
  buffer: number;
  /** Worst case: days late customer money arrives. 0 turns the stress test off. */
  lateDays: number;
  /** Worst case: percent to inflate ESTIMATED outgoing by. Default 10. */
  costStressPct?: number;
  /** Overdraft protection / line of credit — how far below zero they can reach. */
  creditLine?: number;
};

export type ForecastDay = {
  index: number;
  dateKey: string;
  /** Every event: the headline line. */
  projected: number;
  /** Confirmed events only: how much of the projection is actually pinned down. */
  confirmedOnly: number;
  /** Customer money late + estimated costs stressed. */
  worstCase: number;
  /** Money in on this day (positive). */
  incoming: number;
  /** Money out on this day (positive). */
  outgoing: number;
  cumulativeIn: number;
  cumulativeOut: number;
  /**
   * The balance needed at the END of this day to cover everything still to come
   * without dropping below the buffer. Different from the buffer itself: this
   * one moves with what's ahead.
   */
  minimumRequired: number;
  events: CashEvent[];
};

export type ForecastPoint = { dateKey: string; index: number; balance: number };

export type Forecast = {
  days: ForecastDay[];
  todayKey: string;
  lowest: ForecastPoint;
  ending: number;
  /** First day the projected line drops under the buffer. */
  firstBelowBuffer: ForecastPoint | null;
  /** First day the projected line goes negative. */
  overdraft: ForecastPoint | null;
  /** Same, on the stressed line — the one that matters for "could this go wrong". */
  worstCaseLowest: ForecastPoint;
  worstCaseOverdraft: ForecastPoint | null;
  /** Smallest starting balance that keeps the projected line at or above buffer. */
  safeStartingCash: number;
  totals: {
    incoming: number;
    outgoing: number;
    confirmedIn: number;
    estimatedIn: number;
    confirmedOut: number;
    estimatedOut: number;
    net: number;
  };
};

export function isIncoming(event: CashEvent): boolean {
  return event.amount > 0;
}

/** Cents, so a long chain of additions can't drift into $0.30000000000000004. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Where an event lands in the window.
 *
 * Anything already overdue is pulled onto today rather than dropped: an unpaid
 * bill from last Tuesday is still going to come out of this month's money, and
 * leaving it off the chart is how a forecast ends up cheerfully wrong. Anything
 * past the far edge falls off, which is what "a 30-day forecast" means.
 */
function slotFor(dateKey: string, todayKey: string, days: number): number | null {
  const offset = daysBetween(todayKey, dateKey);
  if (offset >= days) return null;
  return Math.max(0, offset);
}

export function buildForecast(events: CashEvent[], options: ForecastOptions): Forecast {
  const days = Math.max(1, Math.round(options.days));
  const { todayKey, buffer } = options;
  const stress = 1 + Math.max(0, options.costStressPct ?? 10) / 100;
  const lateDays = Math.max(0, Math.round(options.lateDays));

  const dateKeys = Array.from({ length: days }, (_, index) => addDays(todayKey, index));

  const perDay: CashEvent[][] = Array.from({ length: days }, () => []);
  const delta = new Array<number>(days).fill(0);
  const confirmedDelta = new Array<number>(days).fill(0);
  const worstDelta = new Array<number>(days).fill(0);
  const inPerDay = new Array<number>(days).fill(0);
  const outPerDay = new Array<number>(days).fill(0);

  const totals = { incoming: 0, outgoing: 0, confirmedIn: 0, estimatedIn: 0, confirmedOut: 0, estimatedOut: 0, net: 0 };

  for (const event of events) {
    const slot = slotFor(event.dateKey, todayKey, days);
    if (slot === null) continue;

    perDay[slot].push(event);
    delta[slot] += event.amount;
    if (event.confirmed) confirmedDelta[slot] += event.amount;

    if (event.amount >= 0) {
      inPerDay[slot] += event.amount;
      totals.incoming += event.amount;
      if (event.confirmed) totals.confirmedIn += event.amount;
      else totals.estimatedIn += event.amount;
    } else {
      outPerDay[slot] += -event.amount;
      totals.outgoing += -event.amount;
      if (event.confirmed) totals.confirmedOut += -event.amount;
      else totals.estimatedOut += -event.amount;
    }

    // The stress test, applied per event rather than to the finished curve:
    // customer money arrives `lateDays` later (and if that pushes it past the
    // window, it simply doesn't arrive in time — which is the point), and
    // outgoing we only ESTIMATED comes in heavier than we guessed.
    if (event.slips && event.amount > 0) {
      const lateSlot = slotFor(addDays(event.dateKey, lateDays), todayKey, days);
      if (lateSlot !== null) worstDelta[lateSlot] += event.amount;
    } else if (event.amount < 0 && !event.confirmed) {
      worstDelta[slot] += event.amount * stress;
    } else {
      worstDelta[slot] += event.amount;
    }
  }

  totals.net = round(totals.incoming - totals.outgoing);
  totals.incoming = round(totals.incoming);
  totals.outgoing = round(totals.outgoing);
  totals.confirmedIn = round(totals.confirmedIn);
  totals.estimatedIn = round(totals.estimatedIn);
  totals.confirmedOut = round(totals.confirmedOut);
  totals.estimatedOut = round(totals.estimatedOut);

  const start = options.startingBalance;
  const projected = new Array<number>(days).fill(0);
  const confirmedOnly = new Array<number>(days).fill(0);
  const worstCase = new Array<number>(days).fill(0);
  const cumulativeIn = new Array<number>(days).fill(0);
  const cumulativeOut = new Array<number>(days).fill(0);

  let runningProjected = start;
  let runningConfirmed = start;
  let runningWorst = start;
  let runningIn = 0;
  let runningOut = 0;
  for (let index = 0; index < days; index++) {
    runningProjected += delta[index];
    runningConfirmed += confirmedDelta[index];
    runningWorst += worstDelta[index];
    runningIn += inPerDay[index];
    runningOut += outPerDay[index];
    projected[index] = round(runningProjected);
    confirmedOnly[index] = round(runningConfirmed);
    worstCase[index] = round(runningWorst);
    cumulativeIn[index] = round(runningIn);
    cumulativeOut[index] = round(runningOut);
  }

  // Minimum required, walked backwards. balance[i+1] = balance[i] + delta[i+1],
  // so to keep tomorrow at or above what tomorrow needs, today has to end at
  // required[i+1] - delta[i+1]. Never below the buffer itself.
  const minimumRequired = new Array<number>(days).fill(buffer);
  for (let index = days - 2; index >= 0; index--) {
    minimumRequired[index] = round(Math.max(buffer, minimumRequired[index + 1] - delta[index + 1]));
  }

  const point = (index: number, series: number[]): ForecastPoint => ({
    index,
    dateKey: dateKeys[index],
    balance: series[index],
  });

  const lowestIndex = projected.reduce((low, value, index) => (value < projected[low] ? index : low), 0);
  const worstLowestIndex = worstCase.reduce((low, value, index) => (value < worstCase[low] ? index : low), 0);
  const belowBufferIndex = projected.findIndex((value) => value < buffer);
  const overdraftIndex = projected.findIndex((value) => value < 0);
  const worstOverdraftIndex = worstCase.findIndex((value) => value < 0);

  // The smallest starting balance that never dips under the buffer. The curve
  // only ever moves by the same deltas, so this is one subtraction against the
  // deepest point rather than a search.
  const lowestDelta = projected.reduce((low, value) => Math.min(low, value - start), 0);
  const safeStartingCash = round(Math.max(buffer, buffer - lowestDelta));

  return {
    todayKey,
    days: dateKeys.map((dateKey, index) => ({
      index,
      dateKey,
      projected: projected[index],
      confirmedOnly: confirmedOnly[index],
      worstCase: worstCase[index],
      incoming: round(inPerDay[index]),
      outgoing: round(outPerDay[index]),
      cumulativeIn: cumulativeIn[index],
      cumulativeOut: cumulativeOut[index],
      minimumRequired: minimumRequired[index],
      // Biggest movement first: the day a $9,000 payroll and a $40 subscription
      // land together should not open with the subscription.
      events: perDay[index].slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    })),
    lowest: point(lowestIndex, projected),
    ending: projected[days - 1],
    firstBelowBuffer: belowBufferIndex === -1 ? null : point(belowBufferIndex, projected),
    overdraft: overdraftIndex === -1 ? null : point(overdraftIndex, projected),
    worstCaseLowest: point(worstLowestIndex, worstCase),
    worstCaseOverdraft: worstOverdraftIndex === -1 ? null : point(worstOverdraftIndex, worstCase),
    safeStartingCash,
    totals,
  };
}

// -- Repeating scheduled payments --------------------------------------------

export type Recurrence = 'once' | 'weekly' | 'biweekly' | 'monthly';

/**
 * Every date a repeating commitment lands on inside a window.
 *
 * Walks forward from the FIRST occurrence rather than from today, so the series
 * is reproducible: a truck payment first due on the 3rd stays on the 3rd
 * whenever the forecast is recomputed. Monthly clamps into short months the same
 * way recurring plans do (the 31st becomes the 30th/28th) — and, like there, a
 * clamp is permanent for the rest of the series.
 */
export function expandRecurrence(
  firstDateKey: string,
  recurrence: Recurrence,
  window: { fromKey: string; toKey: string },
  endsOn?: string | null,
  maxOccurrences = 400,
): string[] {
  if (recurrence === 'once') {
    if (firstDateKey > window.toKey) return [];
    // An overdue one-off still has to be paid, so it counts; buildForecast pulls
    // it onto today.
    if (endsOn && firstDateKey > endsOn) return [];
    return [firstDateKey];
  }

  const out: string[] = [];
  let dateKey = firstDateKey;
  for (let count = 0; count < maxOccurrences; count++) {
    if (dateKey > window.toKey) break;
    if (endsOn && dateKey > endsOn) break;
    if (dateKey >= window.fromKey) out.push(dateKey);
    dateKey = advanceRecurrence(dateKey, recurrence);
  }
  return out;
}

function advanceRecurrence(dateKey: string, recurrence: Recurrence): string {
  if (recurrence === 'monthly') {
    const [year, month, day] = dateKey.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, lastDay))}`;
  }
  return addDays(dateKey, recurrence === 'weekly' ? 7 : 14);
}

// -- Labels ------------------------------------------------------------------

export const KIND_LABEL: Record<CashEventKind, string> = {
  payroll: 'Payroll',
  materials: 'Materials',
  equipment: 'Equipment',
  bill: 'Bill',
  tax: 'Tax',
  loan: 'Loan',
  other: 'Other',
  deposit: 'Customer deposit',
  final: 'Customer payment',
  installment: 'Payment plan',
  recurring: 'Recurring plan',
  job: 'Job payment',
  other_in: 'Other income',
};

/**
 * Which shape a marker gets.
 *
 * Payroll is a diamond because it is the one nobody can be late with; repeating
 * outgoings are circles because they keep coming; everything else is an arrow in
 * the direction the money moves.
 */
export function markerShape(event: CashEvent): 'diamond' | 'up' | 'down' | 'circle' {
  if (event.kind === 'payroll') return 'diamond';
  if (event.amount > 0) return 'up';
  return event.repeating ? 'circle' : 'down';
}
