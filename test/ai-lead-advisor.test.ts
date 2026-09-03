import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMiles,
  findNearestScheduledJob,
  generateLeadAdvisorRecommendation,
  generateOverallLeadsAdvisorRecommendation,
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
  snoozedUntilLabel: null,
  projectType: 'plumbing',
  photoCount: 0,
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

describe('generateOverallLeadsAdvisorRecommendation', () => {
  it('prioritizes urgent leads when hot/urgent leads need response', () => {
    const leads: LeadViewItem[] = [
      mockLead, // hot, urgent, estimate 4200-10500 ($7,350 midpoint)
      { ...mockLead, id: 'lead-2', name: 'John Smith', status: 'new', score: 'warm', isUrgent: false },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, []);
    expect(rec.type).toBe('urgent_response');
    expect(rec.headline).toContain('1 Urgent Lead Need First Response');
    expect(rec.stats.urgentCount).toBe(1);
    expect(rec.stats.totalOpen).toBe(2);
    expect(rec.action?.targetStage).toBe('new');
  });

  it('advises on new inbound leads when no leads are marked urgent', () => {
    const leads: LeadViewItem[] = [
      { ...mockLead, id: 'lead-1', isUrgent: false, score: 'warm', status: 'new' },
      { ...mockLead, id: 'lead-2', isUrgent: false, score: 'warm', status: 'new' },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, []);
    expect(rec.type).toBe('urgent_response');
    expect(rec.headline).toContain('2 New Inbound Leads Awaiting Response');
    expect(rec.action?.targetStage).toBe('new');
  });

  it('detects active jobsite halo when open leads are within 0.75 mi of active jobs', () => {
    const leads: LeadViewItem[] = [
      { ...mockLead, id: 'lead-1', isUrgent: false, score: 'low', status: 'contacted' },
      { ...mockLead, id: 'lead-2', isUrgent: false, score: 'low', status: 'contacted' },
    ];

    const mapPins: MapPin[] = [
      { id: 'lead-lead-1', lat: 42.4895, lng: -83.1446, kind: 'lead', label: 'Lead 1', href: '/dashboard/leads?selected=lead-1' },
      { id: 'lead-lead-2', lat: 42.4910, lng: -83.1420, kind: 'lead', label: 'Lead 2', href: '/dashboard/leads?selected=lead-2' },
      {
        id: 'job-job-1',
        lat: 42.4920,
        lng: -83.1400,
        kind: 'scheduled',
        label: 'Main St Repair',
        sublabel: 'Royal Oak',
        href: '/dashboard/jobs/job-1',
        rows: [{ label: 'Scheduled', value: 'Tomorrow · 1:00 PM' }],
      },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, mapPins);
    expect(rec.type).toBe('route_cluster');
    expect(rec.headline).toContain('Jobsite Halo: 2 Neighbor Inquiries');
    expect(rec.action?.targetLogisticalPreset).toBe('halo');
    expect(rec.stats.haloCount).toBe(2);
  });

  it('detects en-route transit corridor when leads lie along route between stops', () => {
    const leads: LeadViewItem[] = [
      { ...mockLead, id: 'lead-1', isUrgent: false, score: 'low', status: 'contacted' },
      { ...mockLead, id: 'lead-2', isUrgent: false, score: 'low', status: 'contacted' },
    ];

    // Job A at (42.40, -83.14), Job B at (42.50, -83.14) (approx 6.9 miles direct).
    // Leads located along corridor at (42.43, -83.14) and (42.47, -83.14) (> 2 miles from jobs, so NOT halo, but directly en route).
    const mapPins: MapPin[] = [
      { id: 'lead-lead-1', lat: 42.43, lng: -83.14, kind: 'lead', label: 'Lead 1', href: '' },
      { id: 'lead-lead-2', lat: 42.47, lng: -83.14, kind: 'lead', label: 'Lead 2', href: '' },
      { id: 'job-1', lat: 42.40, lng: -83.14, kind: 'scheduled', label: 'South Stop', href: '' },
      { id: 'job-2', lat: 42.50, lng: -83.14, kind: 'scheduled', label: 'North Stop', href: '' },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, mapPins);
    expect(rec.type).toBe('route_cluster');
    expect(rec.headline).toContain('En Route: 2 Leads Directly Along Crew Transit Routes');
    expect(rec.action?.targetLogisticalPreset).toBe('en_route');
    expect(rec.stats.enRouteCount).toBe(2);
  });

  it('detects schedule gap opportunities when calendar slack exists between jobs', () => {
    const leads: LeadViewItem[] = [
      { ...mockLead, id: 'lead-1', isUrgent: false, score: 'low', status: 'contacted' },
    ];

    // Two jobs separated by 3.5 hours: Stop 1 at 9:00 AM, Stop 2 at 2:30 PM
    const mapPins: MapPin[] = [
      { id: 'lead-lead-1', lat: 42.45, lng: -83.14, kind: 'lead', label: 'Lead 1', href: '' },
      {
        id: 'job-1',
        lat: 42.40,
        lng: -83.14,
        kind: 'scheduled',
        label: 'Morning Job',
        href: '',
        rows: [{ label: 'Scheduled', value: 'Today · 9:00 AM' }],
      },
      {
        id: 'job-2',
        lat: 42.50,
        lng: -83.14,
        kind: 'scheduled',
        label: 'Afternoon Job',
        href: '',
        rows: [{ label: 'Scheduled', value: 'Today · 2:30 PM' }],
      },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, mapPins);
    expect(rec.type).toBe('route_cluster');
    expect(rec.headline).toContain('Calendar Slack');
    expect(rec.action?.targetLogisticalPreset).toBe('gap_fits');
  });

  it('flags tier-1 best value targets when high revenue leads exist without active route matches', () => {
    const leads: LeadViewItem[] = [
      {
        ...mockLead,
        id: 'lead-1',
        name: 'Major Trenchless Job',
        status: 'contacted',
        score: 'warm',
        isUrgent: false,
        estimate: { min: 8000, max: 14000 }, // $11,000 midpoint
      },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, []);
    expect(rec.type).toBe('high_value_pipeline');
    expect(rec.headline).toContain('Tier-1 Opportunities');
    expect(rec.action?.targetLogisticalPreset).toBe('best_opportunities');
    expect(rec.stats.tier1Count).toBe(1);
  });

  it('recommends following up on quotes when quotes are pending decision', () => {
    const leads: LeadViewItem[] = [
      { ...mockLead, id: 'lead-1', isUrgent: false, score: 'low', status: 'quoted' },
      { ...mockLead, id: 'lead-2', isUrgent: false, score: 'low', status: 'quoted' },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, []);
    expect(rec.type).toBe('quote_followup');
    expect(rec.headline).toContain('2 Outstanding Quotes Awaiting Homeowner Decision');
    expect(rec.action?.targetStage).toBe('quoted');
  });

  it('reports active pipeline when leads are in progress with no bottlenecks', () => {
    const leads: LeadViewItem[] = [
      { ...mockLead, id: 'lead-1', isUrgent: false, score: 'low', status: 'contacted' },
    ];

    const rec = generateOverallLeadsAdvisorRecommendation(leads, []);
    expect(rec.type).toBe('high_value_pipeline');
    expect(rec.headline).toContain('Pipeline Active');
    expect(rec.action?.targetStage).toBe('open');
  });

  it('handles empty pipeline gracefully', () => {
    const rec = generateOverallLeadsAdvisorRecommendation([], []);
    expect(rec.type).toBe('empty');
    expect(rec.headline).toContain('Pipeline Clear');
    expect(rec.stats.totalOpen).toBe(0);
  });
});

