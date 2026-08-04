import { describe, it, expect } from 'vitest';
import { quickStopMetrics, type QuickStopInsightRow, type QuickStopPaymentRow } from '../src/lib/quick-stop-insights';

const FROM = Date.parse('2026-07-01T00:00:00Z');
const TO = Date.parse('2026-08-01T00:00:00Z');
const IN = '2026-07-15T12:00:00Z';
const BEFORE = '2026-06-15T12:00:00Z';

function request(over: Partial<QuickStopInsightRow> = {}): QuickStopInsightRow {
  return {
    id: 'r1', job_id: 'j1', payment_id: 'p-fee',
    offer_sent_at: IN, paid_at: IN, completed_at: IN,
    ...over,
  };
}
function payment(over: Partial<QuickStopPaymentRow> = {}): QuickStopPaymentRow {
  return { id: 'p-fee', job_id: 'j1', amount: 75, refunded_amount: 0, paid_at: IN, ...over };
}
function run(over: Partial<Parameters<typeof quickStopMetrics>[0]> = {}) {
  return quickStopMetrics({
    requests: [], payments: [], assignments: [], crew: [], fromMs: FROM, toMs: TO, ...over,
  });
}

describe('quickStopMetrics', () => {
  it('reports nothing, and says so, on an account that has never used the feature', () => {
    const m = run();
    expect(m.hasAny).toBe(false);
    expect(m.totalRevenue).toBe(0);
    expect(m.acceptanceRate).toBeNull();
    expect(m.averageValue).toBeNull();
    expect(m.averageFee).toBeNull();
    expect(m.topCrew).toBeNull();
  });

  it('splits the speed fee from the service work rather than adding them up twice', () => {
    const m = run({
      requests: [request()],
      payments: [payment(), payment({ id: 'p-work', amount: 480 })],
    });
    expect(m.feeRevenue).toBe(75);
    expect(m.serviceRevenue).toBe(480);
    expect(m.totalRevenue).toBe(555);
  });

  it('never counts the fee payment as service work, even though it sits on the same job', () => {
    const m = run({ requests: [request()], payments: [payment()] });
    expect(m.serviceRevenue).toBe(0);
    expect(m.totalRevenue).toBe(75);
  });

  it('ignores payments on jobs that were not Quick Stops', () => {
    const m = run({
      requests: [request()],
      payments: [payment(), payment({ id: 'p-other', job_id: 'j-other', amount: 900 })],
    });
    expect(m.totalRevenue).toBe(75);
  });

  it('counts what was KEPT after a partial refund', () => {
    const m = run({
      requests: [request()],
      payments: [payment({ amount: 75, refunded_amount: 25 })],
    });
    expect(m.feeRevenue).toBe(50);
  });

  it('drops a payment refunded down to nothing instead of reporting a negative', () => {
    const m = run({
      requests: [request()],
      payments: [payment({ amount: 75, refunded_amount: 75 })],
    });
    expect(m.feeRevenue).toBe(0);
    expect(m.paidFees).toBe(0);
    expect(m.averageFee).toBeNull();
  });

  it('windows revenue on the day the money arrived', () => {
    const m = run({
      requests: [request()],
      payments: [payment({ paid_at: BEFORE })],
    });
    expect(m.totalRevenue).toBe(0);
  });

  it('measures acceptance on the offers SENT in the window, so it cannot exceed 100%', () => {
    // Two offers sent in the window; one was paid a month later, outside it.
    const m = run({
      requests: [
        request({ id: 'a', paid_at: '2026-08-20T00:00:00Z' }),
        request({ id: 'b', job_id: 'j2', payment_id: 'p2', paid_at: null }),
      ],
    });
    expect(m.offered).toBe(2);
    expect(m.accepted).toBe(1);
    expect(m.acceptanceRate).toBe(50);
  });

  it('does not count an offer sent before the window', () => {
    const m = run({ requests: [request({ offer_sent_at: BEFORE })] });
    expect(m.offered).toBe(0);
    expect(m.acceptanceRate).toBeNull();
  });

  it('averages over the stops that actually earned, not over every request', () => {
    const m = run({
      requests: [
        request({ id: 'a' }),
        request({ id: 'b', job_id: 'j2', payment_id: 'p2' }),
      ],
      // Only the first one was ever paid.
      payments: [payment({ amount: 100 }), payment({ id: 'p-work', amount: 300 })],
    });
    expect(m.totalRevenue).toBe(400);
    expect(m.earningStops).toBe(1);
    expect(m.averageValue).toBe(400);
  });

  it('averages the speed fee over paid fees only', () => {
    const m = run({
      requests: [
        request({ id: 'a' }),
        request({ id: 'b', job_id: 'j2', payment_id: 'p2' }),
      ],
      payments: [payment({ amount: 60 }), payment({ id: 'p2', job_id: 'j2', amount: 100 })],
    });
    expect(m.paidFees).toBe(2);
    expect(m.averageFee).toBe(80);
  });

  it('ranks crew by stops finished in the window, giving every assignee credit', () => {
    const m = run({
      requests: [
        request({ id: 'a', job_id: 'j1' }),
        request({ id: 'b', job_id: 'j2', payment_id: 'p2' }),
      ],
      assignments: [
        { job_id: 'j1', crew_id: 'c1' },
        { job_id: 'j1', crew_id: 'c2' },
        { job_id: 'j2', crew_id: 'c1' },
      ],
      crew: [{ id: 'c1', name: 'Dana' }, { id: 'c2', name: 'Marcus' }],
    });
    expect(m.crew.map((row) => [row.name, row.stops])).toEqual([['Dana', 2], ['Marcus', 1]]);
    expect(m.topCrew?.name).toBe('Dana');
  });

  it('leaves the crew ranking empty when a finished stop had nobody assigned', () => {
    const m = run({ requests: [request()], crew: [{ id: 'c1', name: 'Dana' }] });
    expect(m.completed).toBe(1);
    expect(m.crew).toEqual([]);
  });

  it('does not credit crew for a stop finished outside the window', () => {
    const m = run({
      requests: [request({ completed_at: BEFORE })],
      assignments: [{ job_id: 'j1', crew_id: 'c1' }],
      crew: [{ id: 'c1', name: 'Dana' }],
    });
    expect(m.completed).toBe(0);
    expect(m.crew).toEqual([]);
  });

  it('handles the numeric-as-string amounts PostgREST returns', () => {
    const m = run({
      requests: [request()],
      payments: [payment({ amount: '75.50', refunded_amount: '0.50' })],
    });
    expect(m.feeRevenue).toBe(75);
  });

  it('still shows the card for a stop that was offered but never paid', () => {
    const m = run({ requests: [request({ paid_at: null, completed_at: null })] });
    expect(m.hasAny).toBe(true);
    expect(m.totalRevenue).toBe(0);
    expect(m.acceptanceRate).toBe(0);
  });
});

