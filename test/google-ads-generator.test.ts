import { describe, expect, it } from 'vitest';
import {
  calculateAdProjections,
  generateTradeKeywords,
  generateResponsiveSearchAd,
  generateGoogleAdsEditorCsv,
  TRADE_BENCHMARKS,
} from '@/lib/google-ads-generator';

describe('calculateAdProjections', () => {
  it('calculates daily budget, clicks, leads, and CPL correctly for Roofing', () => {
    const proj = calculateAdProjections(600, 'roofing');

    expect(proj.monthlyBudget).toBe(600);
    expect(proj.dailyBudget).toBe(19.74); // 600 / 30.4
    expect(proj.avgCpc).toBe(11.5);
    expect(proj.estimatedMonthlyClicks).toBe(52); // 600 / 11.5
    expect(proj.estimatedMonthlyLeads).toBe(7); // 52 * 0.14
    expect(proj.estimatedCostPerLead).toBe(86); // 600 / 7
    expect(proj.estimatedJobRevenue).toBeGreaterThan(15000);
  });

  it('handles fallback to general trade benchmark', () => {
    const proj = calculateAdProjections(300, 'unregistered_trade');
    expect(proj.monthlyBudget).toBe(300);
    expect(proj.avgCpc).toBe(TRADE_BENCHMARKS.general.avgCpc);
    expect(proj.estimatedMonthlyLeads).toBeGreaterThan(0);
  });
});

describe('generateTradeKeywords', () => {
  it('generates phrase and exact match keywords with local intent', () => {
    const { keywordGroups, allKeywords, negativeKeywords } = generateTradeKeywords(
      ['Emergency Pipe Repair', 'Water Heater Install'],
      'Austin, TX',
      'Plumber'
    );

    expect(keywordGroups.length).toBe(2);
    expect(allKeywords).toContain('"emergency pipe repair in austin tx"');
    expect(allKeywords).toContain('[emergency pipe repair austin]');
    expect(allKeywords).toContain('"plumber near me"');

    expect(negativeKeywords).toContain('diy');
    expect(negativeKeywords).toContain('jobs');
    expect(negativeKeywords).toContain('home depot');
  });
});

describe('generateResponsiveSearchAd', () => {
  it('enforces character limits strictly: headlines <= 30 chars, descriptions <= 90 chars', () => {
    const rsa = generateResponsiveSearchAd({
      businessName: 'Apex Quality Home Improvements & Services LLC',
      trade: 'Roofing and Gutter Replacement Contractor',
      city: 'Oklahoma City Metropolitan Area, OK',
      services: ['Residential Asphalt Shingle Roof Replacement Specialists'],
      phone: '555-123-4567',
      landingPageUrl: 'https://apexroofing.com/estimate',
    });

    expect(rsa.headlines.length).toBeGreaterThanOrEqual(5);
    expect(rsa.headlines.length).toBeLessThanOrEqual(15);
    for (const h of rsa.headlines) {
      expect(h.length).toBeLessThanOrEqual(30);
    }

    expect(rsa.descriptions.length).toBeGreaterThanOrEqual(2);
    expect(rsa.descriptions.length).toBeLessThanOrEqual(4);
    for (const d of rsa.descriptions) {
      expect(d.length).toBeLessThanOrEqual(90);
    }

    expect(rsa.sitelinks.length).toBe(4);
    for (const s of rsa.sitelinks) {
      expect(s.title.length).toBeLessThanOrEqual(25);
      expect(s.desc.length).toBeLessThanOrEqual(35);
    }

    expect(rsa.finalUrl).toContain('utm_source=google');
    expect(rsa.callExtension).toBe('555-123-4567');
  });
});

describe('generateGoogleAdsEditorCsv', () => {
  it('produces valid CSV rows for Ads, Keywords, and Negative Keywords', () => {
    const rsa = generateResponsiveSearchAd({
      businessName: 'Evergreen Roofing',
      trade: 'Roofing',
      city: 'Austin, TX',
      services: ['Roof Repair', 'Leak Inspection'],
      phone: '512-555-0100',
      landingPageUrl: 'https://evergreen.com',
    });

    const csv = generateGoogleAdsEditorCsv({
      campaignName: 'Austin Roofing - Search Ads',
      monthlyBudget: 600,
      dailyBudget: 19.74,
      targetCity: 'Austin, TX',
      targetRadiusMiles: 25,
      rsa,
      keywords: ['"roof repair near me"', '[roof repair austin]'],
      negativeKeywords: ['diy', 'jobs'],
    });

    const lines = csv.split('\n');
    expect(lines[0]).toContain('Campaign,Ad Group,Keyword,Criterion Type');
    expect(csv).toContain('Austin Roofing - Search Ads');
    expect(csv).toContain('"roof repair near me"');
    expect(csv).toContain('Phrase');
    expect(csv).toContain('Exact');
    expect(csv).toContain('Negative Phrase');
  });
});
