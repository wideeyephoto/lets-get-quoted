export type BillingCycle = 'monthly' | 'annual';
export type PlanId = 'flex' | 'solo' | 'growth' | 'scale';

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

export const PRICING_CATALOG_VERSION = '2026-08-15-preview';

export const PLANS: readonly PricingPlan[] = [
  {
    id: 'flex',
    name: 'Flex',
    audience: 'New, part-time, or seasonal',
    promise: 'Start without another monthly bill',
    monthly: 0,
    annualMonthly: 0,
    paymentFeePct: 1.25,
    fit: 'Best for getting started with no fixed software bill.',
    featured: false,
    officeUsers: 1,
    crewUsers: 2,
    textCredits: '50 one-time starter credits',
    messagingSummary: '50 starter text credits · shared LGQ number',
    forwardingMinutes: 0,
    voiceMinutes: 100,
    voiceConcurrentCalls: 1,
    features: [
      'Unlimited core records and standard quote forms',
      '1 office user + 2 crew users',
      '1 custom-domain connection',
      'Shared LGQ texting number',
      'QuickBooks Online connection included',
      '50 text + 30 AI Intake one-time starter credits',
      '100 marketing emails + 25 AI writing drafts to start',
      'No automatic refills; optional paid top-ups',
      'AI Voice Receptionist available for $69/month',
    ],
  },
  {
    id: 'solo',
    name: 'Solo',
    audience: 'Owner-operator',
    promise: 'Your own number and a lower payment fee',
    monthly: 39,
    annualMonthly: 35,
    paymentFeePct: 0.5,
    fit: 'Best for owner-operators ready for their own business line.',
    featured: false,
    officeUsers: 1,
    crewUsers: 2,
    textCredits: '500/month',
    messagingSummary: '500 text credits/month · dedicated number',
    forwardingMinutes: 100,
    voiceMinutes: 100,
    voiceConcurrentCalls: 1,
    features: [
      'Unlimited core records and standard quote forms',
      '1 office user + 2 crew users',
      '1 custom-domain connection',
      '1 dedicated voice/text business number',
      'QuickBooks Online connection included',
      '500 text credits + 500 marketing emails/month',
      '250 AI Intake + 50 AI writing drafts/month',
      '100 domestic forwarding/voicemail minutes/month',
      'AI Voice Receptionist available for $59/month',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    audience: 'Growing office + field team',
    promise: 'Add your team and automate the busywork',
    monthly: 129,
    annualMonthly: 99,
    paymentFeePct: 0.25,
    fit: 'Best for growing teams that need more people and capacity.',
    featured: true,
    officeUsers: 5,
    crewUsers: 10,
    textCredits: '1,500/month',
    messagingSummary: '1,500 text credits/month · dedicated number',
    forwardingMinutes: 100,
    voiceMinutes: 200,
    voiceConcurrentCalls: 1,
    features: [
      'Unlimited core records and standard quote forms',
      '5 office users + 10 crew users',
      '1 custom-domain connection',
      '1 dedicated voice/text business number',
      'QuickBooks Online connection included',
      '1,500 text credits + 2,500 marketing emails/month',
      '500 AI Intake + 250 AI writing drafts/month',
      '100 domestic forwarding/voicemail minutes/month',
      'AI Voice Receptionist available for $55/month',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    audience: 'High-volume contractor',
    promise: 'Remove the LGQ fee and upgrade call handling',
    monthly: 329,
    annualMonthly: 299,
    paymentFeePct: 0,
    fit: 'Best when a 0% LGQ fee and advanced AI call handling save you money.',
    featured: false,
    officeUsers: 5,
    crewUsers: 10,
    textCredits: '1,500/month',
    messagingSummary: '1,500 text credits/month · dedicated number',
    forwardingMinutes: 100,
    voiceMinutes: 100,
    voiceConcurrentCalls: 3,
    features: [
      'Growth-level team, messaging, AI Intake, and storage capacity',
      '0% LGQ payment fee',
      'AI Voice Receptionist included with 100 minutes',
      '3 simultaneous AI calls + advanced routing',
      '5 office users + 10 crew users',
      '90-day AI Voice Receptionist call history',
      '1 custom-domain connection',
      '1 dedicated voice/text business number',
      '1,500 text credits + 2,500 marketing emails/month',
      '500 AI Intake + 250 AI writing drafts/month',
      '100 GB file and photo storage',
      'QuickBooks Online connection included',
      'Extra usage is opt-in through top-ups or a spending cap',
    ],
  },
] as const;

export const VOICE_MONTHLY_BY_PLAN: Record<PlanId, number> = {
  flex: 69,
  solo: 59,
  growth: 55,
  scale: 0,
};

export const COMPARISON_ROWS = [
  ['LGQ payment fee', '1.25%', '0.50%', '0.25%', '0%'],
  ['Leads, clients, quotes, jobs & invoices', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Standard quote-form submissions', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Lead capture after AI limit', 'Automatic standard form', 'Automatic standard form', 'Automatic standard form', 'Automatic standard form'],
  ['Office / admin users', '1', '1', '5', '5'],
  ['Crew-only users', '2', '2', '10', '10'],
  ['Operating locations for one legal business', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Custom-domain connections', '1', '1', '1', '1'],
  ['Business number', 'Shared LGQ texting number', '1 dedicated voice/text number', '1 dedicated voice/text number', '1 dedicated voice/text number'],
  ['Basic call forwarding & voicemail', 'With active AI Voice Receptionist', '100 min/month', '100 min/month', '100 min/month'],
  ['Text credits', '50 one-time starter credits', '500/month', '1,500/month', '1,500/month'],
  ['Marketing email sends', '100 one-time starter sends', '500/month', '2,500/month', '2,500/month'],
  ['Transactional emails', 'Unlimited (fair use)', 'Unlimited (fair use)', 'Unlimited (fair use)', 'Unlimited (fair use)'],
  ['AI Intake credits', '30 one-time starter credits', '250/month', '500/month', '500/month'],
  ['AI writing drafts', '25 one-time starter drafts', '50/month', '250/month', '250/month'],
  ['File & photo storage', '5 GB', '10 GB', '100 GB', '100 GB'],
  ['QuickBooks Online', '1 connection included', '1 connection included', '1 connection included', '1 connection included'],
  ['AI Voice Receptionist', '$69 add-on / 100 min', '$59 add-on / 100 min', '$55 add-on / 200 min', 'Included / 100 min'],
  ['Simultaneous AI Voice Receptionist calls', '1', '1', '1', '3'],
  ['AI Voice Receptionist routing', 'Standard', 'Standard', 'Standard', 'Advanced'],
  ['AI Voice Receptionist call history', '30 days', '30 days', '30 days', '90 days'],
  ['Usage beyond included limits', 'Approved top-ups', 'Approved top-ups', 'Approved top-ups', 'Top-ups or enabled overages with a spending cap'],
  ['Free onboarding + quick tour', 'Included', 'Included', 'Included', 'Included'],
] as const;

export const ADD_ONS = [
  { label: 'Flex: 250 text-credit top-up', price: '$12', eligibility: 'Flex' },
  { label: '1,000 text credits', price: '$42', eligibility: 'All plans' },
  { label: '5,000 marketing emails', price: '$17', eligibility: 'All plans' },
  { label: '100 AI Intake credits', price: '$15', eligibility: 'All plans' },
  { label: '250 AI writing drafts', price: '$19', eligibility: 'All plans' },
  { label: '100 GB storage', price: '$15/month', eligibility: 'All plans' },
  { label: 'Office user', price: '$15/month', eligibility: 'Solo+' },
  { label: 'Crew user', price: '$5/month', eligibility: 'Solo+' },
] as const;

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
    q: 'What does the LGQ payment fee apply to?',
    a: 'The fee applies only to the discount-adjusted service subtotal successfully collected through LGQ: the job-related labor, materials, equipment, and service-charge line items on the invoice. Separately stated sales tax, tips, Stripe fees, refunds, and credits are excluded. Deposits and installments allocate that eligible subtotal proportionally.',
  },
  {
    q: 'Are Stripe processing fees included?',
    a: 'No. Stripe processing and payment-infrastructure costs are separate and are paid by the contractor. LGQ plan and payment-fee prices do not include them.',
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
    a: 'Not without approval. Extra capacity requires a one-time top-up or an overage setting you deliberately enable with a spending cap.',
  },
  {
    q: 'What does a dedicated business number do without the AI Voice Receptionist?',
    a: 'The included Solo, Growth, and Scale number supports two-way texting, domestic call forwarding, and voicemail. Text credits and voice-minute rules still apply.',
  },
  {
    q: 'Can I add another business phone line?',
    a: 'Extra lines are available on Solo, Growth, Scale, and Enterprise after carrier review. They share the workspace’s text, voice, and concurrency allowances and do not create another workspace or another set of plan credits. The price is shown for approval before activation.',
  },
  {
    q: 'What happens when the AI Voice Receptionist reaches its limit during a call?',
    a: 'The active call may finish its current interaction and transfer or fall back, with up to 15 grace minutes and a 60-minute total-call safety cap. New calls then follow your forwarding or voicemail rule unless you explicitly enabled paid extra minutes.',
  },
  {
    q: 'When do plan changes take effect?',
    a: 'A paid upgrade takes effect after successful prorated payment and raises the current month’s limits without resetting usage already consumed. The lower LGQ fee applies only to customer payment charges created after the upgrade. A downgrade takes effect at renewal.',
  },
  {
    q: 'What is the annual-plan guarantee?',
    a: 'Once per verified business, the first annual base plan may be converted within 30 days. The refund is the annual prepayment minus one normal month-to-month base charge. LGQ payment fees are not recalculated retroactively, and consumed add-ons, AI Voice Receptionist or carrier costs, Stripe fees, taxes, and custom work are excluded.',
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
  startingMonthly: 799,
  includedWorkspaces: 2,
  fullScaleDuoMonthly: 1099,
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
