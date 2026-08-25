import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLANS, PRICING_FAQS, planCrossover, annualPlanCost } from '@/app/pricing/pricing-catalog';

const PRICING_EXPERIENCE = readFileSync('src/app/pricing/PricingExperience.tsx', 'utf8');
const PRICING_PAGE = readFileSync('src/app/pricing/page.tsx', 'utf8');
const PRICING_CALCULATOR = readFileSync('src/app/pricing/PricingCalculator.tsx', 'utf8');

describe('Problem 5: Streamlining Pricing Decision Architecture', () => {
  describe('1. Compact Pricing Hero & Formula', () => {
    it('states the complete pricing formula clearly in the hero', () => {
      expect(PRICING_EXPERIENCE).toContain(
        'Your cost is the <strong>plan subscription</strong> plus an <strong>LGQ platform fee</strong> on eligible payments.',
      );
      expect(PRICING_EXPERIENCE).toContain('Stripe processing is separate.');
    });

    it('provides primary and secondary CTAs in hero', () => {
      expect(PRICING_EXPERIENCE).toContain('See plans &darr;');
      expect(PRICING_EXPERIENCE).toContain('Find my plan &rarr;');
      expect(PRICING_EXPERIENCE).toContain('href="#plans"');
      expect(PRICING_EXPERIENCE).toContain('href="#recommender"');
    });
  });

  describe('2. Single Guided Plan Recommender', () => {
    it('replaces trade presets with 3 decision variables', () => {
      expect(PRICING_EXPERIENCE).toContain('1. Team &amp; Office Users');
      expect(PRICING_EXPERIENCE).toContain('2. Annual Payments Collected via LGQ');
      expect(PRICING_EXPERIENCE).toContain('3. Business Texting &amp; AI Intake');
    });

    it('renders a unified recommendation card with winner, reason, cost breakdown, alternative, and crossover', () => {
      expect(PRICING_EXPERIENCE).toContain('★ Recommended Fit');
      expect(PRICING_EXPERIENCE).toContain('Estimated LGQ Monthly Cost');
      expect(PRICING_EXPERIENCE).toContain('Base Subscription');
      expect(PRICING_EXPERIENCE).toContain('LGQ Platform Fee');
      expect(PRICING_EXPERIENCE).toContain('Closest Alternative:');
      expect(PRICING_EXPERIENCE).toContain('Crossover Insight:');
    });

    it('generates contextual signup URL with plan and billing via buildStartUrl', () => {
      expect(PRICING_EXPERIENCE).toContain('signupHref(recommendation.winner.id, billing)');
      expect(PRICING_EXPERIENCE).toContain("goal: 'choose_plan'");
      expect(PRICING_EXPERIENCE).toContain("source: 'pricing'");
    });

    it('verifies cost crossover math accurately', () => {
      const flex = PLANS.find((p) => p.id === 'flex')!;
      const solo = PLANS.find((p) => p.id === 'solo')!;
      const growth = PLANS.find((p) => p.id === 'growth')!;
      const scale = PLANS.find((p) => p.id === 'scale')!;

      // Flex to Solo crossover (annual fixed: Solo $420 vs Flex $0; fee difference: 1.25% - 0.50% = 0.75%)
      // $420 / 0.0075 = $56,000
      expect(planCrossover(flex, solo, 'annual', false)).toBe(56_000);

      // Solo to Growth crossover (annual fixed: Growth $1,188 vs Solo $420; diff: $768; fee diff: 0.50% - 0.25% = 0.25%)
      // $768 / 0.0025 = $307,200
      expect(planCrossover(solo, growth, 'annual', false)).toBe(307_200);

      // Growth to Scale crossover (annual fixed: Scale $3,588 vs Growth $1,188; diff: $2,400; fee diff: 0.25% - 0.10% = 0.15%)
      // $2,400 / 0.0015 = $1,600,000
      expect(planCrossover(growth, scale, 'annual', false)).toBe(1_600_000);
    });
  });

  describe('3. Four Compact Plan Cards', () => {
    it('defaults billing to monthly', () => {
      expect(PRICING_EXPERIENCE).toContain("const [billing, setBilling] = useState<BillingCycle>('monthly')");
    });

    it('labels annual commitments and exact annual savings explicitly', () => {
      expect(PRICING_EXPERIENCE).toContain(
        'billed annually — equivalent to',
      );
      expect(PRICING_EXPERIENCE).toContain('Save $');
      expect(PRICING_EXPERIENCE).toContain('month-to-month · cancel anytime');
    });

    it('incorporates seasonal $0 base directly into the Flex card', () => {
      expect(PRICING_EXPERIENCE).toContain(
        '$0 monthly base · pay only when you get paid',
      );
      expect(PRICING_EXPERIENCE).toContain('No monthly subscription — 100% free when work slows down');
    });

    it('shows 3 meaningful differentiators on each card', () => {
      expect(PRICING_EXPERIENCE).toContain('CARD_DIFFERENTIATORS');
      expect(PRICING_EXPERIENCE).toContain('1 office user + 2 crew users');
      expect(PRICING_EXPERIENCE).toContain('2 office users + 2 crew users');
      expect(PRICING_EXPERIENCE).toContain('5 office users + 10 crew users');
      expect(PRICING_EXPERIENCE).toContain('15 office users + 50 crew users');
    });
  });

  describe('4. What Every Plan Includes', () => {
    it('displays the 4-point foundational feature strip', () => {
      expect(PRICING_EXPERIENCE).toContain('Unlimited Core Records');
      expect(PRICING_EXPERIENCE).toContain('Free Contractor Website');
      expect(PRICING_EXPERIENCE).toContain('QuickBooks Online Sync');
      expect(PRICING_EXPERIENCE).toContain('Stripe Certified Payments');
    });
  });

  describe('5. Optional Cost Calculator & Detailed Comparison', () => {
    it('provides an optional calculator section synchronized with state', () => {
      expect(PRICING_EXPERIENCE).toContain('<PricingCalculator');
      expect(PRICING_EXPERIENCE).toContain('showCalculator');
      expect(PRICING_CALCULATOR).toContain('buildStartUrl');
    });

    it('places full feature comparison behind a single disclosure and links to /compare', () => {
      expect(PRICING_EXPERIENCE).toContain('<details className={styles.disclosure}>');
      expect(PRICING_EXPERIENCE).toContain('Full feature comparison &amp; plan limits');
      expect(PRICING_EXPERIENCE).toContain('href="/compare"');
    });
  });

  describe('6. Short FAQ and Final CTA', () => {
    it('shows the top purchasing questions with link to full FAQ', () => {
      expect(PRICING_EXPERIENCE).toContain('PRICING_FAQS.slice(0, 6)');
      expect(PRICING_EXPERIENCE).toContain('Show all');
      expect(PRICING_EXPERIENCE).toContain('pricing questions');
    });

    it('renders a final conversion CTA linking to /start', () => {
      expect(PRICING_EXPERIENCE).toContain('From first click to final payment. Run it all in one place.');
      expect(PRICING_EXPERIENCE).toContain("source: 'pricing_footer'");
    });
  });
});
