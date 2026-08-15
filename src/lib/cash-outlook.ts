// What the forecast actually means, in one sentence.
//
// THE BUG THIS EXISTS TO FIX: the page drew a 30-day window, found no dip
// inside it, and printed "First warning: None". Cash went negative on day 33.
// Every number on the page was correct and the page was lying, because the
// window was a drawing choice and "None" read as a fact about the business.
//
// So risk is looked for over the LONG horizon — the furthest the data goes —
// and the window only decides how the finding is worded. A risk past the edge
// of the chart is still a risk; it just gets told differently: "No warning
// within 30 days; projected negative Sep 10."
//
// The second thing here is refusing to know what we don't. Until somebody has
// entered a bank balance the projection starts from a placeholder zero, which
// makes every balance on the curve a fiction — but the SHAPE is real, and so is
// the starting balance the shape implies. Those survive `balanceKnown: false`:
// the dates and `required` still come back, and the sentence says what they are
// dates about. What does not survive is the verdict — the status is `unknown`
// rather than Safe or Shortfall, and `headroom` is null rather than a
// placeholder measured against a real buffer.
//
// PURE and CLOCK-FREE, like cash-forecast.ts: `todayKey` comes in, nothing here
// reads a clock, so all of it can be argued with in a test.

import { daysBetween } from '@/lib/pay-day';
import type { Forecast } from '@/lib/cash-forecast';

export type CashRiskKind = 'buffer' | 'overdraft';

/** Safe / Tight / Shortfall projected, plus the honest fourth option. */
export type CashStatus = 'unknown' | 'safe' | 'tight' | 'shortfall';

export type CashRisk = {
  kind: CashRiskKind;
  dateKey: string;
  /** "Wed, Sep 10" */
  label: string;
  /** The projected balance at that point. */
  balance: number;
  daysAway: number;
  /** True when this lands past the window the chart is drawing. */
  beyondWindow: boolean;
};

export type CashLow = {
  /** The horizon this low was measured over, in days. */
  days: number;
  dateKey: string;
  label: string;
  balance: number;
};

export type CashOutlook = {
  status: CashStatus;
  /** The word for the status pill. */
  label: string;
  /** The first risk anywhere out to the long horizon, in or out of the window. */
  risk: CashRisk | null;
  /** The one line that says what happens and when. */
  sentence: string;
  /**
   * How far the lowest point sits above the buffer. Negative means it goes
   * under. Null when no balance has been entered, because then it is a
   * statement about a placeholder.
   */
  headroom: number | null;
  /**
   * Cash that has to be there before the low to stay above the buffer — the
   * gap between what the forecast needs to start with and what it has. Zero
   * when nothing is needed. Meaningful even with no balance entered, since it
   * is derived from the movements rather than from the starting point.
   */
  funding: number;
  /** The starting balance that keeps the whole long horizon above the buffer. */
  required: number;
  /** The low at each horizon, so a 30-day reader can see the 60- and 90-day floor. */
  lows: CashLow[];
};

export type CashOutlookInput = {
  /** Built over the longest horizon the data supports, NOT the selected window. */
  long: Forecast;
  todayKey: string;
  /** The window the chart is drawing, in days. */
  windowDays: number;
  /** The horizon `long` was built over, in days. */
  longDays: number;
  buffer: number;
  /** False until an owner has entered a bank balance. */
  balanceKnown: boolean;
  /** What they have today. Ignored when the balance is unknown. */
  balance: number;
};

const STATUS_LABEL: Record<CashStatus, string> = {
  unknown: 'Starting balance needed',
  safe: 'Safe',
  tight: 'Tight',
  shortfall: 'Shortfall projected',
};

