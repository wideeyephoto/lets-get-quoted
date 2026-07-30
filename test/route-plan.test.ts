import { describe, it, expect } from 'vitest';
import { planDayRoute, parseTimeMinutes, formatTimeMinutes, formatTimeLabel, type PlanStop } from '@/lib/route-plan';

// A tidy synthetic geography: four stops strung west-to-east along one latitude,
// roughly 5 miles apart, with the shop sitting at the west end. The shortest route
// is therefore simply W → E, which makes a deliberately scrambled input easy to
// assert against.
const HOME = { lat: 42.5, lng: -83.5 };
const AT = (lngOffset: number) => ({ lat: 42.5, lng: -83.5 + lngOffset });

function stop(overrides: Partial<PlanStop> & { id: string }): PlanStop {
  return {
    label: `Client ${overrides.id}`,
    address: '1 Main St',
    lat: null,
    lng: null,
    scheduledTime: null,
    visitMinutes: 60,
    locked: false,
    ...overrides,
  };
}

const base = {
  homeBase: HOME,
  workdayStart: '08:00',
  workdayEnd: '17:00',
  bufferMinutes: 0,
  defaultVisitMinutes: 60,
};

describe('parseTimeMinutes / formatTimeMinutes / formatTimeLabel', () => {
  it('round-trips HH:MM and tolerates seconds', () => {
    expect(parseTimeMinutes('08:30')).toBe(510);
    expect(parseTimeMinutes('08:30:00')).toBe(510);
    expect(parseTimeMinutes('8:05')).toBe(485);
    expect(formatTimeMinutes(510)).toBe('08:30');
    expect(formatTimeLabel(510)).toBe('8:30 AM');
    expect(formatTimeLabel(0)).toBe('12:00 AM');
    expect(formatTimeLabel(12 * 60)).toBe('12:00 PM');
    expect(formatTimeLabel(13 * 60 + 5)).toBe('1:05 PM');
  });

  it('returns null for junk and clamps out-of-range output into the day', () => {
    expect(parseTimeMinutes(null)).toBeNull();
    expect(parseTimeMinutes('')).toBeNull();
    expect(parseTimeMinutes('nope')).toBeNull();
    expect(parseTimeMinutes('25:00')).toBeNull();
    expect(parseTimeMinutes('08:75')).toBeNull();
    expect(formatTimeMinutes(-30)).toBe('00:00');
    expect(formatTimeMinutes(2000)).toBe('23:59');
  });
});

describe('planDayRoute ordering', () => {
  it('reorders a scrambled day into the shortest route and reports the saving', () => {
    const stops = [
      stop({ id: 'far', ...AT(0.3), scheduledTime: '08:00' }),
      stop({ id: 'near', ...AT(0.1), scheduledTime: '09:00' }),
      stop({ id: 'mid', ...AT(0.2), scheduledTime: '10:00' }),
    ];
    const plan = planDayRoute({ ...base, stops });

    expect(plan.planned.map((p) => p.stop.id)).toEqual(['near', 'mid', 'far']);
    expect(plan.plannedMiles).toBeLessThan(plan.currentMiles);
    expect(plan.savedMiles).toBeGreaterThan(0);
    expect(plan.savedMinutes).toBeGreaterThan(0);
    expect(plan.alreadyOptimal).toBe(false);
    expect(plan.anchor).toBe('home_base');
    expect(plan.driveTimeSource).toBe('straight_line');
  });

  it('leaves an already-tight day alone and reports no saving', () => {
    const stops = [
      stop({ id: 'a', ...AT(0.1), scheduledTime: '08:00' }),
      stop({ id: 'b', ...AT(0.2), scheduledTime: '10:00' }),
      stop({ id: 'c', ...AT(0.3), scheduledTime: '12:00' }),
    ];
    const plan = planDayRoute({ ...base, stops });

    expect(plan.planned.map((p) => p.stop.id)).toEqual(['a', 'b', 'c']);
    expect(plan.alreadyOptimal).toBe(true);
    expect(plan.savedMiles).toBe(0);
    expect(plan.savedMinutes).toBe(0);
  });

  it('assigns arrival times forward from the workday start, stacking travel + visit + buffer', () => {
    const stops = [
      stop({ id: 'a', ...AT(0.1), visitMinutes: 60 }),
      stop({ id: 'b', ...AT(0.2), visitMinutes: 30 }),
    ];
    const plan = planDayRoute({ ...base, stops, bufferMinutes: 15 });

    const [first, second] = plan.planned;
    // 8:00 start + the drive out to the first stop.
    expect(first.arrivalMinutes).toBe(8 * 60 + first.legMinutes);
    // Then 60m of work, a 15m buffer, and the hop to the second stop.
    expect(second.arrivalMinutes).toBe(first.arrivalMinutes + 60 + 15 + second.legMinutes);
    expect(second.departMinutes).toBe(second.arrivalMinutes + 30 + 15);
    expect(first.moved).toBe(true); // had no time before
  });

  it('flags stops whose proposed time matches what was already booked as unmoved', () => {
    const stops = [stop({ id: 'a', ...AT(0.0), scheduledTime: '08:00', visitMinutes: 60 })];
    const plan = planDayRoute({ ...base, stops });
    // Zero distance from home base ⇒ arrival is exactly the workday start.
    expect(plan.planned[0].arrivalTime).toBe('08:00');
    expect(plan.planned[0].moved).toBe(false);
  });
});

