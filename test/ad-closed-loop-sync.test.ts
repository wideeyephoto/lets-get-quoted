import { describe, expect, it } from 'vitest';
import {
  sha256Hash,
  normalizePhoneForHashing,
  buildMetaCapiPurchaseEvent,
  buildGoogleAdsOfflineConversion,
  calculateClosedLoopRoas,
} from '@/lib/ad-closed-loop-sync';
import { buildHaloCreativeBundle } from '@/lib/neighborhood-halo-ai';
import { detectWeatherSurgeOpportunity } from '@/lib/weather-ad-surge';

describe('Closed-Loop Ad Network Sync — Privacy & Hashing', () => {
  it('correctly hashes customer email with SHA-256 after lowercasing and trimming', () => {
    const rawEmail = '  John.Doe@Example.COM ';
    const hash = sha256Hash(rawEmail);
    // sha256 of "john.doe@example.com"
    expect(hash).toBe('836f82db99121b3481011f16b49dfa5fbc714a0d1b1b9f784a1ebbbf5b39577f');
  });

  it('normalizes 10-digit US phone numbers with +1 country code before SHA-256 hashing', () => {
    const rawPhone = '(248) 555-0199';
    const hash = normalizePhoneForHashing(rawPhone);
    // sha256 of "12485550199"
    expect(hash).toBeTruthy();
    expect(hash?.length).toBe(64); // 64 hex characters for SHA-256
  });

  it('returns null when given empty or whitespace inputs', () => {
    expect(sha256Hash('')).toBeNull();
    expect(normalizePhoneForHashing(null)).toBeNull();
  });
});

describe('Closed-Loop Ad Network Sync — Meta Conversions API (CAPI)', () => {
  it('builds a compliant Meta CAPI Purchase payload from a signed quote', () => {
    const event = buildMetaCapiPurchaseEvent({
      transactionId: 'quote_98765',
      accountId: 'acc_roofing_pro',
      amountDollars: 12500,
      currency: 'USD',
      customerEmail: 'homeowner@gmail.com',
      customerPhone: '5865551234',
      fbclid: 'IwAR3Q8v7bN...',
      trade: 'Roofing',
      conversionTimestamp: new Date('2026-08-30T15:00:00Z'),
    });

    expect(event.event_name).toBe('Purchase');
    expect(event.event_id).toBe('purchase_quote_98765');
    expect(event.custom_data.value).toBe(12500);
    expect(event.custom_data.currency).toBe('USD');
    expect(event.custom_data.order_id).toBe('quote_98765');
    expect(event.user_data.em?.[0]).toBeTruthy();
    expect(event.user_data.ph?.[0]).toBeTruthy();
    expect(event.user_data.fbc).toContain('fb.1.');
    expect(event.user_data.fbc).toContain('IwAR3Q8v7bN...');
  });
});

describe('Closed-Loop Ad Network Sync — Google Ads Offline Conversion', () => {
  it('builds a Google Ads Click Conversion upload payload when gclid is present', () => {
    const conversion = buildGoogleAdsOfflineConversion(
      {
        transactionId: 'inv_44556',
        accountId: 'acc_hvac_experts',
        amountDollars: 8450.5,
        currency: 'USD',
        gclid: 'Cj0KCQjww4-hBhCjARIsAC9g0Ud...',
        conversionTimestamp: new Date('2026-08-30T12:30:00Z'),
      },
      'customers/999/conversionActions/888'
    );

    expect(conversion).not.toBeNull();
    expect(conversion?.conversionAction).toBe('customers/999/conversionActions/888');
    expect(conversion?.gclid).toBe('Cj0KCQjww4-hBhCjARIsAC9g0Ud...');
    expect(conversion?.conversionValue).toBe(8450.5);
    expect(conversion?.currencyCode).toBe('USD');
    expect(conversion?.orderId).toBe('inv_44556');
    expect(conversion?.conversionDateTime).toBe('2026-08-30 12:30:00+00:00');
  });

  it('returns null if gclid is missing (strictly required by Google Ads API)', () => {
    const noGclid = buildGoogleAdsOfflineConversion({
      transactionId: 'inv_123',
      accountId: 'acc_1',
      amountDollars: 500,
    });
    expect(noGclid).toBeNull();
  });
});

describe('Closed-Loop Ad Network Sync — ROAS & Verified ROI', () => {
  it('calculates verified ROAS and CAC from Stripe settled revenue', () => {
    const metrics = calculateClosedLoopRoas({
      totalAdSpendDollars: 1000,
      totalVerifiedRevenueDollars: 12500,
      totalConversionsCount: 2,
    });

    expect(metrics.roas).toBe(12.5); // 12.5x ROAS
    expect(metrics.costPerAcquisitionDollars).toBe(500); // $500 CAC
    expect(metrics.netProfitEstimateDollars).toBe(11500);
    expect(metrics.roasVerdict).toBe('exceptional');
  });
});

describe('Dynamic Storm Surge Halo Coordination', () => {
  it('automatically upgrades Halo copy and CTA to emergency storm restoration mode during severe weather', () => {
    const weatherCondition = {
      hasStorm: true,
      hasHighWind: true,
      alertHeadline: 'Severe Thunderstorm & Hail Warning (60mph winds)',
    };

    const surge = detectWeatherSurgeOpportunity('Roofing', 'Rochester', weatherCondition);
    expect(surge.surgeActive).toBe(true);

    const bundle = buildHaloCreativeBundle({
      trade: 'Roofing',
      businessName: 'Apex Roofing Experts',
      streetName: 'Maple Ave',
      neighborhoodName: 'Oakridge Estates',
      city: 'Rochester',
      weatherSurge: surge,
    });

    expect(bundle.stormSurgeActive).toBe(true);
    expect(bundle.metaAd.headline).toContain('Storm Damage on Maple Ave');
    expect(bundle.metaAd.description).toContain('Insurance Claim Inspection');
    expect(bundle.metaAd.callToAction).toBe('Book Inspection');
    expect(bundle.metaAd.primaryText).toContain('Severe Storm & Wind Activity Detected');
    expect(bundle.googleAd.headlines.some((h) => h.includes('Storm Damage'))).toBe(true);
    expect(bundle.showcaseStory.title).toContain('Storm Damage Restoration on Maple Ave');
  });
});
