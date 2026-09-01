import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeE164Phone,
  normalizeEmail,
  isClickIdExpired,
  enqueueOfflineConversion,
  processOfflineConversionItem,
} from '@/lib/google-ads-conversion-outbox';
import {
  parseAttribution,
  getOrCaptureAttribution,
  ATTRIBUTION_STORAGE_KEY,
} from '@/lib/attribution';
import {
  fetchGoogleAdsWithBackoff,
} from '@/lib/google-ads-api';
import {
  enforceMonthlySpendHardCap,
} from '@/lib/ad-billing-shared';
import {
  clampText,
  generateResponsiveSearchAd,
  getTradeNegativeKeywords,
} from '@/lib/google-ads-generator';

describe('Google Ads Infrastructure Hardening Suite', () => {
  describe('Pillar 1: Offline Conversion Resilience & Enhanced Matching', () => {
    it('normalizes various phone number formats into strict E.164 (+1XXXXXXXXXX)', () => {
      expect(normalizeE164Phone('(512) 555-0199')).toBe('+15125550199');
      expect(normalizeE164Phone('512-555-0199')).toBe('+15125550199');
      expect(normalizeE164Phone('15125550199')).toBe('+15125550199');
      expect(normalizeE164Phone('+15125550199')).toBe('+15125550199');
      expect(normalizeE164Phone('')).toBeNull();
      expect(normalizeE164Phone(null)).toBeNull();
      expect(normalizeE164Phone('   ')).toBeNull();
    });

    it('normalizes email addresses to trimmed lowercase for Google Enhanced Conversions', () => {
      expect(normalizeEmail('  HomeOwner.Austin@Gmail.COM  ')).toBe('homeowner.austin@gmail.com');
      expect(normalizeEmail('')).toBeNull();
      expect(normalizeEmail(null)).toBeNull();
    });

    it('detects click IDs older than 90 days as expired', () => {
      const now = Date.now();
      const recentDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
      const expiredDate = new Date(now - 95 * 24 * 60 * 60 * 1000).toISOString(); // 95 days ago

      expect(isClickIdExpired(recentDate, 90)).toBe(false);
      expect(isClickIdExpired(expiredDate, 90)).toBe(true);
      expect(isClickIdExpired('', 90)).toBe(false);
      expect(isClickIdExpired('invalid-date', 90)).toBe(false);
    });

    it('enqueues offline conversion with auto-normalized contact fields', () => {
      const item = enqueueOfflineConversion({
        accountId: 'acc_123',
        orderId: 'ord_999',
        conversionActionName: 'customers/123/conversionActions/456',
        conversionValueDollars: 4500,
        currencyCode: 'USD',
        conversionDateTime: new Date().toISOString(),
        gclid: 'CjwKCAiA_test_gclid_123',
        email: '  Client@AustinRoof.COM ',
        phone: '(512) 555-1234',
        firstName: 'John',
        lastName: 'Doe',
        postalCode: '78701',
      });

      expect(item.email).toBe('client@austinroof.com');
      expect(item.phone).toBe('+15125551234');
      expect(item.status).toBe('pending');
      expect(item.attempts).toBe(0);
    });

    it('strips expired click IDs and falls back to Enhanced Conversions in processOfflineConversionItem', async () => {
      const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
      const item = enqueueOfflineConversion({
        accountId: 'acc_123',
        orderId: 'ord_old_job',
        conversionActionName: 'customers/123/conversionActions/456',
        conversionValueDollars: 8500,
        currencyCode: 'USD',
        conversionDateTime: ninetyFiveDaysAgo,
        gclid: 'expired_gclid_older_than_90_days',
        email: 'john@example.com',
        phone: '5125559876',
      });

      const result = await processOfflineConversionItem(item);
      expect(result.success).toBe(true);
      expect(result.gclid).toBeUndefined(); // Stripped because expired
      expect(result.enhancedConversionsActive).toBe(true); // Enhanced conversions active
      expect(item.status).toBe('uploaded');
    });
  });

  describe('Pillar 2: Cross-Session Attribution Continuity', () => {
    beforeEach(() => {
      const storageMock: Record<string, string> = {};
      const sessionStorageMock = {
        getItem: (k: string) => storageMock[k] || null,
        setItem: (k: string, v: string) => { storageMock[k] = v; },
        removeItem: (k: string) => { delete storageMock[k]; },
      };
      const localStorageMock = {
        getItem: (k: string) => storageMock[k] || null,
        setItem: (k: string, v: string) => { storageMock[k] = v; },
        removeItem: (k: string) => { delete storageMock[k]; },
      };

      (globalThis as any).window = {
        location: { href: 'https://austinroofpro.com/?gclid=test_gclid_abc&utm_source=google&utm_campaign=emergency_roof' },
        sessionStorage: sessionStorageMock,
        localStorage: localStorageMock,
      };
      (globalThis as any).document = {
        referrer: 'https://google.com',
        cookie: '',
      };
    });

    it('parses Google Ads click IDs and UTM campaign parameters accurately', () => {
      const parsed = parseAttribution(
        'https://austinroofpro.com/services/leak-repair?gclid=gclid_xyz_123&utm_source=google&utm_medium=cpc&utm_campaign=summer_promo&utm_term=roof+repair+austin'
      );
      expect(parsed).not.toBeNull();
      expect(parsed?.clickId).toBe('gclid_xyz_123');
      expect(parsed?.clickIdType).toBe('gclid');
      expect(parsed?.source).toBe('google');
      expect(parsed?.medium).toBe('cpc');
      expect(parsed?.campaign).toBe('summer_promo');
      expect(parsed?.term).toBe('roof repair austin');
    });

    it('persists and retrieves attribution across multi-page browsing sessions', () => {
      const captured = getOrCaptureAttribution();
      expect(captured).not.toBeNull();
      expect(captured?.clickId).toBe('test_gclid_abc');
      expect(captured?.source).toBe('google');

      // Navigate to a new internal page without UTM parameters
      (globalThis as any).window.location.href = 'https://austinroofpro.com/about-us';
      (globalThis as any).document.referrer = 'https://austinroofpro.com/';

      const retrievedOnSubsequentPage = getOrCaptureAttribution();
      expect(retrievedOnSubsequentPage).not.toBeNull();
      expect(retrievedOnSubsequentPage?.clickId).toBe('test_gclid_abc');
      expect(retrievedOnSubsequentPage?.campaign).toBe('emergency_roof');
    });
  });

  describe('Pillar 3: Google Ads API Resilience & Exponential Backoff', () => {
    it('retries transient 429 and 503 errors with backoff before succeeding', async () => {
      let callCount = 0;
      const fakeFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED' }), { status: 429 });
        }
        if (callCount === 2) {
          return new Response(JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }), { status: 503 });
        }
        return new Response(JSON.stringify({ access_token: 'mock_token_123' }), { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = fakeFetch;

      try {
        const res = await fetchGoogleAdsWithBackoff('https://oauth2.googleapis.com/token', { method: 'POST' }, 3, 10);
        expect(res.status).toBe(200);
        expect(callCount).toBe(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Pillar 4: Financial Safeguards & Monthly Hard Cap Circuit Breaker', () => {
    it('allows bidding when spend is comfortably under the monthly spend cap', () => {
      const check = enforceMonthlySpendHardCap({
        spentThisMonthDollars: 450,
        maxMonthlySpendDollars: 1000,
      });

      expect(check.isHardCapReached).toBe(false);
      expect(check.remainingAllowanceDollars).toBe(550);
      expect(check.reason).toBeUndefined();
    });

    it('triggers the circuit breaker and pauses bidding when monthly cap is reached or exceeded', () => {
      const check = enforceMonthlySpendHardCap({
        spentThisMonthDollars: 1000,
        maxMonthlySpendDollars: 1000,
      });

      expect(check.isHardCapReached).toBe(true);
      expect(check.remainingAllowanceDollars).toBe(0);
      expect(check.reason).toContain('Monthly ad spend hard-cap of $1000.00 has been reached');
    });
  });

  describe('Pillar 5: Programmatic RSA Character Limit Enforcement & Shield Guardrails', () => {
    it('strictly clamps text without exceeding Google character limits and cleans trailing punctuation', () => {
      const headlineMax30 = clampText('Emergency Roofing Service in Austin, TX,', 30);
      expect(headlineMax30.length).toBeLessThanOrEqual(30);
      expect(headlineMax30.endsWith(',…')).toBe(false);

      const descMax90 = clampText(
        'Need reliable roofing contractors in Austin? We provide 24/7 emergency leak repair, roof replacements, and insurance claims with upfront pricing.',
        90
      );
      expect(descMax90.length).toBeLessThanOrEqual(90);
    });

    it('generates 100% compliant RSA assets satisfying Google Ads API constraints', () => {
      const rsa = generateResponsiveSearchAd({
        businessName: 'Apex Precision Roofing & Construction Inc',
        trade: 'Roofing & Solar Replacement',
        city: 'Salt Lake City Metropolitan Area, UT',
        services: ['Emergency Roof Leak Repair', 'Complete Shingle Replacement', 'Gutter Installation'],
        landingPageUrl: 'https://apexroofing.com',
        customFocus: 'Emergency Hail Damage Insurance Estimates',
      });

      // Google RSA Limits:
      // Headlines: max 15 headlines, each <= 30 chars
      expect(rsa.headlines.length).toBeGreaterThanOrEqual(5);
      expect(rsa.headlines.length).toBeLessThanOrEqual(15);
      for (const h of rsa.headlines) {
        expect(h.length).toBeLessThanOrEqual(30);
      }

      // Descriptions: max 4 descriptions, each <= 90 chars
      expect(rsa.descriptions.length).toBeGreaterThanOrEqual(2);
      expect(rsa.descriptions.length).toBeLessThanOrEqual(4);
      for (const d of rsa.descriptions) {
        expect(d.length).toBeLessThanOrEqual(90);
      }

      // Sitelinks: titles <= 25 chars, descriptions <= 35 chars
      for (const s of rsa.sitelinks) {
        expect(s.title.length).toBeLessThanOrEqual(25);
        expect(s.desc.length).toBeLessThanOrEqual(35);
      }
    });

    it('generates deduplicated negative keywords with competitor exclusions scrubbed', () => {
      const negatives = getTradeNegativeKeywords('roofing', ['ABC Roofing', 'Centimark']);
      expect(negatives).toContain('diy');
      expect(negatives).toContain('jobs');
      expect(negatives).toContain('abc roofing');
      expect(negatives).toContain('centimark');
      expect(negatives).toContain('abc roofing reviews');
      expect(new Set(negatives).size).toBe(negatives.length); // 100% unique
    });
  });
});