describe('planDayRoute confirmed appointments', () => {
  it('never moves a locked stop off its committed time', () => {
    const stops = [
      stop({ id: 'far-locked', ...AT(0.3), scheduledTime: '09:00', locked: true, visitMinutes: 60 }),
      stop({ id: 'near', ...AT(0.1), scheduledTime: '13:00', visitMinutes: 60 }),
    ];
    const plan = planDayRoute({ ...base, stops });

    const locked = plan.planned.find((p) => p.stop.id === 'far-locked')!;
    expect(locked.arrivalTime).toBe('09:00');
    expect(locked.moved).toBe(false);
  });

  it('routes a free stop before a locked one when it fits, and after when it does not', () => {
    // The free stop is a 60m visit close to home; the locked stop is far east at
    // 15:00 — plenty of room to do the near one first.
    const fits = planDayRoute({
      ...base,
      stops: [
        stop({ id: 'locked', ...AT(0.3), scheduledTime: '15:00', locked: true }),
        stop({ id: 'free', ...AT(0.1) }),
      ],
    });
    expect(fits.planned.map((p) => p.stop.id)).toEqual(['free', 'locked']);

    // Same geography, but the appointment is at 08:15 — the free stop cannot be
    // squeezed in first without making the customer wait.
    const tight = planDayRoute({
      ...base,
      stops: [
        stop({ id: 'locked', ...AT(0.3), scheduledTime: '08:15', locked: true }),
        stop({ id: 'free', ...AT(0.1) }),
      ],
    });
    expect(tight.planned.map((p) => p.stop.id)).toEqual(['locked', 'free']);
  });

  it('surfaces a locked appointment it cannot physically reach in time', () => {
    // 08:00 start, but the appointment is 300 miles away at 08:05.
    const plan = planDayRoute({
      ...base,
      stops: [stop({ id: 'impossible', lat: 42.5, lng: -78.0, scheduledTime: '08:05', locked: true })],
    });
    // Flagged late, and shown at the time we'd REALLY get there rather than
    // parroting back a promise the day can't keep.
    expect(plan.planned[0].late).toBe(true);
    expect(plan.planned[0].arrivalMinutes).toBeGreaterThan(8 * 60 + 5);
    expect(plan.planned[0].moved).toBe(true);
  });

  it('records idle time before an appointment it would reach early', () => {
    const plan = planDayRoute({
      ...base,
      stops: [stop({ id: 'later', ...AT(0.0), scheduledTime: '11:00', locked: true })],
    });
    expect(plan.planned[0].waitMinutes).toBe(180); // 08:00 → 11:00, no travel
  });

  it('keeps today’s order when locked stops make the reorder no better', () => {
    // Both stops confirmed, in a deliberately inefficient east-then-west order.
    const stops = [
      stop({ id: 'east', ...AT(0.3), scheduledTime: '08:00', locked: true }),
      stop({ id: 'west', ...AT(0.05), scheduledTime: '11:00', locked: true }),
    ];
    const plan = planDayRoute({ ...base, stops });
    expect(plan.planned.map((p) => p.stop.id)).toEqual(['east', 'west']);
    expect(plan.savedMinutes).toBe(0);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(plan.currentMinutes);
  });
});

