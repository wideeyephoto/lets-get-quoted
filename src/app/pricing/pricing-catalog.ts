import {
  BILLING_PLANS,
  ENTERPRISE_PRICING,
  PRICING_CATALOG_VERSION,
  SELLABLE_TOP_UP_IDS,
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
  allowanceCadence: 'one_time' | 'monthly';
  marketingEmailSends: number;
  aiCredits: number;
  storageGb: number;
  messagingSummary: string;
  forwardingMinutes: number;
  voiceMinutes: number;
  voiceConcurrentCalls: number;
  features: readonly string[];
};

export const OFFICE_USER_ADD_ON_MONTHLY = 15;
export const CREW_USER_ADD_ON_MONTHLY = TOP_UPS.crew_user.priceCents / 100;
export const CREW_USER_ADD_ON_AVAILABLE = SELLABLE_TOP_UP_IDS.includes('crew_user');
export const CREW_USER_ADD_ON_ELIGIBLE_PLANS = TOP_UPS.crew_user.eligiblePlans;

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
    allowanceCadence: BILLING_PLANS.flex.allowances.cadence,
    marketingEmailSends: BILLING_PLANS.flex.allowances.marketingEmailSends,
    aiCredits: BILLING_PLANS.flex.allowances.aiIntakeCredits + BILLING_PLANS.flex.allowances.aiWritingDrafts,
    storageGb: BILLING_PLANS.flex.allowances.storageGb,
    messagingSummary: '50 starter text credits · dedicated number after carrier approval',
    forwardingMinutes: BILLING_PLANS.flex.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.flex.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.flex.voice.concurrentCalls,
    features: [
      'Unlimited core records and standard quote forms',
      '1 office user + 2 crew users',
      '1 custom-domain connection',
      '2-way business texting (requires carrier registration & number)',
      'QuickBooks Online connection included',
      '50 text credits + 100 marketing emails to start',
      '55 AI starter credits (Smart Intake & writing drafts)',
      'No automatic refills; optional paid top-ups',
    ],
  },
  {
    id: 'solo',
    name: 'Solo',
    audience: 'Owner-operator',
    promise: 'A lower platform fee and automated 2-way messaging',
    monthly: BILLING_PLANS.solo.monthlyPriceCents / 100,
    annualMonthly: BILLING_PLANS.solo.annualPriceCents / 12 / 100,
    paymentFeePct: platformFeePercent('solo'),
    fit: 'Best for owner-operators ready for automated intake and messaging.',
    featured: false,
    officeUsers: BILLING_PLANS.solo.allowances.officeUsers,
    crewUsers: BILLING_PLANS.solo.allowances.crewUsers,
    textCredits: '500/month',
    allowanceCadence: BILLING_PLANS.solo.allowances.cadence,
    marketingEmailSends: BILLING_PLANS.solo.allowances.marketingEmailSends,
    aiCredits: BILLING_PLANS.solo.allowances.aiIntakeCredits + BILLING_PLANS.solo.allowances.aiWritingDrafts,
    storageGb: BILLING_PLANS.solo.allowances.storageGb,
    messagingSummary: '500 text credits/month · dedicated number after carrier approval',
    forwardingMinutes: BILLING_PLANS.solo.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.solo.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.solo.voice.concurrentCalls,
    features: [
      'Unlimited core records and standard quote forms',
      '2 office users + 2 crew users',
      '1 custom-domain connection',
      '2-way business texting (requires carrier registration & number)',
      'QuickBooks Online connection included',
      '500 text credits + 500 marketing emails/month',
      '300 AI credits/month (Smart Intake & quote drafts)',
      '100 domestic forwarding/voicemail minutes/month',
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
    allowanceCadence: BILLING_PLANS.growth.allowances.cadence,
    marketingEmailSends: BILLING_PLANS.growth.allowances.marketingEmailSends,
    aiCredits: BILLING_PLANS.growth.allowances.aiIntakeCredits + BILLING_PLANS.growth.allowances.aiWritingDrafts,
    storageGb: BILLING_PLANS.growth.allowances.storageGb,
    messagingSummary: '1,500 text credits/month · dedicated number after carrier approval',
    forwardingMinutes: BILLING_PLANS.growth.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.growth.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.growth.voice.concurrentCalls,
    features: [
      'Unlimited core records and standard quote forms',
      '5 office users + 10 crew users',
      '1 custom-domain connection',
      '2-way business texting (requires carrier registration & number)',
      'QuickBooks Online connection included',
      '1,500 text credits + 2,500 marketing emails/month',
      '750 AI credits/month (Smart Intake & quote drafts)',
      '100 domestic forwarding/voicemail minutes/month',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    audience: 'High-volume contractor',
    promise: 'Minimize the LGQ platform fee and maximize team capacity',
    monthly: BILLING_PLANS.scale.monthlyPriceCents / 100,
    annualMonthly: BILLING_PLANS.scale.annualPriceCents / 12 / 100,
    paymentFeePct: platformFeePercent('scale'),
    fit: 'Best when a 0.1% LGQ platform fee and high-capacity dispatch save you money.',
    featured: false,
    officeUsers: BILLING_PLANS.scale.allowances.officeUsers,
    crewUsers: BILLING_PLANS.scale.allowances.crewUsers,
    textCredits: '3,000/month',
    allowanceCadence: BILLING_PLANS.scale.allowances.cadence,
    marketingEmailSends: BILLING_PLANS.scale.allowances.marketingEmailSends,
    aiCredits: BILLING_PLANS.scale.allowances.aiIntakeCredits + BILLING_PLANS.scale.allowances.aiWritingDrafts,
    storageGb: BILLING_PLANS.scale.allowances.storageGb,
    messagingSummary: '3,000 text credits/month · dedicated number after carrier approval',
    forwardingMinutes: BILLING_PLANS.scale.allowances.forwardingMinutes,
    voiceMinutes: BILLING_PLANS.scale.voice.includedMinutes,
    voiceConcurrentCalls: BILLING_PLANS.scale.voice.concurrentCalls,
    features: [
      'The highest team, messaging, AI, and storage capacity',
      '0.1% LGQ platform fee',
      '15 office users + 50 crew users',
      '1 custom-domain connection',
      '2-way business texting (requires carrier registration & number)',
      '3,000 text credits + 5,000 marketing emails/month',
      '1,500 AI credits/month (Smart Intake & quote drafts)',
      '250 GB file and photo storage',
      'QuickBooks Online connection included',
      'Extra usage is opt-in through top-ups you choose',
    ],
  },
] as const;

export const VOICE_PURCHASABLE = false;

export const VOICE_PLANNED_PRICE_LABEL = 'Launch pricing from $55/month';

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
  ['Office / admin users', '1', '2', '5', '15'],
  ['Crew-only users', '2', '2', '10', '50'],
  ['Operating locations for one legal business', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Custom-domain connections', '1', '1', '1', '1'],
  ['Business number', 'Dedicated number (carrier registration required)', 'Dedicated number (carrier registration required)', 'Dedicated number (carrier registration required)', 'Dedicated number (carrier registration required)'],
  ['Basic call forwarding & voicemail', 'Standard routing', '100 min/month', '100 min/month', '200 min/month'],
  ['AI calls answered at once', '1 with add-on', '1 with add-on', '1 with add-on', '3 included'],
  ['When all AI call slots are busy', 'Forward normally', 'Forward normally', 'Forward normally', 'Forward normally'],
  ['Text credits', '50 one-time starter credits', '500/month', '1,500/month', '3,000/month'],
  ['Marketing email sends', '100 one-time starter sends', '500/month', '2,500/month', '5,000/month'],
  ['Transactional emails', 'Unlimited (fair use)', 'Unlimited (fair use)', 'Unlimited (fair use)', 'Unlimited (fair use)'],
  ['AI credits', '55 one-time starter credits', '300/month', '750/month', '1,500/month'],
  ['File & photo storage', '5 GB', '10 GB', '100 GB', '250 GB'],
  ['QuickBooks Online', '1 connection included', '1 connection included', '1 connection included', '1 connection included'],
  ['Usage beyond included limits', 'Top-ups, or opt-in extra usage with a limit you set', 'Top-ups, or opt-in extra usage with a limit you set', 'Top-ups, or opt-in extra usage with a limit you set', 'Top-ups, or opt-in extra usage with a limit you set'],
  ['Free onboarding + quick tour', 'Included', 'Included', 'Included', 'Included'],
] as const;

export const ADD_ONS = Object.values(TOP_UPS)
  .filter((topUp) => !(topUp.id in TOP_UPS_WITHHELD) && topUp.id !== 'ai_intake_100')
  .map((topUp) => {
    const isAi = topUp.id === 'ai_writing_250';
    return {
      label: isAi ? '250 AI credits' : topUp.label,
      price: `${formatUsdFromCents(topUp.priceCents)}${topUp.recurring ? '/month' : ''}`,
      eligibility: topUp.eligibilityLabel,
      available: true,
    };
  });

export const PRICING_FAQS = [
  {
    q: 'How does 2-way business texting work?',
    a: '2-way business texting requires carrier vetting (10DLC registration) with a dedicated business phone number. Messaging software tools and your plan’s included text credits become active after carrier approval. Carrier registration, campaign vetting, and dedicated number lease fees are separate.',
  },
  {
    q: 'Is AI Voice Receptionist & Field Assistant available?',
    a: 'AI Voice Receptionist is coming soon (in preview rollout) while carrier line routing and dedicated voice numbers complete final validation. Web-based 24/7 Smart Intake, instant quote generation, automated SMS dispatch, and multi-tier estimate workflows are fully live across all accounts today. Dedicated business lines and AI call answering add-ons become active as carrier 10DLC registrations are verified.',
  },
  {
    q: 'Can the AI receptionist answer multiple calls at once?',
    a: 'Flex, Solo, and Growth support one AI-handled call at a time. Scale supports three. When every AI call slot is occupied, additional callers are sent to your normal forwarding number. If no forwarding number is configured, they hear that the line is unavailable.',
  },
  {
    q: 'How does Flex starter usage work?',
    a: 'Flex includes one-time starter balances of 50 text credits, 100 marketing email sends, and 55 AI credits (for Smart Intake and AI writing drafts). They are issued once per verified business, remain available until used, and do not reset monthly or replenish when you collect a payment. Buy an optional top-up or move to Solo when you need more.',
  },
  {
    q: 'What happens when AI credits run out?',
    a: 'LGQ automatically switches new website visitors to the normal quote form at no charge. The standard form remains unlimited and creates the same lead and notifications without using AI credits.',
  },
  {
    q: 'What counts as one AI credit?',
    a: 'AI credits cover both 24/7 Smart Intake lead threads and AI writing drafts (like quote descriptions, review replies, and messages). For Smart Intake, one credit covers one deduplicated lead thread for 24 hours. For AI writing, one credit generates one draft. Blocked spam and provider failures do not consume credits.',
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
    a: 'Only if you switch it on and set a spending limit yourself. Extra usage is off by default, and with it off nothing can bill past your plan — sends and drafts are refused instead. If you do switch it on, you agree to the per-unit rates shown at the time and set a hard limit; nothing is ever charged beyond that limit, and you can lower it or switch it off whenever you like. The other way to add capacity is a top-up you buy outright, at a price you see before you pay.',
  },
  {
    q: 'When do plan changes take effect?',
    a: 'A paid upgrade takes effect after successful prorated payment and raises the current month’s limits without resetting usage already consumed. The lower LGQ platform fee applies only to customer payment charges created after the upgrade. A downgrade takes effect at renewal.',
  },
  {
    q: 'What is the annual-plan guarantee?',
    a: 'Once per verified business, the first annual base plan may be converted within 30 days. The refund is the annual prepayment minus one normal month-to-month base charge. LGQ platform fees are not recalculated retroactively, and consumed add-ons, carrier costs, Stripe fees, taxes, and custom work are excluded.',
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

export type CompetitorBenchmark = {
  id: string;
  name: string;
  category: string;
  monthlyBase: number;
  perUserMonthly: number;
  includedUsers: number;
  leadFeeAvg: number;
  notes: string;
};

export const COMPETITOR_BENCHMARKS: readonly CompetitorBenchmark[] = [
  {
    id: 'jobber',
    name: 'Jobber (Connect / Grow)',
    category: 'Legacy Field Software',
    monthlyBase: 169,
    perUserMonthly: 29,
    includedUsers: 1,
    leadFeeAvg: 0,
    notes: '$169/mo base + $29/mo per extra seat. Subscription billed every month even in slow seasons.',
  },
  {
    id: 'housecall',
    name: 'Housecall Pro (Essential)',
    category: 'Legacy Field Software',
    monthlyBase: 189,
    perUserMonthly: 35,
    includedUsers: 1,
    leadFeeAvg: 0,
    notes: '$189/mo base + $35/mo per extra user. Marketing, AI and SMS tools sold as separate add-ons.',
  },
  {
    id: 'servicetitan',
    name: 'ServiceTitan',
    category: 'Enterprise HVAC & Plumbing',
    monthlyBase: 350,
    perUserMonthly: 125,
    includedUsers: 1,
    leadFeeAvg: 0,
    notes: 'High per-technician monthly cost ($250–$400+/mo) plus thousands in required upfront implementation.',
  },
  {
    id: 'leadbrokers',
    name: 'Angi / Thumbtack Shared Leads',
    category: 'Shared Lead Brokers',
    monthlyBase: 0,
    perUserMonthly: 0,
    includedUsers: 1,
    leadFeeAvg: 75,
    notes: 'You pay $50–$120 for shared leads sent simultaneously to 4–5 other contractors.',
  },
] as const;

export function estimateCompetitorAnnualCost(
  competitor: CompetitorBenchmark,
  officeUsers: number,
  monthlyLeads: number = 0,
): number {
  const users = Math.max(1, officeUsers);
  const extraUsers = Math.max(0, users - competitor.includedUsers);
  const annualSoftware = (competitor.monthlyBase + extraUsers * competitor.perUserMonthly) * 12;
  const annualLeads = Math.max(0, monthlyLeads) * competitor.leadFeeAvg * 12;
  return annualSoftware + annualLeads;
}

