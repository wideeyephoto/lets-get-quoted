import { describe, it, expect } from 'vitest';
import { scheduleOrder, type PlanInput, type PlanStop } from '@/lib/route-plan';
import {
  costOrder,
  endOn,
  fullRouteUrl,
  isMovable,
  reorderStops,
  sameOrder,
  type DayPlanPayload,
} from '@/lib/day-plan-view';

const stop = (id: string, over: Partial<PlanStop> = {}): PlanStop => ({
  id,
  label: id,
  address: `${id} Street`,
  lat: 42.5,
  lng: -83.1,
  scheduledTime: null,
  visitMinutes: 60,
  locked: false,
  ...over,
});

// A square of stops one degree apart, so leg lengths are obviously different and
// a reorder has to change the total.
const A = stop('a', { lat: 42.0, lng: -83.0 });
const B = stop('b', { lat: 42.0, lng: -83.5 });
const C = stop('c', { lat: 42.5, lng: -83.5 });
const D = stop('d', { lat: 42.5, lng: -83.0 });

const input = (stops: PlanStop[], over: Partial<PlanInput> = {}): PlanInput => ({
  stops,
  homeBase: { lat: 42.0, lng: -83.0 },
  workdayStart: '08:00',
  workdayEnd: '17:00',
  bufferMinutes: 0,
  defaultVisitMinutes: 60,
  ...over,
});

describe('costing a specific order', () => {
  it('walks arrivals forward through the day', () => {
    const result = scheduleOrder(['a', 'b'], input([A, B]));
    expect(result.planned.map((p) => p.stop.id)).toEqual(['a', 'b']);
    expect(result.planned[0].arrivalTime).toBe('08:00'); // home base is A's location
    // 60 min on site at A, then the drive to B.
    expect(result.planned[1].arrivalMinutes).toBeGreaterThan(9 * 60);
  });

  // The point of the whole page: a different order costs a different amount, and
  // the contractor sees that the moment they drop a stop.
  it('gives a worse order a bigger total', () => {
    const good = scheduleOrder(['a', 'b', 'c', 'd'], input([A, B, C, D]));
    const bad = scheduleOrder(['a', 'c', 'b', 'd'], input([A, B, C, D]));
    expect(bad.miles).toBeGreaterThan(good.miles);
  });

  it('adds up time on site separately from driving', () => {
    const result = scheduleOrder(['a', 'b'], input([A, B]));
    expect(result.workMinutes).toBe(120);
    expect(result.minutes).toBeGreaterThan(0);
  });

  it('finishes when the last visit ends, not after a trailing buffer', () => {
    // The buffer pads travel to a NEXT stop; there isn't one, so the day is over.
    const withBuffer = scheduleOrder(['a'], input([A], { bufferMinutes: 45 }));
    const without = scheduleOrder(['a'], input([A], { bufferMinutes: 0 }));
    expect(withBuffer.finishMinutes).toBe(without.finishMinutes);
    expect(withBuffer.finishMinutes).toBe(9 * 60);
  });

  it('reports how far past the workday it runs', () => {
    const long = stop('long', { lat: 42.0, lng: -83.0, visitMinutes: 12 * 60 });
    const result = scheduleOrder(['long'], input([long]));
    expect(result.overflowMinutes).toBe(3 * 60); // 08:00 + 12h = 20:00, three past 17:00
  });

  it('fits inside the day without claiming overflow', () => {
    expect(scheduleOrder(['a'], input([A])).overflowMinutes).toBe(0);
  });

  it('pins a confirmed stop to its agreed time wherever it lands', () => {
    const locked = stop('locked', { lat: 42.5, lng: -83.5, locked: true, scheduledTime: '14:00' });
    const first = scheduleOrder(['locked', 'a'], input([locked, A]));
    const last = scheduleOrder(['a', 'locked'], input([locked, A]));
    expect(first.planned[0].arrivalTime).toBe('14:00');
    expect(last.planned[1].arrivalTime).toBe('14:00');
  });

  it('drops ids it cannot place rather than inventing a leg for them', () => {
    const noCoords = stop('ghost', { lat: null, lng: null });
    const result = scheduleOrder(['a', 'ghost', 'nonexistent'], input([A, noCoords]));
    expect(result.planned.map((p) => p.stop.id)).toEqual(['a']);
  });

  it('handles an empty day', () => {
    const result = scheduleOrder([], input([]));
    expect(result.planned).toEqual([]);
    expect(result.miles).toBe(0);
    expect(result.finishMinutes).toBe(8 * 60);
  });

  it('prefers a real drive leg over the straight-line estimate', () => {
    const matrix = new Map([['start->a', { miles: 99, minutes: 120 }]]);
    const result = scheduleOrder(['a'], input([A], { matrix }));
    expect(result.miles).toBe(99);
    expect(result.planned[0].arrivalTime).toBe('10:00');
  });
});

