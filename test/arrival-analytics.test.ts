import { describe, expect, it } from 'vitest';
import {
  ADVICE_MIN_TRIPS, arrivalAdvice, latenessMinutes, summariseArrivals, summariseByCrew,
  travelMinutes, wasDelivered, type ArrivalTripRow,
} from '@/lib/arrival-analytics';

// The definitions are the hard part here, not the arithmetic. Each of these
// pins one down, because "on time" and "opened" are exactly the numbers that
// get quietly redefined into meaninglessness.

const BASE: ArrivalTripRow = {
  crew_id: 'crew-1',
  sent_by: 'Danny Fletcher',
  status: 'arrived',
  arrival_start: '2026-08-03T18:15:00.000Z',
  arrival_end: '2026-08-03T18:45:00.000Z',
  arrived_at: '2026-08-03T18:30:00.000Z',
  en_route_at: '2026-08-03T18:00:00.000Z',
  eta_minutes: 15,
  suggested_minutes: 18,
  sms_status: 'sent',
  first_viewed_at: '2026-08-03T18:02:00.000Z',
  view_count: 3,
};

const trip = (overrides: Partial<ArrivalTripRow> = {}): ArrivalTripRow => ({ ...BASE, ...overrides });

describe('lateness', () => {
  it('is zero anywhere inside the promised window', () => {
    // Arriving at 2:40 inside a 2:15–2:45 window is not late. Measuring from
    // the midpoint would say it was, and the number would stop being trusted
    // the first time somebody checked it by hand.
    expect(latenessMinutes(trip({ arrived_at: '2026-08-03T18:40:00.000Z' }))).toBe(0);
    expect(latenessMinutes(trip({ arrived_at: '2026-08-03T18:45:00.000Z' }))).toBe(0);
  });

  it('counts from the late edge once it has passed', () => {
    expect(latenessMinutes(trip({ arrived_at: '2026-08-03T19:05:00.000Z' }))).toBe(20);
  });

  it('is unmeasurable — not zero — with no window or no arrival', () => {
    expect(latenessMinutes(trip({ arrival_end: null }))).toBeNull();
    expect(latenessMinutes(trip({ arrived_at: null }))).toBeNull();
  });
});

describe('travel time', () => {
  it('measures door to door', () => {
    expect(travelMinutes(trip())).toBe(30);
  });

  it('refuses a negative duration rather than reporting one', () => {
    expect(travelMinutes(trip({ arrived_at: '2026-08-03T17:00:00.000Z' }))).toBeNull();
  });
});

describe('open rate', () => {
  it('counts only texts that actually reached a phone', () => {
    // Counting a failed send against the open rate blames the customer for our
    // failure, and quietly makes the number mean nothing.
    expect(wasDelivered(trip({ sms_status: 'sent' }))).toBe(true);
    for (const status of ['failed', 'no_phone', 'opted_out', 'not_configured', null]) {
      expect(wasDelivered(trip({ sms_status: status }))).toBe(false);
    }
  });

  it('is null, not zero, when nothing was delivered', () => {
    const summary = summariseArrivals([trip({ sms_status: 'no_phone' })]);
    expect(summary.delivered).toBe(0);
    expect(summary.openRate).toBeNull();
  });

  it('divides opens by delivered, ignoring undeliverable trips entirely', () => {
    const summary = summariseArrivals([
      trip({ first_viewed_at: '2026-08-03T18:02:00.000Z' }),
      trip({ first_viewed_at: null }),
      trip({ sms_status: 'failed', first_viewed_at: null }),
    ]);
    expect(summary.delivered).toBe(2);
    expect(summary.opened).toBe(1);
    expect(summary.openRate).toBe(50);
  });
});

describe('the summary', () => {
  it('reports median alongside mean, because one disaster moves the mean', () => {
    const rows = [
      trip({ arrived_at: '2026-08-03T18:30:00.000Z' }), // on time
      trip({ arrived_at: '2026-08-03T18:50:00.000Z' }), // 5 late
      trip({ arrived_at: '2026-08-03T21:45:00.000Z' }), // 180 late
    ];
    const summary = summariseArrivals(rows);
    expect(summary.medianLateness).toBe(5);
    expect(summary.averageLateness).toBeGreaterThan(60);
    expect(summary.worstLateness).toBe(180);
    expect(summary.onTime).toBe(1);
  });

  it('measures on-time only over trips that promised AND arrived', () => {
    const summary = summariseArrivals([
      trip(),
      trip({ arrival_end: null, arrival_start: null }),
      trip({ arrived_at: null, status: 'en_route' }),
    ]);
    expect(summary.trips).toBe(3);
    expect(summary.measured).toBe(1);
    expect(summary.onTimeRate).toBe(100);
  });

  it('counts every way a visit falls over', () => {
    const summary = summariseArrivals([
      trip(), trip({ status: 'rescheduled' }), trip({ status: 'cancelled' }), trip({ status: 'no_access' }),
    ]);
    expect(summary.rescheduled).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.noAccess).toBe(1);
    expect(summary.falloverRate).toBe(75);
  });

  it('measures ETA bias against what was PROMISED, not what GPS guessed', () => {
    // The promise is what the customer planned their afternoon around.
    // Promised 15, took 30 → 15 minutes optimistic.
    expect(summariseArrivals([trip()]).etaBias).toBe(15);
  });

  it('survives an empty set without dividing by zero', () => {
    const summary = summariseArrivals([]);
    expect(summary.trips).toBe(0);
    expect(summary.onTimeRate).toBeNull();
    expect(summary.averageLateness).toBeNull();
    expect(summary.etaBias).toBeNull();
  });
});

describe('by crew', () => {
  it('groups by person and puts the busiest first', () => {
    const rows = [
      trip({ crew_id: 'a', sent_by: 'Ana' }),
      trip({ crew_id: 'b', sent_by: 'Bo' }),
      trip({ crew_id: 'b', sent_by: 'Bo' }),
    ];
    const byCrew = summariseByCrew(rows);
    expect(byCrew.map((row) => row.name)).toEqual(['Bo', 'Ana']);
    expect(byCrew[0].trips).toBe(2);
  });

  it('keeps office-sent trips visible instead of dropping them', () => {
    // crew_id is null when the owner sent it from a desk. Silently excluding
    // those would make the per-person totals disagree with the headline.
    const byCrew = summariseByCrew([trip({ crew_id: null, sent_by: 'BrokePipes' })]);
    expect(byCrew).toHaveLength(1);
    expect(byCrew[0].name).toBe('BrokePipes');
    expect(byCrew[0].crewId).toBeNull();
  });
});

describe('advice', () => {
  const many = (over: Partial<ArrivalTripRow>, count = ADVICE_MIN_TRIPS) =>
    Array.from({ length: count }, () => trip(over));

  it('stays silent until there is enough to say anything', () => {
    // "You're late 100% of the time" drawn from two visits is how a useful
    // number gets ignored forever.
    expect(arrivalAdvice(summariseArrivals(many({ arrived_at: '2026-08-03T20:00:00.000Z' }, 3)))).toBeNull();
  });

  it('names the fix when arrival times run optimistic', () => {
    const advice = arrivalAdvice(summariseArrivals(many({ arrived_at: '2026-08-03T19:30:00.000Z' })));
    expect(advice).toContain('optimistic');
  });

  it('congratulates a business that keeps its window', () => {
    const advice = arrivalAdvice(summariseArrivals(many({ arrived_at: '2026-08-03T18:30:00.000Z' })));
    expect(advice).toContain('website');
  });
});