describe('quickStopMetrics — the road cost', () => {
  it('divides revenue by the hours the day actually got longer', () => {
    const m = run({
      requests: [
        request({ id: 'r1', job_id: 'j1', payment_id: 'p1', route_extension_minutes: 30, detour_miles: 4 }),
        request({ id: 'r2', job_id: 'j2', payment_id: 'p2', route_extension_minutes: 90, detour_miles: 6 }),
      ],
      payments: [
        payment({ id: 'p1', job_id: 'j1', amount: 150 }),
        payment({ id: 'p2', job_id: 'j2', amount: 150 }),
      ],
    });
    expect(m.avgAddedMinutes).toBe(60);
    expect(m.avgAddedMiles).toBe(5);
    expect(m.revenuePerAddedHour).toBe(150); // $300 over 2 hours
    expect(m.revenuePerAddedMile).toBe(30);  // $300 over 10 miles
    expect(m.measuredStops).toBe(2);
  });

  it('LEAVES OUT an unmeasured stop rather than calling the trip free', () => {
    // Averaging a missing measurement in as 0 would claim the stop cost no road
    // time at all, which flatters every rate below it.
    const m = run({
      requests: [
        request({ id: 'r1', job_id: 'j1', payment_id: 'p1', route_extension_minutes: 60, detour_miles: 10 }),
        request({ id: 'r2', job_id: 'j2', payment_id: 'p2', route_extension_minutes: null, detour_miles: null }),
      ],
      payments: [
        payment({ id: 'p1', job_id: 'j1', amount: 100 }),
        payment({ id: 'p2', job_id: 'j2', amount: 100 }),
      ],
    });
    expect(m.measuredStops).toBe(1);
    expect(m.avgAddedMinutes).toBe(60);
    expect(m.revenuePerAddedHour).toBe(200); // $200 over the 1 hour we can account for
  });

  it('returns null rather than dividing by zero', () => {
    const m = run({ requests: [request()], payments: [payment()] });
    expect(m.revenuePerAddedHour).toBeNull();
    expect(m.revenuePerAddedMile).toBeNull();
    expect(m.avgAddedMiles).toBeNull();
  });
});

