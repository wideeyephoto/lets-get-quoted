import { describe, it, expect } from 'vitest';
import {
  buildForecast,
  expandRecurrence,
  markerShape,
  type CashEvent,
  type ForecastOptions,
} from '@/lib/cash-forecast';

const TODAY = '2026-08-01';

function event(over: Partial<CashEvent> & { dateKey: string; amount: number }): CashEvent {
  return {
    id: over.id ?? `${over.dateKey}:${over.amount}`,
    label: 'Thing',
    detail: 'detail',
    kind: over.amount >= 0 ? 'final' : 'bill',
    confirmed: false,
    slips: over.amount > 0,
    repeating: false,
    href: null,
    ...over,
  };
}

function options(over: Partial<ForecastOptions> = {}): ForecastOptions {
  return { todayKey: TODAY, days: 10, startingBalance: 10000, buffer: 0, lateDays: 0, ...over };
}

describe('buildForecast — the projected line', () => {
  it('is flat at the starting balance when nothing is scheduled', () => {
    const forecast = buildForecast([], options());
    expect(forecast.days).toHaveLength(10);
    expect(forecast.days.every((day) => day.projected === 10000)).toBe(true);
    expect(forecast.ending).toBe(10000);
    expect(forecast.lowest.balance).toBe(10000);
    expect(forecast.overdraft).toBeNull();
  });

  it('steps down on the day an outgoing lands and stays down', () => {
    const forecast = buildForecast([event({ dateKey: '2026-08-04', amount: -2500 })], options());
    expect(forecast.days[2].projected).toBe(10000);
    expect(forecast.days[3].projected).toBe(7500);
    expect(forecast.days[9].projected).toBe(7500);
    expect(forecast.lowest.dateKey).toBe('2026-08-04');
  });

  it("applies today's own events to day zero", () => {
    // The owner types what the bank says now; a bill dated today has not left
    // yet, so it still has to come off.
    const forecast = buildForecast([event({ dateKey: TODAY, amount: -1000 })], options());
    expect(forecast.days[0].projected).toBe(9000);
  });

  it('pulls an overdue event onto today rather than dropping it', () => {
    // A bill from last week is still going to be paid out of this month's money.
    const forecast = buildForecast([event({ dateKey: '2026-07-20', amount: -800 })], options());
    expect(forecast.days[0].projected).toBe(9200);
    expect(forecast.days[0].events).toHaveLength(1);
  });

  it('drops an event past the far edge of the window', () => {
    const forecast = buildForecast([event({ dateKey: '2026-08-11', amount: -5000 })], options());
    expect(forecast.ending).toBe(10000);
    expect(forecast.totals.outgoing).toBe(0);
  });

  it('keeps an event on the last day of the window', () => {
    const forecast = buildForecast([event({ dateKey: '2026-08-10', amount: -5000 })], options());
    expect(forecast.ending).toBe(5000);
  });
});

describe('buildForecast — confirmed vs estimated', () => {
  it('leaves estimated money out of the confirmed-only line', () => {
    const forecast = buildForecast(
      [
        event({ dateKey: '2026-08-03', amount: 4000, confirmed: false }),
        event({ dateKey: '2026-08-05', amount: -1000, confirmed: true }),
      ],
      options(),
    );
    expect(forecast.days[9].projected).toBe(13000);
    expect(forecast.days[9].confirmedOnly).toBe(9000);
    expect(forecast.totals.estimatedIn).toBe(4000);
    expect(forecast.totals.confirmedOut).toBe(1000);
  });
});

describe('buildForecast — the late-payment stress test', () => {
  it('shifts customer money later and inflates estimated costs', () => {
    const forecast = buildForecast(
      [
        event({ dateKey: '2026-08-02', amount: 5000, slips: true }),
        event({ dateKey: '2026-08-02', amount: -1000, confirmed: false }),
      ],
      options({ lateDays: 3, costStressPct: 10 }),
    );
    // Day 1: the payment has slipped away, and the cost came in 10% over.
    expect(forecast.days[1].projected).toBe(14000);
    expect(forecast.days[1].worstCase).toBe(8900);
    // Day 4: it finally arrives.
    expect(forecast.days[4].worstCase).toBe(13900);
  });

  it('never slips an outgoing — a bill does not arrive late, it bounces', () => {
    const forecast = buildForecast(
      [event({ dateKey: '2026-08-03', amount: -2000, confirmed: true, slips: false })],
      options({ lateDays: 7 }),
    );
    expect(forecast.days[2].worstCase).toBe(8000);
  });

  it('loses money that slips past the end of the window', () => {
    const forecast = buildForecast(
      [event({ dateKey: '2026-08-08', amount: 6000, slips: true })],
      options({ lateDays: 7 }),
    );
    expect(forecast.days[9].projected).toBe(16000);
    expect(forecast.days[9].worstCase).toBe(10000);
  });
});

describe('buildForecast — the warnings', () => {
  it('finds the first day under the buffer and the first day overdrawn', () => {
    const forecast = buildForecast(
      [
        event({ dateKey: '2026-08-03', amount: -4000 }),
        event({ dateKey: '2026-08-06', amount: -8000 }),
      ],
      options({ buffer: 7000 }),
    );
    expect(forecast.firstBelowBuffer?.dateKey).toBe('2026-08-03');
    expect(forecast.firstBelowBuffer?.balance).toBe(6000);
    expect(forecast.overdraft?.dateKey).toBe('2026-08-06');
    expect(forecast.overdraft?.balance).toBe(-2000);
  });

  it('reports no warning when the line never reaches the buffer', () => {
    const forecast = buildForecast([event({ dateKey: '2026-08-03', amount: -1000 })], options({ buffer: 5000 }));
    expect(forecast.firstBelowBuffer).toBeNull();
    expect(forecast.overdraft).toBeNull();
  });
});

