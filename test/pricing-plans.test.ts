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
import { TOP_UPS } from '@/lib/billing/catalog';

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
    expect(PRICING_CATALOG_VERSION).toBe('2026-08-18-preview');
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

    // THE APPROVED PRICE BOOK, pinned at the source. Withholding a sale is not
    // forgetting a price: these are decided and correct, and losing them would
    // make each launch a re-decision rather than a flag flip.
    expect(Object.values(TOP_UPS).map((t) => [t.label, t.priceCents, t.recurring])).toEqual([
      ['Flex: 250 text-credit top-up', 1_200, false],
      ['1,000 text credits', 4_200, false],
      ['5,000 marketing emails', 1_700, false],
      ['100 AI Intake credits', 1_500, false],
      ['250 AI writing drafts', 1_900, false],
      ['100 GB storage', 1_500, true],
      ['Office user', 1_500, true],
      ['Crew user', 500, true],
      // One SKU per plan, because the published price differs by plan and one
      // `priceCents` cannot hold three. Scale is absent: it includes voice.
      ['AI Voice Receptionist (Flex)', 6_900, true],
      ['AI Voice Receptionist (Solo)', 5_900, true],
      ['AI Voice Receptionist (Growth)', 5_500, true],
      ['100 AI-connected minutes', 3_500, false],
    ]);

    // WHAT THE PUBLIC PAGE QUOTES is a smaller list than the price book, and
    // deliberately so -- the six checkout will actually sell, priced, then the
    // six it refuses, unpriced and last. See pricing-add-ons-are-buyable for
    // why that separation exists rather than what it currently is.
    //
    // Crew user crossed the line on 2026-08-20 and crossed back on 2026-08-23.
    // It is the only RECURRING sku here, and nothing in the product can cancel a
    // top-up subscription -- every Stripe subscription write resolves through
    // billing_subscriptions, which a crew seat never enters. So it reads 'Coming
    // soon' with the rest until a cancel path exists. The '/month' note below
    // stays relevant for whenever it returns: the others are one-off balances,
    // and a reader who takes $5 for a one-time charge has been misled by the very
    // list meant to inform them.
    expect(ADD_ONS.map(({ label, price }) => [label, price])).toEqual([
      ['Flex: 250 text-credit top-up', '$12'],
      ['1,000 text credits', '$42'],
      ['5,000 marketing emails', '$17'],
      ['100 AI Intake credits', '$15'],
      ['250 AI writing drafts', '$19'],
      ['100 GB storage', 'Coming soon'],
      ['Office user', 'Coming soon'],
      ['Crew user', 'Coming soon'],
      ['AI Voice Receptionist (Flex)', 'Coming soon'],
      ['AI Voice Receptionist (Solo)', 'Coming soon'],
      ['AI Voice Receptionist (Growth)', 'Coming soon'],
      ['100 AI-connected minutes', 'Coming soon'],
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
    // Solo grants two office seats, so a second user costs nothing extra. Kept
    // alongside the three-user case so the add-on arithmetic stays covered for
    // Solo -- moving this to 1,670 on its own would have deleted it.
    expect(annualPlanEstimate(plan('solo'), 'annual', 250_000, false, 2, true)).toBe(1_670);
    expect(annualPlanEstimate(plan('solo'), 'annual', 250_000, false, 3, true)).toBe(1_850);
    expect(annualPlanEstimate(plan('growth'), 'annual', 600_000, false, 6, true)).toBe(2_868);
  });

  it('shows Scale beating Growth on every metered row of the public table', () => {
    // The public table used to repeat Growth's numbers in the Scale column, and
    // a feature bullet said so out loud: "Growth-level team, messaging, AI Intake,
    // and storage capacity". Catalog 2026-08-18-preview separates them, so the
    // customer-facing copy has to move with it or the page undersells the plan.
    const growth = plan('growth');
    const scale = plan('scale');

    expect(scale.officeUsers).toBeGreaterThan(growth.officeUsers);
    expect(scale.crewUsers).toBeGreaterThan(growth.crewUsers);
    expect(scale.textCredits).toBe('3,000/month');
    expect(scale.messagingSummary).toBe('3,000 text credits/month · shared LGQ number');

    for (const [label, expected] of [
      ['Office / admin users', '15'],
      ['Crew-only users', '50'],
      ['Text credits', '3,000/month'],
      ['Marketing email sends', '5,000/month'],
      ['AI Intake credits', '1,000/month'],
      ['AI writing drafts', '500/month'],
      ['File & photo storage', '250 GB'],
      ['Basic call forwarding & voicemail', '200 min/month'],
    ] as const) {
      const [, , , growthValue, scaleValue] = comparisonRow(label);
      expect(scaleValue, `${label} Scale column`).toBe(expected);
      expect(scaleValue, `${label} must not repeat Growth`).not.toBe(growthValue);
    }

    // Genuinely shared, and it should stay that way: one legal business.
    for (const label of ['Custom-domain connections', 'QuickBooks Online'] as const) {
      const [, , , growthValue, scaleValue] = comparisonRow(label);
      expect(scaleValue).toBe(growthValue);
    }

    expect(scale.features).not.toContain('Growth-level team, messaging, AI Intake, and storage capacity');
    expect(scale.features).toContain('15 office users + 50 crew users');
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
