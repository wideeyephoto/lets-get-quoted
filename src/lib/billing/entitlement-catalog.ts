import {
  BILLING_PLANS,
  PRICING_CATALOG_VERSION,
  TOP_UPS,
  type BillingCycle,
  type BillingPlanId,
  type TopUpId,
} from '@/lib/billing/catalog';

export const CREDIT_RESOURCE_CODES = [
  'text_segments',
  'marketing_email_sends',
  'ai_intake_threads',
  'ai_writing_drafts',
] as const;

export type CreditResourceCode = (typeof CREDIT_RESOURCE_CODES)[number];

export type PlanCreditGrant = Readonly<{
  resourceCode: CreditResourceCode;
  units: number;
  cadence: 'one_time' | 'monthly';
}>;

export type WorkspaceEntitlementCatalogSnapshot = Readonly<{
  planCode: BillingPlanId;
  billingInterval: 'none' | BillingCycle;
  catalogVersion: typeof PRICING_CATALOG_VERSION;
  platformFeeBps: number;
  featureLimits: Readonly<Record<string, number>>;
  featureFlags: Readonly<Record<string, boolean>>;
}>;

const ALLOWANCE_TO_RESOURCE = Object.freeze({
  text_segments: 'textCredits',
  marketing_email_sends: 'marketingEmailSends',
  ai_intake_threads: 'aiIntakeCredits',
  ai_writing_drafts: 'aiWritingDrafts',
} as const);

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

/** Compile the exact DB-facing limits/flags from the public pricing catalog. */
export function workspaceEntitlementCatalogSnapshot(
  planCode: BillingPlanId,
  billingInterval: 'none' | BillingCycle,
): WorkspaceEntitlementCatalogSnapshot {
  const plan = BILLING_PLANS[planCode];
  if (planCode === 'flex' && billingInterval !== 'none') {
    throw new Error('Flex must use the non-subscription billing interval.');
  }
  if (planCode !== 'flex' && billingInterval === 'none') {
    throw new Error('Paid plans require a monthly or annual billing interval.');
  }

  return Object.freeze({
    planCode,
    billingInterval,
    catalogVersion: PRICING_CATALOG_VERSION,
    platformFeeBps: plan.platformFeeBps,
    featureLimits: Object.freeze({
      office_users: plan.allowances.officeUsers,
      crew_users: plan.allowances.crewUsers,
      custom_domain_connections: plan.allowances.customDomainConnections,
      dedicated_business_numbers: plan.allowances.dedicatedBusinessNumbers,
      storage_gb: plan.allowances.storageGb,
      quickbooks_connections: plan.quickBooksConnections,
      forwarding_minutes: plan.allowances.forwardingMinutes,
      voice_concurrent_calls: plan.voice.concurrentCalls,
      voice_history_days: plan.voice.historyDays,
      voice_included_minutes: plan.voice.includedInBasePlan ? plan.voice.includedMinutes : 0,
    }),
    // WRITE-ONLY. Nothing reads any of these.
    //
    // Verified exhaustively on 2026-08-19: shared_lgq_texting_number,
    // voice_included and voice_advanced_routing each appear exactly once in the
    // whole of src -- on the line below that builds them. `feature_flags` is
    // persisted by the subscription projector and typed by the event projector,
    // and the property access `featureFlags.` occurs nowhere at all.
    //
    // Said plainly here because the danger is not the field, it is reading the
    // field as evidence. A snapshot listing four capability flags looks like
    // enforcement to anyone auditing it, and none of them gates anything.
    // voice_advanced_routing has nothing to gate until AI Voice exists, which is
    // why this is left in place rather than dropped -- see 2.3 in
    // docs/entitlement-gap-roadmap-2026-08-19.md.
    featureFlags: Object.freeze({
      quickbooks: plan.quickBooksConnections > 0,
      shared_lgq_texting_number: plan.sharedLgqTextingNumber,
      voice_included: plan.voice.includedInBasePlan,
      voice_advanced_routing: plan.voice.advancedRouting,
    }),
  });
}

/** Credits issued once for Flex or at each monthly allowance reset for paid plans. */
export function planCreditGrants(planCode: BillingPlanId): readonly PlanCreditGrant[] {
  const plan = BILLING_PLANS[planCode];
  return Object.freeze(CREDIT_RESOURCE_CODES.map((resourceCode) => Object.freeze({
    resourceCode,
    units: requireNonNegativeInteger(
      plan.allowances[ALLOWANCE_TO_RESOURCE[resourceCode]],
      `${planCode}.${resourceCode}`,
    ),
    cadence: plan.allowances.cadence,
  })));
}

