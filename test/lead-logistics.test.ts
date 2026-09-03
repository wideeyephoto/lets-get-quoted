import { describe, it, expect } from 'vitest';
import {
  computeCorridorDetourMiles,
  analyzePipelineLogistics,
} from '@/lib/ai-lead-advisor';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { MapPin } from '@/components/pin-map';

const baseLead: LeadViewItem = {
  id: 'lead-test',
  name: 'Jane Doe',
  status: 'new',
  statusLabel: 'New lead',
  sourceLabel: 'Website Form',
  phone: '248-555-0199',
  email: 'jane@example.com',
  address: '123 Main St, Royal Oak, MI 48067',
  detail: 'Roof Inspection & Repair',
  estimatedHours: 8,
  createdAt: new Date().toISOString(),
  ageLabel: '1h ago',
  convertedJob: null,
  score: 'hot',
  hasTriage: true,
  scoreLabel: 'Hot lead',
  flags: [{ key: 'urgency', label: 'Needs response' }],
  textOnly: false,
  estimate: { min: 4000, max: 8000 },
  estimateLabel: '$4,000–$8,000',
  timeline: 'Within 2 weeks',
  location: 'Royal Oak, MI',
  city: 'Royal Oak',
  contactLog: [],
  isUrgent: true,
  waitingLong: '1 hour waiting',
  waitingShort: '1h waiting',
  lastTouchAt: null,
  snoozedUntilLabel: null,
  projectType: 'roofing',
  photoCount: 0,
};

describe('computeCorridorDetourMiles', () => {
  it('calculates near-zero detour when lead is directly on the path between Stop A and Stop B', () => {
    // Stop A: (42.40, -83.14), Stop B: (42.50, -83.14)
    // Lead is halfway at (42.45, -83.14)
    const detour = computeCorridorDetourMiles(
      { lat: 42.40, lng: -83.14 },
      { lat: 42.50, lng: -83.14 },
      { lat: 42.45, lng: -83.14 },
    );
    expect(detour).toBeLessThanOrEqual(0.1);
  });

  it('calculates positive detour when lead requires driving out of the way', () => {
    // Stop A: (42.40, -83.14), Stop B: (42.50, -83.14)
    // Lead is off to the east at (42.45, -83.00) (~7 miles out of the way)
    const detour = computeCorridorDetourMiles(
      { lat: 42.40, lng: -83.14 },
      { lat: 42.50, lng: -83.14 },
      { lat: 42.45, lng: -83.00 },
    );
    expect(detour).toBeGreaterThan(5);
  });
});

describe('analyzePipelineLogistics', () => {
  it('correctly marks a lead as Halo when within 0.75 miles of a scheduled job', () => {
    const leads: LeadViewItem[] = [baseLead];
    const mapPins: MapPin[] = [
      { id: 'lead-lead-test', lat: 42.4895, lng: -83.1446, kind: 'lead', label: 'Jane Doe', href: '' },
      { id: 'job-1', lat: 42.4920, lng: -83.1400, kind: 'scheduled', label: 'Roof Repair', href: '' },
    ];

    const result = analyzePipelineLogistics(leads, mapPins);
    const meta = result.get('lead-test');
    expect(meta).toBeDefined();
    expect(meta?.isHalo).toBe(true);
    expect(meta?.haloJobTitle).toBe('Roof Repair');
    expect(meta?.haloDistanceMiles).toBeLessThanOrEqual(0.75);
  });

  it('calculates opportunity score including value, urgency, and logistics boosts', () => {
    const leads: LeadViewItem[] = [
      {
        ...baseLead,
        estimate: { min: 8000, max: 12000 }, // $10,000 midpoint -> 100 value points
        score: 'hot', // +30
        isUrgent: true, // +25
      },
    ];
    const mapPins: MapPin[] = [
      { id: 'lead-lead-test', lat: 42.4895, lng: -83.1446, kind: 'lead', label: 'Jane Doe', href: '' },
      { id: 'job-1', lat: 42.4920, lng: -83.1400, kind: 'scheduled', label: 'Roof Repair', href: '' },
    ];

    const result = analyzePipelineLogistics(leads, mapPins);
    const meta = result.get('lead-test');
    expect(meta?.isTier1Opportunity).toBe(true);
    expect(meta?.opportunityScore).toBeGreaterThanOrEqual(150);
  });
});
