import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  driveDistances,
  driveMatrix,
  calculateLiveDriveTime,
  calculateLiveEtaWithFallback,
} from '@/lib/drive-time';
import { recalculateLiveArrivalTimes, arrivalSettingsFromAccount } from '@/lib/arrival';
import { updateTechPosition, type TrackingRow } from '@/lib/job-tracking';
import { departurePlans } from '@/lib/departure-plan';

describe('traffic-aware drive-time calculations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, GOOGLE_MAPS_API_KEY: 'test-google-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('correctly requests traffic-aware parameters and parses duration_in_traffic', async () => {
    const origin = { lat: 40.7128, lng: -74.006 };
    const destination = { lat: 40.7589, lng: -73.9851 };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [
          {
            elements: [
              {
                status: 'OK',
                distance: { value: 8046.72 }, // 5.0 miles
                duration: { value: 900 }, // 15 mins base
                duration_in_traffic: { value: 1380 }, // 23 mins in traffic (8m delay)
              },
            ],
          },
        ],
      }),
    });

    global.fetch = mockFetch;

    const results = await driveDistances(origin, [destination], {
      departureTime: 'now',
      trafficModel: 'best_guess',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('departure_time=now');
    expect(calledUrl).toContain('traffic_model=best_guess');
    expect(calledUrl).toContain('key=test-google-key');

    expect(results).not.toBeNull();
    expect(results?.length).toBe(1);
    const leg = results![0];
    expect(leg).not.toBeNull();
    expect(leg!.miles).toBeCloseTo(5.0, 1);
    expect(leg!.minutes).toBe(23); // Uses traffic-aware duration
    expect(leg!.minutesInTraffic).toBe(23);
    expect(leg!.trafficDelayMinutes).toBe(8);
    expect(leg!.isTrafficAware).toBe(true);
  });

  it('falls back to standard duration when duration_in_traffic is not present', async () => {
    const origin = { lat: 40.7128, lng: -74.006 };
    const destination = { lat: 40.7589, lng: -73.9851 };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [
          {
            elements: [
              {
                status: 'OK',
                distance: { value: 16093.44 }, // 10.0 miles
                duration: { value: 1200 }, // 20 mins
              },
            ],
          },
        ],
      }),
    });

    const results = await driveDistances(origin, [destination]);
    expect(results).not.toBeNull();
    const leg = results![0];
    expect(leg!.miles).toBeCloseTo(10.0, 1);
    expect(leg!.minutes).toBe(20);
    expect(leg!.minutesInTraffic).toBeUndefined();
    expect(leg!.trafficDelayMinutes).toBe(0);
    expect(leg!.isTrafficAware).toBe(false);
  });

  it('parses driveMatrix with traffic awareness', async () => {
    const points = [
      { id: 'start', coord: { lat: 40.71, lng: -74.0 } },
      { id: 'job-1', coord: { lat: 40.73, lng: -73.99 } },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [
          {
            elements: [
              { status: 'OK', distance: { value: 0 }, duration: { value: 0 } },
              {
                status: 'OK',
                distance: { value: 3218.69 }, // 2 miles
                duration: { value: 360 }, // 6 mins
                duration_in_traffic: { value: 600 }, // 10 mins
              },
            ],
          },
          {
            elements: [
              {
                status: 'OK',
                distance: { value: 3218.69 },
                duration: { value: 360 },
                duration_in_traffic: { value: 480 },
              },
              { status: 'OK', distance: { value: 0 }, duration: { value: 0 } },
            ],
          },
        ],
      }),
    });

    const matrix = await driveMatrix(points, { departureTime: 'now' });
    expect(matrix).not.toBeNull();
    const forward = matrix!.get('start->job-1');
    expect(forward).toBeDefined();
    expect(forward!.miles).toBeCloseTo(2.0, 1);
    expect(forward!.minutes).toBe(10);
    expect(forward!.trafficDelayMinutes).toBe(4);
    expect(forward!.isTrafficAware).toBe(true);
  });

  it('calculateLiveEtaWithFallback uses traffic results when available', async () => {
    const origin = { lat: 42.4, lng: -83.1 };
    const destination = { lat: 42.45, lng: -83.12 };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [
          {
            elements: [
              {
                status: 'OK',
                distance: { value: 6437.38 }, // 4 miles
                duration: { value: 600 }, // 10 mins
                duration_in_traffic: { value: 900 }, // 15 mins
              },
            ],
          },
        ],
      }),
    });

    const liveEta = await calculateLiveEtaWithFallback(origin, destination);
    expect(liveEta).not.toBeNull();
    expect(liveEta!.miles).toBe(4);
    expect(liveEta!.minutes).toBe(15);
    expect(liveEta!.trafficDelayMinutes).toBe(5);
    expect(liveEta!.isTrafficAware).toBe(true);
  });

  it('calculateLiveEtaWithFallback falls back gracefully when Google API fails or has no key', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const origin = { lat: 42.4, lng: -83.1 };
    const destination = { lat: 42.45, lng: -83.12 };

    const fallback = await calculateLiveEtaWithFallback(origin, destination);
    expect(fallback).not.toBeNull();
    expect(fallback!.miles).toBeGreaterThan(0);
    expect(fallback!.minutes).toBeGreaterThanOrEqual(5);
    expect(fallback!.isTrafficAware).toBe(false);
  });
});