/** "Wed, Sep 10", in UTC — a bare date key parsed as local shifts a day west of Greenwich. */
export function cashDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function cashMoney(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

/**
 * The lowest projected balance within the first `days` of a forecast.
 *
 * A slice rather than a second buildForecast: the long forecast already holds
 * every day, and re-running the math per horizon would be three passes over the
 * same events to answer the same question three times.
 */
export function lowestWithin(forecast: Forecast, days: number): CashLow {
  const span = forecast.days.slice(0, Math.max(1, Math.round(days)));
  const low = span.reduce((worst, day) => (day.projected < worst.projected ? day : worst), span[0]);
  return { days, dateKey: low.dateKey, label: cashDayLabel(low.dateKey), balance: low.projected };
}

export function cashOutlook(input: CashOutlookInput): CashOutlook {
  const { long, todayKey, windowDays, longDays, buffer, balanceKnown, balance } = input;

  // Chronological, not by severity. Going under the buffer always happens on or
  // before going negative (the buffer is never below zero), so the buffer breach
  // is the one that answers "when does this start".
  const first = long.firstBelowBuffer ?? long.overdraft;
  const risk: CashRisk | null = first
    ? {
        kind: long.overdraft && long.overdraft.index === first.index ? 'overdraft' : 'buffer',
        dateKey: first.dateKey,
        label: cashDayLabel(first.dateKey),
        balance: first.balance,
        daysAway: daysBetween(todayKey, first.dateKey),
        beyondWindow: daysBetween(todayKey, first.dateKey) >= windowDays,
      }
    : null;

  // Status reads the LONG horizon on purpose. Being told "Safe" while the
  // account goes negative on day 33 is the whole defect; the sentence below is
  // what keeps "Shortfall projected" from reading as "today".
  const status: CashStatus = !balanceKnown
    ? 'unknown'
    : long.overdraft
      ? 'shortfall'
      : long.firstBelowBuffer
        ? 'tight'
        : 'safe';

  const lows = [windowDays, 60, 90]
    .filter((days, index, all) => days <= longDays && all.indexOf(days) === index)
    .sort((a, b) => a - b)
    .map((days) => lowestWithin(long, days));

  const required = long.safeStartingCash;
  const funding = balanceKnown ? Math.max(0, round(required - balance)) : Math.max(0, required);
  const headroom = balanceKnown ? round(lowestWithin(long, longDays).balance - buffer) : null;

  return {
    status,
    label: STATUS_LABEL[status],
    risk,
    sentence: outlookSentence({ status, risk, long, windowDays, longDays, buffer }),
    headroom,
    funding,
    required,
    lows,
  };
}

function outlookSentence(input: {
  status: CashStatus;
  risk: CashRisk | null;
  long: Forecast;
  windowDays: number;
  longDays: number;
  buffer: number;
}): string {
  const { status, risk, long, windowDays, longDays, buffer } = input;

  if (status === 'unknown') {
    // The dates ARE shown beside this sentence when there are any, so "this
    // becomes a dated warning" read as a contradiction of the fact directly
    // under it. What is missing is not the dates, it is whose account they are
    // about. With nothing scheduled yet — the most common first visit — there
    // are no dates to point at and the fact beside it reads "None in 90 days",
    // so "these dates" would refer to nothing.
    return risk
      ? `Enter today's bank balance and these dates become a warning about your account rather than the shape of the month.`
      : `Enter today's bank balance and this becomes a forecast of your account rather than the shape of the month.`;
  }
  if (!risk) {
    return buffer > 0
      ? `Stays above your ${cashMoney(buffer)} buffer for the next ${longDays} days.`
      : `Stays above zero for the next ${longDays} days.`;
  }

  const negative = long.overdraft;
  // Two clauses, because they are two different facts: what the buffer does and
  // what zero does. When they are the same day, saying it twice is noise.
  const bufferClause =
    risk.kind === 'overdraft'
      ? `projected negative ${risk.label}`
      : buffer > 0
        ? `dips under your ${cashMoney(buffer)} buffer ${risk.label}`
        : `hits zero ${risk.label}`;
  const zeroClause =
    negative && negative.dateKey !== risk.dateKey ? `, negative ${cashDayLabel(negative.dateKey)}` : '';

  if (risk.beyondWindow) {
    // The sentence the 30-day view was missing entirely.
    return `No warning within ${windowDays} days; ${bufferClause}${zeroClause}.`;
  }
  const opening = bufferClause.charAt(0).toUpperCase() + bufferClause.slice(1);
  return `${opening}${zeroClause}.`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
