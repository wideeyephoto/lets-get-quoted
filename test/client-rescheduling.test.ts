import { describe, expect, it } from 'vitest';
import {
  calculateAvailableRescheduleWindows,
  validateRescheduleRequest,
} from '@/lib/client-rescheduling';

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
