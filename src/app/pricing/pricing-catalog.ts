import {
  BILLING_PLANS,
  ENTERPRISE_PRICING,
  PRICING_CATALOG_VERSION,
  TOP_UPS,
  TOP_UPS_WITHHELD,
  formatUsdFromCents,
  platformFeePercent,
  type BillingCycle as CatalogBillingCycle,
  type BillingPlanId,
} from '@/lib/billing/catalog';

export { PRICING_CATALOG_VERSION };
export type BillingCycle = CatalogBillingCycle;
export type PlanId = BillingPlanId;

export type PricingPlan = {
  id: PlanId;
  name: string;
  audience: string;
  promise: string;
  monthly: number;
  annualMonthly: number;
  paymentFeePct: number;
  fit: string;
  featured: boolean;
  officeUsers: number;
  crewUsers: number;
  textCredits: string;
  messagingSummary: string;
  forwardingMinutes: number;
  voiceMinutes: number;
  voiceConcurrentCalls: number;
  features: readonly string[];
};

export const OFFICE_USER_ADD_ON_MONTHLY = 15;

export const PLANS: readonly PricingPlan[] = [
  {
    id: 'flex',
    name: 'Flex',
    audience: 'New, part-time, or seasonal',
    promise: 'Start without another monthly bill',
    monthly: BILLING_PLANS.flex.monthlyPriceCents / 100,
    annualMonthly: BILLING_PLANS.flex.annualPriceCents / 12 / 100,
    paymentFeePct: platformFeePercent('flex'),
    fit: 'Best for getting started with no fixed software bill.',
    featured: false,
    officeUsers: BILLING_PLANS.flex.allowances.officeUsers,
    crewUsers: BILLING_PLANS.flex.allowances.crewUsers,
    textCredits: '50 one-time starter credits',
    messagingSummary: '50 starter text credits · shared LGQ number',
    forwardingMinutes: BILLING_PLANS.flex.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.flex.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.flex.voice.concurrentCalls,
    features: [
      'Unlimited core records and standard quote forms',
      '1 office user + 2 crew users',
      '1 custom-domain connection',
      'Shared LGQ texting number',
      'QuickBooks Online connection included',
      '50 text + 30 AI Intake one-time starter credits',
      '100 marketing emails + 25 AI writing drafts to start',
      'No automatic refills; optional paid top-ups',
      'AI Voice Receptionist coming soon',
    ],
  },
  {
    id: 'solo',
    name: 'Solo',
    audience: 'Owner-operator',
    promise: 'A lower platform fee, and your own number when it launches',
    monthly: BILLING_PLANS.solo.monthlyPriceCents / 100,
    annualMonthly: BILLING_PLANS.solo.annualPriceCents / 12 / 100,
    paymentFeePct: platformFeePercent('solo'),
    fit: 'Best for owner-operators ready for their own business line.',
    featured: false,
    officeUsers: BILLING_PLANS.solo.allowances.officeUsers,
    crewUsers: BILLING_PLANS.solo.allowances.crewUsers,
    textCredits: '500/month',
    messagingSummary: '500 text credits/month · shared LGQ number',
    forwardingMinutes: BILLING_PLANS.solo.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.solo.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.solo.voice.concurrentCalls,
    features: [
      'Unlimited core records and standard quote forms',
      '2 office users + 2 crew users',
      '1 custom-domain connection',
      'Dedicated business number coming soon',
      'QuickBooks Online connection included',
      '500 text credits + 500 marketing emails/month',
      '250 AI Intake + 50 AI writing drafts/month',
      '100 domestic forwarding/voicemail minutes/month',
      'AI Voice Receptionist coming soon',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    audience: 'Growing office + field team',
    promise: 'Add your team and automate the busywork',
    monthly: BILLING_PLANS.growth.monthlyPriceCents / 100,
    annualMonthly: BILLING_PLANS.growth.annualPriceCents / 12 / 100,
    paymentFeePct: platformFeePercent('growth'),
    fit: 'Best for growing teams that need more people and capacity.',
    featured: true,
    officeUsers: BILLING_PLANS.growth.allowances.officeUsers,
    crewUsers: BILLING_PLANS.growth.allowances.crewUsers,
    textCredits: '1,500/month',
    messagingSummary: '1,500 text credits/month · shared LGQ number',
    forwardingMinutes: BILLING_PLANS.growth.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.growth.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.growth.voice.concurrentCalls,
    features: [
      'Unlimited core records and standard quote forms',
      '5 office users + 10 crew users',
      '1 custom-domain connection',
      'Dedicated business number coming soon',
      'QuickBooks Online connection included',
      '1,500 text credits + 2,500 marketing emails/month',
      '500 AI Intake + 250 AI writing drafts/month',
      '100 domestic forwarding/voicemail minutes/month',
      'AI Voice Receptionist coming soon',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    audience: 'High-volume contractor',
    promise: 'Minimize the LGQ platform fee and upgrade call handling',
    monthly: BILLING_PLANS.scale.monthlyPriceCents / 100,
    annualMonthly: BILLING_PLANS.scale.annualPriceCents / 12 / 100,
    paymentFeePct: platformFeePercent('scale'),
    fit: 'Best when a 0.1% LGQ platform fee and advanced AI call handling save you money.',
    featured: false,
    officeUsers: BILLING_PLANS.scale.allowances.officeUsers,
    crewUsers: BILLING_PLANS.scale.allowances.crewUsers,
    textCredits: '3,000/month',
    messagingSummary: '3,000 text credits/month · shared LGQ number',
    forwardingMinutes: BILLING_PLANS.scale.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.scale.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.scale.voice.concurrentCalls,
    features: [
      'The highest team, messaging, AI, and storage capacity',
      '0.1% LGQ platform fee',
      'AI Voice Receptionist coming soon',
      'Highest AI Voice Receptionist capacity when it launches',
      '15 office users + 50 crew users',
      '90-day AI Voice Receptionist call history at launch',
      '1 custom-domain connection',
      'Dedicated business number coming soon',
      '3,000 text credits + 5,000 marketing emails/month',
      '1,000 AI Intake + 500 AI writing drafts/month',
      '250 GB file and photo storage',
      'QuickBooks Online connection included',
      'Extra usage is opt-in through top-ups you choose',
    ],
  },
] as const;

/**
 * Whether AI Voice Receptionist can be bought today. It cannot.
 *
 * The price book is settled -- $69 Flex, $59 Solo, $55 Growth, included on
 * Scale, plus a $35 hundred-minute top-up and $0.35 approved overage -- and
 * `VOICE_MONTHLY_BY_PLAN` below still carries those numbers, because they are
 * correct and will be needed. What is false is that any of it is purchasable:
 * there is no provisioning, no usage ledger, no checkout SKU and no agent.
 *
 * So this is ONE constant rather than copy edited in a dozen places. While it is
 * false the page captures demand and promises nothing: no voice money in the
 * calculator, none in the plan crossover, no `voice=1` on a signup link, and no
 * claim that Scale includes it today. Flipping it to true, restoring the toggle
 * and putting the prices back is the launch change, and it is meant to be small.
 *
 * See docs/ai-voice-v1-decisions.md section 10 for what must be true first.
 */
export const VOICE_PURCHASABLE = false;

/** What the page may say about price while `VOICE_PURCHASABLE` is false. */
export const VOICE_PLANNED_PRICE_LABEL = 'Planned launch pricing from $55/month';

export const VOICE_MONTHLY_BY_PLAN: Record<PlanId, number> = {
  flex: BILLING_PLANS.flex.voice.monthlyPriceCents / 100,
  solo: BILLING_PLANS.solo.voice.monthlyPriceCents / 100,
  growth: BILLING_PLANS.growth.voice.monthlyPriceCents / 100,
  scale: BILLING_PLANS.scale.voice.monthlyPriceCents / 100,
};

export const COMPARISON_ROWS = [
  ['LGQ platform fee', '1.25%', '0.50%', '0.25%', '0.1%'],
  ['Leads, clients, quotes, jobs & invoices', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Standard quote-form submissions', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Lead capture after AI limit', 'Automatic standard form', 'Automatic standard form', 'Automatic standard form', 'Automatic standard form'],
  ['Office / admin users', '1', '1', '5', '15'],
  ['Crew-only users', '2', '2', '10', '50'],
  ['Operating locations for one legal business', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Custom-domain connections', '1', '1', '1', '1'],
  ['Business number', 'Shared LGQ texting number', 'Coming soon', 'Coming soon', 'Coming soon'],
  ['Basic call forwarding & voicemail', 'With AI Voice Receptionist at launch', '100 min/month', '100 min/month', '200 min/month'],
  ['Text credits', '50 one-time starter credits', '500/month', '1,500/month', '3,000/month'],
  ['Marketing email sends', '100 one-time starter sends', '500/month', '2,500/month', '5,000/month'],
  ['Transactional emails', 'Unlimited (fair use)', 'Unlimited (fair use)', 'Unlimited (fair use)', 'Unlimited (fair use)'],
  ['AI Intake credits', '30 one-time starter credits', '250/month', '500/month', '1,000/month'],
  ['AI writing drafts', '25 one-time starter drafts', '50/month', '250/month', '500/month'],
  ['File & photo storage', '5 GB', '10 GB', '100 GB', '250 GB'],
  ['QuickBooks Online', '1 connection included', '1 connection included', '1 connection included', '1 connection included'],
  ['AI Voice Receptionist', 'Coming soon', 'Coming soon', 'Coming soon', 'Coming soon'],
  ['Simultaneous AI Voice Receptionist calls', 'At launch: 1', 'At launch: 1', 'At launch: 1', 'At launch: 3'],
  ['AI Voice Receptionist routing', 'At launch: Standard', 'At launch: Standard', 'At launch: Standard', 'At launch: Advanced'],
  ['AI Voice Receptionist call history', 'At launch: 30 days', 'At launch: 30 days', 'At launch: 30 days', 'At launch: 90 days'],
  // Every plan answers this the same way, and that is the honest row. The Scale
  // column used to promise "enabled overages with a spending cap", which is a
  // mechanism that does not exist anywhere in the product -- see the FAQ below.
  ['Usage beyond included limits', 'Approved top-ups', 'Approved top-ups', 'Approved top-ups', 'Approved top-ups'],
  ['Free onboarding + quick tour', 'Included', 'Included', 'Included', 'Included'],
] as const;

/**
 * A PRICE IS A PROMISE, so only the SKUs that can actually be bought carry one.
 *
 * Seven of the twelve top-ups are withheld -- both purchase paths refuse them by
 * SKU, and the dashboard's own picker is built from SELLABLE_TOP_UP_IDS -- so
 * this page was quoting "$15/month" for an office user that no signed-in
 * contractor has ever been able to buy, and $69/month for an AI receptionist the
 * comparison table three inches above already calls "Coming soon".
 *
 * They stay listed, because a roadmap is worth showing and the user asked for
 * exactly this treatment on AI Voice. They are not priced, and the buyable ones
 * come first: a list that opens with four things you cannot have reads as a
 * product that is not ready.
 */
export const ADD_ONS = Object.values(TOP_UPS)
  .map((topUp) => {
    const available = !(topUp.id in TOP_UPS_WITHHELD);
    return {
      label: topUp.label,
      price: available
        ? `${formatUsdFromCents(topUp.priceCents)}${topUp.recurring ? '/month' : ''}`
        : 'Coming soon',
      eligibility: topUp.eligibilityLabel,
      available,
    };
  })
  .sort((a, b) => Number(b.available) - Number(a.available));

export const PRICING_FAQS = [
  {
    q: 'How does Flex starter usage work?',
    a: 'Flex includes one-time starter balances of 50 text credits, 100 marketing email sends, 30 AI Intake credits, and 25 AI writing drafts. They are issued once per verified business, remain available until used, and do not reset monthly or replenish when you collect a payment. Buy an optional top-up or move to Solo when you need more.',
  },
  {
    q: 'What happens when AI Intake credits run out?',
    a: 'LGQ automatically switches new website visitors to the normal quote form at no charge. The standard form remains unlimited and creates the same lead and notifications without using AI credits.',
  },
  {
    q: 'What counts as one AI Intake credit?',
    a: 'One credit covers one deduplicated lead thread for 24 hours, beginning with the first meaningful AI response and subject to published turn and size safety limits. Blocked spam and provider failures before a meaningful response do not use a credit.',
  },
  {
    q: 'What does the LGQ platform fee apply to?',
    a: 'The fee applies only to the discount-adjusted service subtotal successfully collected through LGQ: the job-related labor, materials, equipment, and service-charge line items on the invoice. Separately stated sales tax, tips, Stripe fees, refunds, and credits are excluded. Deposits and installments allocate that eligible subtotal proportionally.',
  },
  {
    q: 'Are Stripe processing fees included?',
    a: 'No. Stripe processing and payment-infrastructure costs are separate and are paid by the contractor. LGQ plan and platform-fee prices do not include them.',
  },
  {
    q: 'Do annual plans receive their usage only once a year?',
    a: 'No. Annual billing changes when the subscription is paid, not when usage renews. Included paid-plan allowances still reset monthly and do not roll over.',
  },
  {
    q: 'How are text credits counted?',
    a: 'One text credit equals one carrier SMS segment. Long or Unicode messages can use more than one segment. Incoming replies do not consume the customer text balance, subject to fair-use and anti-abuse controls.',
  },
  {
    q: 'Do purchased credits expire?',
    a: 'Purchased credits remain until used while the workspace exists and stay in a separate wallet from promotional and monthly plan balances. They survive plan changes and archival; reactivating Flex does not issue new starter credits.',
  },
  {
    q: 'Can LGQ charge an overage automatically?',
    a: 'No. There is no automatic overage and no setting that turns one on, so nothing can bill past your plan without you buying it. Extra capacity is a top-up you choose — some one-time, some monthly — at a price you see before you pay.',
  },
  {
    q: 'When will I get my own business number?',
    a: 'Not yet. Every workspace texts from a shared Let’s Get Quoted number today, on Flex and on the paid plans alike. Your own number is planned for Solo, Growth, and Scale and is not available to buy or provision — US carriers require each business to be registered before it can send, and that process is not open yet. At launch the plan is that the included number supports two-way texting, domestic call forwarding, and voicemail.',
  },
  {
    q: 'Can I add another business phone line?',
    a: 'Not yet, and neither is the first one — see above. Extra lines are planned for Solo, Growth, Scale, and Enterprise after carrier review. They would share the workspace’s text, voice, and concurrency allowances rather than creating another workspace or another set of plan credits, and any price would be shown for approval before activation.',
  },
  {
    q: 'What will happen when the AI Voice Receptionist reaches its limit during a call?',
    a: 'AI Voice Receptionist is not available yet, so nothing today consumes voice minutes. At launch the plan is that an active call may finish its current interaction and transfer or fall back, with up to 15 grace minutes and a 60-minute total-call safety cap. New calls would then follow your forwarding or voicemail rule unless you explicitly enabled paid extra minutes.',
  },
  {
    q: 'When do plan changes take effect?',
    a: 'A paid upgrade takes effect after successful prorated payment and raises the current month’s limits without resetting usage already consumed. The lower LGQ platform fee applies only to customer payment charges created after the upgrade. A downgrade takes effect at renewal.',
  },
  {
    q: 'What is the annual-plan guarantee?',
    a: 'Once per verified business, the first annual base plan may be converted within 30 days. The refund is the annual prepayment minus one normal month-to-month base charge. LGQ platform fees are not recalculated retroactively, and consumed add-ons, AI Voice Receptionist or carrier costs, Stripe fees, taxes, and custom work are excluded.',
  },
  {
    q: 'What happens to an inactive Flex workspace?',
    a: 'After 12 inactive months and advance notice, LGQ may pause background services and move the workspace to low-cost archive. Your data and purchased credits remain, reactivation is free, and one-time starter credits are not issued again.',
  },
  {
    q: 'What happens after a refund or lost payment dispute?',
    a: 'A settled refund or lost dispute receives a proportional LGQ-fee reversal at the original plan rate. Stripe processing, dispute, Connect, payout, and negative-balance costs remain the contractor’s responsibility.',
  },
] as const;

export const ENTERPRISE = {
  startingMonthly: ENTERPRISE_PRICING.startingMonthlyCents / 100,
  includedWorkspaces: ENTERPRISE_PRICING.includedWorkspaces,
  fullScaleDuoMonthly: ENTERPRISE_PRICING.fullScaleDuoMonthlyCents / 100,
} as const;

export function annualFixedCost(plan: PricingPlan, billing: BillingCycle, includeVoice: boolean): number {
  const subscription = plan.id === 'flex' ? 0 : (billing === 'annual' ? plan.annualMonthly : plan.monthly) * 12;
  return subscription + (includeVoice ? VOICE_MONTHLY_BY_PLAN[plan.id] * 12 : 0);
}

export function annualPlanCost(
  plan: PricingPlan,
  billing: BillingCycle,
  annualEligibleServiceSubtotal: number,
  includeVoice: boolean,
): number {
  const safeSubtotal = Number.isFinite(annualEligibleServiceSubtotal)
    ? Math.max(0, annualEligibleServiceSubtotal)
    : 0;
  return annualFixedCost(plan, billing, includeVoice) + safeSubtotal * (plan.paymentFeePct / 100);
}

export function annualPlanEstimate(
  plan: PricingPlan,
  billing: BillingCycle,
  annualEligibleServiceSubtotal: number,
  includeVoice: boolean,
  officeUsers: number,
  needsDedicatedNumber: boolean,
): number | null {
  const requestedOfficeUsers = Number.isFinite(officeUsers) ? Math.max(1, Math.round(officeUsers)) : 1;
  if (plan.id === 'flex' && (requestedOfficeUsers > plan.officeUsers || needsDedicatedNumber)) return null;

  const extraOfficeUsers = Math.max(0, requestedOfficeUsers - plan.officeUsers);
  const annualOfficeUserCost = extraOfficeUsers * OFFICE_USER_ADD_ON_MONTHLY * 12;
  return annualPlanCost(plan, billing, annualEligibleServiceSubtotal, includeVoice) + annualOfficeUserCost;
}

export function planCrossover(
  lower: PricingPlan,
  higher: PricingPlan,
  billing: BillingCycle,
  includeVoice: boolean,
): number {
  const feeDifference = (lower.paymentFeePct - higher.paymentFeePct) / 100;
  if (feeDifference <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (annualFixedCost(higher, billing, includeVoice) - annualFixedCost(lower, billing, includeVoice)) / feeDifference);
}
