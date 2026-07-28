import { describe, it, expect } from 'vitest';
import { rankByProximity } from '@/lib/route-density';
import type { BookingDay } from '@/lib/booking';
import type { LatLng } from '@/lib/distance';

const slot = [{ time: '08:00', label: 'Morning' }];
const days: BookingDay[] = [
  { dateKey: '2026-08-04', dayLabel: 'Tue', slots: slot }, // far
  { dateKey: '2026-08-05', dayLabel: 'Wed', slots: slot }, // near
  { dateKey: '2026-08-06', dayLabel: 'Thu', slots: slot }, // no anchor
];
const lead: LatLng = { lat: 42.7231, lng: -84.4275 }; // Okemos
const near: LatLng = { lat: 42.7369, lng: -84.4839 }; // ~3 mi
const far: LatLng = { lat: 42.3314, lng: -83.0458 }; // ~80 mi
const anchors = new Map<string, LatLng[]>([
  ['2026-08-04', [far]],
  ['2026-08-05', [near]],
]);

describe('rankByProximity', () => {
  it('marks a day nearby only when a same-day anchor is within radius, and ranks it first', () => {
    const ranked = rankByProximity({ days, leadCoord: lead, anchorsByDate: anchors, radiusMiles: 15, mode: 'prefer' });
    expect(ranked[0].dateKey).toBe('2026-08-05'); // near day floats up
    expect(ranked.find((d) => d.dateKey === '2026-08-05')!.nearby).toBe(true);
    expect(ranked.find((d) => d.dateKey === '2026-08-04')!.nearby).toBe(false); // 80mi > 15
    expect(ranked.find((d) => d.dateKey === '2026-08-06')!.nearby).toBe(false); // no anchor
    expect(ranked).toHaveLength(3); // prefer keeps all
  });

  it('restrict mode offers only nearby days when there is at least one', () => {
    const ranked = rankByProximity({ days, leadCoord: lead, anchorsByDate: anchors, radiusMiles: 15, mode: 'restrict' });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].dateKey).toBe('2026-08-05');
  });

  it('cold start: no lead coordinates ⇒ plain order, nothing marked nearby', () => {
    const ranked = rankByProximity({ days, leadCoord: null, anchorsByDate: anchors, radiusMiles: 15, mode: 'restrict' });
    expect(ranked.map((d) => d.dateKey)).toEqual(['2026-08-04', '2026-08-05', '2026-08-06']);
    expect(ranked.every((d) => !d.nearby)).toBe(true);
  });

  it('restrict never strands: no nearby days ⇒ still offers everything', () => {
    const ranked = rankByProximity({ days, leadCoord: lead, anchorsByDate: new Map(), radiusMiles: 15, mode: 'restrict' });
    expect(ranked).toHaveLength(3);
    expect(ranked.every((d) => !d.nearby)).toBe(true);
  });

  it('a tighter radius drops a formerly-nearby day', () => {
    const ranked = rankByProximity({ days, leadCoord: lead, anchorsByDate: anchors, radiusMiles: 1, mode: 'prefer' });
    expect(ranked.every((d) => !d.nearby)).toBe(true); // ~3mi > 1mi
  });
});
