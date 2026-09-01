import { describe, it, expect } from 'vitest';
import {
  calculateMemberDiscount,
  getMemberBenefitsSummary,
  DEFAULT_BENEFITS,
  DEFAULT_MEMBERSHIP_TIERS,
  type MembershipBenefits,
} from '@/lib/membership-tiers';

describe('Service Club Memberships & Club Tiers', () => {
  describe('DEFAULT_MEMBERSHIP_TIERS Presets', () => {
    it('provides standard tiers for HVAC, Plumbing, and General trades', () => {
      expect(DEFAULT_MEMBERSHIP_TIERS.hvac).toBeDefined();
      expect(DEFAULT_MEMBERSHIP_TIERS.hvac.length).toBeGreaterThanOrEqual(4);
      expect(DEFAULT_MEMBERSHIP_TIERS.plumbing).toBeDefined();
      expect(DEFAULT_MEMBERSHIP_TIERS.general).toBeDefined();

      const goldHvac = DEFAULT_MEMBERSHIP_TIERS.hvac.find((t) => t.tierLevel === 3);
      expect(goldHvac).toBeDefined();
      expect(goldHvac?.name).toContain('Gold');
      expect(goldHvac?.benefits.discountPercentage).toBe(15);
      expect(goldHvac?.benefits.emergencyDispatchDiscount).toBe(100);
      expect(goldHvac?.benefits.warrantyMultiplier).toBe(2.0);
    });
  });

  describe('calculateMemberDiscount', () => {
    const silverBenefits: MembershipBenefits = {
      ...DEFAULT_BENEFITS,
      discountPercentage: 10,
      emergencyDispatchDiscount: 50,
    };

    const goldBenefits: MembershipBenefits = {
      ...DEFAULT_BENEFITS,
      discountPercentage: 15,
      emergencyDispatchDiscount: 100,
    };

    it('calculates standard percentage discount on repair service', () => {
      const result = calculateMemberDiscount(silverBenefits, 450);
      expect(result.originalAmount).toBe(450);
      expect(result.discountPercentage).toBe(10);
      expect(result.discountAmount).toBe(45);
      expect(result.finalAmount).toBe(405);
      expect(result.savingsLabel).toContain('$45.00 (10% off)');
    });

    it('applies waived or higher discount for emergency dispatch fee', () => {
      const result = calculateMemberDiscount(goldBenefits, 189, true);
      expect(result.originalAmount).toBe(189);
      expect(result.discountPercentage).toBe(100);
      expect(result.discountAmount).toBe(189);
      expect(result.finalAmount).toBe(0);
      expect(result.savingsLabel).toContain('100% off');
    });

    it('returns zero discount gracefully when no benefits active', () => {
      const result = calculateMemberDiscount(null, 300);
      expect(result.originalAmount).toBe(300);
      expect(result.discountPercentage).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.finalAmount).toBe(300);
      expect(result.savingsLabel).toBe('');
    });
  });

  describe('getMemberBenefitsSummary', () => {
    it('summarizes active member benefits, remaining tune-ups, and annual savings', () => {
      const summary = getMemberBenefitsSummary(
        {
          name: 'Gold VIP Protection Club',
          tierLevel: 3,
          badgeColor: '#eab308',
          benefits: {
            ...DEFAULT_BENEFITS,
            discountPercentage: 15,
            includedTuneupsPerYear: 2,
            emergencyDispatchDiscount: 100,
            warrantyMultiplier: 2.0,
            freeFilterReplacements: 4,
          },
        },
        true,
        1, // 1 tune-up completed this plan year
      );

      expect(summary.tierName).toBe('Gold VIP Protection Club');
      expect(summary.tierLevel).toBe(3);
      expect(summary.badgeColor).toBe('#eab308');
      expect(summary.discountPercentage).toBe(15);
      expect(summary.includedTuneupsPerYear).toBe(2);
      expect(summary.tuneupsUsedThisYear).toBe(1);
      expect(summary.tuneupsRemainingThisYear).toBe(1);
      expect(summary.isEligibleForFreeTuneup).toBe(true);
      expect(summary.emergencyFeeWaived).toBe(true);
      expect(summary.warrantyMultiplier).toBe(2.0);
      expect(summary.freeFiltersPerYear).toBe(4);
      expect(summary.membershipStatus).toBe('active');
      expect(summary.statusLabel).toBe('Active Club Member');
      expect(summary.annualSavingsEstimate).toBeGreaterThan(500);
    });

    it('marks free tune-up as exhausted when usage reaches annual allocation', () => {
      const summary = getMemberBenefitsSummary(
        {
          name: 'Bronze Comfort Plan',
          tierLevel: 1,
          badgeColor: '#94a3b8',
          benefits: {
            ...DEFAULT_BENEFITS,
            includedTuneupsPerYear: 1,
          },
        },
        true,
        1, // 1 used of 1
      );

      expect(summary.tuneupsRemainingThisYear).toBe(0);
      expect(summary.isEligibleForFreeTuneup).toBe(false);
    });
  });
});
