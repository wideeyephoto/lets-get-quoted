import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANS, COMPARISON_ROWS, planCrossover, annualPlanCost, type BillingCycle } from '@/app/pricing/pricing-catalog';
import { BILLING_PLANS } from '@/lib/billing/catalog';

const PRICING_EXPERIENCE = readFileSync('src/app/pricing/PricingExperience.tsx', 'utf8');
const PRICING_PAGE = readFileSync('src/app/pricing/page.tsx', 'utf8');

describe('Pricing Improvements: Crossovers & Entitlement Integrity', () => {
  const flex = PLANS.find((p) => p.id === 'flex')!;
  const solo = PLANS.find((p) => p.id === 'solo')!;
  const growth = PLANS.find((p) => p.id === 'growth')!;
  const scale = PLANS.find((p) => p.id === 'scale')!;

  describe('Billing-Cycle and Revenue Crossover Math (#24)', () => {
    it('computes exact Annual billing crossovers', () => {
      // Flex -> Solo (Annual: Solo $420/yr vs Flex $0; fee difference: 1.25% - 0.50% = 0.75%)
      // $420 / 0.0075 = $56,000
      expect(planCrossover(flex, solo, 'annual', false)).toBe(56_000);

      // Solo -> Growth (Annual: Growth $1,188/yr vs Solo $420/yr; diff: $768; fee diff: 0.50% - 0.25% = 0.25%)
      // $768 / 0.0025 = $307,200
      expect(planCrossover(solo, growth, 'annual', false)).toBe(307_200);

      // Growth -> Scale (Annual: Scale $3,588/yr vs Growth $1,188/yr; diff: $2,400; fee diff: 0.25% - 0.10% = 0.15%)
      // $2,400 / 0.0015 = $1,600,000
      expect(planCrossover(growth, scale, 'annual', false)).toBe(1_600_000);
    });

    it('computes exact Monthly billing crossovers', () => {
      // Flex -> Solo (Monthly: Solo $468/yr vs Flex $0; fee difference: 1.25% - 0.50% = 0.75%)
      // $468 / 0.0075 = $62,400
      expect(planCrossover(flex, solo, 'monthly', false)).toBe(62_400);

      // Solo -> Growth (Monthly: Growth $1,548/yr vs Solo $468/yr; diff: $1,080; fee diff: 0.50% - 0.25% = 0.25%)
      // $1,080 / 0.0025 = $432,000
      expect(planCrossover(solo, growth, 'monthly', false)).toBe(432_000);

      // Growth -> Scale (Monthly: Scale $3,948/yr vs Growth $1,548/yr; diff: $2,400; fee diff: 0.25% - 0.10% = 0.15%)
      // $2,400 / 0.0015 = $1,600,000
      expect(planCrossover(growth, scale, 'monthly', false)).toBe(1_600_000);
    });

    it('verifies cost parity at exact crossover points', () => {
      const cycles: BillingCycle[] = ['annual', 'monthly'];
      for (const cycle of cycles) {
        const xFlexSolo = planCrossover(flex, solo, cycle, false);
        expect(Math.round(annualPlanCost(flex, cycle, xFlexSolo, false))).toBe(
          Math.round(annualPlanCost(solo, cycle, xFlexSolo, false)),
        );

        const xSoloGrowth = planCrossover(solo, growth, cycle, false);
        expect(Math.round(annualPlanCost(solo, cycle, xSoloGrowth, false))).toBe(
          Math.round(annualPlanCost(growth, cycle, xSoloGrowth, false)),
        );

        const xGrowthScale = planCrossover(growth, scale, cycle, false);
        expect(Math.round(annualPlanCost(growth, cycle, xGrowthScale, false))).toBe(
          Math.round(annualPlanCost(scale, cycle, xGrowthScale, false)),
        );
      }
    });
  });

  describe('Entitlement & Allowance Agreement (#2, #25)', () => {
    it('verifies Solo office seats is 2 across catalog, allowances, and comparison table', () => {
      expect(BILLING_PLANS.solo.allowances.officeUsers).toBe(2);
      expect(solo.officeUsers).toBe(2);

      const officeRow = COMPARISON_ROWS.find(([label]) => label === 'Office / admin users');
      expect(officeRow).toBeDefined();
      // Values: [Label, Flex, Solo, Growth, Scale]
      expect(officeRow![2]).toBe('2'); // Solo must be 2, not 1
    });

    it('ensures all comparison table seat allowances match BILLING_PLANS exactly', () => {
      const officeRow = COMPARISON_ROWS.find(([label]) => label === 'Office / admin users')!;
      expect(officeRow[1]).toBe(String(BILLING_PLANS.flex.allowances.officeUsers));
      expect(officeRow[2]).toBe(String(BILLING_PLANS.solo.allowances.officeUsers));
      expect(officeRow[3]).toBe(String(BILLING_PLANS.growth.allowances.officeUsers));
      expect(officeRow[4]).toBe(String(BILLING_PLANS.scale.allowances.officeUsers));

      const crewRow = COMPARISON_ROWS.find(([label]) => label === 'Crew-only users')!;
      expect(crewRow[1]).toBe(String(BILLING_PLANS.flex.allowances.crewUsers));
      expect(crewRow[2]).toBe(String(BILLING_PLANS.solo.allowances.crewUsers));
      expect(crewRow[3]).toBe(String(BILLING_PLANS.growth.allowances.crewUsers));
      expect(crewRow[4]).toBe(String(BILLING_PLANS.scale.allowances.crewUsers));
    });

    it('ensures platform fee percentages match across plans and comparison table', () => {
      const feeRow = COMPARISON_ROWS.find(([label]) => label === 'LGQ platform fee')!;
      expect(feeRow[1]).toBe('1.25%');
      expect(feeRow[2]).toBe('0.50%');
      expect(feeRow[3]).toBe('0.25%');
      expect(feeRow[4]).toBe('0.1%');
    });
  });

  describe('Structured Data Offer Consistency (#21, #22, #23)', () => {
    it('includes highPrice of 329 for Scale monthly availability', () => {
      expect(PRICING_PAGE).toContain("highPrice: '329'");
      expect(PRICING_PAGE).toContain("lowPrice: '0'");
    });

    it('includes explicit monthly and annual offers with priceSpecification', () => {
      expect(PRICING_PAGE).toContain("name: 'Solo (Monthly)'");
      expect(PRICING_PAGE).toContain("name: 'Solo (Annual)'");
      expect(PRICING_PAGE).toContain("name: 'Growth (Monthly)'");
      expect(PRICING_PAGE).toContain("name: 'Growth (Annual)'");
      expect(PRICING_PAGE).toContain("name: 'Scale (Monthly)'");
      expect(PRICING_PAGE).toContain("name: 'Scale (Annual)'");
    });
  });

  describe('Hero Proof Object, Exclusions & Trust Signals (#4, #5, #8, #9, #10, #11, #12, #14)', () => {
    it('displays revised hero headline and See plans CTA', () => {
      expect(PRICING_EXPERIENCE).toContain('Start at $0. Lower your platform fee as you grow.');
      expect(PRICING_EXPERIENCE).toContain('See plans &darr;');
    });

    it('includes fee progression visual in proof card', () => {
      expect(PRICING_EXPERIENCE).toContain('Flex');
      expect(PRICING_EXPERIENCE).toContain('1.25%');
      expect(PRICING_EXPERIENCE).toContain('0.50%');
      expect(PRICING_EXPERIENCE).toContain('0.25%');
      expect(PRICING_EXPERIENCE).toContain('0.10%');
    });

    it('states exclusion of Stripe, carrier fees, and taxes beside estimates', () => {
      expect(PRICING_EXPERIENCE).toContain('Estimated LGQ Monthly Cost');
      expect(PRICING_EXPERIENCE).toContain(
        '*Stripe processing, carrier registration, phone-number rental, and applicable taxes are excluded.',
      );
    });

    it('surfaces 30-day money back guarantee with annual billing', () => {
      expect(PRICING_EXPERIENCE).toContain('30-Day Money-Back Guarantee on Annual Prepayments');
    });

    it('discloses carrier and messaging activation costs beside cards', () => {
      expect(PRICING_EXPERIENCE).toContain(
        '*10DLC carrier registration, campaign vetting, and dedicated phone number rental are separate telecom fees paid directly to carriers.',
      );
    });

    it('includes a real-world payment math example', () => {
      expect(PRICING_EXPERIENCE).toContain('Real-World Payment Example');
      expect(PRICING_EXPERIENCE).toContain('$5,000.00');
      expect(PRICING_EXPERIENCE).toContain('$12.50');
      expect(PRICING_EXPERIENCE).toContain('$145.30');
      expect(PRICING_EXPERIENCE).toContain('$4,842.20');
    });

    it('renders security and trust signals near CTAs', () => {
      expect(PRICING_EXPERIENCE).toContain('256-Bit SSL');
      expect(PRICING_EXPERIENCE).toContain('Stripe Certified');
      expect(PRICING_EXPERIENCE).toContain('Cancel Anytime');
    });
  });
});
