import { describe, expect, it, beforeEach } from 'vitest';
import {
  parseAttribution,
  sanitizeAttribution,
  formatLeadAttribution,
  ATTRIBUTION_STORAGE_KEY,
  type LeadAttribution,
} from '@/lib/attribution';

describe('parseAttribution', () => {
  it('parses full UTM parameters from a URL', () => {
    const url = 'https://evergreenroofing.com/estimate?utm_source=facebook&utm_medium=cpc&utm_campaign=spring_roofing_promo&utm_content=video_ad_1&utm_term=roof+repair';
    const parsed = parseAttribution(url);

    expect(parsed).not.toBeNull();
    expect(parsed?.source).toBe('facebook');
    expect(parsed?.medium).toBe('cpc');
    expect(parsed?.campaign).toBe('spring_roofing_promo');
    expect(parsed?.content).toBe('video_ad_1');
    expect(parsed?.term).toBe('roof repair');
  });

  it('parses Google Ads click ID (gclid) and defaults source to google and medium to cpc', () => {
    const url = 'https://evergreenroofing.com/book?gclid=Cj0KCQjw123456';
    const parsed = parseAttribution(url);

    expect(parsed).not.toBeNull();
    expect(parsed?.clickId).toBe('Cj0KCQjw123456');
    expect(parsed?.clickIdType).toBe('gclid');
    expect(parsed?.source).toBe('google');
    expect(parsed?.medium).toBe('cpc');
  });

  it('parses Meta click ID (fbclid)', () => {
    const url = 'https://evergreenroofing.com/?fbclid=IwAR123456789';
    const parsed = parseAttribution(url);

    expect(parsed).not.toBeNull();
    expect(parsed?.clickId).toBe('IwAR123456789');
    expect(parsed?.clickIdType).toBe('fbclid');
    expect(parsed?.source).toBe('facebook');
    expect(parsed?.medium).toBe('cpc');
  });

  it('parses TikTok click ID (ttclid)', () => {
    const url = 'https://evergreenroofing.com/?ttclid=E.C.P123456';
    const parsed = parseAttribution(url);

    expect(parsed).not.toBeNull();
    expect(parsed?.clickId).toBe('E.C.P123456');
    expect(parsed?.clickIdType).toBe('ttclid');
    expect(parsed?.source).toBe('tiktok');
    expect(parsed?.medium).toBe('cpc');
  });

  it('parses intra-site promo or campaign query param', () => {
    const url = 'https://evergreenroofing.com/services/gutters?promo=spring_gutter_clean';
    const parsed = parseAttribution(url);

    expect(parsed).not.toBeNull();
    expect(parsed?.campaign).toBe('spring_gutter_clean');
  });

  it('derives organic / social source from external referrer if no UTMs exist', () => {
    const url = 'https://evergreenroofing.com/';
    const parsed = parseAttribution(url, 'https://l.instagram.com/');

    expect(parsed).not.toBeNull();
    expect(parsed?.source).toBe('instagram');
    expect(parsed?.medium).toBe('social');
  });

  it('returns null when there are no UTMs, no click IDs, and no external referrer', () => {
    const url = 'https://evergreenroofing.com/';
    const parsed = parseAttribution(url, 'https://evergreenroofing.com/about');

    expect(parsed).toBeNull();
  });
});

describe('sanitizeAttribution', () => {
  it('sanitizes and truncates strings safely', () => {
    const raw = {
      source: '<script>alert(1)</script>facebook',
      medium: 'cpc',
      campaign: 'super_sale',
      clickId: 'gclid123',
      clickIdType: 'gclid',
      landingPage: '/services',
      capturedAt: new Date().toISOString(),
    };

    const sanitized = sanitizeAttribution(raw);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.source).toBe('scriptalert(1)/scriptfacebook');
    expect(sanitized?.medium).toBe('cpc');
    expect(sanitized?.clickIdType).toBe('gclid');
  });

  it('rejects empty or invalid objects', () => {
    expect(sanitizeAttribution(null)).toBeNull();
    expect(sanitizeAttribution({})).toBeNull();
    expect(sanitizeAttribution([])).toBeNull();
  });
});

describe('formatLeadAttribution', () => {
  it('formats paid social campaign into a clear badge and detail', () => {
    const attr: LeadAttribution = {
      source: 'facebook',
      medium: 'paid_social',
      campaign: 'spring_drain_special',
      clickId: 'fb123',
      clickIdType: 'fbclid',
    };

    const summary = formatLeadAttribution(attr);
    expect(summary).not.toBeNull();
    expect(summary?.headline).toBe('spring drain special');
    expect(summary?.isPaid).toBe(true);
    expect(summary?.channel).toBe('facebook');
    expect(summary?.detail).toContain('facebook (Paid)');
  });

  it('formats Google Ads search click', () => {
    const attr: LeadAttribution = {
      source: 'google',
      medium: 'cpc',
      clickId: 'gclid123',
      clickIdType: 'gclid',
      term: 'emergency pipe repair',
    };

    const summary = formatLeadAttribution(attr);
    expect(summary).not.toBeNull();
    expect(summary?.headline).toBe('Google Search Ad');
    expect(summary?.isPaid).toBe(true);
    expect(summary?.channel).toBe('google');
    expect(summary?.detail).toContain('Keyword: "emergency pipe repair"');
  });

  it('formats Nextdoor referral', () => {
    const attr: LeadAttribution = {
      source: 'nextdoor',
      medium: 'referral',
      referrer: 'https://nextdoor.com/pages/evergreen',
    };

    const summary = formatLeadAttribution(attr);
    expect(summary).not.toBeNull();
    expect(summary?.headline).toBe('Nextdoor');
    expect(summary?.isPaid).toBe(false);
    expect(summary?.channel).toBe('nextdoor');
  });
});
