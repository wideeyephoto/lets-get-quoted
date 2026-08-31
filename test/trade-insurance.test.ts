import { describe, expect, it } from 'vitest';
import {
  getInsuranceTradeProfile,
  isInsuranceEligibleTrade,
  shouldShowInsuranceFeatures,
  INSURANCE_ELIGIBLE_TRADE_SLUGS,
  UPPA_COMPLIANCE_RULES,
} from '@/lib/trade-insurance';

describe('trade-insurance.ts', () => {
  describe('isInsuranceEligibleTrade', () => {
    it('returns true for storm, exterior, and restoration trades', () => {
      expect(isInsuranceEligibleTrade('roofers')).toBe(true);
      expect(isInsuranceEligibleTrade('roofing')).toBe(true);
      expect(isInsuranceEligibleTrade('tree-services')).toBe(true);
      expect(isInsuranceEligibleTrade('tree-care')).toBe(true);
      expect(isInsuranceEligibleTrade('water-damage-restoration')).toBe(true);
      expect(isInsuranceEligibleTrade('fire-damage-restoration')).toBe(true);
      expect(isInsuranceEligibleTrade('mold-remediation')).toBe(true);
      expect(isInsuranceEligibleTrade('siding')).toBe(true);
      expect(isInsuranceEligibleTrade('emergency-plumbing')).toBe(true);
    });

    it('returns false for standard maintenance or non-insurance trades', () => {
      expect(isInsuranceEligibleTrade('house-cleaning')).toBe(false);
      expect(isInsuranceEligibleTrade('lawn-care')).toBe(false);
      expect(isInsuranceEligibleTrade('interior-painting')).toBe(false);
      expect(isInsuranceEligibleTrade('locksmiths')).toBe(false);
      expect(isInsuranceEligibleTrade('pool-cleaning')).toBe(false);
      expect(isInsuranceEligibleTrade('appliance-repair')).toBe(false);
      expect(isInsuranceEligibleTrade(null)).toBe(false);
      expect(isInsuranceEligibleTrade(undefined)).toBe(false);
    });
  });

  describe('shouldShowInsuranceFeatures', () => {
    it('respects contractor explicit override when true', () => {
      expect(
        shouldShowInsuranceFeatures({
          trade_slug: 'house-cleaning',
          enable_insurance_intake: true,
        })
      ).toBe(true);
    });

    it('respects contractor explicit override when false', () => {
      expect(
        shouldShowInsuranceFeatures({
          trade_slug: 'roofers',
          enable_insurance_intake: false,
        })
      ).toBe(false);
    });

    it('falls back to trade eligibility if override is undefined or null', () => {
      expect(shouldShowInsuranceFeatures({ trade_slug: 'roofers' })).toBe(true);
      expect(shouldShowInsuranceFeatures({ trade_slug: 'lawn-care' })).toBe(false);
    });
  });

  describe('getInsuranceTradeProfile', () => {
    it('returns accurate building codes and supplements for roofers', () => {
      const profile = getInsuranceTradeProfile('roofers');
      expect(profile.name).toContain('Roofing');
      expect(profile.primaryCodeCitations.some((c) => c.code.includes('R905.2.8.5'))).toBe(true);
      expect(profile.standardSupplements.some((s) => s.item.includes('Drip Edge'))).toBe(true);
    });

    it('returns accurate debris and tree codes for tree-services', () => {
      const profile = getInsuranceTradeProfile('tree-services');
      expect(profile.name).toContain('Tree Care');
      expect(profile.primaryCodeCitations.some((c) => c.code.includes('ANSI A300'))).toBe(true);
      expect(profile.standardSupplements.some((s) => s.item.includes('Crane'))).toBe(true);
    });

    it('returns psychrometric IICRC standards for water mitigation', () => {
      const profile = getInsuranceTradeProfile('water-damage-restoration');
      expect(profile.name).toContain('Water Mitigation');
      expect(profile.primaryCodeCitations.some((c) => c.code.includes('IICRC S500'))).toBe(true);
    });
  });

  describe('UPPA compliance rules', () => {
    it('contains clear rules discouraging deductible waivers and illegal adjusting', () => {
      expect(UPPA_COMPLIANCE_RULES.length).toBeGreaterThan(0);
      const text = JSON.stringify(UPPA_COMPLIANCE_RULES);
      expect(text.toLowerCase()).toContain('deductible');
      expect(text.toLowerCase()).toContain('adjuster');
    });
  });

  describe('TradeInsuranceClaimsShowcase integration', () => {
    it('identifies eligible public trade pages for insurance showcase', () => {
      const publicInsuranceTrades = ['roofers', 'tree-services', 'water-damage-restoration', 'siding', 'gutters'];
      const nonInsuranceTrades = ['landscapers', 'house-cleaning', 'painters', 'locksmiths'];

      publicInsuranceTrades.forEach((slug) => {
        expect(isInsuranceEligibleTrade(slug)).toBe(true);
      });

      nonInsuranceTrades.forEach((slug) => {
        expect(isInsuranceEligibleTrade(slug)).toBe(false);
      });
    });
  });
});