describe('buildForecast — safe starting cash', () => {
  it('is exactly enough to graze the buffer at the lowest point', () => {
    const events = [event({ dateKey: '2026-08-04', amount: -9000 }), event({ dateKey: '2026-08-08', amount: 3000 })];
    const forecast = buildForecast(events, options({ buffer: 2000 }));
    expect(forecast.safeStartingCash).toBe(11000);

    // Start from that number and the dip lands precisely on the buffer, never under.
    const retested = buildForecast(events, options({ buffer: 2000, startingBalance: 11000 }));
    expect(retested.lowest.balance).toBe(2000);
    expect(retested.firstBelowBuffer).toBeNull();
  });

  it('never falls below the buffer itself, even when everything is inbound', () => {
    const forecast = buildForecast([event({ dateKey: '2026-08-03', amount: 5000 })], options({ buffer: 2500 }));
    expect(forecast.safeStartingCash).toBe(2500);
  });
});

describe('buildForecast — minimum required balance', () => {
  it('carries the coming payroll backwards to every day before it', () => {
    const forecast = buildForecast([event({ dateKey: '2026-08-05', amount: -6000 })], options({ buffer: 1000 }));
    // Every day up to the day BEFORE the hit must already hold buffer + 6000.
    expect(forecast.days[0].minimumRequired).toBe(7000);
    expect(forecast.days[3].minimumRequired).toBe(7000);
    // On the day itself the money is gone, so only the buffer is still required.
    expect(forecast.days[4].minimumRequired).toBe(1000);
    expect(forecast.days[9].minimumRequired).toBe(1000);
  });

  it('nets an incoming payment against a later bill', () => {
    const forecast = buildForecast(
      [
        event({ dateKey: '2026-08-03', amount: 2000 }),
        event({ dateKey: '2026-08-06', amount: -5000 }),
      ],
      options({ buffer: 0 }),
    );
    // Before the deposit you only need the gap it does not cover.
    expect(forecast.days[0].minimumRequired).toBe(3000);
    // After it, the whole bill still has to be there.
    expect(forecast.days[3].minimumRequired).toBe(5000);
  });
});

describe('buildForecast — day totals', () => {
  it('keeps money in and money out apart on the same day', () => {
    const forecast = buildForecast(
      [event({ dateKey: '2026-08-02', amount: 1200 }), event({ dateKey: '2026-08-02', amount: -400 })],
      options(),
    );
    expect(forecast.days[1].incoming).toBe(1200);
    expect(forecast.days[1].outgoing).toBe(400);
    expect(forecast.days[1].cumulativeIn).toBe(1200);
    expect(forecast.days[1].cumulativeOut).toBe(400);
    expect(forecast.totals.net).toBe(800);
  });

  it('sorts a day by size, so the biggest movement is read first', () => {
    const forecast = buildForecast(
      [
        event({ id: 'small', dateKey: '2026-08-02', amount: -40 }),
        event({ id: 'big', dateKey: '2026-08-02', amount: -9000 }),
      ],
      options(),
    );
    expect(forecast.days[1].events.map((entry) => entry.id)).toEqual(['big', 'small']);
  });

  it('does not accumulate floating-point drift across the window', () => {
    const events = Array.from({ length: 30 }, (_, index) =>
      event({ id: `d${index}`, dateKey: `2026-08-${String(index + 1).padStart(2, '0')}`, amount: -0.1 }),
    );
    const forecast = buildForecast(events, options({ days: 30, startingBalance: 100 }));
    expect(forecast.ending).toBe(97);
  });
});

describe('expandRecurrence', () => {
  const window = { fromKey: '2026-08-01', toKey: '2026-08-31' };

  it('returns a single date for a one-off inside the window', () => {
    expect(expandRecurrence('2026-08-12', 'once', window)).toEqual(['2026-08-12']);
  });

  it('still returns an overdue one-off, so it can be pulled onto today', () => {
    expect(expandRecurrence('2026-07-05', 'once', window)).toEqual(['2026-07-05']);
  });

  it('walks weekly from the first occurrence, not from the window start', () => {
    expect(expandRecurrence('2026-07-31', 'weekly', window)).toEqual([
      '2026-08-07',
      '2026-08-14',
      '2026-08-21',
      '2026-08-28',
    ]);
  });

  it('honours an end date', () => {
    expect(expandRecurrence('2026-08-03', 'weekly', window, '2026-08-17')).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
    ]);
  });

  it('clamps a monthly series into short months, and the clamp is permanent', () => {
    // Documented behaviour, matching how recurring plans advance: once the 31st
    // is lost to a 30-day month it does not come back.
    expect(expandRecurrence('2026-01-31', 'monthly', { fromKey: '2026-01-01', toKey: '2026-05-01' })).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-28',
      '2026-04-28',
    ]);
  });

  it('steps every fortnight for biweekly', () => {
    expect(expandRecurrence('2026-08-02', 'biweekly', window)).toEqual(['2026-08-02', '2026-08-16', '2026-08-30']);
  });
});

describe('markerShape', () => {
  it('gives payroll a diamond whichever way the money moves', () => {
    expect(markerShape(event({ dateKey: TODAY, amount: -9000, kind: 'payroll' }))).toBe('diamond');
  });

  it('points arrows the way the money goes', () => {
    expect(markerShape(event({ dateKey: TODAY, amount: 500 }))).toBe('up');
    expect(markerShape(event({ dateKey: TODAY, amount: -500 }))).toBe('down');
  });

  it('circles a repeating outgoing', () => {
    expect(markerShape(event({ dateKey: TODAY, amount: -300, repeating: true }))).toBe('circle');
  });
});