describe('recalculateLiveArrivalTimes', () => {
  const settings = arrivalSettingsFromAccount({
    arrival_window_style: 'window',
    arrival_window_minutes: 30,
  });

  it('recalculates arrival window dynamically from updated ETA minutes', () => {
    const now = new Date('2026-08-03T14:00:00.000Z');
    const result = recalculateLiveArrivalTimes(now, 20, settings);

    expect(result.etaMinutes).toBe(20);
    expect(result.times.start.toISOString()).toBe('2026-08-03T14:20:00.000Z');
    expect(result.times.end.toISOString()).toBe('2026-08-03T14:50:00.000Z');
    expect(result.isDelayed).toBe(false);
  });

  it('detects delays when recalculated arrival start exceeds original promised window', () => {
    const now = new Date('2026-08-03T14:00:00.000Z');
    const originalEnd = new Date('2026-08-03T14:30:00.000Z');

    // ETA is 45 mins from now -> arrival at 14:45, which is 15 mins past original end
    const result = recalculateLiveArrivalTimes(now, 45, settings, originalEnd);
    expect(result.isDelayed).toBe(true);
    expect(result.minutesLate).toBe(15);
  });
});

describe('continuous ETA recalculation in updateTechPosition', () => {
  it('updates technician position and continuously recalculates ETA and window', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, GOOGLE_MAPS_API_KEY: 'test-key' };

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'job_tracking') {
          return { update: mockUpdate };
        }
        if (table === 'jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { lat: 40.7589, lng: -73.9851 },
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as any;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [
          {
            elements: [
              {
                status: 'OK',
                distance: { value: 4828.03 }, // 3 miles
                duration: { value: 600 }, // 10 mins
                duration_in_traffic: { value: 720 }, // 12 mins in traffic
              },
            ],
          },
        ],
      }),
    });

    const row: TrackingRow = {
      id: 'track-123',
      account_id: 'acc-1',
      job_id: 'job-999',
      crew_id: 'crew-1',
      sent_by: 'Dave',
      status: 'en_route',
      tech_lat: 40.71,
      tech_lng: -74.0,
      eta_minutes: 25,
      arrival_start: '2026-08-03T14:25:00.000Z',
      arrival_end: '2026-08-03T14:55:00.000Z',
      share_location: true,
      location_expires_at: '2026-08-03T15:30:00.000Z',
      message_body: null,
      sms_status: 'sent',
      sms_sid: null,
      sms_error: null,
      homeowner_note: null,
      homeowner_note_at: null,
      revision_count: 0,
      last_sent_at: '2026-08-03T14:00:00.000Z',
      en_route_at: '2026-08-03T14:00:00.000Z',
      arrived_at: null,
      expires_at: '2026-08-03T18:00:00.000Z',
      first_viewed_at: null,
      last_viewed_at: null,
      view_count: 0,
      late_notified_at: null,
      suggested_minutes: null,
    };

    const now = new Date('2026-08-03T14:05:00.000Z');
    const result = await updateTechPosition(
      mockAdmin,
      row,
      { lat: 40.725, lng: -73.995 },
      'street',
      now,
    );

    expect(result).toBeDefined();
    expect(result?.etaMinutes).toBe(12);
    expect(result?.arrivalStart).toBe('2026-08-03T14:17:00.000Z');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tech_lat: expect.any(Number),
        tech_lng: expect.any(Number),
        eta_minutes: 12,
        arrival_start: '2026-08-03T14:17:00.000Z',
      }),
    );

    process.env = originalEnv;
  });
});

describe('departurePlans with traffic matrix', () => {
  it('uses traffic-aware matrix duration when supplied', () => {
    const stops = [
      { id: 'stop-1', scheduledTime: '10:00', lat: 42.45, lng: -83.12 },
    ];
    const matrix = new Map<string, { miles: number; minutes: number }>();
    matrix.set('start->stop-1', { miles: 5, minutes: 25 }); // 25 min traffic-aware leg

    const plans = departurePlans(stops, {
      day: '2026-08-03',
      timeZone: 'America/New_York',
      bufferMinutes: 5,
      origin: { lat: 42.4, lng: -83.1 },
      now: new Date('2026-08-03T08:00:00.000Z'),
      matrix,
    });

    expect(plans.length).toBe(1);
    expect(plans[0].driveMinutes).toBe(25);
    // Leave by 10:00 - (25m drive + 5m buffer) = 9:30 AM (13:30 UTC)
    expect(plans[0].leaveBy?.toISOString()).toBe('2026-08-03T13:30:00.000Z');
  });
});
