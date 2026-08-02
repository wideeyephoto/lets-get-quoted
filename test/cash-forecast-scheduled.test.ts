import { describe, it, expect } from 'vitest';
import { expandScheduled, type ScheduledPayment } from '@/lib/cash-forecast-data';

// Every bill the owner has entered, turned into dated events. Exported for
// testability during the audit and then left untested — an off-by-one here
// changes what the whole forecast draws.

const WINDOW = { fromKey: '2026-08-01', toKey: '2026-08-30' };

const bill = (over: Partial<ScheduledPayment> = {}): ScheduledPayment => ({
  id: 'sp-1',
  label: 'Truck payment',
  amount: 450,
  direction: 'out',
  category: 'loan',
  dueDate: '2026-08-12',
  recurrence: 'monthly',
  endsOn: null,
  confirmed: true,
  active: true,
  note: null,
  ...over,
});

const on = (events: { dateKey: string }[]) => events.map((event) => event.dateKey);

describe('expandScheduled', () => {
  it('draws an outgoing bill as a NEGATIVE — the sign lives on direction, not on amount', () => {
    const [event] = expandScheduled([bill({ amount: 450, direction: 'out' })], WINDOW);
    expect(event.amount).toBe(-450);
    expect(event.kind).toBe('loan');
  });

  it('draws an inbound row as a positive, and never as a category', () => {
    // An inbound row is not "a loan arriving" — it is money in, and the chart
    // colours it by direction.
    const [event] = expandScheduled([bill({ direction: 'in', category: 'loan' })], WINDOW);
    expect(event.amount).toBe(450);
    expect(event.kind).toBe('other_in');
  });

  it('repeats a monthly bill across the window from its first occurrence', () => {
    const events = expandScheduled([bill({ dueDate: '2026-08-05', recurrence: 'monthly' })], {
      fromKey: '2026-08-01',
      toKey: '2026-11-30',
    });
    expect(on(events)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']);
  });

  it('gives every occurrence its own id, so two months are two markers', () => {
    const events = expandScheduled([bill({ dueDate: '2026-08-01', recurrence: 'weekly' })], WINDOW);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it('stops at the end date', () => {
    const events = expandScheduled([bill({ dueDate: '2026-08-03', recurrence: 'weekly', endsOn: '2026-08-17' })], WINDOW);
    expect(on(events)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17']);
  });

  it('marks a repeating row as repeating and a one-off as not', () => {
    expect(expandScheduled([bill({ recurrence: 'monthly' })], WINDOW)[0].repeating).toBe(true);
    expect(expandScheduled([bill({ recurrence: 'once' })], WINDOW)[0].repeating).toBe(false);
  });

  it('never lets a bill slip — only customer money does that', () => {
    // A bill does not arrive late. It bounces, which is a different problem and
    // not one the late-payment stress test models.
    expect(expandScheduled([bill()], WINDOW)[0].slips).toBe(false);
  });

  it('carries the confirmed flag through, because it decides a whole line', () => {
    expect(expandScheduled([bill({ confirmed: true })], WINDOW)[0].confirmed).toBe(true);
    expect(expandScheduled([bill({ confirmed: false })], WINDOW)[0].confirmed).toBe(false);
  });

  it('skips a paused row entirely', () => {
    expect(expandScheduled([bill({ active: false })], WINDOW)).toEqual([]);
  });

  it('skips a row with no amount rather than drawing a zero marker', () => {
    expect(expandScheduled([bill({ amount: 0 })], WINDOW)).toEqual([]);
    expect(expandScheduled([bill({ amount: -50 })], WINDOW)).toEqual([]);
  });

  it('keeps an overdue one-off — it still has to be paid', () => {
    // buildForecast pulls it onto today; dropping it here would lose it.
    const events = expandScheduled([bill({ dueDate: '2026-07-20', recurrence: 'once' })], WINDOW);
    expect(on(events)).toEqual(['2026-07-20']);
  });

  it('does NOT resurrect missed occurrences of a repeating bill', () => {
    // A weekly bill first due in June has not accumulated eight payments owed —
    // only the ones inside the window count.
    const events = expandScheduled([bill({ dueDate: '2026-06-01', recurrence: 'weekly' })], WINDOW);
    expect(events.every((event) => event.dateKey >= WINDOW.fromKey)).toBe(true);
  });

  it('says the cadence and the day in the detail line', () => {
    const [event] = expandScheduled([bill({ dueDate: '2026-08-12', recurrence: 'monthly' })], WINDOW);
    expect(event.detail).toContain('Monthly');
    expect(event.detail).toContain('Aug 12');
  });

  it('handles several bills at once without mixing them up', () => {
    const events = expandScheduled(
      [
        bill({ id: 'a', label: 'Insurance', amount: 200, dueDate: '2026-08-04', recurrence: 'once' }),
        bill({ id: 'b', label: 'Fuel', amount: 90, dueDate: '2026-08-06', recurrence: 'weekly' }),
      ],
      WINDOW,
    );
    expect(events.filter((event) => event.label === 'Insurance')).toHaveLength(1);
    expect(events.filter((event) => event.label === 'Fuel').length).toBeGreaterThan(3);
    expect(events.every((event) => event.amount < 0)).toBe(true);
  });
});
