import { describe, it, expect } from 'vitest';
import type { CashEvent } from '@/lib/cash-forecast';
import { CASH_SCENARIOS, applyScenario, summariseScenario, summariseScenarios, scenarioDelta } from '@/lib/cash-scenarios';
import { cashLowPanel, lowHeadline } from '@/lib/cash-causes';
import { buildForecast } from '@/lib/cash-forecast';

const TODAY = '2026-08-01';
const day = (offset: number) => new Date(Date.UTC(2026, 7, 1 + offset)).toISOString().slice(0, 10);

const money = (dateKey: string, amount: number, over: Partial<CashEvent> = {}): CashEvent => ({
  id: `${dateKey}:${amount}:${over.label ?? ''}`,
  dateKey,
  label: amount > 0 ? 'Johnson final payment' : 'Crew payroll',
  detail: 'test',
  amount,
  kind: amount > 0 ? 'final' : 'payroll',
  confirmed: true,
  slips: amount > 0,
  repeating: false,
  href: null,
  ...over,
});

/**
 * A month that works only if the customer pays on time: $12,000 lands on day 5,
 * $14,000 of payroll goes out on day 8.
 */
const EVENTS = [money(day(5), 12_000), money(day(8), -14_000)];

const input = { events: EVENTS, todayKey: TODAY, days: 30, startingBalance: 5_000, buffer: 2_000 };

describe('scenarios move the numbers, not just a dashed line', () => {
  it('offers exactly the three the page is built around', () => {
    expect(CASH_SCENARIOS.map((s) => s.key)).toEqual(['base', 'late', 'stress']);
  });

  it('clears the buffer in the base case', () => {
    const base = summariseScenario(CASH_SCENARIOS[0], input);
    // 5,000 + 12,000 − 14,000 = 3,000, which is above the 2,000 buffer.
    expect(base.warningDateKey).toBeNull();
    expect(base.funding).toBe(0);
  });

  it('breaks it when the customer pays a week late, and says which day', () => {
    const late = summariseScenario(CASH_SCENARIOS[1], input);
    // The payment now lands on day 12, four days after payroll went out.
    expect(late.warningDateKey).toBe(day(8));
    expect(late.lowest).toBe(-9_000);
  });

  it('reports what each scenario would take to survive', () => {
    const [base, late] = summariseScenarios(input);
    // Base needs nothing more. Late needs the payroll covered without the
    // payment: 14,000 out plus a 2,000 buffer, less the 5,000 already there.
    expect(base.funding).toBe(0);
    expect(late.funding).toBe(11_000);
  });

  it('measures a scenario against the base one in days and dollars', () => {
    const [base, late, stress] = summariseScenarios(input);
    const lateDelta = scenarioDelta(base, late, TODAY);
    // The base case had no warning at all, so this is a NEW warning rather than
    // an earlier one — "moves it forward by N days" would be a lie.
    expect(lateDelta.newWarning).toBe(true);
    expect(lateDelta.daysEarlier).toBeNull();
    expect(lateDelta.extraFunding).toBe(11_000);

    const stressDelta = scenarioDelta(late, stress, TODAY);
    expect(stressDelta.extraFunding).toBeGreaterThanOrEqual(0);
  });

  it('reports days earlier when both scenarios warn', () => {
    // Two payrolls: the first breaks the buffer under stress, the second breaks
    // it even in the base case.
    const events = [money(day(3), -4_000), money(day(10), -4_000), money(day(2), 3_000)];
    const [base, late] = summariseScenarios({ ...input, events, startingBalance: 6_000, buffer: 1_000 });
    const delta = scenarioDelta(base, late, TODAY);
    if (base.warningDateKey && late.warningDateKey) {
      expect(delta.newWarning).toBe(false);
      expect(delta.daysEarlier).toBeGreaterThanOrEqual(0);
    }
  });

  it('inflates only the ESTIMATED costs under stress, never the confirmed ones', () => {
    const confirmed = summariseScenario(CASH_SCENARIOS[2], {
      ...input,
      events: [money(day(3), -10_000, { confirmed: true, slips: false })],
      startingBalance: 20_000,
    });
    const estimated = summariseScenario(CASH_SCENARIOS[2], {
      ...input,
      events: [money(day(3), -10_000, { confirmed: false, slips: false })],
      startingBalance: 20_000,
    });
    // A bill with a due date does not come in 10% over. An estimate might.
    expect(confirmed.lowest).toBe(10_000);
    expect(estimated.lowest).toBe(9_000);
  });
});

describe('applyScenario — the shift lands on the events, once', () => {
  it('moves customer money and leaves everything else where it was', () => {
    const shifted = applyScenario(EVENTS, CASH_SCENARIOS[1], TODAY);
    expect(shifted.find((e) => e.amount > 0)!.dateKey).toBe(day(12));
    expect(shifted.find((e) => e.amount < 0)!.dateKey).toBe(day(8));
  });

  it('returns the same list untouched for the base case', () => {
    // Identity, not a copy: nothing downstream should re-render because a
    // no-op scenario handed back a new array.
    expect(applyScenario(EVENTS, CASH_SCENARIOS[0], TODAY)).toBe(EVENTS);
  });

  it('does not apply the delay twice when the forecast is built', () => {
    // buildForecast has its own lateDays shift for the dashed line. Feeding it
    // an already-shifted list AND a lateDays would move the money a fortnight.
    const summary = summariseScenario(CASH_SCENARIOS[1], input);
    expect(summary.warningDateKey).toBe(day(8));
    expect(summary.lowest).toBe(-9_000);
  });

  it('drops money shifted off the end of the window, which is the point', () => {
    const summary = summariseScenario(CASH_SCENARIOS[2], {
      ...input,
      events: [money(day(28), 12_000)],
      days: 30,
      startingBalance: 0,
      buffer: 0,
    });
    // 14 days late puts it on day 42, past a 30-day window: it does not arrive
    // in time, so the window ends at zero rather than at $12,000.
    expect(summary.balances[29]).toBe(0);
  });
});

