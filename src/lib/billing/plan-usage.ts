import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BILLING_PLANS,
  PRICING_CATALOG_VERSION,
  type BillingPlanId,
} from '@/lib/billing/catalog';

export const PLAN_USAGE_DASHBOARD_FLAG = 'LGQ_PRICING_DASHBOARD_ENABLED' as const;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The Plan & usage surface ships dark. It may be exposed only when the new
 * entitlement catalog and the payment rail that charges it have been activated
 * together. Anything except the exact value `1` is off, including a missing or
 * accidentally misspelled value.
 */
export function planUsageDashboardEnabled(env: ServerEnvironment = process.env): boolean {
  return env[PLAN_USAGE_DASHBOARD_FLAG] === '1';
}

export const PLAN_USAGE_RESOURCES = [
  { code: 'text_segments', label: 'Text credits' },
  { code: 'marketing_email_sends', label: 'Marketing emails' },
  { code: 'ai_intake_threads', label: 'AI Intake credits' },
  { code: 'ai_writing_drafts', label: 'AI writing drafts' },
] as const;

export type PlanUsageResourceCode = (typeof PLAN_USAGE_RESOURCES)[number]['code'];
export type WorkspacePlanCode = BillingPlanId | 'enterprise';
export type WorkspaceBillingInterval = 'none' | 'monthly' | 'annual';
export type WorkspaceBillingStatus = 'free' | 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled';
export type WorkspaceEntitlementState = 'active' | 'grace' | 'restricted' | 'archived';

export type PlanUsageLimits = {
  officeUsers: number | null;
  crewUsers: number | null;
  customDomainConnections: number | null;
  dedicatedBusinessNumbers: number | null;
  storageGb: number | null;
  quickBooksConnections: number | null;
  voiceConcurrentCalls: number | null;
  voiceHistoryDays: number | null;
};

export type WorkspacePlanRead =
  | {
      kind: 'ready';
      planCode: WorkspacePlanCode;
      planName: string;
      billingInterval: WorkspaceBillingInterval;
      billingStatus: WorkspaceBillingStatus;
      entitlementState: WorkspaceEntitlementState;
      catalogVersion: string;
      usesCurrentCatalog: boolean;
      platformFeeBps: number;
      periodEnd: string | null;
      nextAllowanceResetAt: string | null;
      basePriceCents: number | null;
      limits: PlanUsageLimits;
    }
  | { kind: 'unavailable' };

export type UsageBalance = {
  resourceCode: PlanUsageResourceCode;
  label: string;
  /** Null means no credit lot was returned. It must not be presented as zero. */
  availableUnits: number | null;
  nextExpirationAt: string | null;
};

export type WorkspaceBalancesRead =
  | { kind: 'ready'; balances: UsageBalance[] }
  | { kind: 'unavailable' };

export type WorkspacePlanUsage = {
  plan: WorkspacePlanRead;
  balances: WorkspaceBalancesRead;
};

type EntitlementRow = {
  account_id: unknown;
  plan_code: unknown;
  billing_interval: unknown;
  billing_status: unknown;
  entitlement_state: unknown;
  catalog_version: unknown;
  platform_fee_bps: unknown;
  period_end: unknown;
  next_allowance_reset_at: unknown;
  feature_limits: unknown;
};

type BalanceRow = {
  account_id: unknown;
  resource_code: unknown;
  available_units: unknown;
  next_expiration_at: unknown;
};

const PLAN_CODES = ['flex', 'solo', 'growth', 'scale', 'enterprise'] as const;
const BILLING_INTERVALS = ['none', 'monthly', 'annual'] as const;
const BILLING_STATUSES = ['free', 'trialing', 'active', 'past_due', 'paused', 'canceled'] as const;
const ENTITLEMENT_STATES = ['active', 'grace', 'restricted', 'archived'] as const;

function memberOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function safeNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalIso(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function limit(limits: Record<string, unknown>, key: string): number | null {
  if (!(key in limits)) return null;
  return safeNonNegativeInteger(limits[key]);
}

function normalizeLimits(value: unknown): PlanUsageLimits | null {
  const limits = plainObject(value);
  if (!limits) return null;

  const normalized: PlanUsageLimits = {
    officeUsers: limit(limits, 'office_users'),
    crewUsers: limit(limits, 'crew_users'),
    customDomainConnections: limit(limits, 'custom_domain_connections'),
    dedicatedBusinessNumbers: limit(limits, 'dedicated_business_numbers'),
    storageGb: limit(limits, 'storage_gb'),
    quickBooksConnections: limit(limits, 'quickbooks_connections'),
    voiceConcurrentCalls: limit(limits, 'voice_concurrent_calls'),
    voiceHistoryDays: limit(limits, 'voice_history_days'),
  };

  // A malformed value is billing data we cannot safely reinterpret. Missing is
  // different and remains null so the UI can omit only that limit.
  for (const [key, raw] of Object.entries(limits)) {
    if (
      [
        'office_users',
        'crew_users',
        'custom_domain_connections',
        'dedicated_business_numbers',
        'storage_gb',
        'quickbooks_connections',
        'voice_concurrent_calls',
        'voice_history_days',
      ].includes(key)
      && safeNonNegativeInteger(raw) === null
    ) {
      return null;
    }
  }
  return normalized;
}

function planName(planCode: WorkspacePlanCode): string {
  return planCode === 'enterprise' ? 'Enterprise' : BILLING_PLANS[planCode].name;
}

function catalogBasePrice(
  planCode: WorkspacePlanCode,
  billingInterval: WorkspaceBillingInterval,
  catalogVersion: string,
): number | null {
  if (planCode === 'enterprise' || catalogVersion !== PRICING_CATALOG_VERSION) return null;
  if (billingInterval === 'annual') return BILLING_PLANS[planCode].annualPriceCents;
  if (billingInterval === 'monthly') return BILLING_PLANS[planCode].monthlyPriceCents;
  return planCode === 'flex' ? 0 : null;
}

export function normalizeWorkspacePlan(row: EntitlementRow | null, accountId: string): WorkspacePlanRead {
  if (!row || row.account_id !== accountId) return { kind: 'unavailable' };
  if (!memberOf(PLAN_CODES, row.plan_code)) return { kind: 'unavailable' };
  if (!memberOf(BILLING_INTERVALS, row.billing_interval)) return { kind: 'unavailable' };
  if (!memberOf(BILLING_STATUSES, row.billing_status)) return { kind: 'unavailable' };
  if (!memberOf(ENTITLEMENT_STATES, row.entitlement_state)) return { kind: 'unavailable' };

  const catalogVersion = typeof row.catalog_version === 'string' ? row.catalog_version.trim() : '';
  const platformFeeBps = safeNonNegativeInteger(row.platform_fee_bps);
  const periodEnd = optionalIso(row.period_end);
  const nextAllowanceResetAt = optionalIso(row.next_allowance_reset_at);
  const limits = normalizeLimits(row.feature_limits);
  if (
    !catalogVersion
    || platformFeeBps === null
    || platformFeeBps > 10_000
    || periodEnd === undefined
    || nextAllowanceResetAt === undefined
    || !limits
  ) {
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ready',
    planCode: row.plan_code,
    planName: planName(row.plan_code),
    billingInterval: row.billing_interval,
    billingStatus: row.billing_status,
    entitlementState: row.entitlement_state,
    catalogVersion,
    usesCurrentCatalog: catalogVersion === PRICING_CATALOG_VERSION,
    platformFeeBps,
    periodEnd,
    nextAllowanceResetAt,
    basePriceCents: catalogBasePrice(row.plan_code, row.billing_interval, catalogVersion),
    limits,
  };
}

export function normalizeWorkspaceBalances(rows: BalanceRow[] | null, accountId: string): WorkspaceBalancesRead {
  if (!rows) return { kind: 'unavailable' };

  const byResource = new Map<PlanUsageResourceCode, { availableUnits: number; nextExpirationAt: string | null }>();
  for (const row of rows) {
    if (row.account_id !== accountId) return { kind: 'unavailable' };
    const resource = PLAN_USAGE_RESOURCES.find((candidate) => candidate.code === row.resource_code);
    // Other ledgers may share this view later. They are not part of this first
    // contractor-facing surface and are intentionally ignored.
    if (!resource) continue;
    if (byResource.has(resource.code)) return { kind: 'unavailable' };

    const availableUnits = safeNonNegativeInteger(row.available_units);
    const nextExpirationAt = optionalIso(row.next_expiration_at);
    if (availableUnits === null || nextExpirationAt === undefined) return { kind: 'unavailable' };
    byResource.set(resource.code, { availableUnits, nextExpirationAt });
  }

  return {
    kind: 'ready',
    balances: PLAN_USAGE_RESOURCES.map((resource) => ({
      resourceCode: resource.code,
      label: resource.label,
      availableUnits: byResource.get(resource.code)?.availableUnits ?? null,
      nextExpirationAt: byResource.get(resource.code)?.nextExpirationAt ?? null,
    })),
  };
}

/**
 * Read only through the owner's session client. RLS is the authorization
 * boundary; the explicit account filters are defense in depth and keep the
 * query contract visible at the call site.
 */
export async function loadWorkspacePlanUsage(
  supabase: SupabaseClient,
  accountId: string,
): Promise<WorkspacePlanUsage> {
  const entitlementQuery = supabase
    .from('workspace_entitlements')
    .select('account_id, plan_code, billing_interval, billing_status, entitlement_state, catalog_version, platform_fee_bps, period_end, next_allowance_reset_at, feature_limits')
    .eq('account_id', accountId)
    .maybeSingle();
  const balancesQuery = supabase
    .from('workspace_usage_credit_balances')
    .select('account_id, resource_code, available_units, next_expiration_at')
    .eq('account_id', accountId);

  const [entitlementResult, balancesResult] = await Promise.allSettled([
    entitlementQuery,
    balancesQuery,
  ]);

  const plan = entitlementResult.status === 'fulfilled' && !entitlementResult.value.error
    ? normalizeWorkspacePlan((entitlementResult.value.data as EntitlementRow | null) ?? null, accountId)
    : { kind: 'unavailable' as const };
  const balances = balancesResult.status === 'fulfilled' && !balancesResult.value.error
    ? normalizeWorkspaceBalances((balancesResult.value.data as BalanceRow[] | null) ?? null, accountId)
    : { kind: 'unavailable' as const };

  return { plan, balances };
}
