import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMiles,
  findNearestScheduledJob,
  generateLeadAdvisorRecommendation,
} from '@/lib/ai-lead-advisor';
import type { LeadViewItem } from '@/app/dashboard/leads/LeadsWorkspace';
import type { MapPin } from '@/components/pin-map';

const mockLead: LeadViewItem = {
  id: 'lead-123',
  name: 'Rosa Holbrook',
  status: 'new',
  statusLabel: 'New lead',
  sourceLabel: 'Website Form',
  phone: '248-555-0199',
  email: 'rosa@example.com',
  address: '306 E 4th St, Royal Oak, MI 48067',
  detail: 'Trenchless Sewer Pipe Relining',
  estimatedHours: 16,
  createdAt: new Date().toISOString(),
  ageLabel: '1h ago',
  convertedJob: null,
  score: 'hot',
  hasTriage: true,
  scoreLabel: 'Hot lead',
  flags: [{ key: 'urgency', label: 'Needs response' }],
  textOnly: false,
  estimate: { min: 4200, max: 10500 },
  estimateLabel: '$4,200–$10,500',
  timeline: 'Within 2 weeks',
  location: 'Royal Oak, MI',
  city: 'Royal Oak',
  contactLog: [],
  isUrgent: true,
  waitingLong: '1 hour waiting',
  waitingShort: '1h waiting',
  lastTouchAt: null,
};

describe('haversineDistanceMiles', () => {
  it('accurately calculates distance between nearby points', () => {
    // Detroit to Royal Oak (~13 miles)
    const dist = haversineDistanceMiles(42.3314, -83.0458, 42.4895, -83.1446);
    expect(dist).toBeGreaterThan(11);
    expect(dist).toBeLessThan(15);
  });

  it('returns 0 for identical points', () => {
    expect(haversineDistanceMiles(42.4895, -83.1446, 42.4895, -83.1446)).toBe(0);
  });
});

describe('findNearestScheduledJob', () => {
  const leadPin: MapPin = {
    id: 'lead-lead-123',
    lat: 42.4895,
    lng: -83.1446,
    kind: 'lead',
    label: 'Rosa Holbrook',
    sublabel: '306 E 4th St, Royal Oak',
    href: '/dashboard/leads/lead-123',
  };

  const scheduledJobPin: MapPin = {
    id: 'job-job-456',
    lat: 42.4920,
    lng: -83.1400,
    kind: 'scheduled',
    label: 'Main St Sewer Repair',
    sublabel: '702 S Main St, Royal Oak',
    href: '/dashboard/jobs/job-456',
    rows: [{ label: 'Scheduled', value: 'Tomorrow · 1:00 PM' }],
  };

  const farJobPin: MapPin = {
    id: 'job-job-789',
    lat: 42.1000,
    lng: -83.8000,
    kind: 'scheduled',
    label: 'Far Away Job',
    href: '/dashboard/jobs/job-789',
  };

  it('finds the nearest scheduled job within radius', () => {
    const nearest = findNearestScheduledJob(leadPin, [scheduledJobPin, farJobPin]);
    expect(nearest).not.toBeNull();
    expect(nearest?.title).toBe('Main St Sewer Repair');
    expect(nearest?.distanceMiles).toBeLessThan(1);
    expect(nearest?.scheduled).toBe('Tomorrow · 1:00 PM');
  });

  it('returns null if no scheduled jobs are within max radius', () => {
    const nearest = findNearestScheduledJob(leadPin, [farJobPin], 10);
    expect(nearest).toBeNull();
  });
});

describe('generateLeadAdvisorRecommendation', () => {
  it('generates a route cluster recommendation when a nearby job is scheduled', () => {
    const mapPins: MapPin[] = [
      {
        id: 'lead-lead-123',
        lat: 42.4895,
        lng: -83.1446,
        kind: 'lead',
        label: 'Rosa Holbrook',
        href: '/dashboard/leads/lead-123',
      },
      {
        id: 'job-job-456',
        lat: 42.4920,
        lng: -83.1400,
        kind: 'scheduled',
        label: 'Drain Line Repair',
        sublabel: 'Main St, Royal Oak',
        href: '/dashboard/jobs/job-456',
        rows: [{ label: 'Scheduled', value: 'Tomorrow · 1:00 PM' }],
      },
    ];

    const rec = generateLeadAdvisorRecommendation(mockLead, mapPins);
    expect(rec.headline).toBe('⚡ Route Cluster Opportunity');
    expect(rec.summary).toContain('mi away');
    expect(rec.action.type).toBe('sms');
    expect(rec.action.suggestedBody).toContain('Rosa');
    expect(rec.action.suggestedBody).toContain('Main St');
    expect(rec.action.href).toContain('sms:248-555-0199');
  });

  it('generates a high-value priority recommendation when no route cluster exists', () => {
    const rec = generateLeadAdvisorRecommendation(mockLead, []);
    expect(rec.headline).toContain('High-Value Target');
    expect(rec.metrics.some((m) => m.label.includes('$4,200–$10,500'))).toBe(true);
    expect(rec.action.type).toBe('call'); // Phone present, textOnly false
  });

  it('generates SMS action when lead prefers text', () => {
    const textOnlyLead = { ...mockLead, textOnly: true };
    const rec = generateLeadAdvisorRecommendation(textOnlyLead, []);
    expect(rec.action.type).toBe('sms');
    expect(rec.action.label).toContain('SMS');
  });
});
