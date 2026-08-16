import { describe, expect, it } from 'vitest';
import {
  ADD_ONS,
  COMPARISON_ROWS,
  ENTERPRISE,
  PLANS,
  PRICING_CATALOG_VERSION,
  PRICING_FAQS,
  VOICE_MONTHLY_BY_PLAN,
  annualFixedCost,
  annualPlanCost,
  annualPlanEstimate,
  planCrossover,
  type PlanId,
} from '@/app/pricing/pricing-catalog';

function plan(id: PlanId) {
  const match = PLANS.find((candidate) => candidate.id === id);
  expect(match, `missing ${id} pricing plan`).toBeDefined();
  return match!;
}

function comparisonRow(label: string) {
  const match = COMPARISON_ROWS.find(([candidate]) => candidate === label);
  expect(match, `missing ${label} comparison row`).toBeDefined();
  return match!;
}

describe('the contractor pricing catalog', () => {
  it('pins the exact base prices and LGQ platform fees', () => {
    expect(PRICING_CATALOG_VERSION).toBe('2026-08-15-preview');
    expect(
      PLANS.map(({ id, monthly, annualMonthly, paymentFeePct }) => ({
        id,
        monthly,
        annualMonthly,
        paymentFeePct,
      })),
    ).toEqual([
      { id: 'flex', monthly: 0, annualMonthly: 0, paymentFeePct: 1.25 },
      { id: 'solo', monthly: 39, annualMonthly: 35, paymentFeePct: 0.5 },
      { id: 'growth', monthly: 129, annualMonthly: 99, paymentFeePct: 0.25 },
      { id: 'scale', monthly: 329, annualMonthly: 299, paymentFeePct: 0.1 },
    ]);

    expect(PLANS.map((candidate) => annualFixedCost(candidate, 'annual', false))).toEqual([
      0,
      420,
      1_188,
      3_588,
    ]);
  });

  it('pins the approved Enterprise floor and margin-safe top-ups', () => {
    expect(ENTERPRISE).toEqual({
      startingMonthly: 799,
      includedWorkspaces: 2,
      fullScaleDuoMonthly: 1_099,
    });

    expect(ADD_ONS.map(({ label, price }) => [label, price])).toEqual([
      ['Flex: 250 text-credit top-up', '$12'],
      ['1,000 text credits', '$42'],
      ['5,000 marketing emails', '$17'],
      ['100 AI Intake credits', '$15'],
      ['250 AI writing drafts', '$19'],
      ['100 GB storage', '$15/month'],
      ['Office user', '$15/month'],
      ['Crew user', '$5/month'],
    ]);
  });

  it('pins the annual crossovers without Voice', () => {
    expect(planCrossover(plan('flex'), plan('solo'), 'annual', false)).toBe(56_000);
    expect(planCrossover(plan('solo'), plan('growth'), 'annual', false)).toBe(307_200);
    expect(planCrossover(plan('growth'), plan('scale'), 'annual', false)).toBe(1_600_000);
  });

  it('moves the annual Growth-to-Scale crossover to $1,160,000 with current Growth Voice', () => {
    expect(VOICE_MONTHLY_BY_PLAN.growth).toBe(55);
    expect(VOICE_MONTHLY_BY_PLAN.scale).toBe(0);
    expect(planCrossover(plan('growth'), plan('scale'), 'annual', true)).toBe(1_160_000);
  });

  it('calculates representative annual contractor costs exactly', () => {
    expect(annualPlanCost(plan('flex'), 'annual', 250_000, false)).toBe(3_125);
    expect(annualPlanCost(plan('solo'), 'annual', 250_000, false)).toBe(1_670);
    expect(annualPlanCost(plan('growth'), 'annual', 250_000, false)).toBe(1_813);
    expect(annualPlanCost(plan('scale'), 'annual', 250_000, false)).toBe(3_838);

    expect(annualPlanCost(plan('growth'), 'annual', 1_160_000, true)).toBe(4_748);
    expect(annualPlanCost(plan('scale'), 'annual', 1_160_000, true)).toBe(4_748);
  });

  it('uses office and phone requirements to find the lowest eligible plan', () => {
    expect(annualPlanEstimate(plan('flex'), 'annual', 40_000, false, 2, false)).toBeNull();
    expect(annualPlanEstimate(plan('flex'), 'annual', 40_000, false, 1, true)).toBeNull();
    expect(annualPlanEstimate(plan('solo'), 'annual', 250_000, false, 2, true)).toBe(1_850);
    expect(annualPlanEstimate(plan('growth'), 'annual', 600_000, false, 6, true)).toBe(2_868);
  });

  it('keeps Scale core team and monthly capacity aligned with Growth', () => {
    const growth = plan('growth');
    const scale = plan('scale');

    expect({
      officeUsers: scale.officeUsers,
      crewUsers: scale.crewUsers,
      textCredits: scale.textCredits,
      messagingSummary: scale.messagingSummary,
    }).toEqual({
      officeUsers: growth.officeUsers,
      crewUsers: growth.crewUsers,
      textCredits: growth.textCredits,
      messagingSummary: growth.messagingSummary,
    });

    for (const label of [
      'Office / admin users',
      'Crew-only users',
      'Custom-domain connections',
      'Business number',
      'Basic call forwarding & voicemail',
      'Text credits',
      'Marketing email sends',
      'Transactional emails',
      'AI Intake credits',
      'AI writing drafts',
      'File & photo storage',
      'QuickBooks Online',
    ]) {
      const [, , , growthValue, scaleValue] = comparisonRow(label);
      expect(scaleValue, `${label} should match Growth`).toBe(growthValue);
    }

    expect(scale.features).toContain('Growth-level team, messaging, AI Intake, and storage capacity');
  });

  it('states that Flex starter usage never automatically refills', () => {
    expect(plan('flex').features).toContain('No automatic refills; optional paid top-ups');

    const faq = PRICING_FAQS.find(({ q }) => q === 'How does Flex starter usage work?');
    expect(faq).toBeDefined();
    expect(faq!.a).toContain('one-time starter balances');
    expect(faq!.a).toContain('do not reset monthly or replenish when you collect a payment');
  });

  it('keeps lead capture working through the free standard form after AI Intake runs out', () => {
    const faq = PRICING_FAQS.find(({ q }) => q === 'What happens when AI Intake credits run out?');
    expect(faq).toBeDefined();
    expect(faq!.a).toContain('normal quote form at no charge');
    expect(faq!.a).toContain('standard form remains unlimited');
    expect(faq!.a).toContain('same lead and notifications without using AI credits');

    expect(comparisonRow('Lead capture after AI limit').slice(1)).toEqual([
      'Automatic standard form',
      'Automatic standard form',
      'Automatic standard form',
      'Automatic standard form',
    ]);
  });
});
