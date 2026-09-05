import { describe, expect, it } from 'vitest';
import {
  calculateCampaignRoi,
  classifyLeadChannel,
  buildCampaignUrl,
  CAMPAIGN_LINK_PRESETS,
  type JobFinancialLookup,
} from '@/lib/campaign-roi';
import type { Lead } from '@/lib/leads';

describe('classifyLeadChannel', () => {
  it('identifies Google Ads from gclid or source', () => {
    expect(classifyLeadChannel({ clickIdType: 'gclid', clickId: '123' })).toBe('google');
    expect(classifyLeadChannel({ source: 'google', medium: 'cpc' })).toBe('google');
  });

  it('identifies Meta from fbclid, facebook, or instagram', () => {
    expect(classifyLeadChannel({ clickIdType: 'fbclid', clickId: 'abc' })).toBe('meta');
    expect(classifyLeadChannel({ source: 'facebook', medium: 'paid_social' })).toBe('meta');
    expect(classifyLeadChannel({ source: 'instagram' })).toBe('meta');
  });

  it('identifies TikTok from ttclid or source', () => {
    expect(classifyLeadChannel({ clickIdType: 'ttclid', clickId: 'xyz' })).toBe('tiktok');
    expect(classifyLeadChannel({ source: 'tiktok' })).toBe('tiktok');
  });

  it('identifies Print & QR collateral from medium or source', () => {
    expect(classifyLeadChannel({ source: 'yard_sign', medium: 'print_qr' })).toBe('print_qr');
    expect(classifyLeadChannel({ source: 'truck_wrap', medium: 'print_qr' })).toBe('print_qr');
  });

  it('identifies local referrals like Nextdoor', () => {
    expect(classifyLeadChannel({ source: 'nextdoor', medium: 'referral' })).toBe('local');
    expect(classifyLeadChannel({ source: 'yelp' })).toBe('local');
  });

  it('defaults to direct when no attribution is present', () => {
    expect(classifyLeadChannel(null)).toBe('direct');
    expect(classifyLeadChannel(undefined)).toBe('direct');
  });
});

