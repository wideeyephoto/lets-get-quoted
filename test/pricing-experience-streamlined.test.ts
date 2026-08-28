import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CREW_USER_ADD_ON_AVAILABLE,
  CREW_USER_ADD_ON_ELIGIBLE_PLANS,
  CREW_USER_ADD_ON_MONTHLY,
  PLANS,
  PRICING_FAQS,
  planCrossover,
} from '@/app/pricing/pricing-catalog';

const PRICING_EXPERIENCE = readFileSync('src/app/pricing/PricingExperience.tsx', 'utf8');
const PRICING_PAGE = readFileSync('src/app/pricing/page.tsx', 'utf8');

describe('Production pricing decision experience', () => {
  describe('approved hero and formula', () => {
    it('uses the approved whole-business message in the UI and route metadata', () => {
      const approvedDescription =
        'From an AI-powered website and instant quoting to client texting, booking, invoices, payments, and QuickBooks sync—everything connected from day one.';

      expect(PRICING_EXPERIENCE).toContain(
        'Your whole contracting business. <em>From $0/month.</em>',
      );
      expect(PRICING_EXPERIENCE.replace(/<em>|<\/em>/g, '')).toContain(approvedDescription);
      expect(PRICING_PAGE).toContain(approvedDescription);
      expect(PRICING_PAGE).toContain("alternates: { canonical: 'https://letsgetquoted.com/pricing' }");
    });

    it('keeps the $0 CTA and guided recommendation as distinct next steps', () => {
      expect(PRICING_EXPERIENCE).toContain("const heroSignupUrl = buildStartUrl({ goal: 'build_site', source: 'pricing' })");
      expect(PRICING_EXPERIENCE).toContain('Start free — $0/month');
      expect(PRICING_EXPERIENCE).toContain('href="#calculator"');
      expect(PRICING_EXPERIENCE).toContain('Calculate my best plan');
    });

    it('defines the formula as subscription plus a fee on the eligible subtotal', () => {
      expect(PRICING_EXPERIENCE).toContain(
        'LGQ platform fee applies to the discount-adjusted eligible service subtotal. Subscription and Stripe processing are separate.',
      );
      expect(PRICING_EXPERIENCE).toContain('Annual eligible service subtotal collected through LGQ');
      expect(PRICING_EXPERIENCE).toContain('annualVolume * 100 * plan.rate');
      expect(PRICING_EXPERIENCE).toContain('annualFee + subscriptionAnnual');
    });
  });

  describe('catalog-driven recommender', () => {
    it('bases the plan view on the canonical four-plan catalog', () => {
      expect(PLANS.map((plan) => plan.id)).toEqual(['flex', 'solo', 'growth', 'scale']);
      expect(PLANS.map((plan) => [plan.monthly, plan.annualMonthly, plan.paymentFeePct])).toEqual([
        [0, 0, 1.25],
        [39, 35, 0.5],
        [129, 99, 0.25],
        [329, 299, 0.1],
      ]);
      expect(PRICING_EXPERIENCE).toContain('const plans = PLANS.map');
      expect(PRICING_EXPERIENCE).toContain('fee: feeLabel(plan.paymentFeePct)');
      expect(PRICING_EXPERIENCE).toContain('planEstimates.map((plan');
    });

    it('collects independent office, crew, eligible-subtotal, and usage requirements', () => {
      expect(PRICING_EXPERIENCE).toContain('1. Team capacity');
      expect(PRICING_EXPERIENCE).toContain('Office / admin users');
      expect(PRICING_EXPERIENCE).toContain('Crew-only users');
      expect(PRICING_EXPERIENCE).toContain('2. Annual eligible service subtotal collected through LGQ');
      expect(PRICING_EXPERIENCE).toContain('3. Monthly messaging and AI usage');
      expect(PRICING_EXPERIENCE).toContain("label: 'High-volume automation'");
      expect(PRICING_EXPERIENCE).toContain('Up to 3,000 texts + 1,500 AI credits');
    });

    it('keeps exact typed revenue separate from the $5k-step slider', () => {
      expect(PRICING_EXPERIENCE).toContain('setAnnualVolume(Math.round(clampVolume(value)))');
      expect(PRICING_EXPERIENCE).toContain('setAnnualVolume(Math.round(clampVolume(value) / 5000) * 5000)');
      expect(PRICING_EXPERIENCE).toContain('onChange={(event) => updateExactVolume');
      expect(PRICING_EXPERIENCE).toContain('onChange={(event) => updateSliderVolume');
    });

    it('models only the sellable recurring crew-seat add-on and enforces office capacity', () => {
      expect(CREW_USER_ADD_ON_AVAILABLE).toBe(true);
      expect(CREW_USER_ADD_ON_MONTHLY).toBe(5);
      expect(CREW_USER_ADD_ON_ELIGIBLE_PLANS).toEqual(['solo', 'growth', 'scale']);
      expect(PRICING_EXPERIENCE).toContain('CREW_USER_ADD_ON_ELIGIBLE_PLANS.includes(plan.id)');
      expect(PRICING_EXPERIENCE).toContain('officeUsers <= plan.officeUsers');
      expect(PRICING_EXPERIENCE).toContain('extraCrewUsers * CREW_USER_ADD_ON_MONTHLY');
      expect(PRICING_EXPERIENCE).toContain('Additional office seats are not currently available.');
    });

    it('ranks only plans that fit and uses the higher-capability tie-break helper', () => {
      expect(PRICING_EXPERIENCE).toContain('const ranking = rankPlanCosts');
      expect(PRICING_EXPERIENCE).toContain('annualCost: plan.eligible ? plan.annualTotal : null');
      expect(PRICING_EXPERIENCE).toContain('ranking.winner?.planId');
      expect(PRICING_EXPERIENCE).toContain('Best cost among plans that fit your capacity');
    });

    it('passes the canonical plan and billing intent through buildStartUrl at every checkout', () => {
      expect(PRICING_EXPERIENCE).toContain('const checkoutUrl = (planId: PlanId) =>');
      expect(PRICING_EXPERIENCE).toContain("goal: 'choose_plan'");
      expect(PRICING_EXPERIENCE).toContain('plan: planId');
      expect(PRICING_EXPERIENCE).toContain('billing: checkoutBilling');
      expect(PRICING_EXPERIENCE).toContain("source: 'pricing'");
      expect(PRICING_EXPERIENCE).toContain('href={checkoutUrl(recommendation.id)}');
      expect(PRICING_EXPERIENCE).toContain('href={checkoutUrl(plan.id)}');
    });

    it('retains the exact annual crossover boundaries used to explain plan economics', () => {
      const [flex, solo, growth, scale] = PLANS;
      expect(planCrossover(flex, solo, 'annual', false)).toBe(56_000);
      expect(planCrossover(solo, growth, 'annual', false)).toBe(307_200);
      expect(planCrossover(growth, scale, 'annual', false)).toBe(1_600_000);
    });

    it('surfaces fee crossover milestones and competitor benchmark comparisons in the recommender', () => {
      expect(PRICING_EXPERIENCE).toContain('UPGRADE BREAKEVEN MILESTONES:');
      expect(PRICING_EXPERIENCE).toContain('Solo beats Flex fee');
      expect(PRICING_EXPERIENCE).toContain('Growth beats Solo fee');
      expect(PRICING_EXPERIENCE).toContain('Scale beats Growth fee');
      expect(PRICING_EXPERIENCE).toContain('COMPARE VS LEGACY FIELD SOFTWARE');
      expect(PRICING_EXPERIENCE).toContain('estimateCompetitorAnnualCost(activeCompetitor, officeUsers)');
      expect(PRICING_EXPERIENCE).toContain('Keep more profit with Let&apos;s Get Quoted');
      expect(PRICING_EXPERIENCE).toContain('waterfall-presets');
      expect(PRICING_EXPERIENCE).toContain('waterfall-methods');
      expect(PRICING_EXPERIENCE).toContain('ACH Bank Transfer (0.8% max $5)');
    });
  });

  describe('plan, proof, and conversion architecture', () => {
    it('preserves every public deep-link anchor used by the existing pricing route', () => {
      for (const anchor of ['calculator', 'recommender', 'savings-calculator', 'plans', 'comparison', 'included', 'faq']) {
        expect(PRICING_EXPERIENCE).toContain(`id="${anchor}"`);
      }
    });

    it('renders canonical plan allowances and a disclosure-backed full comparison', () => {
      expect(PRICING_EXPERIENCE).toContain('{plan.officeUsers} office + {plan.crewUsers} crew users');
      expect(PRICING_EXPERIENCE).toContain('{plan.textAllowance}');
      expect(PRICING_EXPERIENCE).toContain('{plan.aiAllowance}');
      expect(PRICING_EXPERIENCE).toContain('{plan.storage} storage');
      expect(PRICING_EXPERIENCE).toContain('<details className="full-comparison" id="comparison">');
      expect(PRICING_EXPERIENCE).toContain('COMPARISON_ROWS.map(([label, ...values])');
      expect(PRICING_EXPERIENCE).toContain('Detailed comparison of Flex, Solo, Growth and Scale');
    });

    it('uses the real product image as connected-platform proof', () => {
      expect(PRICING_EXPERIENCE).toContain('src="/features/back-office-insights.png"');
      expect(PRICING_EXPERIENCE).toContain('Actual Let&apos;s Get Quoted Insights interface');
      expect(PRICING_EXPERIENCE).toContain('See the whole business—not another disconnected tool.');
      expect(PRICING_EXPERIENCE).toContain('href="/features/back-office"');
    });

    it('renders every canonical pricing FAQ, including the annual guarantee', () => {
      expect(PRICING_FAQS.length).toBeGreaterThanOrEqual(10);
      expect(PRICING_FAQS.some((item) => item.q === 'What is the annual-plan guarantee?')).toBe(true);
      expect(PRICING_EXPERIENCE).toContain('id="faq"');
      expect(PRICING_EXPERIENCE).toContain('PRICING_FAQS.map(({ q, a }, index)');
      expect(PRICING_EXPERIENCE).toContain('{q}');
      expect(PRICING_EXPERIENCE).toContain('{a}');
    });

    it('ends with a catalog-compatible free-site CTA and a human-assistance path', () => {
      expect(PRICING_EXPERIENCE).toContain('Build your site. Send your first quote today.');
      expect(PRICING_EXPERIENCE).toContain("const footerSignupUrl = buildStartUrl({ goal: 'build_site', source: 'pricing_footer' })");
      expect(PRICING_EXPERIENCE).toContain('href={footerSignupUrl}>Build my free site');
      expect(PRICING_EXPERIENCE).toContain('href="/contact">Talk to our team');
    });
  });
});
