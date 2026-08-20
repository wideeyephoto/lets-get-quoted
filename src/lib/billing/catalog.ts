/**
 * Canonical LGQ pricing and entitlement catalog.
 *
 * This module is intentionally pure: it is safe to import from client UI,
 * server routes, Stripe code, migrations/tests, and background jobs. Money is
 * stored in integer cents and percentage fees in basis points so the public
 * page and the payment engine cannot drift through floating-point constants.
 */

export const PRICING_CATALOG_VERSION = '2026-08-18-preview' as const;

export const BILLING_PLAN_IDS = ['flex', 'solo', 'growth', 'scale'] as const;
export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];
export type BillingCycle = 'monthly' | 'annual';
export type AllowanceCadence = 'one_time' | 'monthly';

export type PlanAllowances = {
  cadence: AllowanceCadence;
  officeUsers: number;
  crewUsers: number;
  customDomainConnections: number;
  dedicatedBusinessNumbers: number;
  textCredits: number;
  marketingEmailSends: number;
  aiIntakeCredits: number;
  aiWritingDrafts: number;
  storageGb: number;
  forwardingMinutes: number;
};

export type VoiceOffering = {
  monthlyPriceCents: number;
  includedMinutes: number;
  concurrentCalls: number;
  historyDays: number;
  advancedRouting: boolean;
  includedInBasePlan: boolean;
};

export type BillingPlanDefinition = {
  id: BillingPlanId;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  /** 1.25% = 125 basis points; 0.10% = 10 basis points. */
  platformFeeBps: number;
  allowances: PlanAllowances;
  voice: VoiceOffering;
  sharedLgqTextingNumber: boolean;
  quickBooksConnections: number;
};

export const BILLING_PLANS: Readonly<Record<BillingPlanId, BillingPlanDefinition>> = {
  flex: {
    id: 'flex',
    name: 'Flex',
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    platformFeeBps: 125,
    allowances: {
      cadence: 'one_time',
      officeUsers: 1,
      crewUsers: 2,
      customDomainConnections: 1,
      dedicatedBusinessNumbers: 0,
      textCredits: 50,
      marketingEmailSends: 100,
      aiIntakeCredits: 30,
      aiWritingDrafts: 25,
      storageGb: 5,
      forwardingMinutes: 0,
    },
    voice: {
      monthlyPriceCents: 6_900,
      includedMinutes: 100,
      concurrentCalls: 1,
      historyDays: 30,
      advancedRouting: false,
      includedInBasePlan: false,
    },
    sharedLgqTextingNumber: true,
    quickBooksConnections: 1,
  },
  solo: {
    id: 'solo',
    name: 'Solo',
    monthlyPriceCents: 3_900,
    annualPriceCents: 42_000,
    platformFeeBps: 50,
    allowances: {
      cadence: 'monthly',
      officeUsers: 1,
      crewUsers: 2,
      customDomainConnections: 1,
      dedicatedBusinessNumbers: 0,
      textCredits: 500,
      marketingEmailSends: 500,
      aiIntakeCredits: 250,
      aiWritingDrafts: 50,
      storageGb: 10,
      forwardingMinutes: 100,
    },
    voice: {
      monthlyPriceCents: 5_900,
      includedMinutes: 100,
      concurrentCalls: 1,
      historyDays: 30,
      advancedRouting: false,
      includedInBasePlan: false,
    },
    sharedLgqTextingNumber: false,
    quickBooksConnections: 1,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyPriceCents: 12_900,
    annualPriceCents: 118_800,
    platformFeeBps: 25,
    allowances: {
      cadence: 'monthly',
      officeUsers: 5,
      crewUsers: 10,
      customDomainConnections: 1,
      dedicatedBusinessNumbers: 0,
      textCredits: 1_500,
      marketingEmailSends: 2_500,
      aiIntakeCredits: 500,
      aiWritingDrafts: 250,
      storageGb: 100,
      forwardingMinutes: 100,
    },
    voice: {
      monthlyPriceCents: 5_500,
      includedMinutes: 200,
      concurrentCalls: 1,
      historyDays: 30,
      advancedRouting: false,
      includedInBasePlan: false,
    },
    sharedLgqTextingNumber: false,
    quickBooksConnections: 1,
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    monthlyPriceCents: 32_900,
    annualPriceCents: 358_800,
    platformFeeBps: 10,
    allowances: {
      cadence: 'monthly',
      officeUsers: 15,
      crewUsers: 50,
      customDomainConnections: 1,
      dedicatedBusinessNumbers: 0,
      textCredits: 3_000,
      marketingEmailSends: 5_000,
      aiIntakeCredits: 1_000,
      aiWritingDrafts: 500,
      storageGb: 250,
      forwardingMinutes: 200,
    },
    voice: {
      monthlyPriceCents: 0,
      includedMinutes: 100,
      concurrentCalls: 3,
      historyDays: 90,
      advancedRouting: true,
      includedInBasePlan: true,
    },
    sharedLgqTextingNumber: false,
    quickBooksConnections: 1,
  },
} as const;

