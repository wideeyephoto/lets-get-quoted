import { describe, expect, it } from 'vitest';
import { getLeadTriage, formatLeadAttribution, type Lead } from '@/lib/leads';

describe('Lead Triage Attribution', () => {
  it('reads attribution from lead.triage and formats it cleanly', () => {
    const lead: Lead = {
      id: 'lead-test-123',
      account_id: 'acc-1',
      source: 'website_form',
      status: 'new',
      name: 'Jane Smith',
      phone: '555-123-4567',
      email: 'jane@example.com',
      address: '123 Main St, Austin, TX',
      project_type: 'Roof repair',
      estimated_hours: null,
      message: 'Need urgent leak repair on shingle roof',
      photo_paths: [],
      source_page: 'https://evergreen.com/services?utm_source=facebook&utm_medium=paid_social&utm_campaign=spring_roofing_sale',
      created_at: new Date().toISOString(),
      converted_job: null,
      quote_visit: null,
      client_id: null,
      lat: null,
      lng: null,
      geocoded_at: null,
      updated_at: new Date().toISOString(),
      triage: {
        score: 'hot',
        flags: [],
        contactPreference: 'any',
        attribution: {
          source: 'facebook',
          medium: 'paid_social',
          campaign: 'spring_roofing_sale',
          content: 'hero_cta_video',
          clickId: 'fbclid_987654321',
          clickIdType: 'fbclid',
          landingPage: '/services',
          capturedAt: new Date().toISOString(),
        },
      },
    };

    const triage = getLeadTriage(lead);
    expect(triage.attribution).toBeDefined();
    expect(triage.attribution?.campaign).toBe('spring_roofing_sale');

    const formatted = formatLeadAttribution(triage.attribution);
    expect(formatted).not.toBeNull();
    expect(formatted?.headline).toBe('spring roofing sale');
    expect(formatted?.isPaid).toBe(true);
    expect(formatted?.channel).toBe('facebook');
    expect(formatted?.detail).toContain('facebook (Paid)');
    expect(formatted?.detail).toContain('Creative: hero_cta_video');
  });

  it('handles leads with no attribution gracefully', () => {
    const lead: Lead = {
      id: 'lead-test-456',
      account_id: 'acc-1',
      source: 'manual',
      status: 'new',
      name: 'Bob Johnson',
      phone: '555-987-6543',
      email: null,
      address: null,
      project_type: 'Pipe clearing',
      estimated_hours: null,
      message: 'Walk-in call',
      photo_paths: [],
      source_page: null,
      created_at: new Date().toISOString(),
      converted_job: null,
      quote_visit: null,
      client_id: null,
      lat: null,
      lng: null,
      geocoded_at: null,
      updated_at: new Date().toISOString(),
      triage: null,
    };

    const triage = getLeadTriage(lead);
    expect(triage.attribution).toBeUndefined();
    expect(formatLeadAttribution(triage.attribution)).toBeNull();
  });
});
