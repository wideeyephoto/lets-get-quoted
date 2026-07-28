import { describe, it, expect } from 'vitest';
import { findOfferedSlot, type BookingDay } from '@/lib/booking';

const days: BookingDay[] = [
  {
    dateKey: '2026-08-04',
    dayLabel: 'Tuesday, Aug 4',
    slots: [
      { time: '08:00', label: 'Morning · 8:00 AM' },
      { time: '13:00', label: 'Afternoon · 1:00 PM' },
    ],
  },
  {
    dateKey: '2026-08-05',
    dayLabel: 'Wednesday, Aug 5',
    slots: [{ time: '13:00', label: 'Afternoon · 1:00 PM' }], // morning already taken
  },
];

describe('findOfferedSlot', () => {
  it('matches a genuinely offered day + window and returns the server labels', () => {
    const offered = findOfferedSlot(days, '2026-08-04', '08:00');
    expect(offered).not.toBeNull();
    expect(offered!.day.dayLabel).toBe('Tuesday, Aug 4');
    expect(offered!.slot.label).toBe('Morning · 8:00 AM');
  });

  it('rejects a window not offered on that day (already taken)', () => {
    expect(findOfferedSlot(days, '2026-08-05', '08:00')).toBeNull();
  });

  it('rejects a day that is not on offer at all (past / weekend / full)', () => {
    expect(findOfferedSlot(days, '2026-08-09', '08:00')).toBeNull();
  });

  it('rejects an arbitrary off-template time (tampered value)', () => {
    expect(findOfferedSlot(days, '2026-08-04', '23:45')).toBeNull();
    expect(findOfferedSlot(days, '2026-08-04', 'anything')).toBeNull();
  });

  it('rejects empty / malformed input', () => {
    expect(findOfferedSlot(days, '', '')).toBeNull();
    expect(findOfferedSlot([], '2026-08-04', '08:00')).toBeNull();
  });
});
