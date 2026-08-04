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
