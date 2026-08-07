import { describe, it, expect } from 'vitest';
import {
  isRouteStopId,
  KIND_GLYPH,
  KIND_LABEL,
  normalizeKind,
  ROUTE_STOP_KINDS,
  ROUTE_STOP_PREFIX,
  routeStopUuid,
  toPlanStop,
  type RouteStop,
} from '@/lib/route-stops';
import { SERVICE_ICON_GLYPHS } from '@/lib/templates/service-icons.data';
import { scheduleOrder } from '@/lib/route-plan';

const stop = (over: Partial<RouteStop> = {}): RouteStop => ({
  id: '11111111-2222-3333-4444-555555555555',
  account_id: 'acct',
  crew_id: null,
  saved_place_id: null,
  // Required and nullable: set only when the stop is an estimate visit a lead
  // accepted by text. Null is the ordinary case this fixture models.
  lead_id: null,
  scheduled_for: '2026-07-30',
  scheduled_time: null,
  label: 'County dump',
  address: '1200 W Maple Rd, Troy, MI',
  lat: 42.55,
  lng: -83.15,
  minutes: 30,
  kind: 'dump',
  note: null,
  ...over,
});

describe('telling a supply stop from a job', () => {
  // The whole reason for the prefix: the save action writes to two different
  // tables and must never mistake one for the other. A bare uuid is a job.
  it('marks a route stop id and leaves a job id alone', () => {
    const planned = toPlanStop(stop());
    expect(isRouteStopId(planned.id)).toBe(true);
    expect(isRouteStopId('11111111-2222-3333-4444-555555555555')).toBe(false);
  });

  it('recovers the real row id', () => {
    const planned = toPlanStop(stop());
    expect(routeStopUuid(planned.id)).toBe('11111111-2222-3333-4444-555555555555');
    expect(planned.id).toBe(`${ROUTE_STOP_PREFIX}11111111-2222-3333-4444-555555555555`);
  });

  // A job id that happened to start with "rs:" would be written to the wrong
  // table. Job ids are uuids, so this can't collide — assert it stays that way.
  it('cannot be confused by a uuid', () => {
    expect(isRouteStopId('rs11111111-2222-3333-4444-555555555555')).toBe(false);
  });
});

describe('a supply stop as a planner stop', () => {
  it('carries its coordinates, address and duration', () => {
    const planned = toPlanStop(stop());
    expect(planned.label).toBe('County dump');
    expect(planned.address).toBe('1200 W Maple Rd, Troy, MI');
    expect(planned.lat).toBe(42.55);
    expect(planned.visitMinutes).toBe(30);
  });

  // Nobody confirmed a dump run, so it can always be dragged. A locked supply
  // stop would be a promise made to nobody.
  it('is never locked', () => {
    expect(toPlanStop(stop()).locked).toBe(false);
    expect(toPlanStop(stop({ scheduled_time: '14:00' })).locked).toBe(false);
  });

  it('falls back to 20 minutes rather than costing the day nothing', () => {
    expect(toPlanStop(stop({ minutes: 0 })).visitMinutes).toBe(20);
    expect(toPlanStop(stop({ minutes: null as unknown as number })).visitMinutes).toBe(20);
  });

  it('routes alongside jobs and adds its time to the day', () => {
    const job = {
      id: 'job-1',
      label: 'Nina',
      address: '1 A St',
      lat: 42.5,
      lng: -83.1,
      scheduledTime: null,
      visitMinutes: 60,
      locked: false,
    };
    const errand = toPlanStop(stop());
    const input = {
      stops: [job, errand],
      homeBase: { lat: 42.5, lng: -83.1 },
      workdayStart: '08:00',
      workdayEnd: '17:00',
      bufferMinutes: 0,
      defaultVisitMinutes: 60,
    };
    const withoutErrand = scheduleOrder(['job-1'], input);
    const withErrand = scheduleOrder(['job-1', errand.id], input);
    expect(withErrand.planned).toHaveLength(2);
    expect(withErrand.workMinutes - withoutErrand.workMinutes).toBe(30);
    expect(withErrand.miles).toBeGreaterThan(withoutErrand.miles);
  });
});

describe('stop kinds', () => {
  it('keeps a known kind and falls back for anything else', () => {
    expect(normalizeKind('dump')).toBe('dump');
    expect(normalizeKind('supply')).toBe('supply');
    expect(normalizeKind('nonsense')).toBe('other');
    expect(normalizeKind(null)).toBe('other');
    expect(normalizeKind(undefined)).toBe('other');
  });

  // The kind list is duplicated as a database check constraint. If one grows a
  // value the other doesn't have, an insert fails at runtime instead of here.
  it('labels and draws every kind it allows', () => {
    for (const kind of ROUTE_STOP_KINDS) {
      expect(KIND_LABEL[kind], `no label for ${kind}`).toBeTruthy();
      expect(SERVICE_ICON_GLYPHS[KIND_GLYPH[kind]], `no icon for ${kind}`).toBeTruthy();
    }
  });
});