describe('calculateCampaignRoi', () => {
  const dummyLeads: Lead[] = [
    {
      id: 'lead-1',
      account_id: 'acc-1',
      source: 'website_form',
      status: 'won',
      name: 'Alice',
      phone: '555-1111',
      email: 'alice@example.com',
      address: '100 Main St',
      project_type: 'Roof repair',
      estimated_hours: null,
      message: '',
      photo_paths: [],
      source_page: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      quote_visit: null,
      client_id: null,
      lat: null,
      lng: null,
      geocoded_at: null,
      converted_job: 'job-1',
      triage: {
        score: 'hot',
        flags: [],
        attribution: {
          source: 'facebook',
          medium: 'paid_social',
          campaign: 'spring_roof_sale',
          clickId: 'fb1',
          clickIdType: 'fbclid',
        },
      },
    },
    {
      id: 'lead-2',
      account_id: 'acc-1',
      source: 'website_form',
      status: 'contacted',
      name: 'Bob',
      phone: '555-2222',
      email: 'bob@example.com',
      address: '200 Main St',
      project_type: 'Gutter repair',
      estimated_hours: null,
      message: '',
      photo_paths: [],
      source_page: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      quote_visit: null,
      client_id: null,
      lat: null,
      lng: null,
      geocoded_at: null,
      converted_job: null,
      triage: {
        score: 'warm',
        flags: [],
        attribution: {
          source: 'facebook',
          medium: 'paid_social',
          campaign: 'spring_roof_sale',
        },
      },
    },
    {
      id: 'lead-3',
      account_id: 'acc-1',
      source: 'website_form',
      status: 'won',
      name: 'Charlie',
      phone: '555-3333',
      email: 'charlie@example.com',
      address: '300 Main St',
      project_type: 'Pipe clearing',
      estimated_hours: null,
      message: '',
      photo_paths: [],
      source_page: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      quote_visit: null,
      client_id: null,
      lat: null,
      lng: null,
      geocoded_at: null,
      converted_job: 'job-2',
      triage: {
        score: 'hot',
        flags: [],
        attribution: {
          source: 'google',
          medium: 'cpc',
          campaign: 'drain_emergency',
          clickId: 'gcl1',
          clickIdType: 'gclid',
        },
      },
    },
    {
      id: 'lead-4',
      account_id: 'acc-1',
      source: 'website_form',
      status: 'new',
      name: 'Dan',
      phone: '555-4444',
      email: null,
      address: null,
      project_type: 'Inspection',
      estimated_hours: null,
      message: '',
      photo_paths: [],
      source_page: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      quote_visit: null,
      client_id: null,
      lat: null,
      lng: null,
      geocoded_at: null,
      converted_job: null,
      triage: {
        score: 'warm',
        flags: [],
        attribution: null, // Direct
      },
    },
  ];

  const jobLookup: JobFinancialLookup = {
    'job-1': { total: 4500, isWon: true },
    'job-2': { total: 1200, isWon: true },
  };

  it('aggregates leads, won counts, and closed-loop revenue by channel and overall', () => {
    const roi = calculateCampaignRoi(dummyLeads, jobLookup);

    expect(roi.totalLeads).toBe(4);
    expect(roi.adAttributedLeads).toBe(3); // 2 Facebook + 1 Google
    expect(roi.adAttributedPct).toBe(75);
    expect(roi.totalRevenue).toBe(5700); // 4500 + 1200
    expect(roi.adAttributedRevenue).toBe(5700);
    expect(roi.overallWinRatePct).toBe(50); // 2 won out of 4 leads
    expect(roi.adWinRatePct).toBe(67); // 2 won out of 3 ad leads
    expect(roi.overallAvgTicket).toBe(2850); // 5700 / 2

    const metaChannel = roi.channels.find((c) => c.id === 'meta');
    expect(metaChannel).toBeDefined();
    expect(metaChannel?.leadsCount).toBe(2);
    expect(metaChannel?.wonCount).toBe(1);
    expect(metaChannel?.winRatePct).toBe(50);
    expect(metaChannel?.totalRevenue).toBe(4500);
    expect(metaChannel?.topCampaign).toBe('spring_roof_sale');

    const googleChannel = roi.channels.find((c) => c.id === 'google');
    expect(googleChannel).toBeDefined();
    expect(googleChannel?.leadsCount).toBe(1);
    expect(googleChannel?.wonCount).toBe(1);
    expect(googleChannel?.totalRevenue).toBe(1200);

    expect(roi.topCampaigns.length).toBe(2);
    expect(roi.topCampaigns[0].campaign).toBe('spring_roof_sale');
    expect(roi.topCampaigns[0].totalRevenue).toBe(4500);
  });

  it('handles empty leads gracefully', () => {
    const roi = calculateCampaignRoi([]);
    expect(roi.totalLeads).toBe(0);
    expect(roi.totalRevenue).toBe(0);
    expect(roi.overallWinRatePct).toBe(0);
    expect(roi.channels.length).toBeGreaterThan(0);
  });

  it('computes ROAS from actual ad spend when provided', () => {
    const roi = calculateCampaignRoi(dummyLeads, jobLookup, { actualAdSpend: 1000 });
    expect(roi.totalAdSpend).toBe(1000);
    expect(roi.estimatedRoasMultiplier).toBe(5.7);
  });

  it('accurately reports losing campaign when ad spend exceeds revenue', () => {
    const roi = calculateCampaignRoi(dummyLeads, jobLookup, { actualAdSpend: 10000 });
    expect(roi.totalAdSpend).toBe(10000);
    expect(roi.estimatedRoasMultiplier).toBe(0.6);
    expect(roi.estimatedRoasMultiplier).toBeLessThan(1.0);
  });

  it('does not invent fake ad spend benchmark when no ad spend is recorded', () => {
    const roi = calculateCampaignRoi(dummyLeads, jobLookup);
    expect(roi.totalAdSpend).toBe(0);
    expect(roi.estimatedRoasMultiplier).toBe(0);

    const roiZero = calculateCampaignRoi(dummyLeads, jobLookup, { actualAdSpend: 0 });
    expect(roiZero.totalAdSpend).toBe(0);
    expect(roiZero.estimatedRoasMultiplier).toBe(0);
  });

  it('ignores jobs that are not won (e.g. archived or cancelled)', () => {
    const unwonLookup: JobFinancialLookup = {
      'job-1': { total: 4500, isWon: false },
      'job-2': { total: 1200, isWon: true },
    };
    const roi = calculateCampaignRoi(dummyLeads, unwonLookup);
    expect(roi.totalRevenue).toBe(1200);
    expect(roi.adAttributedRevenue).toBe(1200);
    expect(roi.overallWinRatePct).toBe(25);
  });
});

describe('buildCampaignUrl', () => {
  it('appends UTM parameters properly', () => {
    const url = buildCampaignUrl({
      baseUrl: 'https://evergreenroofs.com/estimate',
      source: 'facebook',
      medium: 'paid_social',
      campaign: 'spring_special',
      content: 'carousel_1',
    });

    expect(url).toContain('https://evergreenroofs.com/estimate?');
    expect(url).toContain('utm_source=facebook');
    expect(url).toContain('utm_medium=paid_social');
    expect(url).toContain('utm_campaign=spring_special');
    expect(url).toContain('utm_content=carousel_1');
  });

  it('prepends https if missing', () => {
    const url = buildCampaignUrl({
      baseUrl: 'evergreenroofs.com',
      source: 'google',
      medium: 'cpc',
    });

    expect(url.startsWith('https://evergreenroofs.com')).toBe(true);
    expect(url).toContain('utm_source=google');
  });
});