export type TopUpId =
  | 'flex_text_250'
  | 'text_1000'
  | 'marketing_email_5000'
  | 'ai_intake_100'
  | 'ai_writing_250'
  | 'storage_100gb'
  | 'office_user'
  | 'crew_user'
  | 'voice_minutes_100'
  | 'ai_voice_flex'
  | 'ai_voice_solo'
  | 'ai_voice_growth';

export type TopUpDefinition = {
  id: TopUpId;
  label: string;
  priceCents: number;
  recurring: boolean;
  fulfillment: 'usage_credit' | 'recurring_capacity';
  resourceCode:
    | 'text_segments'
    | 'marketing_email_sends'
    | 'ai_intake_threads'
    | 'ai_writing_drafts'
    | 'storage_gb'
    | 'office_users'
    | 'crew_users'
    | 'voice_minutes';
  units: number;
  eligiblePlans: readonly BillingPlanId[];
  eligibilityLabel: string;
};

export const TOP_UPS: Readonly<Record<TopUpId, TopUpDefinition>> = {
  flex_text_250: {
    id: 'flex_text_250',
    label: 'Flex: 250 text-credit top-up',
    priceCents: 1_200,
    recurring: false,
    fulfillment: 'usage_credit',
    resourceCode: 'text_segments',
    units: 250,
    eligiblePlans: ['flex'],
    eligibilityLabel: 'Flex',
  },
  text_1000: {
    id: 'text_1000',
    label: '1,000 text credits',
    priceCents: 4_200,
    recurring: false,
    fulfillment: 'usage_credit',
    resourceCode: 'text_segments',
    units: 1_000,
    eligiblePlans: BILLING_PLAN_IDS,
    eligibilityLabel: 'All plans',
  },
  marketing_email_5000: {
    id: 'marketing_email_5000',
    label: '5,000 marketing emails',
    priceCents: 1_700,
    recurring: false,
    fulfillment: 'usage_credit',
    resourceCode: 'marketing_email_sends',
    units: 5_000,
    eligiblePlans: BILLING_PLAN_IDS,
    eligibilityLabel: 'All plans',
  },
  ai_intake_100: {
    id: 'ai_intake_100',
    label: '100 AI Intake credits',
    priceCents: 1_500,
    recurring: false,
    fulfillment: 'usage_credit',
    resourceCode: 'ai_intake_threads',
    units: 100,
    eligiblePlans: BILLING_PLAN_IDS,
    eligibilityLabel: 'All plans',
  },
  ai_writing_250: {
    id: 'ai_writing_250',
    label: '250 AI writing drafts',
    priceCents: 1_900,
    recurring: false,
    fulfillment: 'usage_credit',
    resourceCode: 'ai_writing_drafts',
    units: 250,
    eligiblePlans: BILLING_PLAN_IDS,
    eligibilityLabel: 'All plans',
  },
  storage_100gb: {
    id: 'storage_100gb',
    label: '100 GB storage',
    priceCents: 1_500,
    recurring: true,
    fulfillment: 'recurring_capacity',
    resourceCode: 'storage_gb',
    units: 100,
    eligiblePlans: BILLING_PLAN_IDS,
    eligibilityLabel: 'All plans',
  },
  office_user: {
    id: 'office_user',
    label: 'Office user',
    priceCents: 1_500,
    recurring: true,
    fulfillment: 'recurring_capacity',
    resourceCode: 'office_users',
    units: 1,
    eligiblePlans: ['solo', 'growth', 'scale'],
    eligibilityLabel: 'Solo+',
  },
  crew_user: {
    id: 'crew_user',
    label: 'Crew user',
    priceCents: 500,
    recurring: true,
    fulfillment: 'recurring_capacity',
    resourceCode: 'crew_users',
    units: 1,
    eligiblePlans: ['solo', 'growth', 'scale'],
    eligibilityLabel: 'Solo+',
  },
  /**
   * The AI Voice add-on, as THREE SKUs rather than one.
   *
   * The published price differs by plan -- $69 Flex, $59 Solo, $55 Growth -- and
   * every mechanism downstream assumes one price per SKU: `priceCents` is a
   * single number, the Stripe seeder mints one Price per entry, and
   * `billing_top_up_purchase_operations` binds each top-up id to exactly one
   * `unit_amount_cents` in a CHECK constraint. A single `ai_voice` entry made
   * that constraint unsatisfiable for two of the three plans, and the migration
   * test said so before any of this could reach a database.
   *
   * Scale is absent on purpose: it includes voice in its base plan, so there is
   * nothing to sell it.
   */
  ai_voice_flex: {
    id: 'ai_voice_flex',
    label: 'AI Voice Receptionist (Flex)',
    priceCents: 6_900,
    recurring: true,
    fulfillment: 'recurring_capacity',
    resourceCode: 'voice_minutes',
    units: 100,
    eligiblePlans: ['flex'],
    eligibilityLabel: 'Flex',
  },
  ai_voice_solo: {
    id: 'ai_voice_solo',
    label: 'AI Voice Receptionist (Solo)',
    priceCents: 5_900,
    recurring: true,
    fulfillment: 'recurring_capacity',
    resourceCode: 'voice_minutes',
    units: 100,
    eligiblePlans: ['solo'],
    eligibilityLabel: 'Solo',
  },
  ai_voice_growth: {
    id: 'ai_voice_growth',
    label: 'AI Voice Receptionist (Growth)',
    priceCents: 5_500,
    recurring: true,
    fulfillment: 'recurring_capacity',
    resourceCode: 'voice_minutes',
    // Growth's published allowance is 200 minutes, not 100.
    units: 200,
    eligiblePlans: ['growth'],
    eligibilityLabel: 'Growth',
  },
  voice_minutes_100: {
    id: 'voice_minutes_100',
    label: '100 AI-connected minutes',
    priceCents: 3_500,
    recurring: false,
    fulfillment: 'usage_credit',
    resourceCode: 'voice_minutes',
    units: 100,
    eligiblePlans: BILLING_PLAN_IDS,
    eligibilityLabel: 'All plans',
  },
} as const;

