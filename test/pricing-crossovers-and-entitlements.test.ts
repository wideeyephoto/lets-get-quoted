import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PLANS,
  COMPARISON_ROWS,
  PRICING_FAQS,
  planCrossover,
  annualPlanCost,
  type BillingCycle,
} from '@/app/pricing/pricing-catalog';
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

  describe('Hero, pricing disclosure, and trust integrity', () => {
    it('locks the approved hero promise and its two conversion paths', () => {
      expect(PRICING_EXPERIENCE).toContain(
        'Your whole contracting business. <em>From $0/month.</em>',
      );
      expect(PRICING_EXPERIENCE).toContain(
        'From an AI-powered website and instant quoting to client texting, booking, invoices, payments, and QuickBooks sync—<em>everything connected from day one.</em>',
      );
      expect(PRICING_EXPERIENCE).toContain('Start free — $0/month');
      expect(PRICING_EXPERIENCE).toContain('Calculate my best plan');
      expect(PRICING_EXPERIENCE).toContain('href="#calculator"');
    });

    it('shows all four catalog platform-fee tiers in the visual and plan cards', () => {
      expect(PLANS.map((plan) => plan.paymentFeePct)).toEqual([1.25, 0.5, 0.25, 0.1]);
      expect(PRICING_EXPERIENCE).toContain('const plans = PLANS.map');
      expect(PRICING_EXPERIENCE).toContain('fee: feeLabel(plan.paymentFeePct)');
      expect(PRICING_EXPERIENCE).toContain('plan-${plan.id}');
      expect(PRICING_EXPERIENCE).toContain('FLEX / SEASONAL');
      expect(PRICING_EXPERIENCE).toContain('SUBSCRIPTION PLANS');
    });

    it('states the fee basis and all material exclusions beside the estimates and cards', () => {
      expect(PRICING_EXPERIENCE).toContain(
        'LGQ platform fee applies to the discount-adjusted eligible service subtotal. Subscription and Stripe processing are separate.',
      );
      expect(PRICING_EXPERIENCE).toContain(
        'LGQ fees exclude separately stated sales tax, tips, refunds and credits. Stripe pricing may vary. Carrier and phone-number fees are separate.',
      );
      expect(PRICING_EXPERIENCE).toContain(
        'Carrier registration, dedicated-number lease, Stripe processing, taxes and top-ups are separate.',
      );
    });

    it('keeps the annual-plan guarantee precise instead of promising a blanket refund', () => {
      const guarantee = PRICING_FAQS.find((item) => item.q === 'What is the annual-plan guarantee?');
      expect(guarantee?.a).toBe(
        'Once per verified business, the first annual base plan may be converted within 30 days. The refund is the annual prepayment minus one normal month-to-month base charge. LGQ platform fees are not recalculated retroactively, and consumed add-ons, carrier costs, Stripe fees, taxes, and custom work are excluded.',
      );
      expect(PRICING_EXPERIENCE).toContain('PRICING_FAQS.map');
      expect(PRICING_EXPERIENCE).not.toContain('30-Day Money-Back Guarantee');
    });

    it('renders a dynamic payment waterfall without hard-coding one plan fee', () => {
      expect(PRICING_EXPERIENCE).toContain('REAL-WORLD PAYMENT EXAMPLE');
      expect(PRICING_EXPERIENCE).toContain('$5,000 eligible service subtotal paid by card');
      expect(PRICING_EXPERIENCE).toContain('examplePayment * recommendation.rate');
      expect(PRICING_EXPERIENCE).toContain('examplePayment * 0.029 + 0.30');
      expect(PRICING_EXPERIENCE).toContain('Estimated bank payout');
    });

    it('uses support, transport, payment-provider, and plan-change trust claims accurately', () => {
      expect(PRICING_EXPERIENCE).toContain('US-based phone &amp; chat support');
      expect(PRICING_EXPERIENCE).toContain('HTTPS + TLS 1.3');
      expect(PRICING_EXPERIENCE).toContain('Payments powered by Stripe');
      expect(PRICING_EXPERIENCE).toContain('PCI DSS Level 1 provider');
      expect(PRICING_EXPERIENCE).toContain('Upgrade now · downgrade at renewal');

      expect(PRICING_EXPERIENCE).not.toContain('256-Bit SSL');
      expect(PRICING_EXPERIENCE).not.toContain('Stripe Certified');
      expect(PRICING_EXPERIENCE).not.toContain('Pause or switch plans anytime');
      expect(PRICING_EXPERIENCE).not.toContain('Cancel Anytime');
    });
  });
});
