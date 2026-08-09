import { describe, it, expect } from 'vitest';
import { buildForecast, type CashEvent } from '@/lib/cash-forecast';
import { cashOutlook, lowestWithin, cashDayLabel } from '@/lib/cash-outlook';

const TODAY = '2026-08-01';

/**
 * The defect this whole module is about, reproduced.
 *
 * A month of ordinary weekly costs and one big payment that never comes: the
 * balance is still positive on day 30 and negative on day 33. Every version of
 * the page that only looks inside its own window calls this "None".
 */
const event = (dateKey: string, amount: number, over: Partial<CashEvent> = {}): CashEvent => ({
  id: `${dateKey}-${amount}`,
  dateKey,
  label: 'Crew payroll',
  detail: 'weekly',
  amount,
  kind: amount > 0 ? 'final' : 'payroll',
  confirmed: true,
  slips: amount > 0,
  repeating: true,
  href: null,
  ...over,
});

/** −$1,000 every day from `from` to `to` inclusive. */
const drip = (from: number, to: number, amount: number): CashEvent[] =>
  Array.from({ length: to - from + 1 }, (_, step) => {
    const day = from + step;
    const date = new Date(Date.UTC(2026, 7, 1 + day)).toISOString().slice(0, 10);
    return event(date, amount, { id: `drip-${day}` });
  });

const forecastOf = (events: CashEvent[], options: { start: number; buffer: number; days?: number }) =>
  buildForecast(events, {
    todayKey: TODAY,
    days: options.days ?? 90,
    startingBalance: options.start,
    buffer: options.buffer,
    lateDays: 0,
  });

const cliff = drip(0, 89, -1000);

