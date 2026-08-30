import { describe, it, expect } from 'vitest';
import {
  hashSha256,
  normalizeEmailForHash,
  normalizePhoneForHash,
  uploadOfflineConversion,
  updateCampaignBidModifier,
  syncWeatherSurgeBidModifier,
  syncCapacityGuardStatus,
} from '@/lib/google-ads-api';
import {
  generateStructuredAdGroups,
  generateCallOnlyAd,
} from '@/lib/google-ads-generator';
import { resolveDynamicMessageMatch } from '@/lib/dynamic-message-match';

describe('Google Ads Campaign Effectiveness Suite', () => {
  describe('1. First-Party Enhanced Conversions Hashing', () => {
    it('correctly hashes normalized email and E.164 phone numbers with SHA-256', () => {
      const email = '  Customer.John@Gmail.com ';
      const hashedEmail = normalizeEmailForHash(email);
      expect(hashedEmail).toBeDefined();
      expect(hashedEmail).toHaveLength(64); // SHA-256 produces 64 hex characters
      // Consistent hash for lowercase trimmed
      expect(hashedEmail).toBe(hashSha256('customer.john@gmail.com'));

      const phone10 = '(512) 555-1234';
      const hashedPhone = normalizePhoneForHash(phone10);
      expect(hashedPhone).toBeDefined();
      expect(hashedPhone).toHaveLength(64);
      expect(hashedPhone).toBe(hashSha256('+15125551234'));
    });

    it('uploads offline conversion with enhanced data when gclid or first-party data is provided', async () => {
      const result = await uploadOfflineConversion({
        gclid: 'gclid_test_12345',
        conversionActionName: 'Job Won',
        conversionValueDollars: 6500,
        orderId: 'lead_abc_999',
        email: 'homeowner@austin.com',
        phone: '5125559876',
        firstName: 'Sarah',
        lastName: 'Connor',
        postalCode: '78701',
      });

      expect(result.success).toBe(true);
      expect(result.enhancedConversionsActive).toBe(true);
      expect(result.conversionValueDollars).toBe(6500);
      expect(result.message).toContain('Google Ads');
    });
  });

  describe('2. Real-Time Bid Modifiers & Capacity Auto-Pausing', () => {
    it('applies weather surge bid modifier (+35% mobile boost) during storm radar alerts', async () => {
      const surgeRes = await syncWeatherSurgeBidModifier('camp_12345', true);
      expect(surgeRes.success).toBe(true);
      expect(surgeRes.modifierApplied).toBe(1.35);

      const calmRes = await syncWeatherSurgeBidModifier('camp_12345', false);
      expect(calmRes.success).toBe(true);
      expect(calmRes.modifierApplied).toBe(1.0);
    });

    it('pauses and resumes campaigns when Capacity Guard triggers', async () => {
      const pausedRes = await syncCapacityGuardStatus('camp_12345', true);
      expect(pausedRes.success).toBe(true);
      expect(pausedRes.status).toBe('PAUSED');

      const enabledRes = await syncCapacityGuardStatus('camp_12345', false);
      expect(enabledRes.success).toBe(true);
      expect(enabledRes.status).toBe('ENABLED');
    });
  });

  describe('3. Single-Theme Ad Groups (STAGs) & Urgency Segmentation', () => {
    it('generates 3 dedicated ad groups with tailored RSAs and keywords', () => {
      const adGroups = generateStructuredAdGroups({
        businessName: 'Apex Roofing & Restoration',
        trade: 'Roofing',
        city: 'Austin, TX',
        services: ['Leak Repair', 'Shingle Replacement', 'Metal Roofing'],
        phone: '512-555-0199',
        landingPageUrl: 'https://apexroofing.letsgetquoted.com/estimate',
      });

      expect(adGroups).toHaveLength(3);

      const [emergency, replacement, maintenance] = adGroups;

      // Emergency Ad Group
      expect(emergency.name).toContain('Emergency');
      expect(emergency.theme).toBe('emergency');
      expect(emergency.bidModifierMobile).toBe(1.3);
      expect(emergency.rsa.headlines.some((h) => h.includes('24/7'))).toBe(true);

      // Replacement Ad Group
      expect(replacement.name).toContain('Replacement');
      expect(replacement.theme).toBe('replacement');
      expect(replacement.rsa.headlines.some((h) => h.includes('Replacement') || h.includes('Installation'))).toBe(true);

      // Maintenance Ad Group
      expect(maintenance.name).toContain('Maintenance');
      expect(maintenance.theme).toBe('maintenance');
      expect(maintenance.rsa.headlines.some((h) => h.includes('Tune-Up') || h.includes('Inspection'))).toBe(true);
    });

    it('generates compliant mobile Call-Only ads', () => {
      const callAd = generateCallOnlyAd({
        businessName: 'Apex Plumbing Pros',
        phone: '(512) 555-0199',
        trade: 'Plumbing',
        city: 'Dallas, TX',
        landingPageUrl: 'https://apex.letsgetquoted.com/estimate',
      });

      expect(callAd.phoneNumber).toBe('(512) 555-0199');
      expect(callAd.headline1.length).toBeLessThanOrEqual(30);
      expect(callAd.headline2.length).toBeLessThanOrEqual(30);
      expect(callAd.description1.length).toBeLessThanOrEqual(90);
      expect(callAd.description2.length).toBeLessThanOrEqual(90);
    });
  });

  describe('4. Dynamic Landing Page Message-Matching (10/10 Quality Score)', () => {
    it('matches emergency intent queries into high-converting headlines', () => {
      const match = resolveDynamicMessageMatch({
        searchParams: {
          utm_term: 'emergency burst pipe repair',
          city: 'Austin',
          trade: 'Plumbing',
        },
        defaultTrade: 'Plumbing',
        defaultCity: 'Austin',
        businessName: 'Austin Plumbing Co',
      });

      expect(match.isDynamicMatch).toBe(true);
      expect(match.urgency).toBe('emergency');
      expect(match.heroHeadline).toContain('24/7 Fast Emergency');
      expect(match.heroHeadline).toContain('Austin');
      expect(match.badgeText).toContain('Immediate Dispatch');
    });

    it('matches replacement intent queries into warranty and financing headlines', () => {
      const match = resolveDynamicMessageMatch({
        searchParams: {
          service: 'Tankless Water Heater Installation',
          city: 'Round Rock',
        },
        defaultTrade: 'Plumbing',
        defaultCity: 'Austin',
        businessName: 'Austin Plumbing Co',
      });

      expect(match.isDynamicMatch).toBe(true);
      expect(match.urgency).toBe('replacement');
      expect(match.heroHeadline).toContain('Top-Rated Tankless Water Heater Installation in Round Rock');
      expect(match.heroSubhead).toContain('flexible $0-down financing');
    });

    it('provides graceful fallback when no ad query params are present', () => {
      const match = resolveDynamicMessageMatch({
        searchParams: {},
        defaultTrade: 'Roofing',
        defaultCity: 'San Antonio',
        businessName: 'Texas Roofs',
      });

      expect(match.isDynamicMatch).toBe(false);
      expect(match.heroHeadline).toBe('Professional Roofing in San Antonio');
      expect(match.matchedService).toBe('Roofing');
    });
  });
});