describe('cashLowPanel — the low, and what to do about it', () => {
  const forecast = buildForecast([money(day(8), -14_000), money(day(8), -300, { label: 'Fuel', kind: 'other' })], {
    todayKey: TODAY,
    days: 30,
    startingBalance: 5_000,
    buffer: 2_000,
    lateDays: 0,
  });

  it('names the movement that dug the hole', () => {
    const panel = cashLowPanel(forecast, { todayKey: TODAY, base: '/dashboard', buffer: 2_000 })!;
    expect(panel.headline).toContain('Crew payroll');
    expect(panel.headline).toContain('causes');
    expect(panel.dateKey).toBe(day(8));
    expect(panel.daysAway).toBe(8);
  });

  it('offers actions that fit the kind of money, not a generic list', () => {
    const panel = cashLowPanel(forecast, { todayKey: TODAY, base: '/dashboard', buffer: 2_000 })!;
    const payroll = panel.causes.find((cause) => cause.event.kind === 'payroll')!;
    const kinds = payroll.actions.map((action) => action.kind);
    // You cannot defer payroll, so it is not offered as an option.
    expect(kinds).toContain('edit_payroll');
    expect(kinds).toContain('draw_credit');
    expect(kinds).not.toContain('move_bill');

    const fuel = panel.causes.find((cause) => cause.event.kind === 'other')!;
    expect(fuel.actions.map((action) => action.kind)).toContain('move_bill');
  });

  it('offers date and record actions for money that has not arrived', () => {
    const incoming = buildForecast([money(day(4), 9_000), money(day(6), -20_000)], {
      todayKey: TODAY,
      days: 30,
      startingBalance: 5_000,
      buffer: 2_000,
      lateDays: 0,
    });
    const panel = cashLowPanel(incoming, { todayKey: TODAY, base: '/demo', buffer: 2_000 })!;
    expect(panel.causes.every((cause) => cause.actions.length > 0)).toBe(true);
  });

  it('stays quiet when the account never gets near the floor', () => {
    const easy = buildForecast([money(day(3), 5_000)], {
      todayKey: TODAY,
      days: 30,
      startingBalance: 90_000,
      buffer: 2_000,
      lateDays: 0,
    });
    expect(cashLowPanel(easy, { todayKey: TODAY, base: '/dashboard', buffer: 2_000 })).toBeNull();
  });

  it('will not blame one movement for a day it only partly caused', () => {
    const even = [
      { event: money(day(1), -5_000, { label: 'Crew payroll' }), share: 0.5, actions: [] },
      { event: money(day(1), -5_000, { label: 'Truck payment' }), share: 0.5, actions: [] },
    ];
    // Two thirds is where one movement stops being a factor and becomes the
    // reason. At half and half, naming one alone would mislead.
    expect(lowHeadline(even, day(1))).not.toContain('causes');
    expect(lowHeadline(even, day(1))).toContain('1 more');
  });
});

describe('an invoice that is ALREADY overdue', () => {
  // The reason this needs its own block: every other fixture here is dated in
  // the future, where "delay it a week" and "delay its due date a week" are the
  // same operation. For an overdue invoice they are opposites, and the page had
  // been shipping the opposite one.
  const overdue = [
    money(day(-15), 4_480, { confirmed: false }),  // asked for, 15 days late
    money(day(5), -6_000),                          // payroll, day 5
  ];
  const overdueInput = { events: overdue, todayKey: TODAY, days: 30, startingBalance: 2_000, buffer: 0 };

  it('lands later, never earlier, the later you assume payment is', () => {
    const [base, late, stress] = summariseScenarios(overdueInput);
    // Base mirrors it to day 15. Seven days late is day 22, a fortnight is 29.
    expect(late.lowest).toBeLessThanOrEqual(base.lowest);
    expect(stress.lowest).toBeLessThanOrEqual(late.lowest);
  });

  it('never lets the stress test report a safer month than the base case', () => {
    const [base, late, stress] = summariseScenarios(overdueInput);
    // The whole point of the control. Stress once reported no shortfall at all
    // on this month while Base asked for $4,000.
    for (const worse of [late, stress]) {
      expect(worse.funding).toBeGreaterThanOrEqual(base.funding);
      if (base.warningDateKey) expect(worse.warningDateKey).not.toBeNull();
    }
    expect(stress.funding).toBeGreaterThanOrEqual(4_000);
  });

  it('delays from the day Base expects it, not from the due date', () => {
    const shifted = applyScenario(overdue, CASH_SCENARIOS[1], TODAY);
    // Mirror puts it on day 15; a week late is day 22. Adding 7 to the raw due
    // date would give day -8, which buildForecast re-mirrors onto day 8.
    expect(shifted.find((e) => e.amount > 0)!.dateKey).toBe(day(22));
  });
});
