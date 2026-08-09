// Base / Payments late / Stress test, as a first-class control.
//
// This used to be a checkbox called "Model customer payments arriving late",
// folded into the settings panel below the chart, which drew a dashed line and
// changed nothing else on the page. So the one question it answers — does the
// warning date move if everybody pays me a week late — could only be answered
// by reading a second line off a chart and comparing it to a number in a card
// that had not moved.
//
// Here each scenario is a set of forecast inputs and a summary of what those
// inputs do to the two things that matter: WHEN it goes wrong and HOW MUCH it
// would take to fix. Presented side by side, the comparison is the control.
//
// PURE and CLOCK-FREE, like the rest of the forecast math.

import { buildForecast, type CashEvent } from '@/lib/cash-forecast';
import { cashDayLabel } from '@/lib/cash-outlook';
import { addDays, daysBetween } from '@/lib/pay-day';

export type ScenarioKey = 'base' | 'late' | 'stress';

export type ScenarioDef = {
  key: ScenarioKey;
  label: string;
  /** What it assumes, in one line, for the control itself. */
  hint: string;
  /** Days late every customer payment arrives. */
  lateDays: number;
  /** Percent to inflate ESTIMATED outgoing by. */
  costStressPct: number;
};

/**
 * Three, not a dial.
 *
 * "Payments late" is the thing that actually happens — a week is the median
 * slip on an invoice nobody is chasing. "Stress test" is the one worth having
 * an answer ready for: everyone slow AND the estimates light. A slider between
 * them invites tuning the assumption until the answer is comfortable.
 */
export const CASH_SCENARIOS: ScenarioDef[] = [
  { key: 'base', label: 'Base', hint: 'Everything lands when it says it will.', lateDays: 0, costStressPct: 0 },
  { key: 'late', label: 'Payments late', hint: 'Every customer payment arrives 7 days late.', lateDays: 7, costStressPct: 0 },
  {
    key: 'stress',
    label: 'Stress test',
    hint: 'Payments 14 days late and estimated costs 10% over.',
    lateDays: 14,
    costStressPct: 10,
  },
];

/**
 * The event list as this scenario would have it.
 *
 * Applied to the EVENTS rather than to the finished curve, and this is the
 * whole reason a scenario can drive the page instead of drawing a second line
 * on it: buildForecast reports the warning date, the low and the required
 * starting balance for its projected line only. Hand it a shifted list and
 * every one of those numbers is about the scenario, with no second code path.
 *
 * Two moves, and only two. Customer money arrives `lateDays` later — and if
 * that pushes it past the end of the window it simply does not arrive, which is
 * the point. Outgoing we only ESTIMATED comes in heavier than we guessed; a
 * bill with a due date does not, so confirmed costs are left alone.
 */
export function applyScenario(events: CashEvent[], def: ScenarioDef): CashEvent[] {
  if (def.lateDays === 0 && def.costStressPct === 0) return events;
  const stress = 1 + def.costStressPct / 100;
  return events.map((event) => {
    if (event.slips && event.amount > 0 && def.lateDays > 0) {
      return { ...event, dateKey: addDays(event.dateKey, def.lateDays) };
    }
    if (event.amount < 0 && !event.confirmed && def.costStressPct > 0) {
      return { ...event, amount: round(event.amount * stress) };
    }
    return event;
  });
}

export type ScenarioSummary = {
  key: ScenarioKey;
  label: string;
  hint: string;
  /** The balance series this scenario projects, day by day. */
  balances: number[];
  /** First day under the buffer, or null. */
  warningDateKey: string | null;
  warningLabel: string | null;
  /** First day under zero, or null. */
  overdraftDateKey: string | null;
  /** The deepest point over the whole horizon. */
  lowest: number;
  /** Smallest starting balance that keeps this scenario at or above the buffer. */
  required: number;
  /** What has to be found, given what they have. */
  funding: number;
};

export type ScenarioInput = {
  events: CashEvent[];
  todayKey: string;
  days: number;
  startingBalance: number;
  buffer: number;
  creditLine?: number;
};

/**
 * One scenario, summarised.
 *
 * The stressed line is read off `worstCase` rather than `projected`, and the
 * buffer crossing and required starting balance are recomputed against it —
 * buildForecast only ever reports those two for the projected line, which is
 * precisely why the old checkbox could not move the numbers in the cards.
 */
export function summariseScenario(def: ScenarioDef, input: ScenarioInput): ScenarioSummary {
  const forecast = buildForecast(applyScenario(input.events, def), {
    todayKey: input.todayKey,
    days: input.days,
    startingBalance: input.startingBalance,
    buffer: input.buffer,
    // Zero, because applyScenario has already moved the dates: asking
    // buildForecast to shift them again would apply the delay twice.
    lateDays: 0,
    creditLine: input.creditLine,
  });

  const balances = forecast.days.map((day) => day.projected);

  const belowIndex = balances.findIndex((value) => value < input.buffer);
  const zeroIndex = balances.findIndex((value) => value < 0);
  const lowest = balances.reduce((low, value) => Math.min(low, value), balances[0] ?? 0);

  // The curve only ever moves by the same deltas, so the starting balance that
  // clears the buffer is one subtraction against the deepest point.
  const deepestDelta = balances.reduce((low, value) => Math.min(low, value - input.startingBalance), 0);
  const required = round(Math.max(input.buffer, input.buffer - deepestDelta));

  return {
    key: def.key,
    label: def.label,
    hint: def.hint,
    balances,
    warningDateKey: belowIndex === -1 ? null : forecast.days[belowIndex].dateKey,
    warningLabel: belowIndex === -1 ? null : cashDayLabel(forecast.days[belowIndex].dateKey),
    overdraftDateKey: zeroIndex === -1 ? null : forecast.days[zeroIndex].dateKey,
    lowest: round(lowest),
    required,
    funding: round(Math.max(0, required - input.startingBalance)),
  };
}

export function summariseScenarios(input: ScenarioInput): ScenarioSummary[] {
  return CASH_SCENARIOS.map((def) => summariseScenario(def, input));
}

/**
 * How much worse a scenario is than the base one, in days and dollars.
 *
 * Null days means the base case never went under the buffer at all, so "moves
 * the warning forward by N days" is not a sentence anybody can write — the
 * warning is new, not earlier.
 */
export function scenarioDelta(
  base: ScenarioSummary,
  other: ScenarioSummary,
  todayKey: string,
): { daysEarlier: number | null; newWarning: boolean; extraFunding: number } {
  const extraFunding = round(other.funding - base.funding);
  if (!other.warningDateKey) return { daysEarlier: null, newWarning: false, extraFunding };
  if (!base.warningDateKey) return { daysEarlier: null, newWarning: true, extraFunding };
  return {
    daysEarlier: daysBetween(todayKey, base.warningDateKey) - daysBetween(todayKey, other.warningDateKey),
    newWarning: false,
    extraFunding,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
