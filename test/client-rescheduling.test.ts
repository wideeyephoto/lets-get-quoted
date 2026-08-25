import { describe, expect, it } from 'vitest';
import {
  calculateAvailableRescheduleWindows,
  validateRescheduleRequest,
  calculateLiveArrivalEta,
} from '@/lib/client-rescheduling';
import type { LatLng } from '@/lib/distance';

describe('calculateAvailableRescheduleWindows', () => {
  it('generates morning, afternoon, and evening slots for upcoming days', () => {
    const windows = calculateAvailableRescheduleWindows({
      startDate: '2026-08-25',
      daysCount: 3,
      maxBookingsPerSlot: 2,
      bookedSlots: {
        '2026-08-26_morning': 2, // fully booked
      },
    });

    expect(windows.length).toBeGreaterThanOrEqual(9);

    const fullSlot = windows.find((w) => w.id === '2026-08-26_morning');
    expect(fullSlot).toBeDefined();
    expect(fullSlot?.isAvailable).toBe(false);

    const openSlot = windows.find((w) => w.id === '2026-08-26_afternoon');
    expect(openSlot).toBeDefined();
    expect(openSlot?.isAvailable).toBe(true);
    expect(openSlot?.slotLabel).toBe('Afternoon Window');
  });
});

describe('validateRescheduleRequest', () => {
  const baseNow = new Date('2026-08-25T08:00:00Z');

  it('allows rescheduling when notice is sufficient and target is in the future', () => {
    const result = validateRescheduleRequest({
      currentScheduledAt: '2026-08-25T14:00:00Z', // 6 hours ahead of now
      requestedDate: '2026-08-27',
      requestedSlot: 'morning',
      now: baseNow,
      minNoticeHours: 2,
    });

    expect(result.allowed).toBe(true);
  });

  it('blocks rescheduling if notice is under minimum cutoff', () => {
    const result = validateRescheduleRequest({
      currentScheduledAt: '2026-08-25T09:00:00Z', // only 1 hour ahead
      requestedDate: '2026-08-27',
      requestedSlot: 'morning',
      now: baseNow,
      minNoticeHours: 2,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('at least 2 hours notice');
  });

  it('blocks rescheduling into the past', () => {
    const result = validateRescheduleRequest({
      currentScheduledAt: null,
      requestedDate: '2026-08-20',
      requestedSlot: 'morning',
      now: baseNow,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('past');
  });
});

describe('calculateLiveArrivalEta', () => {
  const destCoord: LatLng = { lat: 40.7312, lng: -74.2731 };
  const baseNow = new Date('2026-08-25T10:00:00Z');

  it('calculates on-schedule arrival for technician in transit', () => {
    const techCoord: LatLng = { lat: 40.7450, lng: -74.2731 }; // ~1 mile away
    const result = calculateLiveArrivalEta({
      technicianCoord: techCoord,
      destinationCoord: destCoord,
      promisedStartIso: '2026-08-25T09:30:00Z',
      promisedEndIso: '2026-08-25T11:00:00Z',
      now: baseNow,
    });

    expect(result.status).toBe('on_schedule');
    expect(result.tone).toBe('success');
    expect(result.distanceMiles).toBeGreaterThan(0.5);
    expect(result.estimatedDriveMinutes).toBeGreaterThan(0);
    expect(result.headline).toContain('Estimated arrival');
  });

  it('reports arrived status when technician is at the destination address', () => {
    const result = calculateLiveArrivalEta({
      technicianCoord: destCoord,
      destinationCoord: destCoord,
      now: baseNow,
    });

    expect(result.status).toBe('arrived');
    expect(result.progressPct).toBe(100);
    expect(result.headline).toContain('arrived at your address');
  });

  it('detects and flags traffic delay when ETA exceeds promised arrival window', () => {
    const techFar: LatLng = { lat: 40.9000, lng: -74.2731 }; // ~11 miles away (~22 mins drive)
    const result = calculateLiveArrivalEta({
      technicianCoord: techFar,
      destinationCoord: destCoord,
      promisedEndIso: '2026-08-25T10:05:00Z', // Window ends in 5 mins!
      now: baseNow,
    });

    expect(result.status).toBe('running_late');
    expect(result.tone).toBe('warn');
    expect(result.varianceMinutes).toBeGreaterThan(15);
    expect(result.headline).toContain('behind due to traffic');
  });
});
