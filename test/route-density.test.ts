import { describe, it, expect } from 'vitest';
import { rankByProximity } from '@/lib/route-density';
import type { BookingDay } from '@/lib/booking';

const slot = [{ time: '08:00', endTime: '12:00', label: 'Morning' }];
const days: BookingDay[] = [
  { dateKey: '2026-08-04', dayLabel: 'Tue', slots: slot }, // far anchor (80mi)
  { dateKey: '2026-08-05', dayLabel: 'Wed', slots: slot }, // near anchor (3mi)
  { dateKey: '2026-08-06', dayLabel: 'Thu', slots: slot }, // no anchor
];
const nearestByDate = new Map<string, number>([
  ['2026-08-04', 80],
  ['2026-08-05', 3],
]);
const base = { days, hasLocation: true, nearestByDate, radiusMiles: 15, mode: 'prefer' as const };

describe('rankByProximity', () => {
  it('marks a day nearby only when its nearest stop is within radius, and ranks it first', () => {
    const ranked = rankByProximity(base);
    expect(ranked[0].dateKey).toBe('2026-08-05');
    expect(ranked.find((d) => d.dateKey === '2026-08-05')!.nearby).toBe(true);
    expect(ranked.find((d) => d.dateKey === '2026-08-04')!.nearby).toBe(false); // 80 > 15
    expect(ranked.find((d) => d.dateKey === '2026-08-06')!.nearby).toBe(false); // no anchor
    expect(ranked).toHaveLength(3);
  });

  it('restrict mode offers only nearby days when there is at least one', () => {
    const ranked = rankByProximity({ ...base, mode: 'restrict' });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].dateKey).toBe('2026-08-05');
  });

  it('cold start: no lead location ⇒ plain order, nothing nearby', () => {
    const ranked = rankByProximity({ ...base, hasLocation: false, mode: 'restrict' });
    expect(ranked.map((d) => d.dateKey)).toEqual(['2026-08-04', '2026-08-05', '2026-08-06']);
    expect(ranked.every((d) => !d.nearby)).toBe(true);
  });

  it('restrict never strands: no nearby days ⇒ still offers everything', () => {
    const ranked = rankByProximity({ ...base, nearestByDate: new Map(), mode: 'restrict' });
    expect(ranked).toHaveLength(3);
    expect(ranked.every((d) => !d.nearby)).toBe(true);
  });

  it('a tighter radius drops a formerly-nearby day', () => {
    const ranked = rankByProximity({ ...base, radiusMiles: 1 });
    expect(ranked.every((d) => !d.nearby)).toBe(true);
  });

  it('attaches rounded drive minutes to a nearby day when provided', () => {
    const ranked = rankByProximity({ ...base, minutesByDate: new Map([['2026-08-05', 11.6]]) });
    expect(ranked.find((d) => d.dateKey === '2026-08-05')!.driveMinutes).toBe(12);
    expect(ranked.find((d) => d.dateKey === '2026-08-04')!.driveMinutes).toBeUndefined(); // not nearby
  });
});