describe('planDayRoute edge cases', () => {
  it('separates stops with no coordinates instead of guessing at them', () => {
    const stops = [
      stop({ id: 'mapped', ...AT(0.1) }),
      stop({ id: 'no-address', address: null, scheduledTime: '10:00' }),
    ];
    const plan = planDayRoute({ ...base, stops });

    expect(plan.planned.map((p) => p.stop.id)).toEqual(['mapped']);
    expect(plan.unroutable.map((s) => s.id)).toEqual(['no-address']);
  });

  it('returns an empty plan when nothing on the day can be routed', () => {
    const plan = planDayRoute({ ...base, stops: [stop({ id: 'a' }), stop({ id: 'b' })] });
    expect(plan.planned).toHaveLength(0);
    expect(plan.unroutable).toHaveLength(2);
    expect(plan.anchor).toBeNull();
    expect(plan.alreadyOptimal).toBe(true);
  });

  it('handles an empty day', () => {
    const plan = planDayRoute({ ...base, stops: [] });
    expect(plan.planned).toHaveLength(0);
    expect(plan.unroutable).toHaveLength(0);
    expect(plan.savedMinutes).toBe(0);
  });

  it('falls back to anchoring on the first stop when there is no geocoded home base', () => {
    const stops = [
      stop({ id: 'far', ...AT(0.3), scheduledTime: '08:00' }),
      stop({ id: 'near', ...AT(0.1), scheduledTime: '09:00' }),
    ];
    const plan = planDayRoute({ ...base, homeBase: null, stops });
    expect(plan.anchor).toBe('first_stop');
    expect(plan.planned).toHaveLength(2);
    // With no anchor the first leg is free, so the route is measured stop-to-stop.
    expect(plan.planned[0].legMiles).toBe(0);
  });

  it('reports how far the day runs past the end of the workday', () => {
    const stops = [
      stop({ id: 'a', ...AT(0.0), visitMinutes: 300 }),
      stop({ id: 'b', ...AT(0.05), visitMinutes: 300 }),
    ];
    const plan = planDayRoute({ ...base, stops, workdayEnd: '17:00' });
    // 08:00 + 300m + travel + 300m lands past 17:00.
    expect(plan.overflowMinutes).toBeGreaterThan(0);
  });

  it('fits a normal day inside the workday with no overflow', () => {
    const stops = [stop({ id: 'a', ...AT(0.0), visitMinutes: 120 })];
    expect(planDayRoute({ ...base, stops }).overflowMinutes).toBe(0);
  });

  it('uses real drive legs when a matrix is supplied and straight-line for the gaps', () => {
    const stops = [
      stop({ id: 'a', ...AT(0.1) }),
      stop({ id: 'b', ...AT(0.2) }),
    ];
    const matrix = new Map([
      ['start->a', { miles: 2, minutes: 7 }],
      ['a->b', { miles: 3, minutes: 11 }],
    ]);
    const plan = planDayRoute({ ...base, stops, matrix });

    expect(plan.driveTimeSource).toBe('drive_matrix');
    expect(plan.planned[0].legMinutes).toBe(7);
    expect(plan.planned[1].legMinutes).toBe(11);
    expect(plan.plannedMiles).toBe(5);
  });

  it('treats a zero or missing visit estimate as the account default', () => {
    const stops = [
      stop({ id: 'a', ...AT(0.0), visitMinutes: 0 }),
      stop({ id: 'b', ...AT(0.05), visitMinutes: 0 }),
    ];
    const plan = planDayRoute({ ...base, stops, defaultVisitMinutes: 90 });
    expect(plan.planned[1].arrivalMinutes).toBe(8 * 60 + 90 + plan.planned[1].legMinutes);
  });

  it('scales to a full dozen-stop day without blowing up', () => {
    const stops = Array.from({ length: 12 }, (_, i) =>
      stop({ id: `s${i}`, lat: 42.5 + (i % 4) * 0.05, lng: -83.5 + Math.floor(i / 4) * 0.05, visitMinutes: 30 }),
    );
    const plan = planDayRoute({ ...base, stops });
    expect(plan.planned).toHaveLength(12);
    expect(new Set(plan.planned.map((p) => p.stop.id)).size).toBe(12); // no drops, no dupes
    expect(plan.plannedMiles).toBeLessThanOrEqual(plan.currentMiles);
  });
});