describe('quickStopMetrics — opportunity', () => {
  it('counts what the CONTRACTOR let go, not what the customer withdrew', () => {
    const m = run({
      requests: [
        request({ id: 'a', status: 'contractor_declined' }),
        request({ id: 'b', status: 'offer_expired' }),
        request({ id: 'c', status: 'customer_declined' }),
        request({ id: 'd', status: 'customer_canceled' }),
      ],
    });
    expect(m.missed).toBe(2);
  });

  it('withholds an estimated missed value until three stops have earned', () => {
    const two = run({
      requests: [
        request({ id: 'a', job_id: 'j1', payment_id: 'p1' }),
        request({ id: 'b', job_id: 'j2', payment_id: 'p2' }),
        request({ id: 'x', job_id: 'jx', payment_id: 'px', status: 'contractor_declined' }),
      ],
      payments: [payment({ id: 'p1', job_id: 'j1', amount: 100 }), payment({ id: 'p2', job_id: 'j2', amount: 200 })],
    });
    expect(two.missedRevenue).toBeNull();

    const three = run({
      requests: [
        request({ id: 'a', job_id: 'j1', payment_id: 'p1' }),
        request({ id: 'b', job_id: 'j2', payment_id: 'p2' }),
        request({ id: 'c', job_id: 'j3', payment_id: 'p3' }),
        request({ id: 'x', job_id: 'jx', payment_id: 'px', status: 'contractor_declined' }),
      ],
      payments: [
        payment({ id: 'p1', job_id: 'j1', amount: 100 }),
        payment({ id: 'p2', job_id: 'j2', amount: 200 }),
        payment({ id: 'p3', job_id: 'j3', amount: 300 }),
      ],
    });
    expect(three.missedRevenue).toBe(200); // median 200 x 1 missed
  });

  it('counts only arrivals still ahead of today', () => {
    const m = run({
      todayKey: '2026-07-20',
      requests: [
        request({ id: 'a', arrival_date: '2026-07-25', completed_at: null }),
        request({ id: 'b', arrival_date: '2026-07-10', completed_at: null }),
        request({ id: 'c', arrival_date: '2026-07-28' }),
      ],
    });
    expect(m.upcoming).toBe(1);
  });
});

describe('quickStopMetrics — best day', () => {
  it('stays silent below four completed stops, because three is not a pattern', () => {
    const m = run({
      requests: [
        request({ id: 'a', completed_at: '2026-07-02T12:00:00Z' }),
        request({ id: 'b', completed_at: '2026-07-09T12:00:00Z' }),
        request({ id: 'c', completed_at: '2026-07-16T12:00:00Z' }),
      ],
    });
    expect(m.bestDay).toBeNull();
  });

  it('names the weekday once there is enough to name one', () => {
    const m = run({
      requests: [
        request({ id: 'a', completed_at: '2026-07-02T12:00:00Z' }),
        request({ id: 'b', completed_at: '2026-07-09T12:00:00Z' }),
        request({ id: 'c', completed_at: '2026-07-16T12:00:00Z' }),
        request({ id: 'd', completed_at: '2026-07-23T12:00:00Z' }),
      ],
    });
    expect(m.bestDay).toEqual({ label: 'Thursday', count: 4 });
  });
});

describe('quickStopMetrics — repeat customers', () => {
  it('counts a customer with several stops once, not once per stop', () => {
    const m = run({
      requests: [
        request({ id: 'a', client_id: 'c1' }),
        request({ id: 'b', client_id: 'c1' }),
        request({ id: 'c', client_id: 'c1' }),
        request({ id: 'd', client_id: 'c2' }),
      ],
    });
    expect(m.repeatCustomers).toBe(1);
  });
});