describe('what the contractor is allowed to drag', () => {
  const byId = new Map([A, B, C, D].map((s) => [s.id, s]));
  const order = ['a', 'b', 'c', 'd'];

  it('moves a stop and renumbers around it', () => {
    expect(reorderStops(order, byId, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderStops(order, byId, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('refuses a no-op or an out-of-range move', () => {
    expect(reorderStops(order, byId, 1, 1)).toBeNull();
    expect(reorderStops(order, byId, 0, 9)).toBeNull();
    expect(reorderStops(order, byId, -1, 0)).toBeNull();
  });

  it('will not pick up a confirmed appointment', () => {
    const locked = new Map(byId).set('c', { ...C, locked: true });
    expect(reorderStops(order, locked, 2, 0)).toBeNull();
    expect(isMovable(locked.get('c')!)).toBe(false);
  });

  // The bug this replaced: requiring a confirmed stop to keep its INDEX made
  // almost every drag illegal the moment one appointment was confirmed. Its time
  // is what's protected — the scheduler pins that wherever it ends up.
  it('lets other stops move past a confirmed appointment', () => {
    const locked = new Map(byId).set('c', { ...C, locked: true });
    expect(reorderStops(order, locked, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(reorderStops(order, locked, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderStops(order, locked, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('holds a pinned stop in place, because pinning is about position', () => {
    const pinned = new Set(['c']);
    // Moving d before c would slide c from index 2 to 3.
    expect(reorderStops(order, byId, 3, 0, pinned)).toBeNull();
    expect(reorderStops(order, byId, 3, 2, pinned)).toBeNull();
    // Swapping a and b leaves c exactly where it was.
    expect(reorderStops(order, byId, 0, 1, pinned)).toEqual(['b', 'a', 'c', 'd']);
    expect(isMovable(C, pinned)).toBe(false);
  });

  it('leaves a single-stop day with nowhere to go', () => {
    expect(reorderStops(['a'], byId, 0, 0)).toBeNull();
  });

  // The live drag calls this on every dragover, resolving both ends by id, so it
  // has to be safe to apply repeatedly as the list walks past each row.
  it('composes across the successive swaps a live drag makes', () => {
    let running = order;
    for (const target of [2, 1, 0]) {
      const from = running.indexOf('d');
      running = reorderStops(running, byId, from, target) ?? running;
    }
    expect(running).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('order comparison', () => {
  it('matches only on identical sequences', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
    expect(sameOrder([], [])).toBe(true);
  });
});

describe('the whole-day Google Maps link', () => {
  const home = { lat: 42.0, lng: -83.0 };

  it('starts and ends at the shop when we know where it is', () => {
    const url = new URL(fullRouteUrl([A, B], home, '1 Shop Rd')!);
    expect(url.searchParams.get('origin')).toBe('1 Shop Rd');
    expect(url.searchParams.get('destination')).toBe('1 Shop Rd');
    expect(url.searchParams.get('waypoints')).toBe('a Street|b Street');
    expect(url.searchParams.get('travelmode')).toBe('driving');
  });

  it('runs first stop to last when there is no shop address', () => {
    const url = new URL(fullRouteUrl([A, B, C], null, null)!);
    expect(url.searchParams.get('origin')).toBe('a Street');
    expect(url.searchParams.get('destination')).toBe('c Street');
    expect(url.searchParams.get('waypoints')).toBe('b Street');
  });

  it('falls back to coordinates for a stop with no street address', () => {
    const bare = stop('bare', { address: null, lat: 42.1, lng: -83.2 });
    expect(fullRouteUrl([bare, A], null, null)).toContain('42.1%2C-83.2');
  });

  it('returns nothing when there is no journey to draw', () => {
    expect(fullRouteUrl([], home, null)).toBeNull();
    // One stop and no shop is a single point, not a route.
    expect(fullRouteUrl([A], null, null)).toBeNull();
  });
});

describe('costing straight off the serialized payload', () => {
  const payload: DayPlanPayload = {
    dateKey: '2026-07-30',
    crewId: null,
    crewName: null,
    stops: [A, B],
    optimizedOrder: ['a', 'b'],
    currentOrder: ['b', 'a'],
    homeBase: { lat: 42.0, lng: -83.0 },
    homeAddress: null,
    workdayStart: '08:00',
    workdayEnd: '17:00',
    bufferMinutes: 0,
    defaultVisitMinutes: 60,
    // The matrix crosses the server/client boundary as a plain object; a Map
    // wouldn't survive serialization, and a dropped matrix would silently swap
    // real driving distances for straight-line guesses.
    matrix: { 'start->a': { miles: 5, minutes: 10 }, 'a->b': { miles: 7, minutes: 15 } },
    driveTimeSource: 'drive_matrix',
    driveTimeSkipped: null,
    anchor: 'home_base',
    lockedCount: 0,
    filteredOutCount: 0,
  };

  it('rebuilds the matrix so a reorder is costed for real', () => {
    const result = costOrder(payload, ['a', 'b']);
    expect(result.miles).toBe(12);
    expect(result.minutes).toBe(25);
  });

  it('still costs an order the matrix has no legs for', () => {
    const result = costOrder(payload, ['b', 'a']);
    expect(result.planned).toHaveLength(2);
    expect(result.miles).toBeGreaterThan(0);
  });
});

describe('the stop you mean to end on', () => {
  it('moves it to the end and leaves everything else in order', () => {
    expect(endOn(['a', 'b', 'c', 'd'], 'b')).toEqual(['a', 'c', 'd', 'b']);
  });

  it('does nothing when it is already last', () => {
    const order = ['a', 'b', 'c'];
    expect(endOn(order, 'c')).toBe(order);
  });

  it('leaves an order alone when nothing is preferred', () => {
    const order = ['a', 'b', 'c'];
    expect(endOn(order, null)).toBe(order);
  });

  // Yesterday's preference reaching today's list must not silently append an id
  // that isn't on the day.
  it('ignores a stop that isn’t in this list', () => {
    const order = ['a', 'b'];
    expect(endOn(order, 'zzz')).toBe(order);
  });
});