/**
 * Published SKUs that must not be sold yet, and why.
 *
 * They stay in TOP_UPS because the price book is settled and the appendix
 * publishes them. What is withheld is the sale, not the price. Keeping the
 * reason next to the catalog means the seeder and the purchase path cannot
 * disagree about which SKUs are live -- and a reader is told why rather than
 * finding a SKU quietly missing from a list.
 */
/** One reason, three SKUs. Repeating it would let two of them drift. */
const AI_VOICE_WITHHELD =
  'the whole call rail is built and dark - admission, agent, receipt, settlement, '
  + 'lead, configuration, history, and since 20260819190000 the monthly allowance '
  + 'grant itself. What is left is not a missing mechanism but four switches '
  + 'nobody has thrown: no live Price exists, no number is pointed at the route, '
  + 'the allowance worker is off, and with the meter dark nothing would spend '
  + 'what it granted - so a subscriber would be charged monthly for minutes that '
  + 'arrive nowhere and buy nothing';

export const TOP_UPS_WITHHELD: Readonly<Partial<Record<TopUpId, string>>> = Object.freeze({
  storage_100gb:
    'the whole rail works - payment writes the capacity ledger, the lifecycle '
    + 'sweep follows the subscription, and the storage limit has added purchased '
    + 'units since 20260819000000. What is left is two switches nobody has '
    + 'thrown: no live recurring Price exists, and LGQ_STORAGE_CAP_ENFORCED is '
    + 'off, so headroom bought today changes nothing a workspace can feel',
  office_user:
    'the seat rail is complete - invitation, acceptance, removal, last-owner '
    + 'protection, reaching the workspace - and since 20260819250000 a purchased '
    + 'seat actually raises the limit, which it did not before: the grant and '
    + 'lapse paths both worked while the limit ignored them, so selling this '
    + 'would have charged $15 a month and granted nothing. Two reasons remain. '
    + 'No live recurring Price exists, and an office user still holds no '
    + 'permissions at all - every capability ships off, so somebody paid for '
    + 'would be connected and unable to open anything',
  crew_user:
    'both halves this used to name are built: 20260819010000 fills the capacity '
    + 'ledger when the Session is paid, and the capacity lifecycle sweep empties '
    + 'it when the subscription lapses. The crew seat limit has added purchased '
    + 'units since 20260818220000. A live recurring Stripe Price is the only '
    + 'thing left',
  ai_voice_flex: AI_VOICE_WITHHELD,
  ai_voice_solo: AI_VOICE_WITHHELD,
  ai_voice_growth: AI_VOICE_WITHHELD,
  voice_minutes_100:
    'the ledger accepts voice_minutes and the top-up path would grant them '
    + 'correctly, but with the meter dark nothing ever spends them - selling 100 '
    + 'minutes today takes $35 for a balance that cannot be drawn down',
});