describe('cashOutlook — risk does not stop existing at the edge of the chart', () => {
  it('says so when the window is clean but the money runs out three days later', () => {
    // $32k against $1k/day: positive on day 30, under zero on day 33.
    const long = forecastOf(cliff, { start: 32_000, buffer: 0 });
    const outlook = cashOutlook({
      long,
      todayKey: TODAY,
      windowDays: 30,
      longDays: 90,
      buffer: 0,
      balanceKnown: true,
      balance: 32_000,
    });

    expect(outlook.risk?.beyondWindow).toBe(true);
    expect(outlook.sentence).toContain('No warning within 30 days');
    expect(outlook.sentence).toContain(cashDayLabel('2026-09-02'));
    // And it is NOT allowed to call this safe.
    expect(outlook.status).toBe('shortfall');
  });

  it('leads with the date when the risk is inside the window', () => {
    const long = forecastOf(cliff, { start: 32_000, buffer: 20_000 });
    const outlook = cashOutlook({
      long,
      todayKey: TODAY,
      windowDays: 30,
      longDays: 90,
      buffer: 20_000,
      balanceKnown: true,
      balance: 32_000,
    });

    expect(outlook.risk?.beyondWindow).toBe(false);
    expect(outlook.sentence).not.toContain('No warning');
    expect(outlook.sentence).toMatch(/^Dips under your \$20,000 buffer/);
  });

  it('names both depths when the buffer and zero are different days', () => {
    const long = forecastOf(cliff, { start: 32_000, buffer: 10_000 });
    const outlook = cashOutlook({
      long,
      todayKey: TODAY,
      windowDays: 60,
      longDays: 90,
      buffer: 10_000,
      balanceKnown: true,
      balance: 32_000,
    });

    // Under $10k on day 22, under zero on day 32 — two facts, one sentence.
    expect(outlook.sentence).toContain('buffer');
    expect(outlook.sentence).toContain('negative');
  });

  it('does not say it twice when the buffer is zero and the two dates coincide', () => {
    const long = forecastOf(cliff, { start: 32_000, buffer: 0 });
    const outlook = cashOutlook({
      long,
      todayKey: TODAY,
      windowDays: 90,
      longDays: 90,
      buffer: 0,
      balanceKnown: true,
      balance: 32_000,
    });
    expect(outlook.sentence.match(/negative/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('stays quiet, and says how long it stayed quiet for, when nothing is wrong', () => {
    const long = forecastOf(cliff, { start: 500_000, buffer: 10_000 });
    const outlook = cashOutlook({
      long,
      todayKey: TODAY,
      windowDays: 30,
      longDays: 90,
      buffer: 10_000,
      balanceKnown: true,
      balance: 500_000,
    });
    expect(outlook.status).toBe('safe');
    expect(outlook.risk).toBeNull();
    // "for the next 90 days" — not "for the next 30", which is the claim the
    // window would have let it make.
    expect(outlook.sentence).toContain('90 days');
  });

  it('separates tight from shortfall', () => {
    // Dips under the buffer but never under zero.
    const long = forecastOf(drip(0, 89, -100), { start: 20_000, buffer: 15_000 });
    const outlook = cashOutlook({
      long,
      todayKey: TODAY,
      windowDays: 30,
      longDays: 90,
      buffer: 15_000,
      balanceKnown: true,
      balance: 20_000,
    });
    expect(outlook.status).toBe('tight');
    expect(outlook.risk?.kind).toBe('buffer');
  });
});

describe('cashOutlook — what it refuses to claim without a balance', () => {
  const long = forecastOf(cliff, { start: 0, buffer: 5_000 });
  const outlook = cashOutlook({
    long,
    todayKey: TODAY,
    windowDays: 30,
    longDays: 90,
    buffer: 5_000,
    balanceKnown: false,
    balance: 0,
  });

  it('reports unknown rather than a shortfall it cannot know about', () => {
    expect(outlook.status).toBe('unknown');
    expect(outlook.label).toBe('Starting balance needed');
    expect(outlook.sentence).toContain('bank balance');
  });

  it('withholds headroom, which is a statement about a placeholder', () => {
    expect(outlook.headroom).toBeNull();
  });

  it('still reports what the movements need, because that survives the gap', () => {
    // safeStartingCash comes out of the deltas and the buffer. It is true
    // whether or not anybody has said what is in the account.
    expect(outlook.required).toBeGreaterThan(0);
    expect(outlook.funding).toBe(outlook.required);
  });
});

describe('lowestWithin — the 60- and 90-day floor a 30-day reader cannot see', () => {
  const long = forecastOf(cliff, { start: 32_000, buffer: 0 });

  it('measures each horizon off the one forecast rather than rebuilding it', () => {
    expect(lowestWithin(long, 30).balance).toBeGreaterThan(lowestWithin(long, 60).balance);
    expect(lowestWithin(long, 60).balance).toBeGreaterThan(lowestWithin(long, 90).balance);
  });

  it('reports the lows the outlook carries, in order, without duplicating the window', () => {
    const outlook = cashOutlook({
      long,
      todayKey: TODAY,
      windowDays: 60,
      longDays: 90,
      buffer: 0,
      balanceKnown: true,
      balance: 32_000,
    });
    // windowDays is 60, which is already one of the standard horizons — it must
    // not appear twice.
    expect(outlook.lows.map((low) => low.days)).toEqual([60, 90]);
  });

  it('never reports a horizon longer than the forecast it was handed', () => {
    const short = forecastOf(cliff, { start: 32_000, buffer: 0, days: 30 });
    const outlook = cashOutlook({
      long: short,
      todayKey: TODAY,
      windowDays: 30,
      longDays: 30,
      buffer: 0,
      balanceKnown: true,
      balance: 32_000,
    });
    expect(outlook.lows.map((low) => low.days)).toEqual([30]);
  });
});

describe('cashDayLabel — UTC, because a bare date key parsed as local shifts a day', () => {
  it('formats the way the rest of the page does', () => {
    expect(cashDayLabel('2026-09-10')).toBe('Thu, Sep 10');
  });
});