/**
 * Mid-cycle upgrades add only the difference between plan-period grants. That
 * raises the cap without reissuing already-consumed credits. Promotional and
 * purchased wallets are deliberately outside this calculation.
 */
export function planUpgradeCreditDeltas(
  fromPlanCode: BillingPlanId,
  toPlanCode: BillingPlanId,
): readonly PlanCreditGrant[] {
  const fromPlan = BILLING_PLANS[fromPlanCode];
  const toPlan = BILLING_PLANS[toPlanCode];
  if (toPlan.allowances.cadence !== 'monthly') return Object.freeze([]);

  // Flex starter lots are promotional, lifetime balances—not a paid monthly
  // plan-period grant. Starting Solo+ therefore issues the full paid allowance
  // and leaves any unused starter balance in its separate wallet.
  if (fromPlan.allowances.cadence === 'one_time') {
    return Object.freeze(planCreditGrants(toPlanCode).map((grant) => Object.freeze({
      ...grant,
      cadence: 'one_time' as const,
    })));
  }

  const from = new Map(planCreditGrants(fromPlanCode).map((grant) => [grant.resourceCode, grant.units]));
  return Object.freeze(planCreditGrants(toPlanCode)
    .map((grant) => Object.freeze({
      ...grant,
      cadence: 'one_time' as const,
      units: Math.max(0, grant.units - (from.get(grant.resourceCode) ?? 0)),
    }))
    .filter((grant) => grant.units > 0));
}

export type AllowancePeriodWindow = Readonly<{
  periodStartMs: number;
  periodEndMs: number;
  effectiveAtMs: number;
}>;

const MAX_ALLOWANCE_PERIOD_MS = 32 * 24 * 60 * 60 * 1_000;

function periodFractionRemaining(window: AllowancePeriodWindow): number {
  const { periodStartMs, periodEndMs, effectiveAtMs } = window;
  if (![periodStartMs, periodEndMs, effectiveAtMs].every(Number.isFinite)) {
    throw new Error('Allowance-period timestamps must be finite numbers.');
  }
  const periodDurationMs = periodEndMs - periodStartMs;
  if (periodDurationMs <= 0) throw new Error('Allowance period end must be after its start.');
  if (periodDurationMs > MAX_ALLOWANCE_PERIOD_MS) {
    throw new Error('Allowance period cannot exceed 32 days; do not use the subscription billing term.');
  }
  if (effectiveAtMs < periodStartMs || effectiveAtMs > periodEndMs) {
    throw new Error('Upgrade effective time must fall inside the current allowance period.');
  }
  return (periodEndMs - effectiveAtMs) / periodDurationMs;
}

/**
 * Match a prorated subscription upgrade with a prorated allowance increase.
 * Floor rounding never promises more variable-cost usage than the paid period
 * fraction supports; a new paid subscription still receives full grants.
 */
export function proratedPlanUpgradeCreditDeltas(
  fromPlanCode: Exclude<BillingPlanId, 'flex'>,
  toPlanCode: Exclude<BillingPlanId, 'flex'>,
  window: AllowancePeriodWindow,
): readonly PlanCreditGrant[] {
  const fraction = periodFractionRemaining(window);
  return Object.freeze(planUpgradeCreditDeltas(fromPlanCode, toPlanCode)
    .map((grant) => Object.freeze({
      ...grant,
      units: Math.floor(grant.units * fraction),
    }))
    .filter((grant) => grant.units > 0));
}

export type TopUpGrant = Readonly<{
  topUpId: TopUpId;
  resourceCode: (typeof TOP_UPS)[TopUpId]['resourceCode'];
  units: number;
  recurring: boolean;
  fulfillment: 'usage_credit' | 'recurring_capacity';
}>;

/** Resolve a purchased SKU to an immutable quantity; callers still enforce eligibility. */
export function topUpGrant(topUpId: TopUpId): TopUpGrant {
  const topUp = TOP_UPS[topUpId];
  return Object.freeze({
    topUpId,
    resourceCode: topUp.resourceCode,
    units: requireNonNegativeInteger(topUp.units, topUpId),
    recurring: topUp.recurring,
    fulfillment: topUp.fulfillment,
  });
}

export function isTopUpEligible(topUpId: TopUpId, planCode: BillingPlanId): boolean {
  return (TOP_UPS[topUpId].eligiblePlans as readonly BillingPlanId[]).includes(planCode);
}