/** SKUs that may be sold today. */
export const SELLABLE_TOP_UP_IDS = Object.freeze(
  (Object.keys(TOP_UPS) as TopUpId[]).filter((id) => !(id in TOP_UPS_WITHHELD)),
);

export const ENTERPRISE_PRICING = {
  startingMonthlyCents: 79_900,
  includedWorkspaces: 2,
  fullScaleDuoMonthlyCents: 109_900,
} as const;

const LEGACY_PLAN_MAP: Readonly<Record<string, BillingPlanId>> = {
  free: 'flex',
  pro: 'growth',
  crew_plus: 'scale',
};

export function parseBillingPlanId(value: unknown): BillingPlanId | null {
  if (typeof value !== 'string') return null;
  if ((BILLING_PLAN_IDS as readonly string[]).includes(value)) return value as BillingPlanId;
  return LEGACY_PLAN_MAP[value] ?? null;
}

/** Existing unclassified development accounts start on Flex. */
export function resolveBillingPlanId(value: unknown): BillingPlanId {
  return parseBillingPlanId(value) ?? 'flex';
}

export function getBillingPlan(value: unknown): BillingPlanDefinition {
  return BILLING_PLANS[resolveBillingPlanId(value)];
}

export function platformFeePercent(plan: BillingPlanDefinition | BillingPlanId): number {
  const definition = typeof plan === 'string' ? BILLING_PLANS[plan] : plan;
  return definition.platformFeeBps / 100;
}

export function platformFeeCents(eligibleSubtotalCents: number, plan: BillingPlanDefinition | BillingPlanId): number {
  if (!Number.isFinite(eligibleSubtotalCents)) return 0;
  const definition = typeof plan === 'string' ? BILLING_PLANS[plan] : plan;
  return Math.round(Math.max(0, eligibleSubtotalCents) * definition.platformFeeBps / 10_000);
}

export function basePriceCents(plan: BillingPlanDefinition | BillingPlanId, billing: BillingCycle): number {
  const definition = typeof plan === 'string' ? BILLING_PLANS[plan] : plan;
  return billing === 'annual' ? definition.annualPriceCents : definition.monthlyPriceCents;
}

export function annualizedBasePriceCents(plan: BillingPlanDefinition | BillingPlanId, billing: BillingCycle): number {
  const definition = typeof plan === 'string' ? BILLING_PLANS[plan] : plan;
  return billing === 'annual' ? definition.annualPriceCents : definition.monthlyPriceCents * 12;
}

export function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toLocaleString('en-US')}` : `$${dollars.toFixed(2)}`;
}
